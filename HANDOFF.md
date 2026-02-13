# 交接文档 (2026-02-13)

## 当前目标
- 维护一个 **仅 CLI** 的语音播报工具，保证运行行为稳定。
- 通过 npm 提供 `speak "text"` 使用体验。
- 采用“主包 + 平台二进制子包”发布模型，避免单包过大。

## 项目现状
- 主包：`@sfpprxy/speak`
  - npm `bin`：`speak -> bin/speak.js`
  - `bin/speak.js` 负责解析当前平台并加载对应子包二进制。
- 平台子包（每个包只放一个二进制）：
  - `@sfpprxy/speak-darwin-arm64`
  - `@sfpprxy/speak-darwin-x64`
  - `@sfpprxy/speak-linux-x64-gnu`
  - `@sfpprxy/speak-linux-arm64-gnu`
  - `@sfpprxy/speak-linux-x64-musl`
  - `@sfpprxy/speak-linux-arm64-musl`
  - `@sfpprxy/speak-win32-x64-msvc`
- 主运行时代码：`src/cli.ts`
- 测试：`src/cli.test.ts`
- 构建脚本：
  - `scripts/build-binaries.ts`（全平台）
  - `scripts/build-one-binary.ts`（单目标）

## 近期重要变更
- 包名从 `speak` 调整为 `@sfpprxy/speak`（避免与 npm 现有同名包冲突）。
- 引入 `optionalDependencies` + 平台子包分发方案。
- 新增平台包目录：`packages/*`。
- 更新 launcher：从本地 `dist/bin` 读取，改为从已安装平台子包解析二进制。
- `src/cli.ts` 已支持平台化播放器回退，且 plist 仅在 macOS 读取。
- `README.md` 改为英文用户文档，并新增 `README.zh-CN.md`。

## 稳定行为说明
- 安装后：`speak "text"`
- 调试：`speak --debug "text"`
- 配置查看：`speak --print-config` / `--config`
- 缺少 token：
  - 交互终端：提示输入并保存到 `~/.speak/auth.json`
  - 非交互终端：直接失败并给初始化提示

## 打包 / 发布（不执行真实发布）
- 约束：未得到用户明确确认前，不执行真实 `npm publish`。
- 建议顺序：
  1. 先发布所有平台子包。
  2. 再发布主包 `@sfpprxy/speak`。
- 常用命令：
  - 测试：`bun test`
  - 构建全平台：`npm run build:binaries`
  - 主包 dry-run：`npm pack --dry-run --cache /tmp/npm-cache-speaker`
  - 子包 dry-run（示例）：
    - `cd packages/speak-darwin-arm64 && npm pack --dry-run --cache /tmp/npm-cache-speaker`

## 验证状态
- 以当前会话实际执行结果为准（见终端记录）。
- 发布动作保留给人工最终确认执行。

## 环境备注
- 某些会话中，网络/DNS 可能受限。
- npm 默认缓存目录（`~/.npm`）可能有权限问题。
- 需要时建议使用：`--cache /tmp/npm-cache-speaker`

## 报告约定
- 需要播报报告内容时，统一使用：
  - `bun run /Users/joe/Sync/Work/speaker/src/cli.ts "report content"`

## 建议下一步
1. 先逐个子包执行 dry-run 并检查包内仅含单个目标二进制。
2. 确认主包 dry-run 体积是否明显下降。
3. 准备正式发布时，按“子包 -> 主包”顺序手动发布。
