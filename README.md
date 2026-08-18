# dsh-midi-plugin

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 添加 MIDI「识别 + 编辑 + 可视化」能力的独立插件。核心思路：用 `@tonejs/midi`（纯 JavaScript、无 C 扩展）做解析与序列化，通过一个**子进程 worker** 暴露给 harness 的动态 Cordis 插件——因为动态插件的代码里不能 `import`/`require` npm 包，所以所有操作都经 Host 的 `shell` 服务转给 `worker.mjs` 执行。

## 功能特性

- **识别**：`midi_summary`（概览）、`midi_read`（完整音符）、`midi_chords`（和弦进行，自动排除鼓/音效轨）。
- **编辑**：`midi_write`（写回）、`midi_transpose`（移调，支持只移单条声部）、`midi_quantize`（量化）、`midi_tempo`（改速度）。
- **可视化**：FL Studio 风格钢琴卷帘——黑白琴键（带音名）、彩色音符条、拍/小节网格、滚轮 + 滑块缩放、拖拽平移、轨道筛选、下载。
- **上传**：聊天栏「上传 MIDI」入口，文件存入插件目录并按会话隔离，超 24 小时自动清理。

## 架构

### 总览

插件由三个运行时部分组成，跨越两个进程：

```
┌─────────────────────────────── 浏览器（Client）───────────────────────────────┐
│  plugin.client.js                                                             │
│    · PianoRoll 组件（钢琴卷帘 UI）                                            │
│    · MidiUpload 组件（上传入口）                                              │
│         │  host.call(method, args)  ── JSON RPC ──►                          │
└─────────┼────────────────────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────── Node 进程（Host）──────────────────────────────┐
│  plugin.host.js                                                               │
│    · 注册 7 个模型工具（harness.registerTool）                                │
│    · 3 个 RPC handler：midi-preview / midi-upload / midi-download             │
│         │  ctx.shell.run({ command: 'node worker.mjs', stdin: JSON(op) })     │
└─────────┼────────────────────────────────────────────────────────────────────┘
          ▼  （子进程，stdin 传 op / stdout 回结果）
┌─────────────────────────────── 子进程（worker）──────────────────────────────┐
│  worker.mjs                                                                   │
│    · 读 stdin 上的单个 JSON op，执行后把 JSON 结果写到 stdout                 │
│    · 懒加载 @tonejs/midi，读写 .mid 文件                                      │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 为什么用子进程桥

动态 Cordis 插件的 `code.host` / `code.client` 是**纯 JavaScript 函数体**，运行时没有 `import`/`require`、没有模块加载器。而 `@tonejs/midi` 是一个 npm 包。解决方法是把真正碰 MIDI 的逻辑放进独立的 `worker.mjs`（一个普通 Node ESM 脚本，可以正常 `import`），Host 每次通过 `shell` 服务启动它，用 **stdin 传 JSON 请求、stdout 收 JSON 结果**——这正是 harness 给 in-process 插件传 JSON 的官方通道（`ShellExecRequest.stdin`）。

### 数据流

**模型工具调用**
`工具 execute → runWorker(op) → ctx.shell.run('node worker.mjs', stdin=JSON(op)) → worker 解析 → @tonejs/midi 处理 → stdout JSON → JSON.parse → 返回工具结果`

**钢琴卷帘**
`Client PianoRoll → host.call('midi-preview', {path}) → Host → worker read(full) → 音符 JSON → Client 渲染`

**上传**
`Client MidiUpload → FileReader 读文件转 base64 → host.call('midi-upload', {name, base64}) → Host → worker upload op（mkdir + 清理 + 写盘）→ 返回路径`

**下载**
`Client doDownload → host.call('midi-download', {path, trackIndex?}) → Host → worker download op（整文件或单轨导出 → base64）→ Client 用 Blob 触发下载`

### Host RPC 接口

| 方法 | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `midi-preview` | `{ path }` | 完整音符模型 | 供钢琴卷帘渲染 |
| `midi-upload` | `{ name, base64 }` | `{ path, bytes }` | 存到 `uploads/<sessionId>/` |
| `midi-download` | `{ path, trackIndex? }` | `{ name, base64, bytes }` | 整文件或单轨导出 |

### Worker op

`read` / `write` / `transpose` / `quantize` / `tempo` / `chords` / `upload` / `download`。`transpose` 和 `download` 支持可选的 `trackIndex` 只作用于单条轨道。

## 安装教程

### 前置条件

- Node.js ≥ 18（推荐 22）。
- 一个可运行的 DeepSeek Harness 环境（能使用动态 Cordis 插件的 `cordis_define` / `cordis_run`）。
- 插件目录需放在 harness 的**工作区（workspace）内**，因为 `worker.mjs` 的路径会硬编码进 Host 代码。

### 1. 获取代码

把本目录放到你的 harness 工作区，例如 `D:\你的工作区\midi-plugin`。

### 2. 安装依赖

```sh
cd midi-plugin
npm install --cache .npm-cache   # --cache 是为了在 harness 文件沙箱内也能写入缓存
```

### 3. 注册插件

这个插件是**动态 Cordis 插件**，代码分别在 `plugin.host.js`（Host 半边）和 `plugin.client.js`（Client 半边）。在 harness 里通过 `cordis_define` + `cordis_run` 注册：

1. `cordis_define`，`plugin` 用 `{ kind: "new", idPrefix: "midi" }`，`code.host` 填 `plugin.host.js` 的内容（从 `return {` 开始），`code.client` 填 `plugin.client.js` 的内容。
2. 记下返回的 `pluginId` / `packageId`。
3. `cordis_run`，`mode: "run"`（首次激活）。含 Client 代码会触发一次授权，在 UI 里点「允许」。
4. 授权通过后，7 个 MIDI 工具、上传入口、钢琴卷帘即生效。

> 注意：`plugin.host.js` 里的 `WORKER` 常量硬编码了 worker 路径，换机器/换目录要同步修改。

### 4. 验证

- 在输入框工具行看到「上传 MIDI」按钮。
- 触发一次 `midi_read` 后，调用卡片里出现钢琴卷帘。

## 使用指南

### 工具

| 工具 | 参数 | 说明 |
| --- | --- | --- |
| `midi_summary` | `path` | 紧凑概览：速度/拍号/调号/轨道/音色/音符数 |
| `midi_read` | `path, mode?` | 解析为 JSON；`mode=full`（默认）含每个音符 |
| `midi_write` | `path, midi` | 把 JSON 写回 `.mid` |
| `midi_transpose` | `path, semitones, trackIndex?, outputPath?` | 移调；`trackIndex` 只移单条声部 |
| `midi_quantize` | `path, subdivisions?, outputPath?` | 音符起始时间对齐节奏网格 |
| `midi_tempo` | `path, bpm, outputPath?` | 设为单一速度 |
| `midi_chords` | `path, epsilon?` | 和弦进行（自动排除鼓/打击乐/音效轨） |

### 上传

聊天栏「上传 MIDI」→ 选文件 → 自动存到 `midi-plugin/uploads/<sessionId>/`。不同会话互相隔离，每次上传会顺带清理该目录下超过 24 小时的旧文件。

### 钢琴卷帘

`midi_read` 的调用卡片即钢琴卷帘：

- **滚轮 / `+` `−` 按钮**：缩放。
- **拖拽**：平移（有边界约束，不会拖出内容）。
- **「适应」**：整曲铺满视口；**「重置」**：回到默认缩放。
- **「水平」滑块**：精确控制水平缩放。
- **轨道筛选下拉框**：只看某条声部。
- **「下载」**：跟随轨道筛选——选了某条就只下那一条（导出为 `原文件名_trackN.mid`），选「全部轨道」则下整个文件。

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
├── worker.mjs          # @tonejs/midi 引擎（子进程，stdin/stdout JSON）
├── plugin.host.js      # Host 半边：7 个工具 + 3 个 RPC handler
├── plugin.client.js    # Client 半边：钢琴卷帘 + 上传组件
├── package.json        # 依赖 @tonejs/midi
├── package-lock.json
└── README.md
```

## 已知限制

- 只保留音符级信息（note / tempo / 拍号 / 调号 / 音色 / 通道），不保留 control change、pitch bend、aftertouch 等细节事件；重写文件时这些事件会被重新生成，文件字节可能与原始不同（音符内容不变）。
- `midi_read` 的 `full` 模式会把所有音符一次性返回，超大文件可能超出结果长度上限；先 `summary` 看规模再决定是否 `full`。
- `midi_quantize` 只对齐起始时间、不改时长；`midi_tempo` 重设速度后不按比例缩放音符绝对时间。
- `midi_chords` 以「最低发声音」为根音，转位和弦可能命名不准；单音/不常见音组以 `根音(音程列表)` 兜底。
- `midi_transpose` 是半音移调；「大调 → 小调」这类调式转换（需要把 3/6/7 级音降半音）暂未实现。
- worker 路径硬编码为 `D:/桌面/Code/DSH/midi-plugin/worker.mjs`，换机器要改 `plugin.host.js` 里的 `WORKER`。
- 动态插件是进程内临时的，harness 重启后会丢失，需重新 `cordis_define` + `cordis_run`。
