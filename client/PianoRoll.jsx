/** FL-style piano roll for the `midi_read` tool result. Renders entirely from
 *  the settled tool result (props.block.content), so it needs no client→host RPC.
 */
import React from 'react'

const BASE_PPS = 80
const BASE_ROW = 12
const NOTE_COLORS = ['#3da5ff', '#4cd97b', '#f2c14e', '#ef6a5c', '#a06af0', '#f07ab0', '#4ad0d0', '#f0984a', '#8a94a6']
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const ZX_MIN = 0.004
const ZX_MAX = 40

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}
function zxToSlider(zx) {
  return Math.round(200 * (Math.log(zx) - Math.log(ZX_MIN)) / (Math.log(ZX_MAX) - Math.log(ZX_MIN)))
}
function sliderToZx(v) {
  const t = v / 200
  return Math.exp(Math.log(ZX_MIN) + t * (Math.log(ZX_MAX) - Math.log(ZX_MIN)))
}
function isBlack(midi) {
  const pc = ((midi % 12) + 12) % 12
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
}
function noteName(midi) {
  const pc = ((midi % 12) + 12) % 12
  return NOTE_NAMES[pc] + Math.floor(midi / 12)
}

/** Extract the MIDI model from a settled midi_read result node. */
function midiFromBlock(block) {
  if (!block || block.kind !== 'tool-result') return null
  const content = Array.isArray(block.content) ? block.content : []
  for (const part of content) {
    if (part && part.type === 'text' && typeof part.text === 'string') {
      try {
        return JSON.parse(part.text)
      } catch (e) {
        return null
      }
    }
  }
  return null
}

function buildTracks(midi) {
  const list = midi && midi.tracks ? midi.tracks : []
  const tracks = []
  for (let i = 0; i < list.length; i++) {
    const track = list[i]
    const fam = track.instrument && track.instrument.family
    if (fam === 'drums' || fam === 'percussive' || fam === 'sound effects') continue
    if (!track.notes || track.notes.length === 0) continue
    let label = track.name
    if (!label && i > 0) {
      const prev = list[i - 1]
      if (prev && (!prev.notes || prev.notes.length === 0) && prev.name) label = prev.name
    }
    if (!label) label = track.instrument ? track.instrument.name : ('Track ' + track.index)
    tracks.push({ index: track.index, label: label })
  }
  return tracks
}

function collectModel(midi, trackFilter) {
  const notes = []
  for (const track of (midi && midi.tracks) || []) {
    if (trackFilter !== null && trackFilter !== undefined && track.index !== trackFilter) continue
    const fam = track.instrument && track.instrument.family
    if (fam === 'drums' || fam === 'percussive' || fam === 'sound effects') continue
    const color = NOTE_COLORS[(track.index || 0) % NOTE_COLORS.length]
    for (const n of (track.notes || [])) {
      notes.push({ midi: n.midi, time: n.time || 0, duration: n.duration || 0, name: noteName(n.midi), color })
    }
  }
  let maxTime = 1
  let minMidi = 60
  let maxMidi = 72
  for (const n of notes) {
    const end = n.time + n.duration
    if (end > maxTime) maxTime = end
    if (n.midi < minMidi) minMidi = n.midi
    if (n.midi > maxMidi) maxMidi = n.midi
  }
  minMidi = 0
  maxMidi = Math.min(127, maxMidi + 2)
  return { notes, maxTime, minMidi, maxMidi }
}

function buildKeys(model) {
  const keys = []
  for (let midi = model.maxMidi; midi >= model.minMidi; midi--) {
    const black = isBlack(midi)
    keys.push(React.createElement('div', {
      key: 'k' + midi,
      className: 'dsh-roll-key ' + (black ? 'dsh-black' : 'dsh-white'),
      title: noteName(midi),
      style: { top: ((model.maxMidi - midi) * BASE_ROW) + 'px', height: (BASE_ROW - 1) + 'px' },
    },
      React.createElement('span', { className: 'dsh-roll-keylabel' }, noteName(midi)),
    ))
  }
  return keys
}

function buildGrid(model, bpm) {
  const beat = 60 / (bpm || 120)
  const bar = beat * 4
  const els = []
  for (let t = 0; t <= model.maxTime + 1e-6; t += bar) {
    els.push(React.createElement('div', { key: 'bar' + t, className: 'dsh-roll-grid-v dsh-bar', style: { left: (t * BASE_PPS) + 'px' } }))
  }
  for (let t = 0; t <= model.maxTime + 1e-6; t += beat) {
    const inBar = Math.abs(t / bar - Math.round(t / bar)) < 1e-6
    if (!inBar) {
      els.push(React.createElement('div', { key: 'beat' + t, className: 'dsh-roll-grid-v', style: { left: (t * BASE_PPS) + 'px' } }))
    }
  }
  for (let midi = model.minMidi; midi <= model.maxMidi; midi++) {
    els.push(React.createElement('div', { key: 'h' + midi, className: 'dsh-roll-grid-h', style: { top: ((model.maxMidi - midi) * BASE_ROW) + 'px' } }))
  }
  return els
}

function buildNotes(model) {
  return model.notes.map((n, i) => React.createElement('div', {
    key: 'n' + i,
    className: 'dsh-roll-note',
    title: n.name + ' @ ' + n.time.toFixed(2) + 's',
    style: {
      left: (n.time * BASE_PPS) + 'px',
      top: ((model.maxMidi - n.midi) * BASE_ROW) + 'px',
      width: Math.max(2, n.duration * BASE_PPS - 2) + 'px',
      height: (BASE_ROW - 2) + 'px',
      background: n.color,
    },
  }))
}

/** The atomic toolview for midi_read, rendered from the settled result. */
export function PianoRoll({ block }) {
  const [view, setView] = React.useState({ zoomX: 0.5, zoomY: 0.3, panX: 0, panY: 0 })
  const [drag, setDrag] = React.useState(null)
  const [trackFilter, setTrackFilter] = React.useState(null)
  const [fitted, setFitted] = React.useState(false)
  const rollRef = React.useRef(null)
  const canvasRef = React.useRef(null)

  const midi = midiFromBlock(block)

  // Auto-fit once, when the model first becomes available.
  React.useEffect(() => {
    if (!midi || fitted) return
    const m = collectModel(midi, null)
    const w = canvasRef.current ? canvasRef.current.clientWidth : 600
    const h = canvasRef.current ? canvasRef.current.clientHeight : 360
    setView({
      zoomX: clamp(w / (m.maxTime * BASE_PPS), ZX_MIN, ZX_MAX),
      zoomY: clamp(h / ((m.maxMidi - m.minMidi + 1) * BASE_ROW), 0.1, 24),
      panX: 0,
      panY: 0,
    })
    setFitted(true)
  }, [midi, fitted])

  // Native wheel zoom (non-passive so the page doesn't scroll).
  React.useEffect(() => {
    const el = rollRef.current
    if (!el || !midi) return
    function onNativeWheel(e) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 0.87
      setView(v => ({ ...v, zoomX: clamp(v.zoomX * factor, ZX_MIN, ZX_MAX), zoomY: clamp(v.zoomY * factor, 0.1, 24) }))
    }
    el.addEventListener('wheel', onNativeWheel, { passive: false })
    return () => el.removeEventListener('wheel', onNativeWheel)
  }, [midi])

  if (!midi) {
    return React.createElement('div', { className: 'dsh-midi-caption' }, '等待 midi_read 结果…')
  }

  const tracks = buildTracks(midi)
  const model = collectModel(midi, trackFilter)
  if (model.notes.length === 0) {
    return React.createElement('div', { className: 'dsh-midi-caption' }, '没有可预览的旋律音符。')
  }

  const bpm = (midi.tempos && midi.tempos[0] && midi.tempos[0].bpm) || 120
  const worldW = model.maxTime * BASE_PPS
  const worldH = (model.maxMidi - model.minMidi + 1) * BASE_ROW
  const worldTransform = 'translate(' + view.panX + 'px,' + view.panY + 'px) scale(' + view.zoomX + ',' + view.zoomY + ')'
  const keyTransform = 'translate(0,' + view.panY + 'px) scale(1,' + view.zoomY + ')'

  function zoomBy(factor) {
    setView(v => ({ ...v, zoomX: clamp(v.zoomX * factor, ZX_MIN, ZX_MAX), zoomY: clamp(v.zoomY * factor, 0.1, 24) }))
  }
  function fit() {
    const w = canvasRef.current ? canvasRef.current.clientWidth : 600
    const h = canvasRef.current ? canvasRef.current.clientHeight : 360
    setView({
      zoomX: clamp(w / (model.maxTime * BASE_PPS), ZX_MIN, ZX_MAX),
      zoomY: clamp(h / ((model.maxMidi - model.minMidi + 1) * BASE_ROW), 0.1, 24),
      panX: 0,
      panY: 0,
    })
  }
  function onMouseDown(e) {
    setDrag({ startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY })
  }
  function onMouseMove(e) {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const cw = canvasRef.current ? canvasRef.current.clientWidth : 600
    const ch = canvasRef.current ? canvasRef.current.clientHeight : 360
    const contentW = worldW * view.zoomX
    const contentH = worldH * view.zoomY
    const minPanX = Math.min(0, cw - contentW)
    const minPanY = Math.min(0, ch - contentH)
    setView(v => ({
      ...v,
      panX: clamp(drag.panX + dx, minPanX, 0),
      panY: clamp(drag.panY + dy, minPanY, 0),
    }))
  }
  function onMouseUp() { setDrag(null) }

  return React.createElement('div', null,
    React.createElement('div', { className: 'dsh-roll-toolbar' },
      React.createElement('button', { className: 'dsh-roll-btn', onClick: () => zoomBy(1.3) }, '+'),
      React.createElement('button', { className: 'dsh-roll-btn', onClick: () => zoomBy(1 / 1.3) }, '−'),
      React.createElement('button', { className: 'dsh-roll-btn', onClick: fit }, '适应'),
      React.createElement('button', { className: 'dsh-roll-btn', onClick: () => setView({ zoomX: 0.5, zoomY: 0.3, panX: 0, panY: 0 }) }, '重置'),
      React.createElement('select', {
        className: 'dsh-roll-select',
        value: trackFilter === null ? '' : trackFilter,
        onChange: (e) => {
          const v = e.target.value
          setTrackFilter(v === '' ? null : Number(v))
        },
      },
        React.createElement('option', { value: '' }, '全部轨道'),
        tracks.map(t => React.createElement('option', { key: t.index, value: t.index }, t.label)),
      ),
      React.createElement('label', { className: 'dsh-roll-zoomslider' },
        '水平',
        React.createElement('input', {
          type: 'range',
          min: 0,
          max: 200,
          value: zxToSlider(view.zoomX),
          onChange: (e) => {
            const zx = sliderToZx(Number(e.target.value))
            setView(v => ({ ...v, zoomX: zx }))
          },
        }),
        React.createElement('span', { className: 'dsh-midi-caption', style: { marginTop: 0 } }, Math.round(view.zoomX * 100) + '%'),
      ),
      React.createElement('span', { className: 'dsh-midi-caption', style: { marginTop: 0 } },
        model.notes.length + ' 音符 · 拖拽平移 · 滚轮/按钮缩放'),
    ),
    React.createElement('div', {
      className: 'dsh-roll' + (drag ? ' dsh-dragging' : ''),
      ref: rollRef,
      onMouseDown: onMouseDown,
      onMouseMove: onMouseMove,
      onMouseUp: onMouseUp,
      onMouseLeave: onMouseUp,
    },
      React.createElement('div', { className: 'dsh-roll-keyboard' },
        React.createElement('div', { className: 'dsh-roll-keys', style: { height: worldH + 'px', transform: keyTransform } },
          buildKeys(model),
        ),
      ),
      React.createElement('div', { className: 'dsh-roll-canvas', ref: canvasRef },
        React.createElement('div', {
          className: 'dsh-roll-world',
          style: { width: worldW + 'px', height: worldH + 'px', transform: worldTransform },
        },
          buildGrid(model, bpm),
          buildNotes(model),
        ),
      ),
    ),
  )
}
