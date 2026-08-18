# dsh-midi-plugin

Adds MIDI file recognition and editing to DeepSeek Harness, powered by [`@tonejs/midi`](https://github.com/Tonejs/Midi) (pure JavaScript, no native extensions).

## Features

- **Read**: `midi_summary` (overview), `midi_read` (full notes), `midi_chords` (chord progression)
- **Edit**: `midi_write` (write back), `midi_transpose` (per-track optional), `midi_quantize`, `midi_tempo`
- **Visualize**: a FL-Studio-style piano roll inside the `midi_read` card (zoom, pan, track filter)

## Parts

The plugin has two parts:

| Part | Files | Lifetime | Purpose |
| --- | --- | --- | --- |
| **Persistent bundle** (required) | `index.js` + `midi.js` + `cordis.patch.yml` | Persists across restarts | The 7 MIDI tools |
| **Dynamic companion** (optional) | `plugin.host.js` + `plugin.client.js` + `worker.mjs` | Session-scoped, reload after restart | The piano roll |

The tools are the core capability and persist via the bundle. The piano roll is an optional browser visualization that runs as a dynamic plugin (the only UI channel harness opens to third parties); it reads full files over `host.call('midi-preview')`, so large files are not truncated.

## Install

### One-liner

```sh
git clone https://github.com/DJCCCCCCCC/midi_operater
cd midi_operater
npm run install:plugin
```

The script installs dependencies, packs, installs into the profile, and verifies. Restart the web service and the 7 tools are active.

Target another profile: `npm run install:plugin -- tui`.

### Manual

```sh
dsh plugin --profile web add ./midi-plugin
# or from GitHub
dsh plugin --profile web add github:DJCCCCCCCC/midi_operater
```

Verify:

```sh
dsh --profile web --dump-config   # should show a "# == dsh-midi-plugin" layer
```

### Optional: piano roll

The piano roll is a dynamic plugin and cannot be installed by the command above (harness requires authorization for browser UI). To enable it, tell the AI:

> Load the midi companion

The AI registers it; approve the prompt and refresh. The `midi_read` card then shows the piano roll.

> Dynamic plugins are session-scoped: after restarting the web service, say "Load the midi companion" once more. The 7 tools are unaffected and always available.

## Usage

Put a `.mid` file in the workspace and let the model process it:

| Tool | Parameters | Description |
| --- | --- | --- |
| `midi_summary` | `path` | Compact overview: tempo/time-sig/key/tracks/instruments/note counts |
| `midi_read` | `path, mode?` | Parse to JSON; `mode=full` (default) includes every note |
| `midi_write` | `path, midi` | Write a JSON object back to `.mid` |
| `midi_transpose` | `path, semitones, trackIndex?, outputPath?` | Transpose; `trackIndex` limits to one track |
| `midi_quantize` | `path, subdivisions?, outputPath?` | Snap note starts to a rhythmic grid |
| `midi_tempo` | `path, bpm, outputPath?` | Set a single tempo |
| `midi_chords` | `path, epsilon?` | Chord progression (drums/percussion/SFX excluded) |

## Data model

The JSON returned by `midi_read` can be passed back to `midi_write` (derived fields are ignored):

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

Note names follow FL Studio's octave convention (middle C = C5 = MIDI 60).

## Limitations

- Keeps note-level data only (notes/tempo/time-sig/key/instrument/channel); pitch bend and controller events are dropped.
- `midi_read` `full` returns every note at once; use `summary` first for very large files.
- The piano roll requires the dynamic companion and must be reloaded after a restart (a harness limitation for third-party UI).
- The piano roll has a Download button (exports the filtered track or the whole file); there is no upload button — drop a `.mid` into the workspace and call `midi_read`.
