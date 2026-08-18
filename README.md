# dsh-midi-plugin

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 添加 MIDI「识别 + 编辑」能力的**持久化 bundle**，基于 `@tonejs/midi`（纯 JavaScript、无 C 扩展）。

- **识别**：`midi_summary`（概览）、`midi_read`（完整音符）、`midi_chords`（和弦进行，自动排除鼓/打击乐/音效轨）。
- **编辑**：`midi_write`（写回）、`midi_transpose`（移调，支持只移单条声部）、`midi_quantize`（量化）、`midi_tempo`（改速度）。

## 分发形态：bundle + 动态伴侣

本仓库是一个可安装的 **bundle**（`dsh.bundle.patch` → `cordis.patch.yml`），由两部分组成：

| 部分 | 文件 | 生命周期 | 说明 |
| --- | --- | --- | --- |
| **持久化 bundle** | `index.js` + `midi.js` + `cordis.patch.yml` | 随 profile 持久，重启不丢 | 注册 7 个 MIDI 工具到全局 `tools` 层 |
| **动态伴侣（可选）** | `plugin.host.js` + `plugin.client.js` + `worker.mjs` | 进程内临时 | 钢琴卷帘、上传、下载等浏览器 UI |

`index.js` 是标准 Cordis 函数插件（`export name / inject / apply`），直接用 `import` 加载 `@tonejs/midi`——普通 npm 包可以 `import`，所以持久化工具**不再需要子进程桥**。

### 为什么钢琴卷帘 / 上传按钮不能随 bundle 持久化

harness 的第三方分发规范（`dsh plugin add`）只支持 **host 侧插件**：bundle 的 `cordis.patch.yml` 只能插入 host 行，`ctx.tools.register` 等全局服务正是为此设计。两个 UI 能力各有一道独立包跨不过的门槛：

1. **上传按钮 → client→host 传文件 RPC 不存在**。`dsh-host-apiproxy` 的 `RpcMethodMap` 编译死（`session.*`、`workspace.*`、`host.*`、`settings.*` 等固定方法），没有任何「上传任意二进制」通道；内置附件上传（`ctx.attachments`）只接受图片（PNG/JPEG/WebP/GIF）并强制解码校验，装不了 MIDI。所以上传按钮只能靠动态插件的私有 RPC（`harness.handle` / `host.call`）。
2. **钢琴卷帘 → `dsh.client` 浏览器清单不开放**。浏览器插件要由 `client-modules` 扫描进 `window.__DSH_BOOT__`，其 `lib/client.js` 是仓库内 tsdown 的 `clientBundle` 预设产物，依赖 `@deepseek-ai/dsh-client-*` 内部包，且构建时的纯度门禁止任何跨插件值导入——整套链只存在于 harness 源码树内，独立包无法产出。

所以这两个 UI 保留为**会话级动态伴侣**：bundle 提供持久能力（7 个工具），动态伴侣提供可视化。两者可同时启用（bundle 注册工具，伴侣只做 RPC + UI，不重复注册工具）。

> 想要 UI 真正持久化，唯一正规路径是把它们做成 harness **内置包**（fork 源码树，加 `dsh.client` 浏览器包 + 在 `RpcMethodMap` 注册私有方法），属于维护自有 harness 分支，不在 `dsh plugin add` 的能力范围内。

## 安装

### 持久化 bundle

```sh
# 从本地目录（文件系统 spec 自动锚定到调用目录）
dsh plugin --profile web add ./midi-plugin

# 或从 GitHub（需要 allowBuilds；本包无 build 脚本，纯 JS 直接可用）
dsh plugin --profile web add github:DJCCCCCCCC/midi_operater

# 或打包成 tarball 交付
pnpm pack && dsh plugin --profile web add ./dsh-midi-plugin-0.2.0.tgz
```

`dsh plugin` 会把 `dsh-midi-plugin` 追加进 profile 的 `dsh.profile.bundles`，并让 pnpm 在 profile 目录里安装依赖（`@tonejs/midi` 及其传递依赖）。重启后工具仍在。

验证：

```sh
dsh --profile web --dump-config   # 应看到 "# == dsh-midi-plugin" 层与 midi-tools 行
```

### 动态伴侣（可选，钢琴卷帘 + 上传）

伴侣是动态 Cordis 插件，代码在 `plugin.host.js`（Host 半边）和 `plugin.client.js`（Client 半边）：

1. 先把目录放进 harness 工作区并安装依赖：`npm install --cache .npm-cache`。
2. `cordis_define`：`code.host` 填 `plugin.host.js` 内容（从 `return {` 开始），`code.client` 填 `plugin.client.js` 内容。
3. `cordis_run`（首次激活）。含 Client 代码会触发一次授权，在 UI 点「允许」。

> `plugin.host.js` 的 `WORKER` 常量硬编码了 worker 路径（`D:/桌面/Code/DSH/midi-plugin/worker.mjs`），换机器要同步改。

#### 重启后重载（一句话配方）

动态伴侣是会话级的，每次重启 web 服务后消失。因为它的客户端代码只注入当前浏览器页面，重载后请**刷新页面**（F5）。重载只做两步：

1. 对 AI 说：**「重新加载 midi 伴侣」**，AI 会重新 `cordis_define` + `cordis_run`。
2. 在页面授权提示点**「允许」**（浏览器 UI 首次激活都要授权）。

工具（7 个 MIDI 工具）不受影响——它们由持久化 bundle 提供，重启后一直在。

## 架构

```
┌──────────────────────────── 持久化 bundle（Node host）────────────────────────┐
│  cordis.patch.yml  →  插入行  id: midi-tools, name: dsh-midi-plugin           │
│  index.js  export name/inject/apply                                           │
│    · ctx.tools.register(defineTool({...})) × 7 —— 注册到全局 tools 层          │
│    · 直接 import { run } from './midi.js'                                     │
│  midi.js  @tonejs/midi 引擎：read/write/transpose/quantize/tempo/chords       │
└────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── 动态伴侣（可选，会话级）──────────────────────────┐
│  plugin.client.js（浏览器）  钢琴卷帘 + 上传组件                                │
│        │  host.call('midi-preview'|'midi-upload'|'midi-download')            │
│  plugin.host.js（Node）  三个 RPC handler，经 ctx.shell 转给 worker           │
│        │  node worker.mjs（stdin 传 op / stdout 回结果）                      │
│  worker.mjs  薄壳：import { run } from './midi.js'（与 bundle 共用引擎）      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 数据流

- **模型工具调用**：`工具 execute → midi.js run(op) → @tonejs/midi 处理 → JSON → 返回工具结果`（bundle，进程内，无子进程）。
- **钢琴卷帘预览**：`Client → host.call('midi-preview') → Host → worker(read full) → 音符 JSON → Client 渲染`。
- **上传/下载**：`Client → host.call('midi-upload'|'midi-download') → Host → worker → 写盘 / 回传 base64`。

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
├── midi.js             # 共享 MIDI 引擎（bundle 与 worker 共用）
├── cordis.patch.yml    # bundle 补丁层：插入 midi-tools 行
├── package.json        # dsh.bundle.patch + @tonejs/midi 依赖
├── worker.mjs          # 动态伴侣的薄壳（复用 midi.js）
├── plugin.host.js      # 动态伴侣 Host：3 个 RPC handler（不注册工具）
├── plugin.client.js    # 动态伴侣 Client：钢琴卷帘 + 上传
└── README.md
```

## 已知限制

- 只保留音符级信息（note / tempo / 拍号 / 调号 / 音色 / 通道），不保留 control change、pitch bend、aftertouch 等细节事件；重写文件时这些事件会被重新生成，文件字节可能与原始不同（音符内容不变）。
- `midi_read` 的 `full` 模式会把所有音符一次性返回，超大文件可能超出结果长度上限；先 `summary` 看规模再决定是否 `full`。
- `midi_quantize` 只对齐起始时间、不改时长；`midi_tempo` 重设速度后不按比例缩放音符绝对时间。
- `midi_chords` 以「最低发声音」为根音，转位和弦可能命名不准；单音/不常见音组以 `根音(音程列表)` 兜底。
- `midi_transpose` 是半音移调；「大调 → 小调」这类调式转换（需要把 3/6/7 级音降半音）暂未实现。
- 动态伴侣的 worker 路径硬编码，换机器要改 `plugin.host.js` 里的 `WORKER`；它随进程重启丢失（这正是持久化工具走 bundle 的原因）。
