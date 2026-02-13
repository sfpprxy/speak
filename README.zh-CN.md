# speak

English docs: [README.md](./README.md)

`speak` 是一个跨平台命令行语音播报工具。

版本变更记录：
- GitHub Releases：`https://github.com/sfpprxy/speak/releases`
- Changelog：[CHANGELOG.md](./CHANGELOG.md)

安装后可直接使用：

```bash
npm i -g @sfpprxy/speak
speak "你好，世界"
```

## 常用命令

```bash
speak "任务完成"
speak --print-config
speak -h
speak --help
speak --debug "任务完成"
```

## 帮助输出

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

## 首次使用

首次运行会提示输入 `VOLC_TTS_TOKEN`，并保存到本地：

- 路径：`~/.speak/auth.json`
- 权限：目录 `700`，文件 `600`

如果在非交互环境下缺少 token，会直接报错并提示先在终端初始化一次。

## 运行要求

- 需要可用音频播放器（系统内置或常见播放器均可）
- 需要网络访问 Doubao TTS API
- 安装时不要跳过 optionalDependencies（避免使用 `--omit=optional`）

## 配置项

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SPEAKER_DEBUG` | 空 | `1/true/yes/on` 时输出调试日志（也可用 `--debug`） |
| `TTS_PROVIDER` | `doubao` | 当前仅支持 `doubao` |
| `VOLC_TTS_APPID` | `3864509867` | 火山 TTS AppID |
| `VOLC_TTS_CLUSTER` | `volcano_tts` | 集群标识 |
| `VOLC_TTS_RESOURCE_ID` | `volc.seedtts.default` | 资源 ID |
| `VOLC_TTS_VOICE_TYPE` | `zh_female_vv_uranus_bigtts` | 音色 |
| `VOLC_TTS_MODEL` | 空 | 可选模型参数 |
| `VOLC_TTS_ENCODING` | `mp3` | 音频格式 |
| `VOLC_TTS_RATE` | `24000` | 采样率 |
| `VOLC_TTS_SPEED` | `1.0` | 语速比例 |
| `VOLC_TTS_VOLUME` | `1.0` | 音量比例 |
| `VOLC_TTS_PITCH` | `1.0` | 音高比例 |
| `MAX_TTS_TEXT_LEN` | `400` | 最大播报字符数 |
| `TTS_TIMEOUT_MS` | `10000` | 云端超时（ms） |
| `TTS_CACHE_DIR` | `${TMPDIR}/speaker-tts-cache` | 音频缓存目录 |

说明：`VOLC_TTS_TOKEN` 由首次交互输入后持久化到 `~/.speak/auth.json`。

## 常见问题

- 没有声音：先检查系统输出设备和音量；再试 `speak --debug "测试"` 查看日志。
- token 失效：删除 `~/.speak/auth.json` 后重新运行 `speak "测试"` 重新初始化。
- 找不到平台二进制：不要跳过 optionalDependencies，重新安装：
  - `npm i -g @sfpprxy/speak`
