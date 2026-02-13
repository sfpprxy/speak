# Changelog

All notable user-facing changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows SemVer.

## [Unreleased]

## [0.1.7] - 2026-02-13

### Added
- `speak -h` and `speak --help` support in the executable CLI flow.
- Help text examples in English and Chinese READMEs.
- GitHub release notes configuration (`.github/release.yml`) for cleaner release pages.
- GitHub publish workflow now auto-creates a GitHub Release for `v*` tags.

### Changed
- Help output formatting now uses aligned option columns.

## [0.1.6] - 2026-02-13

### Added
- Platform package distribution model for cross-platform installs:
  - `@sfpprxy/speak-darwin-arm64`
  - `@sfpprxy/speak-darwin-x64`
  - `@sfpprxy/speak-linux-x64-gnu`
  - `@sfpprxy/speak-linux-arm64-gnu`
  - `@sfpprxy/speak-linux-x64-musl`
  - `@sfpprxy/speak-linux-arm64-musl`
  - `@sfpprxy/speak-win32-x64-msvc`
- Launcher resolution logic in `bin/speak.js` to dispatch to the current platform binary.

### Changed
- Main package tarball reduced to exclude bundled cross-platform binaries.
- Release workflow publishes platform packages first, then main package.
