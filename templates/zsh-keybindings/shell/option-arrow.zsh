# Option+Left / Option+Right → word-jump in zsh
#
# Why this exists: macOS terminals (iTerm2, Terminal.app) send the xterm
# escape sequence ESC[1;3C / ESC[1;3D when you press Option+Right/Left.
# zsh's default keymap doesn't bind those sequences, so the leading ESC
# triggers a meta prefix and the rest (`[1;3C`) gets typed as literal
# characters — you see garbage like `;3C;3D` in your prompt.
#
# These bindings make Option+Arrow jump word-by-word, matching the
# behavior in most GUI text fields (and Claude Code's input prompt).
#
# Usage: source this file from ~/.zshrc, e.g.
#   [ -f ~/.config/shell/option-arrow.zsh ] && source ~/.config/shell/option-arrow.zsh

bindkey "^[[1;3D" backward-word   # Option+Left (iTerm2 / xterm default)
bindkey "^[[1;3C" forward-word    # Option+Right (iTerm2 / xterm default)
bindkey "^[[1;9D" backward-word   # Terminal.app variant
bindkey "^[[1;9C" forward-word    # Terminal.app variant
bindkey "^[b"     backward-word   # Meta+b (if terminal sends "Esc+" for Option)
bindkey "^[f"     forward-word    # Meta+f (if terminal sends "Esc+" for Option)
