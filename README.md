# speak

English docs. 中文版：[README.zh-CN.md](./README.zh-CN.md)

`speak` is a cross-platform command-line text-to-speech tool.

Release notes:
- GitHub Releases: `https://github.com/sfpprxy/speak/releases`
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

Install and run:

```bash
npm i -g @sfpprxy/speak
speak "Hello, world"
```

## Common Commands

```bash
speak "Task completed"
speak --print-config
speak -h
speak --help
speak --debug "Task completed"
```

## Help Output

```bash
speak -h
```

```text
Usage: speak [options] --text "hello"
   or: speak [options] "hello"

Options:
  -h, --help                Show this help
  -d, --debug               Enable debug logs
  --print-config, --config  Print effective config and exit
  -t, --text <text>         Text to speak
```

## First Run

On first run, `speak` prompts for `VOLC_TTS_TOKEN` and stores it locally:

- Path: `~/.speak/auth.json`
- Permissions: directory `700`, file `600`

If token is missing in a non-interactive environment, it exits with an initialization hint.

## Requirements

- A working audio player available on your system
- Network access to Doubao TTS API
- Install without skipping optional dependencies (avoid `--omit=optional`)

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SPEAKER_DEBUG` | empty | Enable debug logs with `1/true/yes/on` (or use `--debug`) |
| `TTS_PROVIDER` | `doubao` | Currently only `doubao` is supported |
| `VOLC_TTS_APPID` | `3864509867` | Volcengine TTS AppID |
| `VOLC_TTS_CLUSTER` | `volcano_tts` | Cluster identifier |
| `VOLC_TTS_RESOURCE_ID` | `volc.seedtts.default` | Resource ID |
| `VOLC_TTS_VOICE_TYPE` | `zh_female_vv_uranus_bigtts` | Voice type |
| `VOLC_TTS_MODEL` | empty | Optional model parameter |
| `VOLC_TTS_ENCODING` | `mp3` | Audio format |
| `VOLC_TTS_RATE` | `24000` | Sample rate |
| `VOLC_TTS_SPEED` | `1.0` | Speech speed ratio |
| `VOLC_TTS_VOLUME` | `1.0` | Volume ratio |
| `VOLC_TTS_PITCH` | `1.0` | Pitch ratio |
| `MAX_TTS_TEXT_LEN` | `400` | Max text length |
| `TTS_TIMEOUT_MS` | `10000` | Request timeout in ms |
| `TTS_CACHE_DIR` | `${TMPDIR}/speaker-tts-cache` | Audio cache directory |

Note: `VOLC_TTS_TOKEN` is persisted after first interactive input to `~/.speak/auth.json`.

## Troubleshooting

- No sound: check system output device and volume first, then run `speak --debug "test"` for logs.
- Token invalid/expired: remove `~/.speak/auth.json`, then run `speak "test"` to reinitialize.
- Binary package missing: reinstall without omitting optional deps:
  - `npm i -g @sfpprxy/speak`
