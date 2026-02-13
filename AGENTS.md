# AGENTS.md

## Purpose

This repo ships a CLI-only TTS tool. End-user install flow:

```bash
npm i -g @sfpprxy/speak
speak "hello"
speak -h
```

## Package Layout

Main package (user installs this):

- `@sfpprxy/speak`
- npm bin entry: `speak -> bin/speak.js`
- `bin/speak.js` resolves and executes a platform binary package

Platform binary packages:

- `@sfpprxy/speak-darwin-arm64`
- `@sfpprxy/speak-darwin-x64`
- `@sfpprxy/speak-linux-x64-gnu`
- `@sfpprxy/speak-linux-arm64-gnu`
- `@sfpprxy/speak-linux-x64-musl`
- `@sfpprxy/speak-linux-arm64-musl`
- `@sfpprxy/speak-win32-x64-msvc`

Runtime logic remains in `src/cli.ts`.

## Build Commands

- Build all platform binaries into `packages/*/bin`: `npm run build:binaries`
- Build one binary: `npm run build:one -- <target> <outfile>`

## Runtime Platform Rules

- macOS-only LaunchAgents plist hydration is gated by platform check.
- Audio playback uses platform fallback commands.
- If no player is available, CLI fails with install hint.

## Release Workflow Constraints

- Do not run real `npm publish` without explicit user confirmation.
- Dry-run first.
- Publish order:
  1. Publish all platform packages.
  2. Publish main package `@sfpprxy/speak`.

## Verification Checklist

1. `bun test` passes.
2. `npm run build:binaries` succeeds.
3. Main package dry-run is small (no bundled cross-platform binaries).
4. Platform package dry-run contains exactly one binary for that platform.

## Progress Snapshot (2026-02-13)

- Latest commit for architecture migration: `d685d82`.
- Confirmed: main dry-run tarball reduced to ~`3.7 kB`.
- Confirmed: platform package dry-runs produce single-binary tarballs.
- Confirmed: real publish not executed in this session.

## Reporting Convention

When audio report playback is needed, use:

```bash
bun run /Users/joe/Sync/Work/speaker/src/cli.ts "report content"
```
