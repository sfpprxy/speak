# speaker

`speaker` 是一个本地语音播报工具。

- 主用途：命令行直接播报
- 当前形态：CLI-only（不再提供 web/server 模式）
- 实现结构：除测试文件外，运行时代码集中在 `src/cli.ts`（`src/cli.test.ts` 为测试）

仅使用火山引擎 TTS；失败时直接报错并输出到终端。

## 运行要求

- macOS（依赖 `afplay`）
- Bun 1.3+

## 1) 工具模式（推荐）

```bash
cd ~/Sync/Work/speaker

# 方式1（推荐入口）
./speak.sh "任务完成"

# 方式2（查看当前生效配置，敏感字段脱敏）
./speak.sh --print-config

# 方式3（调试）
./speak.sh --debug "任务完成"

# 方式4（直接调用 CLI）
bun run src/cli.ts "任务完成"

# 方式5（直接调用 CLI + --text）
bun run src/cli.ts --text "任务完成"
```

首次运行时会交互式提示输入 `VOLC_TTS_TOKEN`，并保存到 `~/.speak/auth.json`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SPEAKER_DEBUG` | 空 | `1/true/yes/on` 时输出调试日志（也可用 `--debug` 临时开启） |
| `TTS_PROVIDER` | `doubao` | 仅支持 `doubao` |
| `VOLC_TTS_APPID` | `3864509867` | 火山 TTS AppID |
| `VOLC_TTS_CLUSTER` | `volcano_tts` | 集群标识 |
| `VOLC_TTS_RESOURCE_ID` | `volc.seedtts.default` | 资源 ID（示例：`seed-tts-2.0`） |
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

`VOLC_TTS_TOKEN` 不再通过环境变量配置，而是在首次运行交互输入并保存到 `~/.speak/auth.json`。

## 测试

```bash
cd ~/Sync/Work/speaker
bun test
```
