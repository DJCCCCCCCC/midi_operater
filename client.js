window.__ModuleLoader__.load({
	id: "dsh-midi-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.mjs
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// client/styles.mjs
var CSS = [
  ".dsh-midi-caption { font-size: 11px; color: #9a9aa2; margin-top: 6px; }",
  ".dsh-midi-error { font-size: 12px; color: #d05a5a; }",
  ".dsh-roll-toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }",
  ".dsh-roll-btn { background: #26262e; color: #d0d0d8; border: 1px solid #34343e; border-radius: 4px; font-size: 12px; line-height: 1; padding: 5px 9px; cursor: pointer; }",
  ".dsh-roll-btn:hover { background: #30303a; }",
  ".dsh-roll-zoomslider { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #9a9aa2; }",
  ".dsh-roll-zoomslider input[type=range] { width: 120px; cursor: pointer; }",
  ".dsh-roll-select { background: #26262e; color: #d0d0d8; border: 1px solid #34343e; border-radius: 4px; font-size: 12px; padding: 4px 6px; cursor: pointer; max-width: 160px; }",
  ".dsh-roll { position: relative; height: 360px; background: #17171b; border: 1px solid #2a2a30; border-radius: 8px; overflow: hidden; user-select: none; cursor: grab; touch-action: none; }",
  ".dsh-roll.dsh-dragging { cursor: grabbing; }",
  ".dsh-roll-keyboard { position: absolute; left: 0; top: 0; bottom: 0; width: 68px; overflow: hidden; background: #1d1d22; z-index: 2; border-right: 1px solid #2a2a30; }",
  ".dsh-roll-keys { position: absolute; left: 0; top: 0; width: 68px; transform-origin: 0 0; }",
  ".dsh-roll-canvas { position: absolute; left: 68px; top: 0; bottom: 0; right: 0; overflow: hidden; background: #141419; }",
  ".dsh-roll-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }",
  ".dsh-roll-key { position: absolute; left: 0; right: 0; box-sizing: border-box; border-bottom: 1px solid rgba(0,0,0,0.35); }",
  ".dsh-roll-key.dsh-white { background: #e8e8ec; }",
  ".dsh-roll-key.dsh-black { background: #101014; }",
  ".dsh-roll-keylabel { position: absolute; left: 6px; bottom: 1px; font-size: 9px; line-height: 1; color: #8a8a94; pointer-events: none; }",
  ".dsh-roll-key.dsh-black .dsh-roll-keylabel { color: #f0f0f2; }",
  ".dsh-roll-note { position: absolute; border-radius: 3px; opacity: 0.92; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.25); }",
  ".dsh-roll-grid-v { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.05); }",
  ".dsh-roll-grid-v.dsh-bar { width: 2px; background: rgba(255,255,255,0.14); }",
  ".dsh-roll-grid-h { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.04); }"
].join("");

// client/PianoRoll.jsx
var import_react = __toESM(require("react"), 1);
var BASE_PPS = 80;
var BASE_ROW = 12;
var NOTE_COLORS = ["#3da5ff", "#4cd97b", "#f2c14e", "#ef6a5c", "#a06af0", "#f07ab0", "#4ad0d0", "#f0984a", "#8a94a6"];
var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var ZX_MIN = 4e-3;
var ZX_MAX = 40;
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function zxToSlider(zx) {
  return Math.round(200 * (Math.log(zx) - Math.log(ZX_MIN)) / (Math.log(ZX_MAX) - Math.log(ZX_MIN)));
}
function sliderToZx(v) {
  const t = v / 200;
  return Math.exp(Math.log(ZX_MIN) + t * (Math.log(ZX_MAX) - Math.log(ZX_MIN)));
}
function isBlack(midi) {
  const pc = (midi % 12 + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}
function noteName(midi) {
  const pc = (midi % 12 + 12) % 12;
  return NOTE_NAMES[pc] + Math.floor(midi / 12);
}
function midiFromBlock(block) {
  if (!block || block.kind !== "tool-result") return null;
  const content = Array.isArray(block.content) ? block.content : [];
  for (const part of content) {
    if (part && part.type === "text" && typeof part.text === "string") {
      try {
        return JSON.parse(part.text);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}
function buildTracks(midi) {
  const list = midi && midi.tracks ? midi.tracks : [];
  const tracks = [];
  for (let i = 0; i < list.length; i++) {
    const track = list[i];
    const fam = track.instrument && track.instrument.family;
    if (fam === "drums" || fam === "percussive" || fam === "sound effects") continue;
    if (!track.notes || track.notes.length === 0) continue;
    let label = track.name;
    if (!label && i > 0) {
      const prev = list[i - 1];
      if (prev && (!prev.notes || prev.notes.length === 0) && prev.name) label = prev.name;
    }
    if (!label) label = track.instrument ? track.instrument.name : "Track " + track.index;
    tracks.push({ index: track.index, label });
  }
  return tracks;
}
function collectModel(midi, trackFilter) {
  const notes = [];
  for (const track of midi && midi.tracks || []) {
    if (trackFilter !== null && trackFilter !== void 0 && track.index !== trackFilter) continue;
    const fam = track.instrument && track.instrument.family;
    if (fam === "drums" || fam === "percussive" || fam === "sound effects") continue;
    const color = NOTE_COLORS[(track.index || 0) % NOTE_COLORS.length];
    for (const n of track.notes || []) {
      notes.push({ midi: n.midi, time: n.time || 0, duration: n.duration || 0, name: noteName(n.midi), color });
    }
  }
  let maxTime = 1;
  let minMidi = 60;
  let maxMidi = 72;
  for (const n of notes) {
    const end = n.time + n.duration;
    if (end > maxTime) maxTime = end;
    if (n.midi < minMidi) minMidi = n.midi;
    if (n.midi > maxMidi) maxMidi = n.midi;
  }
  minMidi = 0;
  maxMidi = Math.min(127, maxMidi + 2);
  return { notes, maxTime, minMidi, maxMidi };
}
function buildKeys(model) {
  const keys = [];
  for (let midi = model.maxMidi; midi >= model.minMidi; midi--) {
    const black = isBlack(midi);
    keys.push(import_react.default.createElement(
      "div",
      {
        key: "k" + midi,
        className: "dsh-roll-key " + (black ? "dsh-black" : "dsh-white"),
        title: noteName(midi),
        style: { top: (model.maxMidi - midi) * BASE_ROW + "px", height: BASE_ROW - 1 + "px" }
      },
      import_react.default.createElement("span", { className: "dsh-roll-keylabel" }, noteName(midi))
    ));
  }
  return keys;
}
function buildGrid(model, bpm) {
  const beat = 60 / (bpm || 120);
  const bar = beat * 4;
  const els = [];
  for (let t = 0; t <= model.maxTime + 1e-6; t += bar) {
    els.push(import_react.default.createElement("div", { key: "bar" + t, className: "dsh-roll-grid-v dsh-bar", style: { left: t * BASE_PPS + "px" } }));
  }
  for (let t = 0; t <= model.maxTime + 1e-6; t += beat) {
    const inBar = Math.abs(t / bar - Math.round(t / bar)) < 1e-6;
    if (!inBar) {
      els.push(import_react.default.createElement("div", { key: "beat" + t, className: "dsh-roll-grid-v", style: { left: t * BASE_PPS + "px" } }));
    }
  }
  for (let midi = model.minMidi; midi <= model.maxMidi; midi++) {
    els.push(import_react.default.createElement("div", { key: "h" + midi, className: "dsh-roll-grid-h", style: { top: (model.maxMidi - midi) * BASE_ROW + "px" } }));
  }
  return els;
}
function buildNotes(model) {
  return model.notes.map((n, i) => import_react.default.createElement("div", {
    key: "n" + i,
    className: "dsh-roll-note",
    title: n.name + " @ " + n.time.toFixed(2) + "s",
    style: {
      left: n.time * BASE_PPS + "px",
      top: (model.maxMidi - n.midi) * BASE_ROW + "px",
      width: Math.max(2, n.duration * BASE_PPS - 2) + "px",
      height: BASE_ROW - 2 + "px",
      background: n.color
    }
  }));
}
function PianoRoll({ block }) {
  const [view, setView] = import_react.default.useState({ zoomX: 0.5, zoomY: 0.3, panX: 0, panY: 0 });
  const [drag, setDrag] = import_react.default.useState(null);
  const [trackFilter, setTrackFilter] = import_react.default.useState(null);
  const [fitted, setFitted] = import_react.default.useState(false);
  const rollRef = import_react.default.useRef(null);
  const canvasRef = import_react.default.useRef(null);
  const midi = midiFromBlock(block);
  import_react.default.useEffect(() => {
    if (!midi || fitted) return;
    const m = collectModel(midi, null);
    const w = canvasRef.current ? canvasRef.current.clientWidth : 600;
    const h = canvasRef.current ? canvasRef.current.clientHeight : 360;
    setView({
      zoomX: clamp(w / (m.maxTime * BASE_PPS), ZX_MIN, ZX_MAX),
      zoomY: clamp(h / ((m.maxMidi - m.minMidi + 1) * BASE_ROW), 0.1, 24),
      panX: 0,
      panY: 0
    });
    setFitted(true);
  }, [midi, fitted]);
  import_react.default.useEffect(() => {
    const el = rollRef.current;
    if (!el || !midi) return;
    function onNativeWheel(e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setView((v) => ({ ...v, zoomX: clamp(v.zoomX * factor, ZX_MIN, ZX_MAX), zoomY: clamp(v.zoomY * factor, 0.1, 24) }));
    }
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, [midi]);
  if (!midi) {
    return import_react.default.createElement("div", { className: "dsh-midi-caption" }, "\u7B49\u5F85 midi_read \u7ED3\u679C\u2026");
  }
  const tracks = buildTracks(midi);
  const model = collectModel(midi, trackFilter);
  if (model.notes.length === 0) {
    return import_react.default.createElement("div", { className: "dsh-midi-caption" }, "\u6CA1\u6709\u53EF\u9884\u89C8\u7684\u65CB\u5F8B\u97F3\u7B26\u3002");
  }
  const bpm = midi.tempos && midi.tempos[0] && midi.tempos[0].bpm || 120;
  const worldW = model.maxTime * BASE_PPS;
  const worldH = (model.maxMidi - model.minMidi + 1) * BASE_ROW;
  const worldTransform = "translate(" + view.panX + "px," + view.panY + "px) scale(" + view.zoomX + "," + view.zoomY + ")";
  const keyTransform = "translate(0," + view.panY + "px) scale(1," + view.zoomY + ")";
  function zoomBy(factor) {
    setView((v) => ({ ...v, zoomX: clamp(v.zoomX * factor, ZX_MIN, ZX_MAX), zoomY: clamp(v.zoomY * factor, 0.1, 24) }));
  }
  function fit() {
    const w = canvasRef.current ? canvasRef.current.clientWidth : 600;
    const h = canvasRef.current ? canvasRef.current.clientHeight : 360;
    setView({
      zoomX: clamp(w / (model.maxTime * BASE_PPS), ZX_MIN, ZX_MAX),
      zoomY: clamp(h / ((model.maxMidi - model.minMidi + 1) * BASE_ROW), 0.1, 24),
      panX: 0,
      panY: 0
    });
  }
  function onMouseDown(e) {
    setDrag({ startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY });
  }
  function onMouseMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const cw = canvasRef.current ? canvasRef.current.clientWidth : 600;
    const ch = canvasRef.current ? canvasRef.current.clientHeight : 360;
    const contentW = worldW * view.zoomX;
    const contentH = worldH * view.zoomY;
    const minPanX = Math.min(0, cw - contentW);
    const minPanY = Math.min(0, ch - contentH);
    setView((v) => ({
      ...v,
      panX: clamp(drag.panX + dx, minPanX, 0),
      panY: clamp(drag.panY + dy, minPanY, 0)
    }));
  }
  function onMouseUp() {
    setDrag(null);
  }
  return import_react.default.createElement(
    "div",
    null,
    import_react.default.createElement(
      "div",
      { className: "dsh-roll-toolbar" },
      import_react.default.createElement("button", { className: "dsh-roll-btn", onClick: () => zoomBy(1.3) }, "+"),
      import_react.default.createElement("button", { className: "dsh-roll-btn", onClick: () => zoomBy(1 / 1.3) }, "\u2212"),
      import_react.default.createElement("button", { className: "dsh-roll-btn", onClick: fit }, "\u9002\u5E94"),
      import_react.default.createElement("button", { className: "dsh-roll-btn", onClick: () => setView({ zoomX: 0.5, zoomY: 0.3, panX: 0, panY: 0 }) }, "\u91CD\u7F6E"),
      import_react.default.createElement(
        "select",
        {
          className: "dsh-roll-select",
          value: trackFilter === null ? "" : trackFilter,
          onChange: (e) => {
            const v = e.target.value;
            setTrackFilter(v === "" ? null : Number(v));
          }
        },
        import_react.default.createElement("option", { value: "" }, "\u5168\u90E8\u8F68\u9053"),
        tracks.map((t) => import_react.default.createElement("option", { key: t.index, value: t.index }, t.label))
      ),
      import_react.default.createElement(
        "label",
        { className: "dsh-roll-zoomslider" },
        "\u6C34\u5E73",
        import_react.default.createElement("input", {
          type: "range",
          min: 0,
          max: 200,
          value: zxToSlider(view.zoomX),
          onChange: (e) => {
            const zx = sliderToZx(Number(e.target.value));
            setView((v) => ({ ...v, zoomX: zx }));
          }
        }),
        import_react.default.createElement("span", { className: "dsh-midi-caption", style: { marginTop: 0 } }, Math.round(view.zoomX * 100) + "%")
      ),
      import_react.default.createElement(
        "span",
        { className: "dsh-midi-caption", style: { marginTop: 0 } },
        model.notes.length + " \u97F3\u7B26 \xB7 \u62D6\u62FD\u5E73\u79FB \xB7 \u6EDA\u8F6E/\u6309\u94AE\u7F29\u653E"
      )
    ),
    import_react.default.createElement(
      "div",
      {
        className: "dsh-roll" + (drag ? " dsh-dragging" : ""),
        ref: rollRef,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave: onMouseUp
      },
      import_react.default.createElement(
        "div",
        { className: "dsh-roll-keyboard" },
        import_react.default.createElement(
          "div",
          { className: "dsh-roll-keys", style: { height: worldH + "px", transform: keyTransform } },
          buildKeys(model)
        )
      ),
      import_react.default.createElement(
        "div",
        { className: "dsh-roll-canvas", ref: canvasRef },
        import_react.default.createElement(
          "div",
          {
            className: "dsh-roll-world",
            style: { width: worldW + "px", height: worldH + "px", transform: worldTransform }
          },
          buildGrid(model, bpm),
          buildNotes(model)
        )
      )
    )
  );
}

// client/index.mjs
var name = "midi-tools";
var inject = ["slots"];
function apply(ctx) {
  if (document.querySelector("style[data-midi-plugin-style]") === null) {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-midi-plugin-style", "");
    styleEl.setAttribute("data-plugin", "dsh-midi-plugin");
    styleEl.textContent = CSS;
    document.head.append(styleEl);
    ctx.effect(() => () => {
      styleEl.remove();
    }, "dsh-midi-plugin: styles");
  }
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: "midi_read" }, PianoRoll));
}
		return module.exports;
	}
});
