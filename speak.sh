#!/usr/bin/env zsh
exec "${commands[bun]:-/opt/homebrew/bin/bun}" run "${0:A:h}/src/cli.ts" "$@"
