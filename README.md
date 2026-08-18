# dsh-midi-plugin

为 DeepSeek Harness 添加 MIDI 文件的识别与编辑能力，基于 `@tonejs/midi`（纯 JavaScript，无 C 扩展）。

## 功能

- **识别**：`midi_summary`（概览）、`midi_read`（完整音符）、`midi_chords`（和弦进行）
- **编辑**：`midi_write`（写回）、`midi_transpose`（移调，可只移单条声部）、`midi_quantize`（量化）、`midi_tempo`（改速度）

## 安装

```sh
# 本地目录
dsh plugin --profile web add ./midi-plugin

# 或从 GitHub
dsh plugin --profile web add github:DJCCCCCCCC/midi_operater
```

安装后重启 web 服务即生效，工具会随 profile 持久化，不会因重启丢失。

验证是否装好：

```sh
dsh --profile web --dump-config   # 应看到 "# == dsh-midi-plugin" 层
```

## 使用

把 `.mid` 文件放进工作区目录，然后让模型处理即可：

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
- 不提供上传/下载按钮：把 `.mid` 文件放进工作区直接 `midi_read` 即可。
