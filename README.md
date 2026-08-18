# dsh-midi-plugin

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 添加 MIDI「识别 + 编辑 + 可视化」能力的**持久化 bundle**，基于 `@tonejs/midi`（纯 JavaScript、无 C 扩展）。

- **识别**：`midi_summary`（概览）、`midi_read`（完整音符）、`midi_chords`（和弦进行，自动排除鼓/打击乐/音效轨）。
- **编辑**：`midi_write`（写回）、`midi_transpose`（移调，支持只移单条声部）、`midi_quantize`（量化）、`midi_tempo`（改速度）。
- **可视化**：`midi_read` 的调用卡片带 FL Studio 风格钢琴卷帘——黑白琴键（带音名）、彩色音符条、拍/小节网格、滚轮/滑块缩放、拖拽平移、轨道筛选。

## 分发形态：单一持久化 bundle

本仓库是一个可安装的 **bundle**（`dsh.bundle.patch` → `cordis.patch.yml`），同时声明 `dsh.client` 提供浏览器端钢琴卷帘。一次安装，工具和卷帘窗**都随 profile 持久，重启不丢**。

| 部分 | 文件 | 说明 |
| --- | --- | --- |
| Host 工具 | `index.js` + `midi.js` | 7 个 MIDI 工具，注册到全局 `tools` 层 |
| 浏览器卷帘窗 | `client/` → `client.js` | 键控 `tool.call.toolview`（key `midi_read`），纯前端渲染工具结果 |
| 补丁层 | `cordis.patch.yml` | 插入 `midi-tools` 行 |

`index.js` 是标准 Cordis 函数插件（`export name / inject / apply`），直接 `import` 加载 `@tonejs/midi`。`client/` 是标准客户端插件（`export name / inject / apply`），经 `scripts/build-client.mjs`（esbuild）打包成 `client.js`，`react` 保持 external、运行时经 `__ModuleLoader__` 与宿主共享 React 实例——与 gal-view 同款机制。

### 钢琴卷帘为什么不需要 RPC

卷帘窗渲染的是 `midi_read` 工具**已经返回的结果**（`ToolCallOwnerProps.block.content` 里的 JSON 字符串），所以它是纯前端渲染，不需要任何「客户端→host」调用。这也是它能随 bundle 持久化的原因。

### 上传 / 下载为何没有

上传 MIDI 需要「客户端→host 传任意二进制文件」的 RPC，而 harness 的 `RpcMethodMap`（`dsh-host-apiproxy` 内编译死）没有这条通道；内置附件上传（`ctx.attachments`）只接受图片。所以本插件不提供上传/下载按钮——把 `.mid` 文件放进工作区目录，直接让模型 `midi_read` 处理即可。

## 安装

```sh
# 从本地目录（文件系统 spec 自动锚定到调用目录）
dsh plugin --profile web add ./midi-plugin

# 或从 GitHub（需要 allowBuilds；本包无 install 构建脚本，纯 JS 直接可用）
dsh plugin --profile web add github:DJCCCCCCCC/midi_operater

# 或打包成 tarball 交付
pnpm pack && dsh plugin --profile web add ./dsh-midi-plugin-0.2.0.tgz
```

`dsh plugin` 会把 `dsh-midi-plugin` 追加进 profile 的 `dsh.profile.bundles`，并让 pnpm 在 profile 目录里安装依赖（`@tonejs/midi` 及其传递依赖）。重启后工具和卷帘窗都在。

验证：

```sh
dsh --profile web --dump-config   # 应看到 "# == dsh-midi-plugin" 层与 midi-tools 行
```

> 非 ASCII 路径注意：在中文路径（如 `D:\桌面\...`）下 `dsh plugin add ./midi-plugin` 可能被 pnpm 链成乱码路径而识别失败，改用 tarball（`pnpm pack` 后 `dsh plugin add <tarball>`）或 ASCII 路径即可。

### 开发：重建客户端 bundle

改了 `client/` 源码后重新打包，并把产物提交（`client.js` 随包分发）：

```sh
pnpm install   # 安装 devDependencies（esbuild）
npm run build:client          # 重新生成 client.js
npm run check:client          # 校验 client.js 与生成器输出一致
```

## 架构

```
┌──────────────────────────── 持久化 bundle（Node host + 浏览器）────────────────────────┐
│  cordis.patch.yml  →  插入行  id: midi-tools, name: dsh-midi-plugin                   │
│  index.js  export name/inject/apply                                                   │
│    · ctx.tools.register(defineTool({...})) × 7 —— 注册到全局 tools 层                  │
│    · 直接 import { run } from './midi.js'                                             │
│  midi.js  @tonejs/midi 引擎：read/write/transpose/quantize/tempo/chords               │
│                                                                                       │
│  client/index.mjs（esbuild → client.js）                                              │
│    · export name/inject/apply；inject: ['slots']                                      │
│    · ctx.slots.inject('tool.call.toolview', () =>                                     │
│        ctx.slots.register({ name: 'tool.call.toolview', key: 'midi_read' }, PianoRoll)│
│    · PianoRoll 从 block.content 解析 midi_read 结果 JSON，纯前端渲染                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 数据流

- **模型工具调用**：`工具 execute → midi.js run(op) → @tonejs/midi 处理 → JSON → 返回工具结果`（进程内，无子进程）。
- **钢琴卷帘**：`midi_read 结果 JSON → tool.call.toolview 槽位 → PianoRoll 组件解析渲染`（纯前端，无 RPC）。

## 工具

| 工具 | 参数 | 说明 |
| --- | --- | --- |
| `midi_summary` | `path` | 紧凑概览：速度/拍号/调号/轨道/音色/音符数 |
| `midi_read` | `path, mode?` | 解析为 JSON；`mode=full`（默认）含每个音符 |
| `midi_write` | `path, midi` | 把 JSON 写回 `.mid` |
| `midi_transpose` | `path, semitones, trackIndex?, outputPath?` | 移调；`trackIndex` 只移单条声部 |
| `midi_quantize` | `path, subdivisions?, outputPath?` | 音符起始时间对齐节奏网格 |
| `midi_tempo` | `path, bpm, outputPath?` | 设为单一速度 |
| `midi_chords` | `path, epsilon?` | 和弦进行（自动排除鼓/打击乐/音效轨） |

## 数据模型（`midi_read` / `midi_write` 共用的 JSON）

```jsonc
{
  "name": "demo",
  "tempos": [{ "bpm": 120, "ticks": 0 }],
  "timeSignatures": [{ "timeSignature": [4, 4], "ticks": 0 }],
  "keySignatures": [{ "key": "C", "scale": "major", "ticks": 0 }],
  "tracks": [
    {
      "name": "Piano",
      "instrument": { "name": "acoustic grand piano", "number": 0 },
      "channel": 0,
      "notes": [
        { "midi": 60, "name": "C5", "time": 0, "duration": 0.5, "velocity": 0.8 }
      ]
    }
  ]
}
```

`midi_write` 只消费 `name` / `tempos` / `timeSignatures` / `keySignatures` / `tracks[].name|instrument|channel|notes[].midi|time|duration|velocity`；`midi_read` 额外返回的派生字段（`duration`、`ppq`、`index`、`noteCount`、`instrument.family`）会被忽略，所以「读 → 改 → 写」可以直接回传。

> 音名标注采用 FL Studio 的八度约定（middle C = C5 = MIDI 60），比科学音高记号（C4 = 60）高一个八度。

## 目录结构

```
midi-plugin/
├── index.js            # 持久化 bundle：7 个工具（直接 import @tonejs/midi）
├── midi.js             # 共享 MIDI 引擎
├── cordis.patch.yml    # bundle 补丁层：插入 midi-tools 行
├── package.json        # dsh.bundle.patch + dsh.client + @tonejs/midi 依赖
├── client/
│   ├── index.mjs       # 浏览器 half：注册 midi_read 键控卷帘窗
│   ├── PianoRoll.jsx   # 钢琴卷帘组件（纯前端渲染）
│   └── styles.mjs      # 卷帘窗样式
├── client.js           # esbuild 打包产物（随包分发，勿手改）
├── scripts/
│   └── build-client.mjs  # esbuild 构建脚本（--check 校验）
└── README.md
```

## 已知限制

- 只保留音符级信息（note / tempo / 拍号 / 调号 / 音色 / 通道），不保留 control change、pitch bend、aftertouch 等细节事件；重写文件时这些事件会被重新生成，文件字节可能与原始不同（音符内容不变）。
- `midi_read` 的 `full` 模式会把所有音符一次性返回，超大文件可能超出结果长度上限；先 `summary` 看规模再决定是否 `full`。
- `midi_quantize` 只对齐起始时间、不改时长；`midi_tempo` 重设速度后不按比例缩放音符绝对时间。
- `midi_chords` 以「最低发声音」为根音，转位和弦可能命名不准；单音/不常见音组以 `根音(音程列表)` 兜底。
- `midi_transpose` 是半音移调；「大调 → 小调」这类调式转换（需要把 3/6/7 级音降半音）暂未实现。
- 上传/下载不提供（见上「上传 / 下载为何没有」）。
