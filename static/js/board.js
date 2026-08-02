/* SVG game board: renders the faithful 1942.2 map from MAP_DATA.geometry,
   with pan/zoom (touch + mouse), unit stacks, and drag-and-drop movement.
   Pure view: all legality comes from the engine via callbacks. */
window.Board = (function () {
  "use strict";

  const POWER_COLOR = { // chip tints matched to the reference app
    soviet: "#8a2b2b", germany: "#26292e", uk: "#c2a469", japan: "#d5852f", us: "#6d8a48",
  };
  const POWER_FILL = { // muted historical map fills, aged-chart style
    soviet: "#c8917a", germany: "#95a7ad", uk: "#d8c191", japan: "#df9a4e", us: "#9fb079",
  };
  const NEUTRAL_FILL = "#d8cfba";
  const SEA_FILL = "#8f9d97"; // aged sea-chart grey-teal
  const GLYPH = { infantry: "I", artillery: "A", tank: "T", aaa: "AA", factory: "IC",
    fighter: "F", bomber: "B", submarine: "S", transport: "Tr", destroyer: "D",
    cruiser: "C", carrier: "CV", battleship: "BB" };
  const NAME = { infantry: "Infantry", artillery: "Artillery", tank: "Tank", aaa: "Antiaircraft Gun",
    factory: "Industrial Complex", fighter: "Fighter", bomber: "Bomber", submarine: "Submarine",
    transport: "Transport", destroyer: "Destroyer", cruiser: "Cruiser", carrier: "Aircraft Carrier",
    battleship: "Battleship" };
  const POWER_LABEL = { soviet: "Soviet", germany: "German", uk: "British", japan: "Japanese", us: "US" };

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

    // parchment texture + vignette + torn-sheet edge + old-chart graticule
    const defs = el("defs", {}, svg);
    defs.innerHTML = `
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"/>
        <feComposite operator="over" in2="SourceGraphic"/>
      </filter>
      <filter id="seaTexture" x="-2%" y="-2%" width="104%" height="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.02" numOctaves="4" seed="11" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.07 0"/>
        <feComposite operator="over" in2="SourceGraphic"/>
      </filter>
      <filter id="torn" x="-6%" y="-6%" width="112%" height="112%">
        <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="30" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="sheetShadow" x="-8%" y="-8%" width="116%" height="116%">
        <feDropShadow dx="0" dy="7" stdDeviation="12" flood-color="#3a3a34" flood-opacity="0.4"/>
      </filter>
      <pattern id="grat" width="120" height="120" patternUnits="userSpaceOnUse">
        <path d="M120 0V120M0 120H120" stroke="#5d6a64" stroke-width="1" fill="none" opacity="0.16"/>
      </pattern>
      <radialGradient id="vign" cx="50%" cy="50%" r="75%">
        <stop offset="62%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.28"/>
      </radialGradient>
      <radialGradient id="chipDome" cx="38%" cy="32%" r="80%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.32"/>
        <stop offset="45%" stop-color="#fff" stop-opacity="0.06"/>
        <stop offset="72%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.34"/>
      </radialGradient>
      <marker id="star" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10">
        <path d="M5 0l1.4 3.4L10 3.8 7.3 6.2l.9 3.8L5 8 1.8 10l.9-3.8L0 3.8l3.6-.4z" fill="#fff"/>
      </marker>`;

    const vp = el("g", { id: "viewport" }, svg);
    // torn ocean sheet: a full-bleed base so the whole map reads as one aged chart
    // torn from a larger sheet, with a soft drop shadow onto the table beneath.
    const gSheet = el("g", { filter: "url(#sheetShadow)" }, vp);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: SEA_FILL, filter: "url(#torn)" }, gSheet);
    el("rect", { x: 40, y: 40, width: W - 80, height: H - 80, fill: SEA_FILL, filter: "url(#seaTexture)",
      "pointer-events": "none" }, vp);
    el("rect", { x: 40, y: 40, width: W - 80, height: H - 80, fill: "url(#grat)", "pointer-events": "none" }, vp);
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

    // approximate radius of each space (from its polygon bounds) so unit stacks
    // can spread out where there's room and stay compact on small islands.
    const spaceExtent = {};
    for (const [id, polys] of Object.entries(MAP.geometry)) {
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (const p of polys) for (const pt of p) {
        if (pt[0] < minx) minx = pt[0]; if (pt[0] > maxx) maxx = pt[0];
        if (pt[1] < miny) miny = pt[1]; if (pt[1] > maxy) maxy = pt[1];
      }
      spaceExtent[id] = Math.max(26, Math.min(maxx - minx, maxy - miny) / 2);
    }

    // --- build static geometry ---
    // Sea zones first, land second: sea-zone polygons include their islands'
    // area, so land must always paint on top (fixes islands like Borneo being
    // covered by the surrounding sea zone).
    const ordered = Object.entries(MAP.geometry)
      .sort((a, b) => (MAP.spaces[a[0]].sea ? 0 : 1) - (MAP.spaces[b[0]].sea ? 0 : 1));
    for (const [id, polys] of ordered) {
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
        const t = el("text", { x: c[0], y: c[1] - 20, class: "t-label" }, gLabels);
        t.textContent = s.name;
        if (s.ipc) {
          const b = el("g", { class: "ipc-badge" }, gLabels);
          el("circle", { cx: c[0], cy: c[1] + 2, r: 14 }, b);
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

    // --- unit identity tooltip (hover on desktop, tap on touch) ---
    const tip = document.createElement("div");
    tip.className = "unit-tip"; tip.style.display = "none";
    (svg.parentNode || document.body).appendChild(tip);
    let tipTimer = null, pendingTip = null;
    function showTip(label, cx, cy, autohide) {
      if (!label) return;
      clearTimeout(tipTimer);
      tip.textContent = label; tip.style.display = "block";
      const wrap = (svg.parentNode || document.body).getBoundingClientRect();
      tip.style.left = (cx - wrap.left) + "px";
      tip.style.top = (cy - wrap.top) + "px";
      if (autohide) tipTimer = setTimeout(hideTip, 1800);
    }
    function hideTip() { clearTimeout(tipTimer); tip.style.display = "none"; }
    const stackUnder = (e) => e.target && e.target.closest && e.target.closest(".stack");
    svg.addEventListener("mouseover", (e) => { const s = stackUnder(e); if (s) showTip(s.dataset.label, e.clientX, e.clientY, false); });
    svg.addEventListener("mousemove", (e) => {
      if (tip.style.display !== "block") return;
      const s = stackUnder(e);
      if (s) showTip(s.dataset.label, e.clientX, e.clientY, false); else hideTip();
    });
    svg.addEventListener("mouseleave", hideTip);

    let gestureStart = null; // where the finger went down — taps are judged from here
    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gestureStart = { x: e.clientX, y: e.clientY };
      moved = false;
      hideTip();
      const hit = stackUnder(e);
      pendingTip = hit ? { label: hit.dataset.label } : null; // shown on a tap (touch)
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
          drag = { from: stack.dataset.space, power: stack.dataset.power,
            type: stack.dataset.type, targets: new Set(info.targets) };
          highlight([...drag.targets], "target");
          const p = svgPoint(e.clientX, e.clientY);
          drawGhost(p, stack.dataset.count, stack.dataset.power);
          return;
        }
        // stack with no legal moves: a tap on it should still open the unit picker
        if (cb.onStackTap) { drag = { from: stack.dataset.space, power: stack.dataset.power,
          type: stack.dataset.type, targets: new Set(), tapOnly: true }; return; }
      }
      panning = true;
    });
    svg.addEventListener("pointermove", (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      // a fingertip wobbles ~5-15px during a tap — only total travel from the
      // press point counts as real movement, and generously so (fixes iPad taps
      // silently turning into tiny pans and never registering)
      if (gestureStart &&
        Math.hypot(e.clientX - gestureStart.x, e.clientY - gestureStart.y) > 14) moved = true;
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
        if (!moved) return; // don't scroll the map under a finger that's just tapping
        const r = svg.getBoundingClientRect();
        view.x += dx / r.width * W;
        view.y += dy / r.height * H;
        clampView(); applyView();
      }
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      // a tap on a piece flashes its identity tooltip (touch has no hover)
      if (!moved && e.type === "pointerup" && pendingTip) showTip(pendingTip.label, e.clientX, e.clientY, true);
      pendingTip = null;
      if (drag) {
        const t = spaceAt(e);
        const d = drag; drag = null;
        gDrag.innerHTML = ""; clearHighlight();
        if (!moved && e.type === "pointerup" && cb.onStackTap) {
          cb.onStackTap(d.from, d.power, d.type); // a tap on a piece opens the unit picker
        } else if (!d.tapOnly && t && d.targets.has(t) && cb.onDrop) cb.onDrop(d.from, t, d.power);
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
        if (s.sea) { path.setAttribute("fill", "transparent"); continue; } // textured ocean base shows through
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
          const g2 = el("g", { transform: `translate(${c[0] - 38},${c[1] - 42}) scale(1.5)`, class: "vc" }, gMarks);
          el("path", { d: "M8 0l2.2 5.4L16 6l-4.3 3.9 1.4 6L8 12.8 2.9 16l1.4-6L0 6l5.8-.6z",
            fill: own && (own === "germany" || own === "japan") ? "#c33" : "#fff",
            stroke: "#333", "stroke-width": 1 }, g2);
        }
        const ics = game.unitsAt ? game.unitsAt(id, u => u.type === "factory") : [];
        if (ics.length) {
          const g2 = el("g", { transform: `translate(${c[0] + 18},${c[1] - 52}) scale(1.4)`, class: "ic" }, gMarks);
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
        const rowsN = Math.ceil(keys.length / perRow);
        const cols = Math.min(perRow, keys.length);
        // spread stacks out where the territory has room; stay >1 chip apart (52),
        // and cap so the block fits within ~1.7× the space's radius.
        const R = spaceExtent[id] || 60;
        const colSpace = Math.max(52, Math.min(72, cols > 1 ? (1.7 * R) / (cols - 1) : 72));
        const rowSpace = Math.max(50, Math.min(64, rowsN > 1 ? (1.7 * R) / (rowsN - 1) : 64));
        keys.forEach((k, i) => {
          const gr = groups[k];
          const row = Math.floor(i / perRow), col = i % perRow;
          const colsThisRow = Math.min(perRow, keys.length - row * perRow); // center each row
          const x = c[0] + (col - (colsThisRow - 1) / 2) * colSpace;
          const y = c[1] + 30 + row * rowSpace;
          const isCur = game.players && game.current === gr.power;
          const label = `${POWER_LABEL[gr.power] || ""} ${NAME[gr.type]}${gr.n > 1 ? "  ×" + gr.n : ""}` +
            (gr.cargo ? `  ·  ${gr.cargo} aboard` : "");
          const node = el("g", {
            class: "stack" + (isCur ? " draggable" : ""),
            transform: `translate(${x},${y})`,
            "data-space": id, "data-power": gr.power, "data-type": gr.type, "data-count": gr.n,
            "data-label": label.trim(),
          }, gUnits);
          // generous invisible touch target so finger taps land on the piece, not the map
          el("circle", { r: 36, fill: "rgba(0,0,0,0)" }, node);
          el("circle", { r: 23, fill: POWER_COLOR[gr.power], stroke: "#0c0e12", "stroke-width": 1.8 }, node);
          el("circle", { r: 21.5, fill: "url(#chipDome)", "pointer-events": "none" }, node); // plastic sheen
          const markup = (window.UNIT_ICONS && UNIT_ICONS[gr.type]) || "";
          if (markup) {
            // sculpted relief: dark offset shadow layer under a light top layer, scaled up
            const sh = el("g", { class: "stack-icon", fill: "#0a0b0e", color: "#0a0b0e",
              opacity: 0.32, transform: "translate(1,1.5) scale(1.5)", "pointer-events": "none" }, node);
            sh.innerHTML = markup;
            const ic = el("g", { class: "stack-icon", fill: "#f6f1e6", color: "#f6f1e6",
              transform: "scale(1.5)", "pointer-events": "none" }, node);
            ic.innerHTML = markup;
          } else el("text", { y: 5, class: "stack-glyph" }, node).textContent = GLYPH[gr.type];
          if (gr.n > 1) {
            el("circle", { cx: 18, cy: 17, r: 12.5, class: "count-badge" }, node);
            el("text", { x: 18, y: 22.5, class: "count-text" }, node).textContent = gr.n;
          }
          if (gr.cargo) {
            el("circle", { cx: -18, cy: -16, r: 10.5, class: "cargo-badge" }, node);
            el("text", { x: -18, y: -11.5, class: "cargo-text" }, node).textContent = gr.cargo;
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
