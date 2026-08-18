// Dynamic Cordis plugin (Client half): FL-style piano roll for `midi_read`,
// rendered inside the tool-call card. Data comes from host.call('midi-preview')
// — a package-private RPC that reads the full file, bypassing the ~24KB
// tool-result truncation that would break large MIDI files.
//
// The roll has a fixed piano keyboard on the left, a beat/bar grid, and
// colour-coded note blocks. Note/key/grid geometry is computed once in BASE
// coordinates and pan/zoom is applied as a CSS transform, so dragging and
// zooming never recompute the note DOM.
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    ctx.effect(() => styles.insert(
      '.dsh-midi-caption { font-size: 11px; color: #9a9aa2; margin-top: 6px; }'
      + '.dsh-midi-error { font-size: 12px; color: #d05a5a; }'
      + '.dsh-roll-toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }'
      + '.dsh-roll-btn { background: #26262e; color: #d0d0d8; border: 1px solid #34343e; border-radius: 4px; font-size: 12px; line-height: 1; padding: 5px 9px; cursor: pointer; }'
      + '.dsh-roll-btn:hover { background: #30303a; }'
      + '.dsh-roll-zoomslider { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #9a9aa2; }'
      + '.dsh-roll-zoomslider input[type=range] { width: 120px; cursor: pointer; }'
      + '.dsh-roll-select { background: #26262e; color: #d0d0d8; border: 1px solid #34343e; border-radius: 4px; font-size: 12px; padding: 4px 6px; cursor: pointer; max-width: 160px; }'
      + '.dsh-roll { position: relative; height: 360px; background: #17171b; border: 1px solid #2a2a30; border-radius: 8px; overflow: hidden; user-select: none; cursor: grab; touch-action: none; }'
      + '.dsh-roll.dsh-dragging { cursor: grabbing; }'
      + '.dsh-roll-keyboard { position: absolute; left: 0; top: 0; bottom: 0; width: 68px; overflow: hidden; background: #1d1d22; z-index: 2; border-right: 1px solid #2a2a30; }'
      + '.dsh-roll-keys { position: absolute; left: 0; top: 0; width: 68px; transform-origin: 0 0; }'
      + '.dsh-roll-canvas { position: absolute; left: 68px; top: 0; bottom: 0; right: 0; overflow: hidden; background: #141419; }'
      + '.dsh-roll-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }'
      + '.dsh-roll-key { position: absolute; left: 0; right: 0; box-sizing: border-box; border-bottom: 1px solid rgba(0,0,0,0.35); }'
      + '.dsh-roll-key.dsh-white { background: #e8e8ec; }'
      + '.dsh-roll-key.dsh-black { background: #101014; }'
      + '.dsh-roll-keylabel { position: absolute; left: 6px; bottom: 1px; font-size: 9px; line-height: 1; color: #8a8a94; pointer-events: none; }'
      + '.dsh-roll-key.dsh-black .dsh-roll-keylabel { color: #f0f0f2; }'
      + '.dsh-roll-note { position: absolute; border-radius: 3px; opacity: 0.92; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.25); }'
      + '.dsh-roll-grid-v { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.05); }'
      + '.dsh-roll-grid-v.dsh-bar { width: 2px; background: rgba(255,255,255,0.14); }'
      + '.dsh-roll-grid-h { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.04); }',
    ))

    const BASE_PPS = 80
    const BASE_ROW = 12
    const NOTE_COLORS = ['#3da5ff', '#4cd97b', '#f2c14e', '#ef6a5c', '#a06af0', '#f07ab0', '#4ad0d0', '#f0984a', '#8a94a6']
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    let canvasNode = null
    let rollEl = null

    function clamp(v, lo, hi) {
      return v < lo ? lo : (v > hi ? hi : v)
    }
    const ZX_MIN = 0.004
    const ZX_MAX = 40
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

    function pathFromBlock(block) {
      if (!block) return undefined
      const raw = block.kind === 'tool-result' ? (block.call ? block.call.argsRaw : null) : block.argsRaw
      if (!raw) return undefined
      try {
        const args = JSON.parse(raw)
        return typeof args.path === 'string' ? args.path : undefined
      } catch (e) {
        return undefined
      }
    }

    // Build the list of selectable tracks (noise tracks and empty naming tracks
    // excluded). A melodic track right after a naming track inherits its name.
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

    // Collect melodic notes (drums/percussion/sfx excluded), colour by track,
    // and derive bounds. Pass a track index to keep only that track.
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

    function PianoRoll(props) {
      const path = pathFromBlock(props.block)
      const [state, setState] = React.useState({ status: 'idle', midi: null, error: null })
      const [view, setView] = React.useState({ zoomX: 0.5, zoomY: 0.3, panX: 0, panY: 0 })
      const [drag, setDrag] = React.useState(null)
      const [trackFilter, setTrackFilter] = React.useState(null)

      React.useEffect(function () {
        if (!path) {
          setState({ status: 'idle', midi: null, error: null })
          return
        }
        let cancelled = false
        setState({ status: 'loading', midi: null, error: null })
        host.call('midi-preview', { path: path }).then(function (midi) {
          if (!cancelled) setState({ status: 'done', midi: midi, error: null })
        }).catch(function (err) {
          if (!cancelled) setState({ status: 'error', midi: null, error: String((err && err.message) || err) })
        })
        return function () { cancelled = true }
      }, [path])

      React.useEffect(function () {
        if (state.status !== 'done') return
        const el = rollEl
        if (!el) return
        function onNativeWheel(e) {
          e.preventDefault()
          const factor = e.deltaY < 0 ? 1.15 : 0.87
          setView(function (v) {
            return { ...v, zoomX: clamp(v.zoomX * factor, 0.004, 40), zoomY: clamp(v.zoomY * factor, 0.1, 24) }
          })
        }
        el.addEventListener('wheel', onNativeWheel, { passive: false })
        return function () {
          el.removeEventListener('wheel', onNativeWheel)
        }
      }, [state.status])

      React.useEffect(function () {
        if (state.status !== 'done' || !state.midi) return
        const w = canvasNode ? canvasNode.clientWidth : 600
        const h = canvasNode ? canvasNode.clientHeight : 360
        const m = collectModel(state.midi, trackFilter)
        const zy = clamp(h / ((m.maxMidi - m.minMidi + 1) * BASE_ROW), 0.1, 24)
        const zx = clamp(w / (m.maxTime * BASE_PPS), 0.004, 40)
        setView({ zoomX: zx, zoomY: zy, panX: 0, panY: 0 })
      }, [state.status])

      if (!path) return null
      if (state.status === 'loading') {
        return React.createElement('div', { className: 'dsh-midi-caption' }, '加载钢琴卷帘…')
      }
      if (state.status === 'error') {
        return React.createElement('div', { className: 'dsh-midi-error' }, '预览失败: ' + state.error)
      }
      if (state.status !== 'done' || !state.midi) return null

      const tracks = buildTracks(state.midi)
      const model = collectModel(state.midi, trackFilter)
      if (model.notes.length === 0) {
        return React.createElement('div', { className: 'dsh-midi-caption' }, '没有可预览的旋律音符。')
      }

      const bpm = (state.midi.tempos && state.midi.tempos[0] && state.midi.tempos[0].bpm) || 120
      const worldW = model.maxTime * BASE_PPS
      const worldH = (model.maxMidi - model.minMidi + 1) * BASE_ROW
      const worldTransform = 'translate(' + view.panX + 'px,' + view.panY + 'px) scale(' + view.zoomX + ',' + view.zoomY + ')'
      const keyTransform = 'translate(0,' + view.panY + 'px) scale(1,' + view.zoomY + ')'

      function zoomBy(factor) {
        setView(function (v) {
          return { ...v, zoomX: clamp(v.zoomX * factor, 0.004, 40), zoomY: clamp(v.zoomY * factor, 0.1, 24) }
        })
      }
      function fit() {
        const w = canvasNode ? canvasNode.clientWidth : 600
        const h = canvasNode ? canvasNode.clientHeight : 360
        setView({
          zoomX: clamp(w / (model.maxTime * BASE_PPS), 0.004, 40),
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
        const cw = canvasNode ? canvasNode.clientWidth : 600
        const ch = canvasNode ? canvasNode.clientHeight : 360
        const contentW = worldW * view.zoomX
        const contentH = worldH * view.zoomY
        const minPanX = Math.min(0, cw - contentW)
        const minPanY = Math.min(0, ch - contentH)
        setView(function (v) {
          return {
            ...v,
            panX: clamp(drag.panX + dx, minPanX, 0),
            panY: clamp(drag.panY + dy, minPanY, 0),
          }
        })
      }
      function onMouseUp() { setDrag(null) }
      function doDownload() {
        host.call('midi-download', { path: path, trackIndex: trackFilter }).then(function (res) {
          const bin = atob(res.base64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const blob = new Blob([bytes], { type: 'audio/midi' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = res.name
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }).catch(function (err) {
          console.error('下载失败: ' + String((err && err.message) || err))
        })
      }

      return React.createElement('div', null,
        React.createElement('div', { className: 'dsh-roll-toolbar' },
          React.createElement('button', { className: 'dsh-roll-btn', onClick: function () { zoomBy(1.3) } }, '+'),
          React.createElement('button', { className: 'dsh-roll-btn', onClick: function () { zoomBy(1 / 1.3) } }, '−'),
          React.createElement('button', { className: 'dsh-roll-btn', onClick: fit }, '适应'),
          React.createElement('button', { className: 'dsh-roll-btn', onClick: function () { setView({ zoomX: 0.5, zoomY: 0.3, panX: 0, panY: 0 }) } }, '重置'),
          React.createElement('button', { className: 'dsh-roll-btn', onClick: doDownload }, '下载'),
          React.createElement('select', {
            className: 'dsh-roll-select',
            value: trackFilter === null ? '' : trackFilter,
            onChange: function (e) {
              const v = e.target.value
              setTrackFilter(v === '' ? null : Number(v))
            },
          },
            React.createElement('option', { value: '' }, '全部轨道'),
            tracks.map(function (t) {
              return React.createElement('option', { key: t.index, value: t.index }, t.label)
            }),
          ),
          React.createElement('label', { className: 'dsh-roll-zoomslider' },
            '水平',
            React.createElement('input', {
              type: 'range',
              min: 0,
              max: 200,
              value: zxToSlider(view.zoomX),
              onChange: function (e) {
                const zx = sliderToZx(Number(e.target.value))
                setView(function (v) { return { ...v, zoomX: zx } })
              },
            }),
            React.createElement('span', { className: 'dsh-midi-caption', style: { marginTop: 0 } }, Math.round(view.zoomX * 100) + '%'),
          ),
          React.createElement('span', { className: 'dsh-midi-caption', style: { marginTop: 0 } },
            model.notes.length + ' 音符 · 拖拽平移 · 滚轮/按钮缩放'),
        ),
        React.createElement('div', {
          className: 'dsh-roll' + (drag ? ' dsh-dragging' : ''),
          ref: function (el) { rollEl = el },
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
          React.createElement('div', {
            className: 'dsh-roll-canvas',
            ref: function (el) { canvasNode = el },
          },
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

    slots.inject('tool.call.toolview', function () {
      return slots.register(
        { name: 'tool.call.toolview', key: 'midi_read' },
        function (props) {
          return React.createElement(PianoRoll, { block: props.block })
        },
      )
    })
  },
}
