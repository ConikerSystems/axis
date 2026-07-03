/* SVG game board: renders the faithful 1942.2 map from MAP_DATA.geometry,
   with pan/zoom (touch + mouse), unit stacks, and drag-and-drop movement.
   Pure view: all legality comes from the engine via callbacks. */
window.Board = (function () {
  "use strict";

  const POWER_COLOR = { // chip tints matched to the reference app
    soviet: "#8a2b2b", germany: "#26292e", uk: "#c2a469", japan: "#d5852f", us: "#6d8a48",
  };
  const POWER_FILL = { // muted map fills, weathered-board style
    soviet: "#c08a70", germany: "#8ea3ad", uk: "#d9c49a", japan: "#e2a35c", us: "#a9b385",
  };
  const NEUTRAL_FILL = "#cfc6b3";
  const SEA_FILL = "#a7b8b1";
  const GLYPH = { infantry: "I", artillery: "A", tank: "T", aaa: "AA", factory: "IC",
    fighter: "F", bomber: "B", submarine: "S", transport: "Tr", destroyer: "D",
    cruiser: "C", carrier: "CV", battleship: "BB" };

  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  function create(svg, MAP, callbacks) {
    const cb = callbacks || {};
    const W = MAP.width, H = MAP.height;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = "";

    // parchment texture + vignette
    const defs = el("defs", {}, svg);
    defs.innerHTML = `
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"/>
        <feComposite operator="over" in2="SourceGraphic"/>
      </filter>
      <radialGradient id="vign" cx="50%" cy="50%" r="75%">
        <stop offset="70%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.25"/>
      </radialGradient>
      <marker id="star" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10">
        <path d="M5 0l1.4 3.4L10 3.8 7.3 6.2l.9 3.8L5 8 1.8 10l.9-3.8L0 3.8l3.6-.4z" fill="#fff"/>
      </marker>`;

    const vp = el("g", { id: "viewport" }, svg);
    const gSpaces = el("g", { id: "spaces" }, vp);
    const gBorders = el("g", { id: "borders" }, vp);
    const gLabels = el("g", { id: "labels" }, vp);
    const gMarks = el("g", { id: "marks" }, vp);   // VC stars, IC icons, damage
    const gUnits = el("g", { id: "units" }, vp);
    const gHi = el("g", { id: "highlights", "pointer-events": "none" }, vp);
    const gDrag = el("g", { id: "dragghost", "pointer-events": "none" }, vp);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#vign)", "pointer-events": "none" }, vp);

    const spacePaths = {};
    let game = null;

    // --- build static geometry ---
    for (const [id, polys] of Object.entries(MAP.geometry)) {
      const s = MAP.spaces[id];
      const d = polys.map(p => "M" + p.map(pt => pt[0] + " " + pt[1]).join("L") + "Z").join("");
      const path = el("path", { d, "data-id": id, class: "space " + (s.sea ? "sea" : "land") }, gSpaces);
      spacePaths[id] = path;
      el("path", { d, class: "border " + (s.sea ? "sea-b" : "land-b") }, gBorders);
    }
    // labels
    for (const [id, c] of Object.entries(MAP.centers)) {
      const s = MAP.spaces[id];
      if (s.sea) {
        el("text", { x: c[0], y: c[1], class: "sz-label" }, gLabels).textContent = id.replace("sz", "");
      } else if (!s.impassable) {
        const t = el("text", { x: c[0], y: c[1] - 14, class: "t-label" }, gLabels);
        t.textContent = s.name;
        if (s.ipc) {
          const b = el("g", { class: "ipc-badge" }, gLabels);
          el("circle", { cx: c[0], cy: c[1] + 4, r: 11 }, b);
          el("text", { x: c[0], y: c[1] + 8, class: "ipc-text" }, b).textContent = s.ipc;
        }
      } else {
        el("text", { x: c[0], y: c[1], class: "t-label neutral" }, gLabels).textContent = s.name;
      }
    }

    // --- pan/zoom ---
    let view = { x: 0, y: 0, k: 1 };
    const applyView = () => vp.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
    const clampView = () => {
      view.k = Math.min(8, Math.max(0.9, view.k));
      const vw = W * view.k, vh = H * view.k;
      view.x = Math.min(80, Math.max(W - vw - 80 > 0 ? 0 : W - vw - 80, view.x));
      view.y = Math.min(80, Math.max(H - vh - 80 > 0 ? 0 : H - vh - 80, view.y));
    };
    const svgPoint = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      const sx = (cx - r.left) / r.width * W, sy = (cy - r.top) / r.height * H;
      return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
    };

    const pointers = new Map();
    let pinch = null, panning = false, drag = null, moved = false;

    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k,
          cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y };
        drag = null; gDrag.innerHTML = ""; gHi.innerHTML = "";
        return;
      }
      // drag a unit stack?
      const stack = e.target.closest && e.target.closest(".stack.draggable");
      if (stack && cb.onDragStart) {
        const info = cb.onDragStart(stack.dataset.space, stack.dataset.power);
        if (info && info.targets && info.targets.length) {
          drag = { from: stack.dataset.space, power: stack.dataset.power, targets: new Set(info.targets) };
          highlight([...drag.targets], "target");
          const p = svgPoint(e.clientX, e.clientY);
          drawGhost(p, stack.dataset.count, stack.dataset.power);
          return;
        }
      }
      panning = true;
    });
    svg.addEventListener("pointermove", (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = svg.getBoundingClientRect();
        const scale = Math.min(8, Math.max(0.9, pinch.k * d / pinch.d));
        // zoom about pinch center
        const px = (pinch.cx - r.left) / r.width * W, py = (pinch.cy - r.top) / r.height * H;
        view.k = scale;
        view.x = px - (px - pinch.vx) * (scale / pinch.k);
        view.y = py - (py - pinch.vy) * (scale / pinch.k);
        clampView(); applyView();
        return;
      }
      if (drag) {
        const p = svgPoint(e.clientX, e.clientY);
        gDrag.setAttribute("transform", `translate(${p.x},${p.y})`);
        const t = spaceAt(e);
        hoverTarget(t && drag.targets.has(t) ? t : null);
        return;
      }
      if (panning) {
        const r = svg.getBoundingClientRect();
        view.x += dx / r.width * W;
        view.y += dy / r.height * H;
        clampView(); applyView();
      }
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag) {
        const t = spaceAt(e);
        const d = drag; drag = null;
        gDrag.innerHTML = ""; clearHighlight();
        if (t && d.targets.has(t) && cb.onDrop) cb.onDrop(d.from, t, d.power);
      } else if (!moved && e.type === "pointerup") {
        const t = spaceAt(e);
        if (t && cb.onSpaceTap) cb.onSpaceTap(t, e);
      }
      panning = false;
    };
    svg.addEventListener("pointerup", endPointer);
    svg.addEventListener("pointercancel", endPointer);
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
      const k0 = view.k;
      view.k = Math.min(8, Math.max(0.9, view.k * (e.deltaY < 0 ? 1.15 : 0.87)));
      view.x = px - (px - view.x) * (view.k / k0);
      view.y = py - (py - view.y) * (view.k / k0);
      clampView(); applyView();
    }, { passive: false });

    function spaceAt(e) {
      // hit-test under pointer, ignoring unit/drag layers
      gUnits.style.pointerEvents = "none"; gDrag.style.display = "none";
      const n = document.elementFromPoint(e.clientX, e.clientY);
      gUnits.style.pointerEvents = ""; gDrag.style.display = "";
      const sp = n && n.closest && n.closest(".space");
      return sp ? sp.dataset.id : null;
    }
    function drawGhost(p, count, power) {
      gDrag.innerHTML = "";
      gDrag.setAttribute("transform", `translate(${p.x},${p.y})`);
      el("circle", { r: 26, fill: POWER_COLOR[power], stroke: "#fff", "stroke-width": 3, opacity: 0.9 }, gDrag);
      el("text", { y: 8, class: "ghost-text" }, gDrag).textContent = count;
    }

    // --- highlights ---
    function highlight(ids, kind) {
      clearHighlight();
      for (const id of ids) {
        const src = spacePaths[id];
        if (!src) continue;
        el("path", { d: src.getAttribute("d"), class: "hi " + (kind || "target") }, gHi);
      }
    }
    function clearHighlight() { gHi.innerHTML = ""; }
    let hoverEl = null;
    function hoverTarget(id) {
      if (hoverEl) { hoverEl.remove(); hoverEl = null; }
      if (id && spacePaths[id]) hoverEl = el("path", { d: spacePaths[id].getAttribute("d"), class: "hi hover" }, gHi);
    }

    // --- dynamic render ---
    function render() {
      if (!game) return;
      for (const [id, path] of Object.entries(spacePaths)) {
        const s = MAP.spaces[id];
        if (s.sea) { path.setAttribute("fill", SEA_FILL); continue; }
        if (s.impassable) { path.setAttribute("fill", NEUTRAL_FILL); continue; }
        const own = game.owner[id];
        path.setAttribute("fill", own ? POWER_FILL[own] : NEUTRAL_FILL);
      }
      renderMarks();
      renderUnits();
    }
    function renderMarks() {
      gMarks.innerHTML = "";
      for (const [id, s] of Object.entries(MAP.spaces)) {
        const c = MAP.centers[id]; if (!c) continue;
        if (s.vc) {
          const own = game.owner[id];
          const g2 = el("g", { transform: `translate(${c[0] - 26},${c[1] - 30})`, class: "vc" }, gMarks);
          el("path", { d: "M8 0l2.2 5.4L16 6l-4.3 3.9 1.4 6L8 12.8 2.9 16l1.4-6L0 6l5.8-.6z",
            fill: own && (own === "germany" || own === "japan") ? "#c33" : "#fff",
            stroke: "#333", "stroke-width": 1 }, g2);
        }
        const ics = game.unitsAt ? game.unitsAt(id, u => u.type === "factory") : [];
        if (ics.length) {
          const g2 = el("g", { transform: `translate(${c[0] + 14},${c[1] - 38})`, class: "ic" }, gMarks);
          el("path", { d: "M0 18v-8l6 4v-4l6 4v-4l6 4v-6h4v18H0z", fill: "#3a3f45", stroke: "#111", "stroke-width": 1 }, g2);
          const dmg = game.icDamage[id] || 0;
          if (dmg) {
            el("circle", { cx: 24, cy: 2, r: 9, fill: "#c33" }, g2);
            el("text", { x: 24, y: 6, class: "dmg-text" }, g2).textContent = dmg;
          }
        }
      }
    }
    function renderUnits() {
      gUnits.innerHTML = "";
      const byedSpace = {};
      for (const u of game.units) {
        if (u.dead || u.type === "factory") continue;
        if (u.onCarrier || u.onTransport) continue; // shown via count on host tooltip
        (byedSpace[u.space] = byedSpace[u.space] || []).push(u);
      }
      for (const [id, list] of Object.entries(byedSpace)) {
        const c = MAP.centers[id]; if (!c) continue;
        // group by power then type
        const groups = {};
        for (const u of list) {
          const k = u.power + "|" + u.type;
          groups[k] = groups[k] || { power: u.power, type: u.type, n: 0, cargo: 0 };
          groups[k].n++;
          if (u.type === "transport") groups[k].cargo += game.cargoOf(u).length;
          if (u.type === "carrier") groups[k].cargo += game.carrierFighters(u).length;
        }
        const keys = Object.keys(groups);
        const perRow = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(keys.length))));
        keys.forEach((k, i) => {
          const gr = groups[k];
          const col = i % perRow, row = Math.floor(i / perRow);
          const x = c[0] + (col - (Math.min(perRow, keys.length) - 1) / 2) * 42;
          const y = c[1] + 26 + row * 40;
          const isCur = game.players && game.current === gr.power;
          const node = el("g", {
            class: "stack" + (isCur ? " draggable" : ""),
            transform: `translate(${x},${y})`,
            "data-space": id, "data-power": gr.power, "data-type": gr.type, "data-count": gr.n,
          }, gUnits);
          el("circle", { r: 17, fill: POWER_COLOR[gr.power], stroke: "#12141a", "stroke-width": 1.5 }, node);
          const icon = el("g", { class: "stack-icon", fill: "#f4efe4", color: "#f4efe4" }, node);
          icon.innerHTML = (window.UNIT_ICONS && UNIT_ICONS[gr.type]) || "";
          if (!icon.innerHTML) el("text", { y: 5, class: "stack-glyph" }, node).textContent = GLYPH[gr.type];
          if (gr.n > 1) {
            el("circle", { cx: 13, cy: 13, r: 9, class: "count-badge" }, node);
            el("text", { x: 13, y: 17, class: "count-text" }, node).textContent = gr.n;
          }
          if (gr.cargo) {
            el("circle", { cx: -13, cy: -12, r: 8, class: "cargo-badge" }, node);
            el("text", { x: -13, y: -8, class: "cargo-text" }, node).textContent = gr.cargo;
          }
        });
      }
    }

    function focusSpace(id) {
      const c = MAP.centers[id]; if (!c) return;
      view.k = Math.max(view.k, 2.2);
      view.x = W / 2 - c[0] * view.k + (W / 2) * 0; // center horizontally in viewBox units
      view.x = W / 2 - c[0] * view.k;
      view.y = H / 2 - c[1] * view.k;
      clampView(); applyView();
    }

    applyView();
    return {
      setGame(g) { game = g; render(); },
      render, highlight, clearHighlight, focusSpace,
      colors: POWER_COLOR, glyphs: GLYPH,
    };
  }

  return { create, POWER_COLOR, GLYPH };
})();
