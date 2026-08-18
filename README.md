# dsh-midi-plugin

为 DeepSeek Harness 添加 MIDI 文件的识别、编辑与可视化能力，基于 `@tonejs/midi`

## 功能

- **识别**：`midi_summary`（概览）、`midi_read`（完整音符）、`midi_chords`（和弦进行）
- **编辑**：`midi_write`（写回）、`midi_transpose`（移调，可只移单条声部）、`midi_quantize`（量化）、`midi_tempo`（改速度）
- **可视化**：`midi_read` 的调用卡片带 FL Studio 风格钢琴卷帘（缩放、拖拽平移、轨道筛选）

## 组成

插件分两部分：

| 部分 | 文件 | 生命周期 | 作用 |
| --- | --- | --- | --- |
| **持久化 bundle**（必装） | `index.js` + `midi.js` + `cordis.patch.yml` | 随 profile 持久，重启不丢 | 7 个 MIDI 工具 |
| **动态伴侣**（可选） | `plugin.host.js` + `plugin.client.js` + `worker.mjs` | 会话级，重启后需重载 | 钢琴卷帘（在对话卡片里渲染） |

工具是核心能力，靠 bundle 持久化。钢琴卷帘是可选的浏览器可视化，走动态插件（harness 对第三方只开放这一条 UI 通道）；它用 `host.call('midi-preview')` 直接读完整文件，不受工具结果 24KB 截断限制，所以大文件也能画。

## 安装

### 一键安装

```sh
git clone https://github.com/DJCCCCCCCC/midi_operater
cd midi_operater
npm run install:plugin
```

脚本会自动完成：装依赖 → 打包 → 装进 profile → 验证。重启 web 服务后 7 个工具生效。

装到其他 profile：`npm run install:plugin -- tui`（把 `tui` 换成你的 profile 名）。

### 手动安装

```sh
# 本地目录
dsh plugin --profile web add ./midi-plugin

# 或从 GitHub
dsh plugin --profile web add github:DJCCCCCCCC/midi_operater
```

验证是否装好：

```sh
dsh --profile web --dump-config   # 应看到 "# == dsh-midi-plugin" 层
```

### 可选：钢琴卷帘

钢琴卷帘是浏览器可视化，属于动态插件，无法随上面的命令自动安装（harness 的安全机制要求授权）。想要的话，对 AI 说一句：

> 加载 midi 伴侣

AI 会完成注册，你点一次「允许」并刷新页面即可。之后 `midi_read` 的调用卡片里就会带出钢琴卷帘。

> 动态插件是会话级的，重启 web 服务后需要再说一次「加载 midi 伴侣」。工具（7 个 MIDI 工具）不受影响，永远在。

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
- 钢琴卷帘带「下载」按钮（按当前轨道筛选导出单轨或整文件）；上传按钮未提供，把 `.mid` 文件放进工作区直接 `midi_read` 即可。
