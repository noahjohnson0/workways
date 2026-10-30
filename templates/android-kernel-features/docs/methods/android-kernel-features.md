# Android: finding "unsupported" device features in the kernel

## Problem

A device feature looks absent. The framework says it is off, the obvious
`/proc` and `/sys` nodes are not there, and the settings toggle does nothing.
Concluding "this ROM cannot do it" at that point is frequently wrong.

Worked example: double-tap-to-wake on a Lenovo TB305FU tablet
(MediaTek MT6768, Chipone ICNL9951 touch panel, Magisk-rooted).

Four independent signals all said unsupported:

```sh
settings put secure double_tap_to_wake 1      # sticks, changes nothing
dumpsys power | grep mDoubleTapWakeEnabled    # false
ls /proc/android_touch/                       # self_test, nothing else
ls /sys/module/chipone/parameters/            # debug_log, nothing else
```

All four were real observations. All four were irrelevant. The hardware had
supported it the whole time.

## Why that is a false negative

Two separate mistakes stack up.

**The framework's opinion is not the kernel's.** `config_supportDoubleTapWake`
gates one specific AOSP code path, where the framework asks the Power HAL to
turn the feature on. Plenty of vendor panels implement gesture wake entirely
inside the touch driver and raise a `KEY_WAKEUP` input event, which Android
acts on natively no matter what that config bool says. A false there tells you
the AOSP path is off, not that the capability is missing.

**A depth-limited `find` over guessed roots proves nothing.** This returned
empty and looked conclusive:

```sh
find /sys /proc -maxdepth 4 -iname '*gesture*'    # nothing
```

The node was eight levels deep under `/sys/devices/platform`. The search was
the problem, not the device.

## The method: ask the kernel what it can do

`/proc/kallsyms` lists every symbol in the running kernel, tagged with the
owning module. Driver capability shows up there even when no node is currently
exposed, and even when the feature is compiled in but switched off.

```sh
su -c "grep -i gesture /proc/kallsyms"
```

```
t cts_enable_gesture_wakeup       [chipone]
t cts_disable_gesture_wakeup      [chipone]
t cts_is_gesture_wakeup_enabled   [chipone]
t gesture_en_show                 [chipone]
t gesture_en_store                [chipone]
d dev_attr_gesture_en             [chipone]
r cts_gesture_control_fops        [chipone]
t enable_gesture_wakeup           [touch_common]
```

That is a complete answer: the driver can do it, and it exposes controls.

### Reading the symbol names

Linux naming conventions map directly onto user-visible nodes, so the symbol
list tells you what to go look for:

| Symbol pattern | What exists |
|---|---|
| `dev_attr_<name>` | sysfs attribute `<name>` in the device's directory |
| `driver_attr_<name>` | attribute under `/sys/bus/<bus>/drivers/<driver>/` |
| `<name>_show` | the attribute is readable |
| `<name>_store` | the attribute is **writable**, this is the one you want |
| `<name>_fops` | a procfs or debugfs file, check its `_write` sibling |

`gesture_en_store` existing guaranteed a writable node named `gesture_en` was
somewhere on the device.

### Then search without a depth limit

```sh
su -c "find /sys -name '*gesture*'"
su -c "find /proc -maxdepth 3 -name '*gesture*'"
```

```
/sys/devices/platform/11010000.spi1/spi_master/spi1/spi1.0/misc/gesture_en
/sys/bus/spi/drivers/chipone-tddi/config/gesture
/proc/gesture_control
```

Read the compile-time switch and the current state before writing anything:

```
CFG_CTS_GESTURE: Y
Gesture wakup is disable
```

Note the vendor's typo in "wakup". Vendor strings are not proofread, so match
loosely when you grep for state.

### Enable it, then verify at the input layer

```sh
echo 1 > /proc/gesture_control
echo 1 > /sys/devices/platform/11010000.spi1/spi_master/spi1/spi1.0/misc/gesture_en
```

Do not trust the screen lighting up as your proof. Watch what the panel
actually emits, with the screen off:

```sh
getevent -lt /dev/input/event4     # find yours in /proc/bus/input/devices
```

```
EV_KEY  KEY_WAKEUP  DOWN
EV_KEY  KEY_WAKEUP  UP
```

`KEY_WAKEUP` is handled by Android natively. No resource overlay, no framework
patch, no HAL work. The framework config that started this was never on the
path.

## Checklist

1. `grep -i <feature> /proc/kallsyms` before concluding anything is missing.
2. Translate `_store` / `dev_attr_` / `_fops` symbols into node names.
3. `find /sys -name '*<feature>*'` with no `-maxdepth` and no guessed roots.
4. Read the compile-time config node (`CFG_*`) and the current state node.
5. Write the enable flag.
6. Verify with `getevent` on the real input device, not by eyeballing.
7. Make it survive reboot, see below.

## Gotchas

**Magisk `su -c` only roots the first command of a chain.** This silently half
fails:

```sh
adb shell su -c 'cp a b; chmod 755 b'      # cp runs as root, chmod gets EPERM
```

Give every step its own invocation:

```sh
adb shell su -c 'cp a b'
adb shell su -c 'chmod 755 b'
```

**Some sysfs reads hard-crash the device.** Reading
`/sys/touchscreen/ts_suspend` on this tablet took it down and forced a reboot.
Wrap exploratory reads so one bad node cannot hang your shell, and expect to
reconnect:

```sh
timeout 3 cat "$node"; echo "(rc=$?)"
```

**These flags reset to off on every boot.** sysfs is not persistent storage. On
a Magisk device, re-arm from `/data/adb/service.d/<name>.sh`, mode 755, with a
wait loop because the node may not exist yet at `late_start`:

```sh
#!/system/bin/sh
G=/sys/.../misc/gesture_en
i=0; while [ $i -lt 60 ]; do [ -e "$G" ] && break; sleep 2; i=$((i+1)); done
sleep 10
echo 1 > "$G"
```

**Android wireless debugging dies on reboot and comes back on a new random
port.** Do not port-scan for it. Ask mDNS:

```sh
adb mdns services          # adb-XXXX  _adb-tls-connect._tcp  192.168.1.x:40575
adb connect 192.168.1.x:40575
```

The toggle itself also has to be switched back on by hand on the device after a
reboot, so a tablet that pings but refuses every port is usually just that.

## Related

- `/proc/bus/input/devices` maps input event numbers to hardware names, which
  is how you pick the right `eventN` for `getevent`.
- `dumpsys sensorservice` lists wake-capable sensors and their declared power
  draw, useful when weighing a gesture feature's battery cost. Its event
  history buffer freezes when the screen turns off, so it is not a live sensor
  stream.
