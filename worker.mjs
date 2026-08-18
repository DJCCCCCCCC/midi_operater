// midi-plugin worker: a plain Node ESM script that performs one MIDI operation
// per invocation. It reads a single JSON op from stdin and prints a single JSON
// result to stdout (errors go to stderr and exit non-zero). The dynamic Cordis
// plugin shells out to this file because plugin code cannot `import` npm packages.
//
// ops:
//   { op: 'read', path, mode: 'summary' | 'full' }
//   { op: 'write', path, midi }
//   { op: 'transpose', path, semitones, outputPath? }
//   { op: 'quantize', path, subdivisions?, outputPath? }
//   { op: 'tempo', path, bpm, outputPath? }
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'

// Remove .mid/.midi files older than the retention window (keeps the upload
// area from growing unbounded). Best-effort: ignores all errors.
async function cleanupDir(dir, maxAgeMs) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.isFile() || !/\.midi?$/i.test(entry.name)) continue
      try {
        const info = await stat(join(dir, entry.name))
        if (now - info.mtimeMs > maxAgeMs) {
          await unlink(join(dir, entry.name)).catch(() => {})
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// @tonejs/midi is loaded lazily so `upload` (which never touches notes) skips
// the library parse cost on every invocation.
let toneMidiPromise = null
async function loadToneMidi() {
  if (toneMidiPromise === null) toneMidiPromise = import('@tonejs/midi')
  const mod = await toneMidiPromise
  return mod.default
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value))
}

async function readMidi(path) {
  const { Midi } = await loadToneMidi()
  const buffer = await readFile(path)
  return new Midi(new Uint8Array(buffer))
}

// A note-centric JSON model (the shape the model reads and edits). It deliberately
// omits control-change and pitch-bend detail; round-tripping through this shape
// keeps notes, tempo, time/key signature, track names, instruments, and channels.
function midiToData(midi, includeNotes) {
  return {
    name: midi.name,
    duration: midi.duration,
    durationTicks: midi.durationTicks,
    ppq: midi.header.ppq,
    tempos: midi.header.tempos.map((t) => ({ bpm: t.bpm, ticks: t.ticks })),
    timeSignatures: midi.header.timeSignatures.map((t) => ({
      timeSignature: t.timeSignature.slice(),
      ticks: t.ticks,
    })),
    keySignatures: midi.header.keySignatures.map((k) => ({
      key: k.key,
      scale: k.scale,
      ticks: k.ticks,
    })),
    tracks: midi.tracks.map((track, index) => {
      const data = {
        index,
        name: track.name,
        instrument: {
          name: track.instrument.name,
          family: track.instrument.family,
          number: track.instrument.number,
        },
        channel: track.channel,
        noteCount: track.notes.length,
      }
      if (includeNotes) {
        data.notes = track.notes.map((note) => ({
          midi: note.midi,
          name: note.name,
          time: note.time,
          duration: note.duration,
          velocity: note.velocity,
          ticks: note.ticks,
        }))
      }
      return data
    }),
  }
}

// Inverse of midiToData: build a Midi from the note-centric JSON. Only the fields
// documented on midi_read are consumed; derived fields (duration, ppq, index,
// noteCount, instrument.family) are ignored.
async function dataToMidi(data) {
  const { Midi } = await loadToneMidi()
  const midi = new Midi()
  midi.name = typeof data.name === 'string' ? data.name : ''

  const tempos = Array.isArray(data.tempos) && data.tempos.length > 0
    ? data.tempos
    : [{ bpm: 120, ticks: 0 }]
  for (const tempo of tempos) {
    midi.header.tempos.push({ bpm: clamp(tempo.bpm, 1, 1000), ticks: tempo.ticks ?? 0 })
  }
  for (const ts of data.timeSignatures ?? []) {
    const [num, den] = ts.timeSignature ?? [4, 4]
    midi.header.timeSignatures.push({ timeSignature: [num, den], ticks: ts.ticks ?? 0 })
  }
  for (const ks of data.keySignatures ?? []) {
    midi.header.keySignatures.push({ key: ks.key ?? 'C', scale: ks.scale ?? 'major', ticks: ks.ticks ?? 0 })
  }
  // Tempo and time-signature changes only take effect for note timing after update().
  midi.header.update()

  for (const trackData of data.tracks ?? []) {
    const track = midi.addTrack()
    track.name = typeof trackData.name === 'string' ? trackData.name : ''
    if (typeof trackData.channel === 'number') {
      track.channel = clamp(Math.floor(trackData.channel), 0, 15)
    }
    const instrument = trackData.instrument
    if (instrument && typeof instrument.number === 'number') {
      track.instrument.number = clamp(Math.floor(instrument.number), 0, 127)
    } else if (instrument && typeof instrument.name === 'string') {
      track.instrument.name = instrument.name
    }
    const notes = [...(trackData.notes ?? [])].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
    for (const note of notes) {
      track.addNote({
        midi: clamp(Math.round(note.midi), 0, 127),
        time: Math.max(0, note.time ?? 0),
        duration: Math.max(0.001, note.duration ?? 0.25),
        velocity: clamp(note.velocity ?? 0.8, 0, 1),
      })
    }
  }
  return midi
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Common chord qualities as root-relative pitch-class intervals.
const CHORD_TYPES = [
  { intervals: [0, 4, 7], symbol: '' },
  { intervals: [0, 3, 7], symbol: 'm' },
  { intervals: [0, 3, 6], symbol: 'dim' },
  { intervals: [0, 4, 8], symbol: 'aug' },
  { intervals: [0, 5, 7], symbol: 'sus4' },
  { intervals: [0, 2, 7], symbol: 'sus2' },
  { intervals: [0, 4, 7, 11], symbol: 'maj7' },
  { intervals: [0, 4, 7, 10], symbol: '7' },
  { intervals: [0, 3, 7, 10], symbol: 'm7' },
  { intervals: [0, 3, 6, 10], symbol: 'm7b5' },
  { intervals: [0, 3, 6, 9], symbol: 'dim7' },
  { intervals: [0, 4, 7, 9], symbol: '6' },
  { intervals: [0, 3, 7, 9], symbol: 'm6' },
]

// Name a chord from its sounding MIDI pitches (lowest sounding pitch = root).
function nameChord(pitches) {
  const classes = [...new Set(pitches.map((p) => ((p % 12) + 12) % 12))]
  if (classes.length === 0) return ''
  const lowestMidi = Math.min(...pitches)
  const root = ((lowestMidi % 12) + 12) % 12
  const rel = [...new Set(classes.map((c) => (c - root + 12) % 12))].sort((a, b) => a - b)
  for (const type of CHORD_TYPES) {
    if (rel.length === type.intervals.length && rel.every((v, i) => v === type.intervals[i])) {
      return PITCH_NAMES[root] + type.symbol
    }
  }
  return PITCH_NAMES[root] + '(' + rel.join(',') + ')'
}

// Cluster notes by near-simultaneous onset (merged across tracks) into chord groups.
function extractChords(midi, epsilon) {
  const notes = []
  for (const track of midi.tracks) {
    // Drum tracks carry percussion keys, not pitches — skip them for chords.
    if (track.instrument && track.instrument.family === 'drums') continue
    for (const note of track.notes) {
      notes.push({ midi: note.midi, name: note.name, time: note.time })
    }
  }
  notes.sort((a, b) => a.time - b.time)
  const groups = []
  for (const note of notes) {
    const last = groups[groups.length - 1]
    if (last && note.time - last.lastTime <= epsilon) {
      last.notes.push(note)
      last.lastTime = Math.max(last.lastTime, note.time)
    } else {
      groups.push({ time: note.time, lastTime: note.time, notes: [note] })
    }
  }
  return groups.map((group) => ({
    time: group.time,
    notes: group.notes.map((n) => n.name),
    chord: nameChord(group.notes.map((n) => n.midi)),
  }))
}

async function run(op) {
  switch (op.op) {
    case 'read': {
      const midi = await readMidi(op.path)
      return midiToData(midi, op.mode === 'full')
    }
    case 'write': {
      const midi = await dataToMidi(op.midi)
      const bytes = midi.toArray()
      await writeFile(op.path, Buffer.from(bytes))
      return {
        path: op.path,
        bytes: bytes.length,
        duration: midi.duration,
        tracks: midi.tracks.length,
      }
    }
    case 'transpose': {
      const midi = await readMidi(op.path)
      const semitones = Math.round(op.semitones ?? 0)
      let noteCount = 0
      midi.tracks.forEach((track, index) => {
        if (op.trackIndex !== undefined && op.trackIndex !== null && index !== op.trackIndex) return
        for (const note of track.notes) {
          note.midi = clamp(note.midi + semitones, 0, 127)
          noteCount++
        }
      })
      const bytes = midi.toArray()
      const out = op.outputPath || op.path
      await writeFile(out, Buffer.from(bytes))
      return { path: out, bytes: bytes.length, semitones, notes: noteCount }
    }
    case 'quantize': {
      const midi = await readMidi(op.path)
      const bpm = midi.header.tempos[0]?.bpm ?? 120
      const subdivisions = Math.max(1, Math.round(op.subdivisions ?? 4))
      const step = 60 / bpm / subdivisions
      let noteCount = 0
      for (const track of midi.tracks) {
        for (const note of track.notes) {
          note.time = Math.round(note.time / step) * step
          noteCount++
        }
      }
      const bytes = midi.toArray()
      const out = op.outputPath || op.path
      await writeFile(out, Buffer.from(bytes))
      return { path: out, bytes: bytes.length, subdivisions, stepSeconds: step, notes: noteCount }
    }
    case 'tempo': {
      const midi = await readMidi(op.path)
      const bpm = clamp(op.bpm ?? 120, 1, 1000)
      midi.header.setTempo(bpm)
      const bytes = midi.toArray()
      const out = op.outputPath || op.path
      await writeFile(out, Buffer.from(bytes))
      return { path: out, bytes: bytes.length, bpm }
    }
    case 'chords': {
      const midi = await readMidi(op.path)
      const epsilon = typeof op.epsilon === 'number' && op.epsilon > 0 ? op.epsilon : 0.05
      return { path: op.path, chords: extractChords(midi, epsilon) }
    }
    case 'upload': {
      const bytes = Buffer.from(op.base64, 'base64')
      const dir = dirname(op.path)
      await mkdir(dir, { recursive: true })
      await cleanupDir(dir, 24 * 3600 * 1000)
      await writeFile(op.path, bytes)
      return { path: op.path, bytes: bytes.length }
    }
    case 'download': {
      const ti = op.trackIndex
      if (ti !== undefined && ti !== null) {
        const { Midi } = await loadToneMidi()
        const midi = await readMidi(op.path)
        const kept = midi.tracks[ti]
        if (!kept) throw new Error('track index ' + ti + ' not found')
        midi.tracks = [kept]
        const bytes = midi.toArray()
        const base = basename(op.path).replace(/\.midi?$/i, '')
        return { name: base + '_track' + ti + '.mid', base64: Buffer.from(bytes).toString('base64'), bytes: bytes.length }
      }
      const bytes = await readFile(op.path)
      return { name: basename(op.path), base64: Buffer.from(bytes).toString('base64'), bytes: bytes.length }
    }
    default:
      throw new Error('unknown op: ' + op.op)
  }
}

let input = ''
for await (const chunk of process.stdin) {
  input += chunk.toString()
}

run(JSON.parse(input))
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error && error.message ? error.message : String(error))
    process.exitCode = 1
  })
