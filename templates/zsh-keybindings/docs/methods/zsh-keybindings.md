# zsh keybindings: Option+Arrow word-jump

## Problem

In Claude Code's prompt (and most GUI text fields on macOS), **Option+Left** and **Option+Right** jump backward/forward by word. In a default zsh shell, the same keys instead produce garbage like:

```
$ git statu;3C;3D;3C
```

## Why

When you press Option+→, your terminal (iTerm2, Terminal.app) sends the xterm escape sequence `ESC[1;3C`. zsh's default `bindkey` table doesn't bind that sequence to anything, so:

1. The leading `ESC` triggers a meta prefix.
2. The rest of the bytes (`[1;3C`) aren't a recognized binding, so they get inserted as literal characters.

Result: you see `;3C` in your buffer instead of the cursor jumping a word.

Claude Code's input handles this correctly because it's a custom TUI with its own keybindings, not a passthrough to the shell.

## Fix

Add these `bindkey` lines to your `~/.zshrc`:

```zsh
bindkey "^[[1;3D" backward-word   # Option+Left
bindkey "^[[1;3C" forward-word    # Option+Right
bindkey "^[[1;9D" backward-word   # Terminal.app variant
bindkey "^[[1;9C" forward-word    # Terminal.app variant
bindkey "^[b"     backward-word   # Meta+b (if terminal sends "Esc+")
bindkey "^[f"     forward-word    # Meta+f (if terminal sends "Esc+")
```

Or source the `shell/option-arrow.zsh` file that ships with this cluster:

```zsh
# in ~/.zshrc
[ -f "$HOME/shell/option-arrow.zsh" ] && source "$HOME/shell/option-arrow.zsh"
```

Open a new shell tab (or `source ~/.zshrc`) and Option+←/→ will now jump word-by-word.

## Debugging

If it still doesn't work, your terminal is probably sending a different escape sequence. To check, in any shell run:

```
cat
```

Then press Option+→. Whatever escape sequence prints is what your terminal actually sends. Add a `bindkey "<that-sequence>" forward-word` line to match it. Press Ctrl+C to exit `cat`.

Common alternatives to know about:

- **iTerm2** — Preferences → Profiles → Keys → "Left/Right Option Key" can be set to `Esc+` (sends Meta sequences `\eb`/`\ef`) or `Normal` (sends `ESC[1;3D`/`ESC[1;3C`). Either works with the bindings above.
- **Terminal.app** — Preferences → Profiles → Keyboard → "Use Option as Meta key" is the same toggle.

## Related

If you want more readline-style editing, also consider:

```zsh
bindkey "^[[H"  beginning-of-line  # Home
bindkey "^[[F"  end-of-line        # End
bindkey "^[^?"  backward-kill-word # Option+Delete
```
