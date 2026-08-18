# dsh-midi-plugin

为 DeepSeek Harness 添加 MIDI 文件的识别、编辑与可视化能力，基于 `@tonejs/midi`（纯 JavaScript，无 C 扩展）。

## 功能

- **识别**：`midi_summary`（概览）、`midi_read`（完整音符）、`midi_chords`（和弦进行）
- **编辑**：`midi_write`（写回）、`midi_transpose`（移调，可只移单条声部）、`midi_quantize`（量化）、`midi_tempo`（改速度）
- **可视化**：`midi_read` 的调用卡片带 FL Studio 风格钢琴卷帘（缩放、拖拽平移、轨道筛选）

## 组成

插件分两部分，**两者都要装**：

| 部分 | 文件 | 生命周期 | 作用 |
| --- | --- | --- | --- |
| **持久化 bundle** | `index.js` + `midi.js` + `cordis.patch.yml` | 随 profile 持久，重启不丢 | 7 个 MIDI 工具 |
| **动态伴侣** | `plugin.host.js` + `plugin.client.js` + `worker.mjs` | 会话级，重启后需重载 | 钢琴卷帘（在对话卡片里渲染） |

工具是核心能力，靠 bundle 持久化。钢琴卷帘是浏览器 UI，走动态插件（harness 对第三方只开放这一条 UI 通道）；它用 `host.call('midi-preview')` 直接读完整文件，不受工具结果 24KB 截断限制，所以大文件也能画。

## 安装

### 第 1 步：装持久化 bundle（工具）

```sh
# 本地目录
dsh plugin --profile web add ./midi-plugin

# 或从 GitHub
dsh plugin --profile web add github:DJCCCCCCCC/midi_operater
```

重启 web 服务后工具生效。验证：

```sh
dsh --profile web --dump-config   # 应看到 "# == dsh-midi-plugin" 层
```

### 第 2 步：装动态伴侣（钢琴卷帘）

动态插件代码不在 npm 包里分发，而是通过 harness 的 `cordis_define` / `cordis_run` 加载。步骤如下：

1. **把插件目录放进 harness 工作区**（`midi-plugin/` 整个目录），并安装依赖：

   ```sh
   cd midi-plugin
   npm install --cache .npm-cache
   ```

2. **在 harness 里注册动态插件**。对 AI 说：

   > 注册 midi 伴侣插件：`code.host` 用 `plugin.host.js` 的内容（从 `return {` 开始），`code.client` 用 `plugin.client.js` 的内容，然后运行。

   或手动执行两步：

   - `cordis_define`：`plugin` 用 `{ kind: "new", idPrefix: "midi" }`，`code.host` 填 `plugin.host.js` 内容（从 `return {` 开始），`code.client` 填 `plugin.client.js` 内容。
   - `cordis_run`：`mode: "run"`（首次激活）。

3. **授权**：含 Client 代码会触发一次授权，在页面弹窗点「允许」。

4. **刷新页面**（F5）。

完成后，触发一次 `midi_read`，调用卡片里就会出现钢琴卷帘。

> 注意：`plugin.host.js` 的 `WORKER` 常量硬编码了 worker 路径（`D:/桌面/Code/DSH/midi-plugin/worker.mjs`），换机器要同步改。

#### 重启后重载伴侣

动态伴侣是会话级的，重启 web 服务后消失，需要重新加载：

1. 对 AI 说：**「重新加载 midi 伴侣」**，AI 会重新 `cordis_define` + `cordis_run`。
2. 在授权提示点「允许」，然后刷新页面。

工具（7 个 MIDI 工具）不受影响——它们由持久化 bundle 提供，重启后一直在。

## 使用

把 `.mid` 文件放进工作区目录，让模型处理即可：

| 工具 | 参数 | 说明 |
| --- | --- | --- |
| `midi_summary` | `path` | 紧凑概览：速度/拍号/调号/轨道/音色/音符数 |
| `midi_read` | `path, mode?` | 解析为 JSON；`mode=full`（默认）含每个音符 |
| `midi_write` | `path, midi` | 把 JSON 写回 `.mid` |
| `midi_transpose` | `path, semitones, trackIndex?, outputPath?` | 移调；`trackIndex` 只移单条声部 |
| `midi_quantize` | `path, subdivisions?, outputPath?` | 音符起始时间对齐节奏网格 |
| `midi_tempo` | `path, bpm, outputPath?` | 设为单一速度 |
| `midi_chords` | `path, epsilon?` | 和弦进行（自动排除鼓/打击乐/音效轨） |

## 数据模型

`midi_read` 返回的 JSON 可直接传给 `midi_write` 回写（派生字段会被忽略）：

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

音名标注采用 FL Studio 的八度约定（middle C = C5 = MIDI 60）。

## 限制

- 只保留音符级信息（音符/速度/拍号/调号/音色/通道），不保留弯音、表情控制器等细节事件。
- `midi_read` 的 `full` 模式会一次性返回所有音符，超大文件先 `summary` 看规模。
- 钢琴卷帘依赖动态伴侣，重启后需按上文重载（这是 harness 对第三方 UI 的限制）。
- 不提供上传/下载按钮：把 `.mid` 文件放进工作区直接 `midi_read` 即可。
