# Handoff (2026-02-13)

## Current Goal
- Project has been refactored to a **CLI-only** tool (no web server mode).
- User asked for deep simplification **without changing behavior**. This was applied in `src/cli.ts`.

## Current Project State
- Entry:
  - `speak.sh` -> one-line forwarder to Bun CLI.
  - npm `bin` command is `speak`.
- Main code:
  - All non-test logic is consolidated in `src/cli.ts` (single-file runtime).
  - Tests are in `src/cli.test.ts`.
- Removed:
  - `src/server.ts`
  - `src/speak.ts`
  - `src/tts-utils.ts`
  - `launchd.out.log`
  - `launchd.err.log`

## Behavior Notes (must stay stable)
- `./speak.sh "text"` speaks text.
- `./speak.sh --debug "text"` enables debug logs.
- `./speak.sh --print-config` / `--config` prints effective config.
- Sensitive token output is masked (never plain text).
- Provider flow:
  - default `doubao`
  - fallback to macOS `say` on doubao failure.

## Packaging / Publish
- `package.json` exists:
  - name: `@sfpprxy/speak`
  - bin: `speak -> ./speak.sh`
  - publish access: public
- Dry-run pack previously passed with tmp cache workaround:
  - `npm pack --dry-run --cache /tmp/npm-cache-speaker`

## Validation Done
- `bun test` passed (11/11).
- `--print-config` output verified.
- `--debug` speak flow verified.

## Known Environment Notes
- Some sessions had sandbox DNS/network limits; outside sandbox doubao worked.
- npm default cache (`~/.npm`) had permission issues in this environment; use temp cache when needed.

## Recommended Next Steps (if continuing)
1. Decide whether to keep single-file `src/cli.ts` or split into modules for maintainability.
2. Update README to explicitly mention:
   - “single-file implementation (except tests)”
   - no server mode anymore.
3. If publishing now:
   - `npm adduser`
   - `npm publish --access public --cache /tmp/npm-cache-speaker`

