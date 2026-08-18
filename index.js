/**
 * Persistent host plugin for dsh-midi-plugin: registers the seven MIDI
 * recognize/edit tools on the global `tools` registry, so every session's agent
 * sees them. It imports @tonejs/midi directly through the shared engine in
 * midi.js — no subprocess bridge, because a standard npm package can `import`.
 *
 * Installed as a bundle: package.json declares `dsh.bundle.patch`, so
 * `dsh plugin --profile web add <this-package>` activates the cordis.patch.yml
 * layer that inserts the row below.
 *
 * @module dsh-midi-plugin
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { run } from './midi.js'

export const name = 'midi-tools'

export const inject = ['tools']

export function apply(ctx) {
  function register(name, description, parameters, makeOp) {
    ctx.tools.register(defineTool({
      name: name,
      description: description,
      parameters: parameters,
      output: {
        schema: { type: 'string' },
        render: function (_args, value) {
          return [{ type: 'text', text: value }]
        },
      },
      execute: async function (args, exec) {
        const result = await run(makeOp(args))
        return JSON.stringify(result)
      },
    }))
  }

  // --- explicit midi_write object schema (read → edit → write round-trips) ---
  const NOTE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      midi: { type: 'integer', required: true, description: 'MIDI note number 0..127.' },
      name: { type: 'string', description: 'Scientific pitch name (e.g. "C4"); ignored on write, derived from midi.' },
      time: { type: 'number', required: true, description: 'Start time in seconds.' },
      duration: { type: 'number', required: true, description: 'Duration in seconds.' },
      velocity: { type: 'number', description: 'Velocity 0..1 (default 0.8).' },
      ticks: { type: 'integer', description: 'Start tick; ignored on write, derived from time.' },
    },
  }
  const INSTRUMENT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'Instrument name (e.g. "acoustic grand piano").' },
      number: { type: 'integer', description: 'General MIDI program number 0..127.' },
      family: { type: 'string', description: 'Instrument family; ignored on write.' },
    },
  }
  const TRACK_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      index: { type: 'integer', description: 'Track index; ignored on write.' },
      name: { type: 'string', description: 'Track name.' },
      instrument: INSTRUMENT_SCHEMA,
      channel: { type: 'integer', description: 'MIDI channel 0..15.' },
      noteCount: { type: 'integer', description: 'Note count; ignored on write.' },
      notes: { type: 'array', items: NOTE_SCHEMA, description: 'Notes in this track.' },
    },
  }
  const TEMPO_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      bpm: { type: 'number', required: true },
      ticks: { type: 'integer' },
    },
  }
  const TIME_SIG_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      timeSignature: { type: 'array', items: { type: 'integer' }, description: '[numerator, denominator].' },
      ticks: { type: 'integer' },
    },
  }
  const KEY_SIG_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      key: { type: 'string' },
      scale: { type: 'string' },
      ticks: { type: 'integer' },
    },
  }
  const MIDI_OBJECT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'MIDI file name.' },
      duration: { type: 'number', description: 'Total duration in seconds; ignored on write.' },
      durationTicks: { type: 'integer', description: 'Total duration in ticks; ignored on write.' },
      ppq: { type: 'integer', description: 'Ticks per quarter note; ignored on write.' },
      tempos: { type: 'array', items: TEMPO_SCHEMA, description: 'Tempo events.' },
      timeSignatures: { type: 'array', items: TIME_SIG_SCHEMA, description: 'Time signature events.' },
      keySignatures: { type: 'array', items: KEY_SIG_SCHEMA, description: 'Key signature events.' },
      tracks: { type: 'array', required: true, items: TRACK_SCHEMA, description: 'Tracks.' },
    },
  }

  register(
    'midi_summary',
    'Read a MIDI (.mid) file and return a compact overview: name, tempo, time/key signatures, and per-track instrument, channel, and note count. Use midi_read to get the actual notes.',
    {
      path: { type: 'string', required: true, description: 'Absolute path to the .mid or .midi file to parse.' },
    },
    (args) => ({ op: 'read', path: args.path, mode: 'summary' }),
  )

  register(
    'midi_read',
    'Read and parse a MIDI (.mid) file into a JSON model of its name, tempo, time/key signatures, tracks, instruments, and notes. mode="full" (default) includes every note; mode="summary" returns only the overview.',
    {
      path: { type: 'string', required: true, description: 'Absolute path to the .mid or .midi file to parse.' },
      mode: { type: 'string', enum: ['summary', 'full'], description: 'summary = overview only; full = include every note (default).' },
    },
    (args) => ({ op: 'read', path: args.path, mode: args.mode || 'full' }),
  )

  register(
    'midi_write',
    'Write a MIDI object back to a .mid file. Pass the same shape midi_read returns; derived fields (duration, ppq, index, noteCount, instrument.family, note name/ticks) are ignored. This is how you save edits.',
    {
      path: { type: 'string', required: true, description: 'Absolute path to write the .mid file to.' },
      midi: { ...MIDI_OBJECT_SCHEMA, required: true, description: 'The MIDI object (same shape midi_read returns).' },
    },
    (args) => ({ op: 'write', path: args.path, midi: args.midi }),
  )

  register(
    'midi_transpose',
    'Transpose notes in a MIDI file by a number of semitones and write the result. Notes clamp to MIDI 0..127. Pass trackIndex to transpose only that one track.',
    {
      path: { type: 'string', required: true, description: 'Absolute path to the source .mid file.' },
      semitones: { type: 'integer', required: true, description: 'Semitone shift applied to every note (e.g. +12 = up one octave, -12 = down one octave).' },
      trackIndex: { type: 'integer', description: 'Optional track index to transpose only that track; omit to transpose all tracks.' },
      outputPath: { type: 'string', description: 'Optional output path; defaults to overwriting the input file.' },
    },
    (args) => ({ op: 'transpose', path: args.path, semitones: args.semitones, trackIndex: args.trackIndex, outputPath: args.outputPath }),
  )

  register(
    'midi_quantize',
    'Snap every note start time in a MIDI file to a rhythmic grid and write the result.',
    {
      path: { type: 'string', required: true, description: 'Absolute path to the source .mid file.' },
      subdivisions: { type: 'integer', description: 'Grid subdivisions per beat: 4 = 16th notes (default), 2 = 8th notes, 1 = quarter notes.' },
      outputPath: { type: 'string', description: 'Optional output path; defaults to overwriting the input file.' },
    },
    (args) => ({ op: 'quantize', path: args.path, subdivisions: args.subdivisions, outputPath: args.outputPath }),
  )

  register(
    'midi_tempo',
    'Set a MIDI file to a single tempo (bpm), replacing all existing tempo events, and write the result.',
    {
      path: { type: 'string', required: true, description: 'Absolute path to the source .mid file.' },
      bpm: { type: 'number', required: true, description: 'Target tempo in beats per minute (replaces every existing tempo event).' },
      outputPath: { type: 'string', description: 'Optional output path; defaults to overwriting the input file.' },
    },
    (args) => ({ op: 'tempo', path: args.path, bpm: args.bpm, outputPath: args.outputPath }),
  )

  register(
    'midi_chords',
    'Analyze a MIDI file and return its chord progression: notes are grouped into chords by near-simultaneous onset (across tracks) and named (e.g. C, Am, G7, Cmaj7).',
    {
      path: { type: 'string', required: true, description: 'Absolute path to the source .mid file.' },
      epsilon: { type: 'number', description: 'Onset clustering window in seconds (default 0.05).' },
    },
    (args) => ({ op: 'chords', path: args.path, epsilon: args.epsilon }),
  )
}
