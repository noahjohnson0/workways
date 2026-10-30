#!/usr/bin/env bash
# Probe a rooted Android device for a kernel feature that looks "unsupported".
#
#   ./android-probe-feature.sh gesture
#   ./android-probe-feature.sh fingerprint
#
# Prints: matching kernel symbols (with owning module), the writable ones worth
# trying, any matching /sys and /proc nodes, and their permissions and values.
# Reads are wrapped in timeout because some vendor sysfs nodes hang or crash
# the device when read. See docs/methods/android-kernel-features.md.
set -euo pipefail

KEY="${1:-}"
[ -n "$KEY" ] || { echo "usage: $(basename "$0") <keyword>  (e.g. gesture)" >&2; exit 2; }

DEV="${ANDROID_SERIAL:-$(adb devices | awk '/\tdevice$/{print $1; exit}')}"
[ -n "$DEV" ] || { echo "no adb device. for wifi adb: adb mdns services" >&2; exit 1; }
echo "device: $DEV   keyword: $KEY"

REMOTE=/data/local/tmp/.probe_feature.sh
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

cat > "$TMP" <<EOF
K='$KEY'
echo "=== kernel symbols ==="
grep -i "\$K" /proc/kallsyms 2>/dev/null | awk '{\$1=""; print}' | sort -u | head -40
echo
echo "=== writable attrs implied by the symbols ==="
grep -ioE "[a-z0-9_]*\${K}[a-z0-9_]*_store" /proc/kallsyms 2>/dev/null \\
  | sed 's/_store\$//' | sort -u
echo
echo "=== nodes (no depth limit) ==="
find /sys -name "*\${K}*" 2>/dev/null
find /proc -maxdepth 3 -name "*\${K}*" 2>/dev/null
echo
echo "=== perms and values ==="
for n in \$(find /sys -name "*\${K}*" 2>/dev/null; find /proc -maxdepth 3 -name "*\${K}*" 2>/dev/null); do
  [ -f "\$n" ] || continue
  printf '%s\n' "--- \$n"
  ls -l "\$n" 2>&1 | sed 's/^/    /'
  v=\$(timeout 3 cat "\$n" 2>&1 | head -3); rc=\$?
  printf '    value: %s (rc=%s)\n' "\${v:-<empty>}" "\$rc"
done
EOF

adb -s "$DEV" push "$TMP" "$REMOTE" >/dev/null
adb -s "$DEV" shell su -c "sh $REMOTE" || true
adb -s "$DEV" shell su -c "rm -f $REMOTE" >/dev/null 2>&1 || true

cat <<'NEXT'

next: a *_store symbol means a writable node exists. enable it, then prove it
at the input layer rather than by eye:
    adb shell su -c 'getevent -lt /dev/input/eventN'
pick N from /proc/bus/input/devices. remember sysfs resets every boot.
NEXT
