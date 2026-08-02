/* UI orchestration: screens, phase flow, drag-drop handlers, battle dialogs,
   purchase/mobilize panels, hotseat handoff, AI turns, saves, undo. */
window.UI = (function () {
  "use strict";
  const { Game, UNITS, POWERS, POWER_NAMES, SIDES } = Engine;
  const MAP = window.MAP_DATA;
  const $ = (sel) => document.querySelector(sel);
  const div = (cls, html) => { const d = document.createElement("div"); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
  // a small unit chip (silhouette icon on a nation-colored disc) for battle UI
  const chipHtml = (type, power) => {
    const icon = (window.UNIT_ICONS && UNIT_ICONS[type]) || "";
    const color = (Board.POWER_COLOR && Board.POWER_COLOR[power]) || "#666";
    if (!icon) return `<span class="chip" style="background:${color}">${Board.GLYPH[type]}</span>`;
    return `<span class="chip" style="background:${color}"><svg viewBox="-14 -14 28 28" width="22" height="22" fill="#f4efe4" style="color:#f4efe4">${icon}</svg></span>`;
  };

  const PHASE_LABEL = { purchase: "Purchase", combatMove: "Combat Move", combat: "Combat",
    noncombatMove: "Noncombat Move", mobilize: "Mobilize", income: "Collect Income" };
  const EMBLEM = { soviet: "☭", germany: "✠", uk: "🎯", japan: "☀", us: "★" };

  // --- historical nation roundels (SVG, viewBox 0 0 32 32) for topbar + VC bar ---
  const STAR = "M0,-10 L2.94,-4.05 L9.51,-3.09 L4.76,1.55 L5.88,8.09 L0,5 L-5.88,8.09 L-4.76,1.55 L-9.51,-3.09 L-2.94,-4.05 Z";
  const SUN_RAYS = Array.from({ length: 12 }, (_, i) => {
    const a0 = (i * 30 - 6) * Math.PI / 180, a1 = (i * 30 + 6) * Math.PI / 180;
    const pt = (r, a) => `${(16 + r * Math.cos(a)).toFixed(1)} ${(16 + r * Math.sin(a)).toFixed(1)}`;
    return `<path d="M16 16L${pt(15, a0)}L${pt(15, a1)}Z" fill="#c62828"/>`;
  }).join("");
  const ROUNDEL_INNER = {
    soviet: `<circle cx="16" cy="16" r="15" fill="#b12a2a" stroke="#7a1c1c" stroke-width="1.5"/>
      <path transform="translate(16,16)" d="${STAR}" fill="#f3d24b" stroke="#8a6d18" stroke-width=".6"/>`,
    germany: `<circle cx="16" cy="16" r="15" fill="#2c2f35" stroke="#15171b" stroke-width="1.5"/>
      <g stroke="#e9e4d8" stroke-width="8" stroke-linecap="butt"><path d="M16 3.5V28.5"/><path d="M3.5 16H28.5"/></g>
      <g stroke="#15171b" stroke-width="4" stroke-linecap="butt"><path d="M16 3.5V28.5"/><path d="M3.5 16H28.5"/></g>`,
    uk: `<circle cx="16" cy="16" r="15" fill="#1d5a94"/><circle cx="16" cy="16" r="9.6" fill="#f0ebdd"/><circle cx="16" cy="16" r="4.6" fill="#b12a2a"/>`,
    japan: `<circle cx="16" cy="16" r="15" fill="#f0ebdd" stroke="#c9b98f" stroke-width="1"/>${SUN_RAYS}<circle cx="16" cy="16" r="6.4" fill="#c62828"/>`,
    us: `<circle cx="16" cy="16" r="15" fill="#1d5a94"/><path transform="translate(16,16) scale(1.28)" d="${STAR}" fill="#f0ebdd"/><circle cx="16" cy="16" r="2.6" fill="#b12a2a"/>`,
  };
  const roundel = (power, cls) =>
    `<svg class="roundel ${cls || ""}" viewBox="0 0 32 32" aria-hidden="true">${ROUNDEL_INNER[power] || ""}</svg>`;

  // --- contextual phase card (bottom-left) copy + themed glyph ---
  const PHASE_CARD = {
    purchase: { title: "PURCHASE UNITS", desc: "Buy units to mobilize this turn.", glyph: "factory" },
    combatMove: { title: "COMBAT MOVE", desc: "Move units into enemy spaces.", glyph: "swords" },
    combat: { title: "RESOLVE COMBAT", desc: "Fight your declared battles.", glyph: "burst" },
    noncombatMove: { title: "NONCOMBAT MOVE", desc: "Reposition and land aircraft.", glyph: "arrows" },
    mobilize: { title: "MOBILIZE", desc: "Place your newly built units.", glyph: "factory" },
    income: { title: "COLLECT INCOME", desc: "Gather IPCs from your territories.", glyph: "coins" },
  };
  const CARD_GLYPH = {
    factory: `<path d="M4 26V13l6 4v-4l6 4v-4l6 4V9h4v17z"/>`,
    swords: `<path d="M6 26l6-6M26 6l-8 8M6 6l14 14M26 26l-6-6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    burst: `<path d="M16 3l3 8 8-4-4 8 8 3-8 3 4 8-8-4-3 8-3-8-8 4 4-8-8-3 8-3-4-8 8 4z"/>`,
    arrows: `<path d="M4 12h16v-5l8 7-8 7v-5H4zM28 20H12" stroke="currentColor" stroke-width="2.2" fill="currentColor"/>`,
    coins: `<ellipse cx="16" cy="9" rx="10" ry="4"/><path d="M6 9v6c0 2.2 4.5 4 10 4s10-1.8 10-4V9M6 15v6c0 2.2 4.5 4 10 4s10-1.8 10-4v-6" fill="none" stroke="currentColor" stroke-width="2"/>`,
  };

  // Golden sculpted "miniature" of a unit for the purchase/mobilize rows: the same
  // recognizable silhouette as the map chips, but rendered in brass with a dark
  // relief layer under a gold gradient and a soft top highlight — the look of the
  // physical Axis & Allies plastic pieces cast in gold.
  function goldPiece(type) {
    const markup = (window.UNIT_ICONS && UNIT_ICONS[type]) || "";
    const gid = "gp-" + type;
    return `<svg class="gold-piece" viewBox="-14 -15 28 30" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0" stop-color="#fbe7ad"/><stop offset=".4" stop-color="#e0ad3d"/>
        <stop offset=".75" stop-color="#a9781f"/><stop offset="1" stop-color="#7a5312"/>
      </linearGradient></defs>
      <g fill="#4d3409" color="#4d3409" opacity=".5" transform="translate(.8,1)">${markup}</g>
      <g fill="url(#${gid})" color="url(#${gid})">${markup}</g>
      <g fill="#fff7db" color="#fff7db" opacity=".22" transform="translate(-.5,-.6)">${markup}</g>
    </svg>`;
  }
  // one-line role blurb shown when the "?" on a purchase row is tapped
  const UNIT_DESC = {
    infantry: "Cheap frontline defender (def 2); attacks at 2 when paired with artillery.",
    artillery: "Boosts one attacking infantry to attack at 2.",
    tank: "Fast armor — can blitz through undefended enemy territory.",
    aaa: "Fires at attacking aircraft before battle; cannot attack.",
    factory: "Builds new units each turn, up to the territory's income value.",
    fighter: "Versatile aircraft (def 4); escorts, intercepts, lands after combat.",
    bomber: "Long range, hits hard (atk 4), and can run strategic bombing raids.",
    submarine: "Surprise first strike; can submerge to slip away from battle.",
    transport: "Ferries land units across the sea; has no attack of its own.",
    destroyer: "Anti-submarine screen — cancels enemy sub surprise strikes.",
    cruiser: "Balanced warship; bombards the shore during amphibious assaults.",
    carrier: "Floating airbase — carries up to two fighters at sea.",
    battleship: "The heaviest warship: two hit points and shore bombardment.",
  };
  const UNIT_NAME = { infantry: "Infantry", artillery: "Artillery", tank: "Tank", aaa: "Antiaircraft Artillery",
    factory: "Industrial Complex", fighter: "Fighter", bomber: "Bomber", submarine: "Submarine",
    transport: "Transport", destroyer: "Destroyer", cruiser: "Cruiser", carrier: "Aircraft Carrier",
    battleship: "Battleship" };

  let game = null, board = null, phaseSnapshot = null, saveKey = "axis.autosave";
  let undoStack = []; // snapshots before each move action, for step-by-step undo
  // online ("Play by GitHub") context: {id, sha, mySeat, seatNames:{p1,p2}}
  let online = null, onlineOutbox = [];
  const otherSeat = () => online.mySeat === "p1" ? "p2" : "p1";
  const seatOf = (power) => game.players[power].seat || null;
  const iControl = (power) => !online || game.players[power].type === "ai" || seatOf(power) === online.mySeat;

  // ================= screens =================
  function show(id) {
    for (const s of document.querySelectorAll(".screen")) s.classList.remove("active");
    $(id).classList.add("active");
  }

  // ================= new game =================
  let onlineCreateMode = false; // when true, the setup screen assigns powers to Player 1/2
  function initNewGameScreen() {
    const grid = $("#powers-grid");
    grid.innerHTML = "";
    const cfg = (window.Online && Online.config()) || {};
    $("#screen-new h2").textContent = onlineCreateMode ? "CREATE AN ONLINE GAME" : "CREATE A HOTSEAT GAME";
    const oldExtra = $("#online-extra"); if (oldExtra) oldExtra.remove();
    if (onlineCreateMode) {
      const extra = div("settings");
      extra.id = "online-extra";
      extra.innerHTML = `<label class="setting"><b>PLAYER 1 (YOU):</b> ${cfg.name || "?"}
        &nbsp;&nbsp;<b>PLAYER 2:</b> <input id="p2-name" type="text" maxlength="14" placeholder="THEIR NAME"
        style="background:#101215;border:1px solid var(--gold-dim);color:var(--gold);font:inherit;font-weight:700;padding:6px 10px;border-radius:4px;">
        <span style="color:var(--dim)"> — assign each power below, then share the Game ID.</span></label>`;
      grid.parentNode.insertBefore(extra, grid);
    }
    for (const p of ["germany", "japan", "soviet", "uk", "us"]) { // axis left, allies right
      const card = div("power-card " + SIDES[p]);
      const opts = onlineCreateMode
        ? `<option value="p1"${SIDES[p] === "allies" ? " selected" : ""}>PLAYER 1</option>
           <option value="p2"${SIDES[p] === "axis" ? " selected" : ""}>PLAYER 2</option>
           <option value="ai">COMPUTER</option>`
        : `<option value="human">HUMAN</option><option value="ai">COMPUTER</option>`;
      card.innerHTML = `
        <div class="power-emblem">${EMBLEM[p]}</div>
        <div class="power-name">${POWER_NAMES[p].toUpperCase()}</div>
        <select data-power="${p}" class="ptype">${opts}</select>
        <input type="text" data-power="${p}" class="pname" placeholder="PLAYER NAME" maxlength="14"
          ${onlineCreateMode ? 'style="visibility:hidden"' : ""}>`;
      grid.appendChild(card);
      card.querySelector(".ptype").addEventListener("change", (e) => {
        card.querySelector(".pname").style.visibility =
          (onlineCreateMode || e.target.value === "ai") ? "hidden" : "visible";
      });
    }
    $("#custom-territories").checked = false;
    $("#new-start").onclick = startNewGame;
  }

  let territoryOverrides = {};
  function openTerritoryEditor() {
    territoryOverrides = territoryOverrides || {};
    const body = div("");
    body.appendChild(div("modal-note", "Reassign any starting territory to a different power. Its starting units switch sides with it. Income and victory logic follow the new owner."));
    const list = div("territory-editor");
    const groups = {};
    for (const [id, s] of Object.entries(MAP.spaces)) {
      if (s.sea || !s.owner) continue;
      (groups[s.owner] = groups[s.owner] || []).push([id, s]);
    }
    for (const p of POWERS) {
      if (!groups[p]) continue;
      list.appendChild(div("te-head " + SIDES[p], EMBLEM[p] + " " + POWER_NAMES[p].toUpperCase()));
      for (const [id, s] of groups[p].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
        const row = div("te-row");
        row.innerHTML = `<span>${s.name}${s.vc ? " ★" : ""} <em>${s.ipc || 0} IPC</em></span>`;
        const sel = document.createElement("select");
        for (const q of POWERS) {
          const o = document.createElement("option");
          o.value = q; o.textContent = POWER_NAMES[q];
          if ((territoryOverrides[id] || p) === q) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () => {
          if (sel.value === p) delete territoryOverrides[id];
          else territoryOverrides[id] = sel.value;
        });
        row.appendChild(sel);
        list.appendChild(row);
      }
    }
    body.appendChild(list);
    openModal("CUSTOMIZE TERRITORIES", body, [{ label: "DONE", cls: "primary" }]);
  }

  async function startNewGame() {
    const players = {};
    const cfg = (window.Online && Online.config()) || {};
    const p2name = onlineCreateMode ? (($("#p2-name").value || "").trim() || "Player 2") : null;
    let hasP1 = false, hasP2 = false;
    for (const p of POWERS) {
      const v = document.querySelector(`.ptype[data-power=${p}]`).value;
      if (onlineCreateMode) {
        if (v === "ai") players[p] = { type: "ai", name: "Computer" };
        else {
          players[p] = { type: "human", name: v === "p1" ? (cfg.name || "Player 1") : p2name, seat: v };
          if (v === "p1") hasP1 = true; else hasP2 = true;
        }
      } else {
        const name = document.querySelector(`.pname[data-power=${p}]`).value.trim() ||
          (v === "ai" ? "Computer" : POWER_NAMES[p]);
        players[p] = { type: v, name };
      }
    }
    if (onlineCreateMode && (!hasP1 || !hasP2)) {
      banner("Assign at least one power to each player."); return;
    }
    const options = {
      straits: $("#opt-straits").checked,
      interceptors: $("#opt-interceptors").checked,
      totalVictory: $("#opt-total").checked,
    };
    const overrides = $("#custom-territories").checked ? territoryOverrides : {};
    game = new Game({ mapData: MAP, players, options, territoryOverrides: overrides });
    game.title = $("#game-title").value.trim() || "1942 Campaign";
    if (onlineCreateMode) {
      const id = Online.newId();
      online = { id, sha: null, mySeat: "p1", seatNames: { p1: cfg.name || "Player 1", p2: p2name } };
      onlineOutbox = [];
      Online.setSeat(id, "p1");
      banner("Creating game on GitHub…", true);
      try {
        const res = await Online.putGame(id, packOnline(), null, "create " + id);
        online.sha = res.sha;
      } catch (e) { online = null; banner("Could not create game: " + e.message); return; }
      banner(null);
      const choice = await openModal("GAME CREATED — " + id, div("modal-note",
        `Your Game ID is <b style="font-size:1.6rem;color:var(--gold)">${id}</b><br><br>
         Tap <b>📲 INVITE ${p2name.toUpperCase()}</b> to text them a link — one tap on it and
         they're in the game (no setup, no token, no typing except their name).`),
        [{ label: "📲 INVITE " + p2name.toUpperCase(), cls: "primary", value: "invite" },
         { label: "START PLAYING", cls: "" }]);
      if (choice === "invite") await shareInvite();
      enterGame();
    } else enterGame();
  }

  // ================= game screen =================
  function enterGame(afterShow) {
    show("#screen-game");
    if (!board) {
      board = Board.create($("#board"), MAP, {
        onSpaceTap: onSpaceTap,
        onDragStart: onDragStart,
        onDrop: onDrop,
        onStackTap: onStackTap,
      });
    }
    board.setGame(game);
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      window.__ui = { get game() { return game; }, onDrop, onDragStart, onStackTap, openMovePicker,
        board: () => board, get online() { return online; }, handleInvite, inviteLink,
        startPhase, openMobilizePanel, openPurchasePanel };
    (afterShow || startPhase)();
  }

  function topBar() {
    $("#tb-round").textContent = game.round;
    const seq = $("#tb-powers");
    seq.innerHTML = "";
    POWERS.forEach((p, i) => {
      const e = div("tb-power " + SIDES[p] + (i === game.turnIndex ? " current" : ""), roundel(p));
      e.title = POWER_NAMES[p];
      seq.appendChild(e);
    });
    $("#tb-phase").textContent = PHASE_LABEL[game.phase].toUpperCase();
    const dots = $("#tb-dots"); dots.innerHTML = "";
    Object.keys(PHASE_LABEL).forEach((ph) => {
      dots.appendChild(div("dot" + (ph === game.phase ? " on" : "")));
    });
    // Victory Cities tug-of-war bar: 13 cities total, axis fills from the left,
    // allies from the right, neutral/uncontrolled stays grey in the middle.
    const TOTAL_VC = 13;
    const ax = game.victoryCityCount("axis"), al = game.victoryCityCount("allies");
    const need = game.options.totalVictory ? [13, 13] : [9, 10];
    let segs = "";
    for (let i = 0; i < TOTAL_VC; i++)
      segs += `<i class="${i < ax ? "ax" : i >= TOTAL_VC - al ? "al" : "mid"}"></i>`;
    $("#tb-vc").innerHTML = `<div class="vc-label">VICTORY CITIES</div>
      <div class="vc-row">
        <div class="vc-flank axis">${roundel("germany", "sm")}${roundel("japan", "sm")}</div>
        <div class="vc-box axis" title="Axis victory cities (need ${need[0]} to win)">${ax}<small>/${need[0]}</small></div>
        <div class="vc-track">${segs}</div>
        <div class="vc-box allies" title="Allied victory cities (need ${need[1]} to win)">${al}<small>/${need[1]}</small></div>
        <div class="vc-flank allies">${roundel("uk", "sm")}${roundel("soviet", "sm")}${roundel("us", "sm")}</div>
      </div>`;
    const pl = game.players[game.current];
    $("#tb-ipc").textContent = game.ipc[game.current] + " IPC";
    const pName = POWER_NAMES[game.current].toUpperCase();
    // only append the player's name when it differs from the power (avoids "SOVIET UNION — SOVIET UNION")
    const pCustom = pl.name && pl.name.toUpperCase() !== pName ? ` — ${pl.name}` : "";
    $("#tb-player").textContent = `${pName}${pCustom}${pl.type === "ai" ? " (COMPUTER)" : ""}`;
    $("#btn-undo").style.display = (game.phase === "combatMove" || game.phase === "noncombatMove") ? "" : "none";
    updatePhaseCard();
  }

  // Bottom-left contextual phase card + bottom-right HOLD button. The card mirrors
  // the current phase and taps through to the detail side-panel; HOLD ends the phase.
  function updatePhaseCard() {
    const card = $("#phase-card"), hold = $("#btn-hold");
    if (!card || !game) return;
    const info = PHASE_CARD[game.phase] || PHASE_CARD.purchase;
    const pl = game.players[game.current];
    const mine = pl.type === "human" && iControl(game.current);
    card.innerHTML = `
      <div class="pc-art ${SIDES[game.current]}"><svg viewBox="0 0 32 32" fill="currentColor">${CARD_GLYPH[info.glyph] || ""}</svg></div>
      <div class="pc-body"><div class="pc-title">${info.title}</div><div class="pc-desc">${info.desc}</div></div>`;
    card.style.display = mine ? "flex" : "none";
    // HOLD only ends a phase the local human is actively driving (not combat, which
    // is resolved through the battle list, and not the other seat's online turn).
    const canHold = mine && game.phase !== "combat" && game.phase !== "income" && !game.winner;
    hold.style.display = canHold ? "flex" : "none";
  }

  function banner(html, sticky) {
    const b = $("#banner");
    if (html == null) { b.classList.remove("show"); return; }
    b.innerHTML = html; b.classList.add("show");
    if (!sticky) setTimeout(() => b.classList.remove("show"), 2600);
  }

  function autosave() {
    try {
      localStorage.setItem(saveKey, JSON.stringify({
        title: game.title, when: Date.now(), snap: game.snapshot(),
        online: online ? { id: online.id, mySeat: online.mySeat, seatNames: online.seatNames } : null,
      }));
    } catch (e) { /* storage full */ }
  }
  async function loadAutosave() {
    try {
      const d = JSON.parse(localStorage.getItem(saveKey) || "null");
      if (!d) return false;
      if (d.online && d.online.id) {
        // online game: GitHub is the source of truth — fetch the latest state
        online = { id: d.online.id, sha: null, mySeat: d.online.mySeat, seatNames: d.online.seatNames };
        onlineOutbox = [];
        banner("Checking " + online.id + " on GitHub…", true);
        try {
          const g = await Online.getGame(online.id);
          banner(null);
          if (!g) { banner("Game " + online.id + " not found on GitHub."); online = null; return false; }
          online.sha = g.sha;
          game = Game.restore(g.data.snap, MAP);
          game.title = g.data.title;
          enterGame(() => {
            if (g.data.winner) victoryScreen();
            else if (g.data.turnSeat === online.mySeat) onRemote(g, true);
            else enterWaiting();
          });
          return true;
        } catch (e) {
          banner("Can't reach GitHub (" + e.message + ") — check your connection.");
          online = null; return false;
        }
      }
      online = null;
      game = Game.restore(d.snap, MAP);
      game.title = d.title;
      enterGame();
      return true;
    } catch (e) { console.error(e); return false; }
  }

  // ================= phase flow =================
  function startPhase() {
    topBar();
    board.setGame(game);
    board.clearHighlight();
    moveSelect = null;
    if (game.players[game.current].type === "human") aiFeedClear();
    sidePanel(null);
    autosave();
    if (game.winner) { if (online) pushOnline(true); return victoryScreen(); }
    const pl = game.players[game.current];
    if (online && pl.type === "human" && pl.seat !== online.mySeat) return pushAndWait();
    if (pl.type === "ai") return runAITurn();

    // live spectating: publish this phase's state so the waiting player watches (Option A)
    if (online && iControl(game.current)) pushSpectate();

    switch (game.phase) {
      case "purchase":
        if (!game.capitalHeld(game.current)) { game.endPurchase(); return startPhase(); }
        phaseSnapshot = null;
        openPurchasePanel();
        break;
      case "combatMove":
        phaseSnapshot = game.snapshot(); undoStack = [];
        banner("COMBAT MOVE — drag your units into hostile spaces. Tap a space for details & special orders.");
        sidePanel(moveHelpPanel(true));
        break;
      case "combat":
        runCombatPhase();
        break;
      case "noncombatMove":
        phaseSnapshot = game.snapshot(); undoStack = [];
        banner("NONCOMBAT MOVE — reposition units and land your aircraft.");
        sidePanel(moveHelpPanel(false));
        break;
      case "mobilize": {
        if (!game.purchases.some(p => p.qty > 0)) { game.endMobilize(); return startPhase(); }
        const first = game.purchases.find(p => p.qty > 0);
        openMobilizePanel(first ? first.unit : null); // first type preselected, ready to tap
        break;
      }
      case "income":
        game.collectIncome();
        topBar();
        if (game.winner) return victoryScreen();
        nextPower();
        break;
    }
  }

  function nextPower() {
    autosave();
    const pl = game.players[game.current];
    if (pl.type === "ai") return startPhase();
    // online: startPhase gates the other seat's powers (push & wait); own powers start directly
    if (online) return startPhase();
    // hotseat handoff splash
    const b = div("", `<div class="handoff">
      <div class="handoff-emblem ${SIDES[game.current]}">${EMBLEM[game.current]}</div>
      <h2>${POWER_NAMES[game.current].toUpperCase()}</h2>
      <p>Round ${game.round} — pass the device to <b>${pl.name}</b></p></div>`);
    openModal("NEXT PLAYER", b, [{ label: "BEGIN TURN", cls: "primary" }]).then(() => startPhase());
  }

  async function endPhaseAction() {
    if (!game || game.players[game.current].type === "ai") return;
    if (online && !iControl(game.current)) return; // spectating the other player's turn
    switch (game.phase) {
      case "purchase": game.endPurchase(); break;
      case "combatMove": {
        // warn about air units that can't demonstrably land
        const risky = game.units.filter(u => !u.dead && u.power === game.current &&
          UNITS[u.type].air && u.moved > 0 && !u.sbr &&
          !game.airCanLandAfter(u, u.space, 0));
        if (risky.length) {
          const okGo = await confirmModal("AIR UNITS AT RISK",
            `${risky.length} air unit(s) may have no safe landing spot after combat and will be LOST at the end of the turn. End the phase anyway?`);
          if (!okGo) return;
        }
        game.endCombatMove(); break;
      }
      case "combat": return; // driven by battle list
      case "noncombatMove": {
        const stranded = game.strandedAir();
        if (stranded.length) {
          const okGo = await confirmModal("AIRCRAFT WILL BE LOST",
            `${stranded.length} aircraft (${stranded.map(u => UNIT_NAME[u.type]).join(", ")}) have no legal landing space and will crash. Continue?`);
          if (!okGo) return;
        }
        game.endNoncombatMove(); break;
      }
      case "mobilize": game.endMobilize(); break;
    }
    startPhase();
  }
  $("#btn-end-phase").addEventListener("click", endPhaseAction);

  // Big round HOLD button (bottom-right): press-and-hold ~600ms to end the phase,
  // so the prominent button can't end a turn by an accidental tap.
  (function wireHold() {
    const hold = $("#btn-hold");
    if (!hold) return;
    let timer = null, fired = false;
    const cancel = () => { clearInterval(timer); timer = null; hold.classList.remove("holding"); hold.style.removeProperty("--fill"); };
    const start = (e) => {
      if (e.button && e.button !== 0) return;
      e.preventDefault(); fired = false;
      const t0 = Date.now(); const DUR = 600;
      hold.classList.add("holding");
      timer = setInterval(() => {
        const p = Math.min(1, (Date.now() - t0) / DUR);
        hold.style.setProperty("--fill", (p * 100).toFixed(0) + "%");
        if (p >= 1 && !fired) { fired = true; cancel(); endPhaseAction(); }
      }, 16);
    };
    hold.addEventListener("pointerdown", start);
    hold.addEventListener("pointerup", cancel);
    hold.addEventListener("pointerleave", cancel);
    hold.addEventListener("pointercancel", cancel);
  })();

  // Fullscreen toggle (⛶). iOS iPhone Safari lacks the Fullscreen API, so fall back
  // to a hint about installing the PWA for a true full-screen experience.
  (function wireFullscreen() {
    const btn = $("#btn-fullscreen");
    if (!btn) return;
    const doc = document;
    btn.addEventListener("click", () => {
      const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (fsEl) {
        (doc.exitFullscreen || doc.webkitExitFullscreen || (() => {})).call(doc);
        return;
      }
      const root = doc.documentElement;
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) req.call(root).catch(() => {});
      else banner("For full screen on iPhone: <b>Share ▸ Add to Home Screen</b>, then open Axis 1942 from the icon.", false);
    });
    const sync = () => {
      const on = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      btn.textContent = on ? "⤢" : "⛶";
      btn.title = on ? "Exit full screen" : "Full screen";
    };
    doc.addEventListener("fullscreenchange", sync);
    doc.addEventListener("webkitfullscreenchange", sync);
  })();

  // Undo steps back one move action at a time (down to the start of the phase).
  $("#btn-undo").addEventListener("click", () => {
    if (!(game.phase === "combatMove" || game.phase === "noncombatMove")) return;
    const stepped = undoStack.length > 0;
    const snap = stepped ? undoStack.pop() : phaseSnapshot;
    if (!snap) return;
    const title = game.title;
    game = Game.restore(snap, MAP);
    game.title = title;
    cancelMoveSelect(true);
    board.setGame(game);
    topBar();
    banner(stepped ? "Last move undone." : "Phase reset — all moves undone.");
  });

  // ---- country summary (📊): treasury, production, territories, VCs, forces ----
  function openSummary() {
    if (!game) return;
    const body = div("");
    const table = div("summary-table");
    table.innerHTML = `<div class="sum-row sum-head">
      <span class="sum-name">POWER</span><span>IPC<br><small>in hand</small></span>
      <span>PRODUCTION<br><small>territory pts</small></span><span>TERRITORIES</span>
      <span>★ CITIES</span><span>UNITS</span></div>`;
    const sideTotals = { axis: { ipc: 0, prod: 0, terr: 0, vc: 0, units: 0 },
      allies: { ipc: 0, prod: 0, terr: 0, vc: 0, units: 0 } };
    for (const p of POWERS) {
      const prod = game.production(p);
      const terr = Object.values(game.owner).filter(o => o === p).length;
      const vc = Object.entries(MAP.spaces).filter(([id, s]) => s.vc && game.owner[id] === p).length;
      const units = game.units.filter(u => !u.dead && u.power === p && u.type !== "factory").length;
      const st = sideTotals[SIDES[p]];
      st.ipc += game.ipc[p]; st.prod += prod; st.terr += terr; st.vc += vc; st.units += units;
      const row = div("sum-row " + SIDES[p] + (p === game.current ? " current" : ""));
      const subName = game.players[p].name && game.players[p].name !== POWER_NAMES[p] ? game.players[p].name : "";
      const subAI = game.players[p].type === "ai" ? (subName ? " (Computer)" : "Computer") : "";
      row.innerHTML = `<span class="sum-name">${EMBLEM[p]} ${POWER_NAMES[p]}
          <small>${subName}${subAI}${game.capitalHeld(p) ? "" : " · ⚠ capital lost"}</small></span>
        <span class="green"><b>${game.ipc[p]}</b></span><span><b>${prod}</b></span>
        <span>${terr}</span><span>${vc}</span><span>${units}</span>`;
      table.appendChild(row);
    }
    for (const side of ["axis", "allies"]) {
      const t = sideTotals[side];
      const row = div("sum-row total " + side);
      row.innerHTML = `<span class="sum-name">${side === "axis" ? "AXIS TOTAL" : "ALLIES TOTAL"}</span>
        <span class="green"><b>${t.ipc}</b></span><span><b>${t.prod}</b></span>
        <span>${t.terr}</span><span>${t.vc}</span><span>${t.units}</span>`;
      table.appendChild(row);
    }
    body.appendChild(table);
    const need = game.options.totalVictory ? [13, 13] : [9, 10];
    body.appendChild(div("modal-note", `Round ${game.round} · Victory: Axis needs ${need[0]} cities, Allies need ${need[1]}`));
    openModal("COUNTRY SUMMARY", body, [{ label: "CLOSE", cls: "primary" }]);
  }
  $("#btn-summary").addEventListener("click", openSummary);

  $("#btn-menu").addEventListener("click", async () => {
    const menuBtns = [
      { label: "RESUME", cls: "" },
      { label: "SAVE & EXIT TO MENU", cls: "", value: "exit" },
      { label: "GAME LOG", cls: "", value: "log" },
    ];
    if (online) menuBtns.push({ label: "🗑 CANCEL GAME (DELETE FOR BOTH)", cls: "", value: "cancelGame" });
    const choice = await openModal("MENU", div("", `<p class="modal-note">${game ? game.title : ""}${online ? " · 🌐 " + online.id : ""}</p>`), menuBtns);
    if (choice === "exit") {
      autosave();
      if (window.Online) { Online.stopPolling(); Online.stopSpectating(); }
      online = null; // Continue re-syncs from GitHub for online games
      show("#screen-home"); refreshHome();
    }
    if (choice === "log") {
      const body = div("log-view", game.log.slice(-120).map(l =>
        `<div><b>R${l.round}</b> ${POWER_NAMES[l.power] || ""} <i>${PHASE_LABEL[l.phase] || ""}</i> — ${l.msg}</div>`).join(""));
      openModal("GAME LOG", body, [{ label: "CLOSE", cls: "primary" }]);
    }
    if (choice === "cancelGame") {
      const sure = await confirmModal("CANCEL " + online.id + "?",
        `This permanently deletes "${game.title}" from GitHub for BOTH players. There is no undo.`);
      if (!sure) return;
      try {
        Online.stopPolling(); Online.stopSpectating();
        await Online.deleteGame(online.id);
        online = null;
        localStorage.removeItem(saveKey);
        banner("Game deleted.");
        show("#screen-home"); refreshHome();
      } catch (e) { banner("✗ " + e.message); }
    }
  });

  // ================= side panels =================
  let panelCollapsed = false;
  function panelToggleSync() {
    const sp = $("#side-panel"), t = $("#panel-toggle");
    if (!sp.classList.contains("open")) { t.style.display = "none"; return; }
    t.style.display = "flex";
    if (panelCollapsed) {
      sp.style.transform = "translateX(105%)";
      t.style.right = "0px";
      t.textContent = "◀";
    } else {
      sp.style.transform = "";
      t.style.right = Math.min(sp.offsetWidth, window.innerWidth * 0.88) + "px";
      t.textContent = "▶";
    }
  }
  function sidePanel(content) {
    const sp = $("#side-panel");
    sp.innerHTML = "";
    sp.style.transform = "";
    if (!content) { sp.classList.remove("open"); panelToggleSync(); return; }
    sp.appendChild(content);
    sp.classList.add("open");
    panelCollapsed = false; // each new panel opens expanded; the arrow tucks it away
    panelToggleSync();
  }
  $("#panel-toggle").addEventListener("click", () => {
    panelCollapsed = !panelCollapsed;
    panelToggleSync();
  });
  // Tapping the bottom-left phase card opens the detail panel (or tucks it away).
  $("#phase-card").addEventListener("click", () => {
    const sp = $("#side-panel");
    if (!sp.classList.contains("open")) return; // nothing detailed for this phase
    panelCollapsed = !panelCollapsed;
    panelToggleSync();
  });
  window.addEventListener("resize", panelToggleSync);
  function moveHelpPanel(combat) {
    const d = div("panel");
    d.appendChild(div("panel-title", combat ? "COMBAT MOVE" : "NONCOMBAT MOVE"));
    d.appendChild(div("panel-body", combat ?
      `<ul class="help">
        <li><b>Tap</b> one of your pieces to select exactly which units move, then tap a highlighted space to attack.</li>
        <li>Or <b>drag</b> a unit stack straight to a highlighted space.</li>
        <li>Drag land units onto a <b>sea zone</b> with your transport to load.</li>
        <li>Drag a <b>transport</b> onto an enemy coast to declare an amphibious assault.</li>
        <li>Tap an enemy territory with your <b>bomber</b> on it to order a strategic bombing raid.</li>
        <li>Tap a sea zone with only enemy subs/transports to declare an attack on them.</li>
      </ul>` :
      `<ul class="help">
        <li>Move units that did not fight this turn.</li>
        <li>Aircraft <b>must reach</b> a friendly territory or carrier.</li>
        <li>Transports may load & offload in friendly areas.</li>
        <li>Antiaircraft artillery may move one space now.</li>
      </ul>`));
    if (!combat) {
      const land = div("mini-btn wide", "✈ SHOW SAFE LANDINGS");
      land.onclick = showLandingSpots;
      d.appendChild(land);
    }
    const end = div("panel-cta", `Then press <b>END PHASE</b> ↗`);
    d.appendChild(end);
    return d;
  }
  // Noncombat helper: highlight every friendly spot the current power's aircraft
  // can still reach and safely land on this phase (green), so nothing is stranded.
  function showLandingSpots() {
    const spots = new Set();
    let planes = 0;
    for (const u of game.units) {
      if (u.dead || u.power !== game.current || !UNITS[u.type].air) continue;
      planes++;
      for (const s of game.airLandingSpots(u)) spots.add(s.space);
    }
    if (!planes) { banner("No aircraft to land."); return; }
    if (!spots.size) { banner("⚠ No safe landing spots in range — some aircraft may be lost."); return; }
    board.highlight([...spots], "place");
    banner("Green = places your aircraft can still reach and land safely this phase.", true);
  }

  // ---- purchase panel ----
  function openPurchasePanel() {
    const TABS = { LAND: ["infantry", "artillery", "tank", "aaa"],
      SEA: ["submarine", "transport", "destroyer", "cruiser", "carrier", "battleship"],
      AIR: ["fighter", "bomber"], INDUSTRY: ["factory"] };
    let tab = "LAND";
    const d = div("panel purchase");
    const render = () => {
      d.innerHTML = "";
      const head = div("pu-head");
      head.innerHTML = `<div class="pu-x" title="Close">✕</div><div class="pu-title">PURCHASE UNITS</div>`;
      head.querySelector(".pu-x").onclick = () => { panelCollapsed = true; panelToggleSync(); };
      d.appendChild(head);
      d.appendChild(div("panel-sub", "Purchase units for war — mobilized during the Mobilize phase"));
      const spent = game.purchaseSpent();
      d.appendChild(div("purchase-status",
        `<span>REMAINING IPC <b class="green">${game.ipc[game.current] - spent}</b></span>
         <span>PURCHASED <b>${game.purchases.reduce((s, p) => s + p.qty, 0)}</b></span>`));
      const tabs = div("tabs");
      for (const t of Object.keys(TABS)) {
        const b = div("tab" + (t === tab ? " on" : ""), t);
        b.onclick = () => { tab = t; render(); };
        tabs.appendChild(b);
      }
      d.appendChild(tabs);
      d.appendChild(div("stat-head", `<span></span><span>ATK</span><span>DEF</span><span>MOV</span><span>COST</span><span>PURCHASE</span>`));
      for (const ut of TABS[tab]) {
        const u = UNITS[ut];
        const line = game.purchases.find(p => p.unit === ut);
        const qty = line ? line.qty : 0;
        const row = div("unit-row pu-row");
        row.innerHTML = `
          <div class="pu-name">${UNIT_NAME[ut].toUpperCase()}</div>
          <div class="pu-pic">${goldPiece(ut)}<span class="pu-q" title="What is this unit?">?</span></div>
          <div class="pu-stat">${u.attack || "–"}</div>
          <div class="pu-stat">${u.defense || "–"}</div>
          <div class="pu-stat">${u.move || "–"}</div>
          <div class="pu-stat green">${u.cost}</div>
          <div class="stepper pu-buy"><button class="minus">−</button><b>${qty}</b><button class="plus">+</button></div>`;
        row.querySelector(".plus").onclick = () => {
          try { game.buy(ut, 1); } catch (e) { banner("Not enough IPCs"); }
          render(); topBar();
        };
        row.querySelector(".minus").onclick = () => {
          if (qty > 0) { game.buy(ut, -1); render(); topBar(); }
        };
        row.querySelector(".pu-q").onclick = (e) => {
          e.stopPropagation();
          banner(`<b>${UNIT_NAME[ut]}</b> — ${UNIT_DESC[ut] || ""}`);
        };
        d.appendChild(row);
      }
      // repairs
      const damaged = Object.entries(game.icDamage).filter(([id, n]) => n > 0 && game.owner[id] === game.current);
      if (damaged.length) {
        d.appendChild(div("panel-sub", "REPAIR INDUSTRIAL COMPLEXES (1 IPC / point)"));
        for (const [id, n] of damaged) {
          const row = div("unit-row");
          row.innerHTML = `<div class="unit-label">${MAP.spaces[id].name} — ${n} damage</div>
            <div class="unit-stats"><button class="mini-btn">REPAIR ALL</button></div>`;
          row.querySelector("button").onclick = () => { game.repairIC(id, n); render(); topBar(); };
          d.appendChild(row);
        }
      }
      d.appendChild(div("panel-cta", `Press <b>END PHASE</b> when done ↗`));
    };
    render();
    sidePanel(d);
  }

  // ---- mobilize panel ----
  // Sticky selection: pick a unit type once, then tap territory after territory —
  // each tap places ONE unit, so purchases can be spread across the map freely.
  let mobilizeTarget = null;
  function mobilizeHighlight(ut) {
    const ids = [];
    const info = UNITS[ut];
    if (info.facility) {
      for (const [id, s] of Object.entries(MAP.spaces)) {
        if (!s.sea && game.owner[id] === game.current && (s.ipc || 0) >= 1 &&
          !game.capturedThisTurn.has(id) && !game.unitsAt(id, u => u.type === "factory").length) ids.push(id);
      }
    } else {
      for (const ic of game.eligibleICs(game.current)) {
        if (game._placedCount(ic) >= game.mobilizeCapacity(ic)) continue;
        if (info.sea || ut === "fighter") for (const nb of MAP.spaces[ic].conn) if (MAP.spaces[nb].sea) ids.push(nb);
        if (!info.sea) ids.push(ic);
      }
    }
    board.highlight(ids, "place");
    mobilizeTarget = { unit: ut, spaces: new Set(ids) };
    return ids.length;
  }
  function openMobilizePanel(keepSelection) {
    let selected = keepSelection || null;
    const d = div("panel");
    const render = () => {
      d.innerHTML = "";
      d.appendChild(div("panel-title", "MOBILIZE NEW UNITS"));
      d.appendChild(div("panel-sub", selected
        ? "Tap a green space to place 1 " + UNIT_NAME[selected] + " — repeat anywhere eligible"
        : "Select a unit type, then tap green spaces to place them one by one"));
      let any = false;
      for (const p of game.purchases) {
        if (p.qty <= 0) continue;
        any = true;
        const row = div("unit-row selectable mob-row" + (selected === p.unit ? " on" : ""));
        row.innerHTML = `<div class="mob-pic">${goldPiece(p.unit)}</div>
          <div class="mob-info"><div class="unit-label">${UNIT_NAME[p.unit].toUpperCase()}</div>
            <div class="mob-left"><b>${p.qty}</b> to place</div></div>`;
        row.onclick = () => { selected = p.unit; mobilizeHighlight(p.unit); render(); };
        d.appendChild(row);
      }
      if (!any) {
        d.appendChild(div("panel-body", "✅ All units placed."));
        board.clearHighlight(); mobilizeTarget = null;
      }
      d.appendChild(div("panel-cta", `Press <b>END PHASE</b> to finish ↗`));
    };
    if (selected) mobilizeHighlight(selected);
    render();
    sidePanel(d);
  }

  // ================= space interactions =================
  function onSpaceTap(id) {
    if (!game) return;
    if (moveSelect) {
      if (moveSelect.targets.has(id)) executeMoveSelect(id);
      else cancelMoveSelect();
      return;
    }
    if (game.phase === "mobilize" && mobilizeTarget && mobilizeTarget.spaces.has(id)) {
      try {
        const ut = mobilizeTarget.unit;
        game.place(ut, id);
        board.render(); topBar();
        const line = game.purchases.find(p => p.unit === ut && p.qty > 0);
        if (line) {
          openMobilizePanel(ut); // keep the selection; capacities re-highlighted live
          banner(`${UNIT_NAME[ut]} placed in ${MAP.spaces[id].name} — ${line.qty} left`);
        } else {
          // auto-advance to the next unplaced unit type
          const next = game.purchases.find(p => p.qty > 0);
          openMobilizePanel(next ? next.unit : null);
          banner(next ? `${UNIT_NAME[ut]} done — now placing ${UNIT_NAME[next.unit]}` : "All units placed.");
        }
      } catch (e) { banner(e.message); }
      return;
    }
    spaceInfoModal(id);
  }

  function spaceInfoModal(id) {
    const s = MAP.spaces[id];
    const own = s.sea ? null : game.owner[id];
    const units = game.unitsAt(id);
    const byPower = {};
    for (const u of units) {
      if (u.type === "factory") continue;
      const host = u.onTransport ? " (aboard)" : u.onCarrier ? " (on carrier)" : "";
      const k = u.power;
      byPower[k] = byPower[k] || {};
      byPower[k][u.type + host] = (byPower[k][u.type + host] || 0) + 1;
    }
    const body = div("");
    body.appendChild(div("modal-note",
      `${s.sea ? "Sea zone" : own ? "Controlled by " + POWER_NAMES[own] : "Neutral (impassable)"}` +
      `${s.ipc ? " · " + s.ipc + " IPC" : ""}${s.vc ? " · ★ " + s.vc : ""}` +
      `${game.unitsAt(id, u => u.type === "factory").length ? " · Industrial Complex" +
        ((game.icDamage[id] || 0) ? " (" + game.icDamage[id] + " dmg)" : "") : ""}`));
    for (const [p, types] of Object.entries(byPower)) {
      const rows = Object.entries(types).map(([t, n]) => {
        const base = t.split(" ")[0];
        return `<div class="ulist-row"><span>${UNIT_NAME[base] || base}${t.includes("(") ? " " + t.slice(t.indexOf("(")) : ""}</span><b>×${n}</b></div>`;
      }).join("");
      body.appendChild(div("ulist " + SIDES[p], `<div class="ulist-head">${EMBLEM[p]} ${POWER_NAMES[p]}</div>` + rows));
    }
    const buttons = [{ label: "CLOSE", cls: "" }];
    // move own units from here (tap-to-select flow)
    if (isMovePhase() && Object.keys(moverGroups(id, game.current)).length)
      buttons.unshift({ label: "➤ MOVE UNITS", cls: "primary", value: "movePick" });
    // special orders in combat move
    if (game.phase === "combatMove" && game.players[game.current].type === "human") {
      const myBombers = game.unitsAt(id, u => u.power === game.current && u.type === "bomber" && !u.sbr);
      const enemyIC = !s.sea && game.isHostileSpace(game.current, id) && game.unitsAt(id, u => u.type === "factory").length;
      if (myBombers.length && enemyIC)
        buttons.unshift({ label: "🛩 DECLARE BOMBING RAID", cls: "primary", value: "sbr" });
      if (s.sea && game.hasEnemyUnits(game.current, id) && !game.isHostileSpace(game.current, id) &&
        game.unitsAt(id, u => u.power === game.current).length)
        buttons.unshift({ label: game.declaredSeaAttacks.has(id) ? "CANCEL ATTACK ON SUBS/TRANSPORTS" : "⚔ ATTACK SUBS/TRANSPORTS HERE", cls: "primary", value: "seaAtk" });
    }
    openModal(s.name.toUpperCase(), body, buttons).then((v) => {
      if (v === "sbr") {
        const b = game.unitsAt(id, u => u.power === game.current && u.type === "bomber" && !u.sbr)[0];
        if (b) { try { game.setSBR(b.id); banner("Strategic bombing raid declared on " + s.name); } catch (e) { banner(e.message); } }
      }
      if (v === "seaAtk") { game.toggleSeaAttack(id); banner(game.declaredSeaAttacks.has(id) ? "Attack declared" : "Attack cancelled"); }
      if (v === "movePick") openMovePicker(id, game.current, null);
    });
  }

  // ================= drag & drop =================
  const isMovePhase = () => game && (game.phase === "combatMove" || game.phase === "noncombatMove") &&
    game.players[game.current].type === "human" && iControl(game.current);

  function onDragStart(spaceId, power) {
    if (!isMovePhase() || power !== game.current) return null;
    const targets = new Set();
    const movers = game.unitsAt(spaceId, u => u.power === power && !UNITS[u.type].facility &&
      !u.onTransport && !u.onCarrier);
    for (const u of movers) {
      for (const [id, info] of game.reachable(u, game.phase)) { if (info.endOk === false) continue; targets.add(id); }
    }
    // load option: adjacent sea zones with friendly transports with room
    const landUnits = movers.filter(u => UNITS[u.type].land && u.moved === 0);
    if (landUnits.length) {
      for (const nb of MAP.spaces[spaceId].conn) {
        if (!MAP.spaces[nb].sea) continue;
        const trs = game.unitsAt(nb, x => x.type === "transport" && game.isFriendly(x.power, power));
        if (trs.some(t => game.canLoad(landUnits[0], t))) targets.add(nb);
      }
    }
    // offload option: transports with cargo → adjacent territories
    const trs = movers.filter(u => u.type === "transport" && game.cargoOf(u).length && !u.usedThisTurn);
    for (const t of trs) {
      for (const nb of MAP.spaces[t.space].conn) {
        const ns = MAP.spaces[nb];
        if (ns.sea || ns.impassable) continue;
        const hostile = game.isHostileSpace(power, nb) || game.hasEnemyUnits(power, nb);
        if (game.phase === "combatMove" ? hostile : !hostile) targets.add(nb);
      }
    }
    return { targets: [...targets] };
  }

  // movable units at a space for the current power, grouped by type
  function moverGroups(from, power) {
    const movers = game.unitsAt(from, u => u.power === power && !UNITS[u.type].facility &&
      !u.onTransport && !u.onCarrier);
    const groups = {};
    for (const u of movers) (groups[u.type] = groups[u.type] || []).push(u);
    return groups;
  }
  // what could each unit type at `from` do if sent to `to`? → [{type, mode, eligible}]
  function rowsFor(from, to, power) {
    const toSpace = MAP.spaces[to];
    const rows = [];
    for (const [type, list] of Object.entries(moverGroups(from, power))) {
      const info = UNITS[type];
      let eligible = [], mode = "move";
      if (info.land && toSpace.sea) {
        const trs = game.unitsAt(to, x => x.type === "transport" && game.isFriendly(x.power, power));
        eligible = list.filter(u => trs.some(t => game.canLoad(u, t)));
        mode = "load";
      } else if (type === "transport" && !toSpace.sea) {
        eligible = list.filter(u => game.cargoOf(u).length && !u.usedThisTurn &&
          MAP.spaces[u.space].conn.includes(to));
        mode = "offload";
      } else {
        eligible = list.filter(u => game.reachable(u, game.phase).has(to));
      }
      if (eligible.length) rows.push({ type, mode, eligible, take: eligible.length });
    }
    return rows;
  }
  function performMoves(rows, to, power) {
    if (rows.some(r => r.take > 0)) undoStack.push(game.snapshot()); // one undo step per move action
    for (const r of rows) {
      let n = r.take;
      for (const u of r.eligible) {
        if (n <= 0) break;
        try {
          if (r.mode === "move") game.moveUnit(u.id, to, game.phase);
          else if (r.mode === "load") {
            const t = game.unitsAt(to, x => x.type === "transport" && game.isFriendly(x.power, power) &&
              game.canLoad(u, x))[0];
            if (t) game.loadUnit(u.id, t.id); else continue;
          } else if (r.mode === "offload") {
            game.offloadTransport(u.id, to);
          }
          n--;
        } catch (e) { banner(e.message); break; }
      }
    }
  }

  async function onDrop(from, to, power) {
    if (!isMovePhase()) return;
    const toSpace = MAP.spaces[to];
    const rows = rowsFor(from, to, power);
    if (!rows.length) return;
    // quantity dialog (skip if single unit)
    let confirmed = rows;
    if (rows.length > 1 || rows[0].eligible.length > 1) {
      confirmed = await moveQuantityDialog(rows, to);
      if (!confirmed) return;
    }
    performMoves(confirmed, to, power);
    board.render(); topBar();
    if (game.phase === "combatMove" && !toSpace.sea &&
      confirmed.some(r => r.mode === "offload")) banner("Amphibious assault declared on " + toSpace.name);
  }

  // ---- tap-to-select movement (select pieces, then tap a highlighted destination) ----
  let moveSelect = null; // {from, power, takes:{type:n}, targets:Set}

  function onStackTap(from, power, tappedType) {
    if (!isMovePhase() || power !== game.current) { spaceInfoModal(from); return; }
    openMovePicker(from, power, tappedType);
  }

  function openMovePicker(from, power, tappedType) {
    cancelMoveSelect();
    const groups = moverGroups(from, power);
    const types = Object.keys(groups).filter(t => {
      const canMove = groups[t].some(u => u.moved < UNITS[u.type].move ||
        (t === "transport" && game.cargoOf(u).length && !u.usedThisTurn));
      return canMove;
    });
    if (!types.length) { spaceInfoModal(from); return; }
    const takes = {};
    for (const t of types) takes[t] = t === tappedType ? groups[t].length : 0;
    if (!tappedType || !takes[tappedType]) takes[types[0]] = groups[types[0]].length;

    const body = div("");
    body.appendChild(div("modal-note", "Choose which pieces to move, then tap a highlighted space on the map."));
    const nums = [];
    const syncNums = () => nums.forEach(({ t, node }) => node.textContent = takes[t]);
    const allRow = div("select-all-row");
    allRow.innerHTML = `<button class="mini-btn" data-a="all">SELECT ALL</button><button class="mini-btn" data-a="none">CLEAR</button>`;
    allRow.querySelector('[data-a="all"]').onclick = () => { for (const t of types) takes[t] = groups[t].length; syncNums(); };
    allRow.querySelector('[data-a="none"]').onclick = () => { for (const t of types) takes[t] = 0; syncNums(); };
    body.appendChild(allRow);
    for (const t of types) {
      const row = div("unit-row");
      row.innerHTML = `<div class="unit-label">${chipHtml(t, power)} ${UNIT_NAME[t].toUpperCase()} <em class="avail">of ${groups[t].length}</em></div>
        <div class="unit-stats"><span class="stepper"><button class="minus">−</button><b>${takes[t]}</b><button class="plus">+</button></span></div>`;
      const num = row.querySelector("b");
      nums.push({ t, node: num });
      row.querySelector(".plus").onclick = () => { takes[t] = Math.min(groups[t].length, takes[t] + 1); num.textContent = takes[t]; };
      row.querySelector(".minus").onclick = () => { takes[t] = Math.max(0, takes[t] - 1); num.textContent = takes[t]; };
      body.appendChild(row);
    }
    openModal("SELECT UNITS — " + MAP.spaces[from].name.toUpperCase(), body, [
      { label: "CANCEL", cls: "", value: null },
      { label: "CHOOSE DESTINATION", cls: "primary", value: "go" },
    ]).then((v) => {
      if (v !== "go") return;
      const targets = selectionTargets(from, power, takes);
      if (!targets.size) { banner("Those units have no legal moves."); return; }
      moveSelect = { from, power, takes, targets };
      board.setSelected(from, types.filter(t => takes[t] > 0)); // ring the chosen stacks
      board.highlight([...targets]); // auto: hostile red, friendly gold
      banner(`Tap a highlighted space to ${game.phase === "combatMove" ? "move / attack" : "move"} — tap anywhere else to cancel.`, true);
    });
  }

  function selectionTargets(from, power, takes) {
    const targets = new Set();
    const groups = moverGroups(from, power);
    for (const [type, n] of Object.entries(takes)) {
      if (n <= 0 || !groups[type]) continue;
      for (const u of groups[type]) {
        for (const [id, info] of game.reachable(u, game.phase)) { if (info.endOk === false) continue; targets.add(id); }
      }
      if (UNITS[type].land) { // load onto adjacent friendly transports
        for (const nb of MAP.spaces[from].conn) {
          if (!MAP.spaces[nb].sea) continue;
          const trs = game.unitsAt(nb, x => x.type === "transport" && game.isFriendly(x.power, power));
          if (groups[type].some(u => trs.some(t => game.canLoad(u, t)))) targets.add(nb);
        }
      }
      if (type === "transport") { // offload to adjacent coasts
        for (const t of groups[type].filter(u => game.cargoOf(u).length && !u.usedThisTurn)) {
          for (const nb of MAP.spaces[t.space].conn) {
            const ns = MAP.spaces[nb];
            if (ns.sea || ns.impassable) continue;
            const hostile = game.isHostileSpace(power, nb) || game.hasEnemyUnits(power, nb);
            if (game.phase === "combatMove" ? hostile : !hostile) targets.add(nb);
          }
        }
      }
    }
    return targets;
  }

  function cancelMoveSelect(silent) {
    if (!moveSelect) return;
    moveSelect = null;
    board.clearHighlight();
    board.setSelected(null);
    banner(null);
    if (!silent) banner("Move cancelled.");
  }

  function executeMoveSelect(to) {
    const { from, power, takes } = moveSelect;
    moveSelect = null;
    board.clearHighlight(); board.setSelected(null); banner(null);
    const rows = rowsFor(from, to, power);
    for (const r of rows) r.take = Math.min(takes[r.type] || 0, r.eligible.length);
    performMoves(rows.filter(r => r.take > 0), to, power);
    board.render(); topBar();
    const toSpace = MAP.spaces[to];
    if (game.phase === "combatMove" && !toSpace.sea && rows.some(r => r.take > 0 && r.mode === "offload"))
      banner("Amphibious assault declared on " + toSpace.name);
  }

  function moveQuantityDialog(rows, to) {
    const body = div("");
    body.appendChild(div("modal-note", "How many units should move to " + MAP.spaces[to].name + "?"));
    for (const r of rows) {
      const row = div("unit-row");
      const verb = r.mode === "load" ? " (load transports)" : r.mode === "offload" ? " (offload cargo)" : "";
      row.innerHTML = `<div class="unit-label">${UNIT_NAME[r.type].toUpperCase()}${verb}</div>
        <div class="unit-stats"><span class="stepper"><button class="minus">−</button><b>${r.take}</b><button class="plus">+</button></span></div>`;
      const num = row.querySelector("b");
      row.querySelector(".plus").onclick = () => { r.take = Math.min(r.eligible.length, r.take + 1); num.textContent = r.take; };
      row.querySelector(".minus").onclick = () => { r.take = Math.max(0, r.take - 1); num.textContent = r.take; };
      body.appendChild(row);
    }
    return openModal("MOVE UNITS", body, [
      { label: "CANCEL", cls: "", value: null },
      { label: "MOVE", cls: "primary", value: rows },
    ]);
  }

  // ================= combat phase =================
  async function runCombatPhase() {
    game.resolveUnopposed();
    board.render(); topBar();
    const pending = game.pendingBattles();
    if (!pending.length) {
      game.endCombat();
      return startPhase();
    }
    // battle list panel
    const d = div("panel");
    d.appendChild(div("panel-title", "CONDUCT COMBAT"));
    d.appendChild(div("panel-sub", pending.length + " battle(s) to resolve — tap one"));
    for (const b of pending) {
      const row = div("unit-row selectable");
      row.innerHTML = `<div class="unit-label">${b.sbr ? "✈ BOMBING RAID: " : "⚔ "}${MAP.spaces[b.space].name.toUpperCase()}</div>`;
      row.onclick = async () => {
        board.focusSpace(b.space);
        await runBattle(b);
        runCombatPhase();
      };
      d.appendChild(row);
    }
    sidePanel(d);
  }

  async function runBattle(bRec) {
    const battle = new Combat.Battle(game, bRec.space, { sbr: bRec.sbr });
    const att0 = battle.att.slice(), def0 = battle.def.slice();
    const modal = battleModalShell(bRec, battle);
    let d;
    let evCursor = 0;
    const flushEvents = () => {
      for (; evCursor < battle.events.length; evCursor++) modal.addEvent(battle.events[evCursor]);
    };
    while ((d = battle.pending())) {
      flushEvents();
      modal.refreshSides();
      const answeringPower = d.side === "attacker" ? battle.attacker : battle.defPower;
      const auto = !answeringPower || game.players[answeringPower].type === "ai" ||
        (online && seatOf(answeringPower) && seatOf(answeringPower) !== online.mySeat); // remote player: smart auto
      let ans;
      if (auto) { ans = AI.answer(game, battle, d); await pause(350); }
      else ans = await modal.humanDecision(d);
      battle.decide(ans);
    }
    flushEvents();
    modal.refreshSides();
    bRec.resolved = true;
    if (online) {
      const s = MAP.spaces[bRec.space], r = battle.result || {};
      onlineOutbox.push(`⚔ <b>${s.name}</b>: ${r.type === "retreat" ? "attacker retreated" :
        r.captured ? "captured by " + POWER_NAMES[battle.attacker] :
        r.attackerWon ? "attacker won" : "defenders held"} · atk lost ${lossList(att0)} · def lost ${lossList(def0)}`);
    }
    board.render(); topBar();
    await modal.finish(battle);
  }

  function battleModalShell(bRec, battle) {
    const s = MAP.spaces[bRec.space];
    const wrap = div("battle-modal");
    const head = div("battle-head", `<h3>${bRec.sbr ? "STRATEGIC BOMBING — " : "BATTLE OF "}${s.name.toUpperCase()}</h3>`);
    const sides = div("battle-sides");
    const attEl = div("battle-side att"), defEl = div("battle-side def");
    sides.appendChild(attEl); sides.appendChild(defEl);
    const evEl = div("battle-events");
    const decEl = div("battle-decision");
    wrap.appendChild(head); wrap.appendChild(sides); wrap.appendChild(evEl); wrap.appendChild(decEl);
    const overlay = showOverlay(wrap);

    // strength table: for each unit type show count × combat value = total, plus a side total
    const sideHtml = (units, label, attacking) => {
      const groups = {};
      for (const u of units) {
        const g2 = groups[u.type] = groups[u.type] || { type: u.type, n: 0, dmg: 0, sub: 0, power: u.power };
        g2.n++; if (u.hits) g2.dmg++; if (u.submerged) g2.sub++;
      }
      const support = (attacking && !battle.sea)
        ? Math.min(groups.artillery ? groups.artillery.n : 0, groups.infantry ? groups.infantry.n : 0) : 0;
      let total = 0;
      const rows = Object.values(groups).map(g => {
        const base = attacking ? UNITS[g.type].attack : UNITS[g.type].defense;
        let rowTotal = base * g.n, shownVal = base;
        if (attacking && g.type === "infantry" && support > 0) {
          rowTotal = 2 * Math.min(support, g.n) + 1 * Math.max(0, g.n - support);
          shownVal = "1–2";
        }
        total += rowTotal;
        return `<div class="bs-unit">${chipHtml(g.type, g.power)}
          <span class="bs-name">${UNIT_NAME[g.type]}${g.dmg ? " (damaged)" : ""}${g.sub ? " (submerged)" : ""}</span>
          <span class="bs-math">×${g.n} @${base === 0 ? "–" : shownVal} = <b>${rowTotal}</b></span></div>`;
      }).join("");
      const totalRow = units.length ?
        `<div class="bs-total">${attacking ? "ATTACK" : "DEFENSE"} TOTAL <b>${total}</b>
         <small>each unit hits by rolling its number or less</small></div>` : "<i>none</i>";
      return `<div class="bs-label">${label}</div>` + rows + totalRow;
    };
    const refreshSides = () => {
      const att = battle.attAlive, def = battle.defFiring;
      attEl.innerHTML = sideHtml(att, "ATTACKER — " + POWER_NAMES[battle.attacker].toUpperCase(), true);
      defEl.innerHTML = sideHtml(def, "DEFENDER" + (battle.defPower ? " — " + POWER_NAMES[battle.defPower].toUpperCase() : ""), false);
    };
    refreshSides();

    const addEvent = (e) => {
      if (e.type === "dice") {
        const diceHtml = (e.detail || [{ dice: e.dice, hits: e.hits, value: null }]).map(dd =>
          `<span class="dice-group">${dd.value ? `<i>hits on ≤${dd.value}:</i>` : ""}${(dd.dice || []).map(x =>
            `<span class="die${dd.value != null && x <= dd.value ? " hit" : ""}">${x}</span>`).join("")}</span>`).join("");
        evEl.appendChild(div("ev", `<b>${e.label}</b> ${diceHtml} <em>= ${e.hits} hit(s)</em>`));
      } else if (e.type === "info") evEl.appendChild(div("ev info", e.text));
      evEl.scrollTop = evEl.scrollHeight;
    };

    const humanDecision = (d) => new Promise((resolve) => {
      decEl.innerHTML = "";
      decEl.appendChild(div("dec-text", `<b>${d.side === "attacker" ? "ATTACKER" : "DEFENDER"}:</b> ${d.text || d.type}`));
      if (d.type === "casualties" || d.type === "submerge" || d.type === "intercept") {
        const chosen = new Set();
        const pool = d.pool.map(id => game.unit(id)).filter(Boolean);
        const chips = div("dec-chips");
        const max = d.type === "casualties" ? d.count : d.pool.length;
        const counter = div("dec-count", "");
        const upd = () => counter.textContent = d.type === "casualties" ?
          `${chosen.size} / ${d.count} selected` : `${chosen.size} selected`;
        for (const u of pool) {
          const c = div("chip-pick", `${chipHtml(u.type, u.power)}${UNIT_NAME[u.type]}${UNITS[u.type].twoHit && u.hits === 0 ? " (can absorb)" : ""}`);
          c.onclick = () => {
            if (chosen.has(u.id)) { chosen.delete(u.id); c.classList.remove("on"); }
            else if (chosen.size < max || d.type !== "casualties") { chosen.add(u.id); c.classList.add("on"); }
            upd();
          };
          chips.appendChild(c);
        }
        upd();
        decEl.appendChild(chips); decEl.appendChild(counter);
        const btn = div("btn primary", d.type === "casualties" ? "CONFIRM CASUALTIES" : "CONFIRM");
        btn.onclick = () => { decEl.innerHTML = ""; resolve({ units: [...chosen] }); };
        decEl.appendChild(btn);
        if (d.type === "casualties" && d.count >= pool.length) {
          // everything dies anyway — offer quick confirm
          for (const u of pool) chosen.add(u.id);
          chips.querySelectorAll(".chip-pick").forEach(c => c.classList.add("on"));
          upd();
        }
      } else if (d.type === "retreat") {
        const btns = div("dec-btns");
        const press = div("btn primary", "PRESS THE ATTACK");
        press.onclick = () => { decEl.innerHTML = ""; resolve({}); };
        btns.appendChild(press);
        if (d.options.length) {
          const sel = document.createElement("select");
          for (const o of d.options) { const op = document.createElement("option"); op.value = o; op.textContent = "Retreat to " + MAP.spaces[o].name; sel.appendChild(op); }
          const rbtn = div("btn", "RETREAT");
          rbtn.onclick = () => { decEl.innerHTML = ""; resolve({ retreat: true, to: sel.value }); };
          btns.appendChild(sel); btns.appendChild(rbtn);
        }
        decEl.appendChild(btns);
      } else resolve({});
    });

    const finish = (battle) => new Promise((resolve) => {
      decEl.innerHTML = "";
      const r = battle.result || {};
      const msg = r.type === "sbr" ? "Bombing raid complete." :
        r.type === "retreat" ? "The attacker withdrew." :
        r.captured ? `${s.name} CAPTURED by ${POWER_NAMES[battle.attacker]}!` :
        r.attackerWon ? "Attacker victorious." : "Defenders held their ground.";
      decEl.appendChild(div("dec-text result", msg));
      const btn = div("btn primary", "CONTINUE");
      btn.onclick = () => { overlay.remove(); resolve(); };
      decEl.appendChild(btn);
    });

    return { addEvent, humanDecision, finish, refreshSides };
  }

  // ================= AI turn =================
  // Fully automatic: the computer plays every phase itself — no confirmations,
  // even when it attacks a human-defended space (the AI assigns the defender's
  // casualties sensibly). A live feed shows what is happening, fast.
  const AI_PACE = 340;

  function aiFeed(html) {
    if (online) onlineOutbox.push(html); // collected into the "while you were away" report
    const feed = $("#ai-feed");
    if (!feed) return;
    const e = div("ai-ev", html);
    feed.appendChild(e);
    while (feed.children.length > 6) feed.removeChild(feed.firstChild);
    requestAnimationFrame(() => e.classList.add("show"));
  }
  function aiFeedClear() { const f = $("#ai-feed"); if (f) f.innerHTML = ""; }

  const NAMES_SHORT = { infantry: "Inf", artillery: "Art", tank: "Tank", aaa: "AA", factory: "IC",
    fighter: "Ftr", bomber: "Bmr", submarine: "Sub", transport: "Trn", destroyer: "Dst",
    cruiser: "Cru", carrier: "Car", battleship: "BB" };
  const lossList = (units) => {
    const m = {};
    for (const u of units) if (u.dead) m[u.type] = (m[u.type] || 0) + 1;
    const s = Object.entries(m).map(([t, n]) => n + " " + NAMES_SHORT[t]).join(", ");
    return s || "none";
  };

  function runAIBattle(bRec) {
    const battle = new Combat.Battle(game, bRec.space, { sbr: bRec.sbr });
    const att0 = battle.att.slice(), def0 = battle.def.slice();
    let d, guard = 0;
    while ((d = battle.pending()) && guard++ < 400) battle.decide(AI.answer(game, battle, d));
    bRec.resolved = true;
    const s = MAP.spaces[bRec.space];
    const r = battle.result || {};
    if (bRec.sbr) return `✈ Bombing raid on <b>${s.name}</b> — ${game.icDamage[bRec.space] || 0} total damage`;
    const outcome = r.type === "retreat" ? "attacker retreated" :
      r.captured ? `<b>${s.name} captured!</b>` :
      r.attackerWon ? "attacker won" : "defenders held";
    return `⚔ <b>${s.name}</b>: ${outcome} · atk lost ${lossList(att0)} · def lost ${lossList(def0)}`;
  }

  // pause that never stalls the turn: skipped when the tab is hidden (browsers
  // throttle background timers) and capped as a safety net.
  const aiPause = (ms) => (typeof document !== "undefined" && document.hidden)
    ? Promise.resolve() : new Promise(r => setTimeout(r, Math.min(ms, 1200)));

  async function runAITurn() {
    const p = game.current;
    banner(`<b>${POWER_NAMES[p].toUpperCase()}</b> (Computer) is playing…`, true);
    aiFeedClear();
    try {
      AI.purchase(game); topBar();
      const bought = game.purchases.map(x => x.qty + " " + NAMES_SHORT[x.unit]).join(", ");
      aiFeed(`💰 <b>${POWER_NAMES[p]}</b> purchases: ${bought || "nothing"}`);
      await aiPause(AI_PACE);

      AI.combatMove(game); board.render();
      game.resolveUnopposed(); board.render(); topBar();
      const captured = [...game.capturedThisTurn].map(id => MAP.spaces[id].name);
      if (captured.length) aiFeed(`🚩 Captured unopposed: ${captured.join(", ")}`);
      const battles = game.pendingBattles();
      if (battles.length) { aiFeed(`⚔ ${battles.length} battle(s) declared`); await aiPause(AI_PACE); }

      for (const b of battles) {
        try {
          board.focusSpace(b.space);
          await aiPause(220);
          const summary = runAIBattle(b);
          board.render(); topBar();
          aiFeed(summary);
        } catch (e) {
          console.error("AI battle error at " + b.space, e);
          b.resolved = true; // never leave the turn stuck on one battle
          aiFeed(`⚔ ${MAP.spaces[b.space].name}: resolved`);
        }
        await aiPause(AI_PACE + 160);
      }
      // failsafe: nothing may remain unresolved
      for (const b of game.pendingBattles()) { try { runAIBattle(b); } catch (e) { b.resolved = true; } }
      game.endCombat();

      AI.noncombat(game); board.render();
      AI.mobilize(game); board.render();
      game.collectIncome(); topBar(); autosave();
      aiFeed(`🏭 Reinforced & mobilized · 💰 income collected (${game.ipc[p]} IPC)`);
      await aiPause(AI_PACE);
    } catch (e) {
      // absolute failsafe: report, then force the turn to a clean end so play continues
      console.error("AI turn error (" + p + ", " + game.phase + ")", e);
      aiFeed(`⚠ Computer turn error — recovering`);
      try {
        for (const b of game.pendingBattles()) b.resolved = true;
        if (game.phase === "combatMove") game.endCombatMove();
        if (game.phase === "combat") game.endCombat();
        if (game.phase === "noncombatMove") game.endNoncombatMove();
        if (game.phase === "mobilize") game.endMobilize();
        if (game.phase === "income" || game.phase === "purchase") { /* fallthrough below */ }
        if (game.phase !== "purchase") game.collectIncome();
        else game.endPurchase(), game.endCombatMove(), game.endCombat(), game.endNoncombatMove(), game.endMobilize(), game.collectIncome();
      } catch (e2) { console.error("AI recovery failed", e2); }
      topBar(); board.render(); autosave();
    }
    banner(null);
    if (game.winner) { aiFeedClear(); return victoryScreen(); }
    nextPower();
  }

  // ================= victory =================
  function victoryScreen() {
    const side = game.winner;
    const body = div("", `<div class="handoff">
      <h2>${side === "axis" ? "AXIS VICTORY" : "ALLIED VICTORY"}</h2>
      <p>${side === "axis" ? "✠ ☀" : "☭ 🎯 ★"} — Round ${game.round}</p>
      <p>Victory cities: Axis ${game.victoryCityCount("axis")} · Allies ${game.victoryCityCount("allies")}</p></div>`);
    openModal("GAME OVER", body, [{ label: "BACK TO MENU", cls: "primary" }]).then(() => {
      localStorage.removeItem(saveKey);
      if (window.Online) { Online.stopPolling(); Online.stopSpectating(); }
      online = null;
      show("#screen-home"); refreshHome();
    });
  }

  // ================= online play ("Play by GitHub") =================
  function packOnline() {
    return { v: 1, id: online.id, title: game.title, seatNames: online.seatNames,
      turnSeat: online.mySeat, snap: game.snapshot(), summary: onlineOutbox.slice(-40),
      winner: game.winner || null, updated: Date.now() };
  }

  function openOnlineSetup() {
    return new Promise((resolve) => {
      const wrap = div("modal");
      wrap.appendChild(div("modal-title", "ONLINE SETUP"));
      const body = div("modal-body");
      const repoName = (Online.repo().split("/")[1]) || "axis";
      body.innerHTML = `
        <div class="modal-note"><b>Invited by someone?</b> Just tap the link they texted you instead — no setup needed.</div>
        <div class="modal-note"><b>Hosting games?</b> One-time setup. Create a GitHub key that can touch
          <b>only</b> the games repo (<b>${Online.repo()}</b>) — never the rest of your account:</div>
        <div class="btn" id="ol-helper" style="display:block;margin:4px auto 8px;max-width:320px;">📋 COPY GITHUB TOKEN-PAGE LINK</div>
        <ol style="text-align:left;font-size:.82rem;margin:4px auto 8px;max-width:340px;line-height:1.5;padding-left:20px">
          <li>Open the link in Safari (sign in to GitHub if asked).</li>
          <li>Token name: <b>${repoName}</b>. Pick an expiry.</li>
          <li><b>Repository access → Only select repositories → ${repoName}.</b>
              <u>Do NOT choose “All repositories.”</u></li>
          <li><b>Permissions → Repository → Contents → Read and write.</b> Leave everything else “No access.”
              (GitHub adds “Metadata: Read-only” automatically — that's fine.)</li>
          <li>Generate → copy the token (starts with <code>github_pat_</code>). <b>Save it in your password
              manager under this GitHub account</b> — GitHub shows it only once — then paste it below.</li>
        </ol>
        <div class="modal-note" style="font-size:.78rem;color:var(--dim)">🔒 The app only accepts a fine-grained,
          <b>${repoName}</b>-only token. A broad or classic token is rejected — it can never end up in an invite link.</div>
        <input id="ol-name" class="ol-input" type="text" maxlength="14" placeholder="YOUR NAME (e.g. JOE)">
        <input id="ol-token" class="ol-input" type="password" placeholder="GITHUB TOKEN (github_pat_…)">
        <div class="modal-note" id="ol-status"></div>`;
      body.querySelector("#ol-helper").onclick = async () => {
        const url = "https://github.com/settings/personal-access-tokens/new";
        try { await navigator.clipboard.writeText(url); body.querySelector("#ol-status").textContent = "Link copied — open it in Safari."; }
        catch (e) { prompt("Open this in Safari:", url); }
      };
      wrap.appendChild(body);
      const btns = div("modal-btns");
      const cancel = div("btn", "CANCEL"), save = div("btn primary", "VERIFY & SAVE");
      btns.appendChild(cancel); btns.appendChild(save); wrap.appendChild(btns);
      const ov = showOverlay(wrap);
      const cfg = Online.config() || {};
      body.querySelector("#ol-name").value = cfg.name || "";
      body.querySelector("#ol-token").value = cfg.token || "";
      cancel.onclick = () => { ov.remove(); resolve(false); };
      const fail = (st, msg) => { st.innerHTML = `<span style="color:var(--red)">✗ ${msg}</span>`; };
      save.onclick = async () => {
        const name = body.querySelector("#ol-name").value.trim();
        const token = body.querySelector("#ol-token").value.trim();
        const st = body.querySelector("#ol-status");
        if (!name || !token) { st.textContent = "Both fields are required."; return; }
        // HARD LOCK — the app will only ever store a fine-grained token. Classic
        // (ghp_…) / OAuth tokens are account-wide and would leak the whole account
        // through the invite link, so they are rejected outright (no override).
        if (!/^github_pat_/.test(token)) {
          return fail(st, `Blocked — that isn't a fine-grained token. A classic token can reach your ` +
            `<b>whole GitHub account</b>, so the app won't use it. Create a fine-grained token limited to ` +
            `<b>${repoName}</b> (it starts with <code>github_pat_</code>) using the steps above.`);
        }
        st.textContent = "Checking the token against GitHub…";
        Online.saveConfig({ name, token, repo: Online.repo() });
        const clearBad = () => Online.saveConfig({ name, token: "", repo: Online.repo() });
        try {
          // Server-confirmed defense in depth: reject anything GitHub reports as
          // carrying account-wide (classic) scopes.
          const info = await Online.tokenScopes();
          if (!info.fineGrained || info.scopes) {
            clearBad();
            return fail(st, `Blocked — GitHub reports this token has account-wide access` +
              `${info.scopes ? " (" + info.scopes + ")" : ""}. Use a fine-grained token limited to <b>${repoName}</b>.`);
          }
          await Online.verifyToken();     // confirms it can actually reach the games repo
          ov.remove(); resolve(true);
        } catch (e) { clearBad(); fail(st, e.message); }
      };
    });
  }
  async function ensureOnlineSetup() {
    const cfg = Online.config();
    if (cfg && cfg.token && cfg.name) return true;
    return openOnlineSetup();
  }

  async function openOnlineCreate() {
    if (!(await ensureOnlineSetup())) return;
    onlineCreateMode = true;
    territoryOverrides = {};
    initNewGameScreen();
    show("#screen-new");
  }

  // join a game by id (shared by the JOIN dialog and invite links)
  async function joinOnlineGame(id, statusCb) {
    const st = statusCb || (() => {});
    st("Looking up " + id + "…");
    const g = await Online.getGame(id);
    if (!g) { st("✗ No game found with that ID."); return false; }
    const mySeat = Online.seat(id) || "p2"; // creator device remembers p1; everyone else is player 2
    Online.setSeat(id, mySeat);
    online = { id, sha: g.sha, mySeat, seatNames: g.data.seatNames };
    onlineOutbox = [];
    game = Game.restore(g.data.snap, MAP);
    game.title = g.data.title;
    enterGame(() => {
      if (g.data.winner) victoryScreen();
      else if (g.data.turnSeat === online.mySeat) onRemote(g, true);
      else enterWaiting();
    });
    return true;
  }

  // MY ONLINE GAMES: every game on the relay — open it or delete it.
  async function openOnlineGames() {
    if (!(await ensureOnlineSetup())) return;
    const wrap = div("modal");
    wrap.appendChild(div("modal-title", "MY ONLINE GAMES"));
    const body = div("modal-body");
    body.innerHTML = `<div class="modal-note" id="ol-status">Loading games from GitHub…</div><div id="ol-list"></div>`;
    wrap.appendChild(body);
    const btns = div("modal-btns");
    const byId = div("btn", "JOIN BY GAME ID"), close = div("btn primary", "CLOSE");
    btns.appendChild(byId); btns.appendChild(close); wrap.appendChild(btns);
    const ov = showOverlay(wrap);
    close.onclick = () => ov.remove();
    byId.onclick = () => {
      const id = (prompt("Enter the Game ID (e.g. EAGLE-4821):") || "").trim().toUpperCase();
      if (id) { ov.remove(); joinOnlineGame(id, (t) => banner(t)).catch(e => banner("✗ " + e.message)); }
    };
    const st = body.querySelector("#ol-status"), list = body.querySelector("#ol-list");

    const render = async () => {
      list.innerHTML = ""; st.textContent = "Loading games from GitHub…";
      let ids = [];
      try { ids = await Online.listGames(); }
      catch (e) { st.textContent = "✗ " + e.message; return; }
      if (!ids.length) { st.textContent = "No online games yet — create one and invite someone!"; return; }
      st.textContent = "";
      const details = await Promise.all(ids.slice(0, 25).map(id =>
        Online.getGame(id).then(g => ({ id, g })).catch(() => ({ id, g: null }))));
      for (const { id, g } of details) {
        const row = div("unit-row");
        if (!g) { row.innerHTML = `<div class="unit-label">${id}</div>`; list.appendChild(row); continue; }
        const d = g.data;
        const mySeat = Online.seat(id);
        const turnName = d.winner ? (d.winner === "axis" ? "AXIS WON" : "ALLIES WON")
          : `${(d.seatNames || {})[d.turnSeat] || d.turnSeat}'s turn` +
            (mySeat && d.turnSeat === mySeat ? " — YOU!" : "");
        const when = d.updated ? new Date(d.updated).toLocaleDateString() : "";
        row.innerHTML = `<div class="unit-label">${d.title || id} <em style="color:var(--dim);font-style:normal">· ${id}</em></div>
          <div class="panel-sub" style="text-align:left;margin:2px 0 8px">${turnName}${when ? " · " + when : ""}
            · ${(d.seatNames || {}).p1 || "P1"} vs ${(d.seatNames || {}).p2 || "P2"}</div>
          <div class="unit-stats" style="justify-content:flex-start;gap:10px">
            <span class="mini-btn ol-open">▶ OPEN</span>
            <span class="mini-btn ol-del" style="border-color:var(--red);color:#ff8a75">🗑 DELETE</span>
          </div>`;
        row.querySelector(".ol-open").onclick = () => {
          ov.remove();
          joinOnlineGame(id, (t) => banner(t)).catch(e => banner("✗ " + e.message));
        };
        row.querySelector(".ol-del").onclick = async () => {
          const sure = await confirmModal("DELETE " + id + "?",
            `This permanently deletes "${d.title || id}" for BOTH players. There is no undo.`);
          if (!sure) return;
          try {
            await Online.deleteGame(id);
            // clear a local Continue that points at the deleted game
            try { const a = JSON.parse(localStorage.getItem(saveKey) || "null");
              if (a && a.online && a.online.id === id) localStorage.removeItem(saveKey); } catch (e) {}
            banner(id + " deleted.");
            refreshHome();
            render();
          } catch (e) { banner("✗ " + e.message); }
        };
        list.appendChild(row);
      }
    };
    render();
  }

  // ---- invite links: everything player 2 needs, in one tap ----
  // The token travels in the URL fragment (#…), which browsers never send to any
  // server — it exists only in the message and on the two devices.
  function inviteLink() {
    const cfg = Online.config() || {};
    let link = location.origin + location.pathname + "#join=" + online.id +
      "&k=" + encodeURIComponent(cfg.token || "");
    if (cfg.repo && cfg.repo !== Online.defaultRepo) link += "&r=" + encodeURIComponent(cfg.repo);
    return link;
  }
  async function shareInvite() {
    const who = (online.seatNames && online.seatNames.p2) || "Player 2";
    const link = inviteLink();
    const text = `Join our Axis 1942 game (${online.id})! Tap the link, type your name, and play:`;
    try {
      if (navigator.share) { await navigator.share({ title: "Axis 1942 — " + online.id, text, url: link }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text + "\n" + link); banner("Invite link copied — paste it into a text to " + who + "."); }
    catch (e) { prompt("Copy this invite link:", link); }
  }
  // arriving via an invite link: save the key, ask only for a name, jump into the game
  async function handleInvite(id, key, repoOverride) {
    const cfg = Online.config() || {};
    if (key) Online.saveConfig({ name: cfg.name || "", token: key,
      repo: repoOverride || cfg.repo || Online.repo() });
    if (!(Online.config() || {}).name) {
      await new Promise((resolve) => {
        const wrap = div("modal");
        wrap.appendChild(div("modal-title", "YOU'RE INVITED — " + id));
        const body = div("modal-body");
        body.innerHTML = `<div class="modal-note">You've been invited to an Axis 1942 game. What's your name?</div>
          <input id="ol-name2" class="ol-input" type="text" maxlength="14" placeholder="YOUR NAME">`;
        wrap.appendChild(body);
        const btns = div("modal-btns");
        const go = div("btn primary", "LET'S PLAY");
        btns.appendChild(go); wrap.appendChild(btns);
        const ov = showOverlay(wrap);
        go.onclick = () => {
          const name = body.querySelector("#ol-name2").value.trim();
          if (!name) return;
          const c = Online.config() || {};
          Online.saveConfig({ name, token: c.token, repo: c.repo || Online.repo() });
          ov.remove(); resolve();
        };
      });
    }
    try {
      banner("Joining " + id + "…", true);
      const ok2 = await joinOnlineGame(id, () => {});
      if (!ok2) banner("Game " + id + " was not found — ask for a fresh invite.");
      else banner(null);
    } catch (e) { banner("Could not join: " + e.message); }
  }

  // push the state and park this device until the other player moves
  async function pushAndWait() {
    sidePanel(null); board.clearHighlight();
    banner("Sending turn to GitHub…", true);
    const data = packOnline();
    data.turnSeat = otherSeat();
    try {
      const res = await Online.putGame(online.id, data, online.sha,
        `${game.title}: over to ${online.seatNames[otherSeat()]}`);
      if (res.conflict) return onlineConflict();
      online.sha = res.sha;
      onlineOutbox = [];
      autosave();
    } catch (e) {
      banner("Sync failed (" + e.message + ") — retrying in 10s…", true);
      setTimeout(pushAndWait, 10000);
      return;
    }
    enterWaiting();
  }

  function enterWaiting() {
    const who = (online.seatNames && online.seatNames[otherSeat()]) || "opponent";
    const d = div("panel");
    d.appendChild(div("panel-title", "WATCHING " + who.toUpperCase()));
    d.appendChild(div("panel-sub", "Game " + online.id + " — the board follows " + who + "'s moves live. Your turn unlocks automatically."));
    const btn = div("btn primary", "CHECK NOW");
    btn.style.cssText = "display:block;margin:12px auto;max-width:220px;";
    btn.onclick = async () => {
      try {
        const g = await Online.getGame(online.id);
        if (g && g.sha !== online.sha) onRemote(g); else banner("No update yet — still " + who + "'s turn.");
      } catch (e) { banner(e.message); }
    };
    d.appendChild(btn);
    const inv = div("btn", "📲 RESEND INVITE LINK");
    inv.style.cssText = "display:block;margin:0 auto 8px;max-width:220px;";
    inv.onclick = shareInvite;
    d.appendChild(inv);
    d.appendChild(div("panel-cta", "You can close the app — resume from CONTINUE any time."));
    sidePanel(d);
    banner(`Watching <b>${who}</b>…`, true);
    Online.startSpectating(online.id, online.sha, onRemote);
  }

  function onRemote(g, skipRestore) {
    online.sha = g.sha;
    if (g.data.seatNames) online.seatNames = g.data.seatNames;
    if (g.data.turnSeat !== online.mySeat && !g.data.winner) {
      // still the opponent's turn — mirror their in-progress board (read-only) so
      // the waiting player watches move-by-move, and keep the spectate poller live.
      if (!skipRestore) { game = Game.restore(g.data.snap, MAP); game.title = g.data.title; }
      board.setGame(game); topBar();
      const who = (online.seatNames && online.seatNames[otherSeat()]) || "opponent";
      banner(`Watching <b>${who}</b> — ${PHASE_LABEL[g.data.phase] || ""}…`, true);
      if (!Online.isSpectating()) Online.startSpectating(online.id, online.sha, onRemote);
      return;
    }
    Online.stopSpectating();
    Online.stopPolling();
    if (!skipRestore) {
      game = Game.restore(g.data.snap, MAP);
      game.title = g.data.title;
    }
    onlineOutbox = [];
    board.setGame(game); topBar(); autosave(); banner(null);
    if (g.data.winner) return victoryScreen();
    const rep = g.data.summary || [];
    const body = div("");
    body.appendChild(div("modal-note",
      `<b>${(online.seatNames && online.seatNames[otherSeat()]) || "Your opponent"}</b> finished. What happened:`));
    body.appendChild(div("log-view", rep.map(x => `<div>${x}</div>`).join("") || "<i>No battles this round.</i>"));
    openModal("IT'S YOUR TURN — " + game.title.toUpperCase(), body,
      [{ label: "PLAY", cls: "primary" }]).then(() => startPhase());
  }

  function onlineConflict() {
    banner("The game changed on GitHub — loading the latest…");
    Online.getGame(online.id).then(g => { if (g) onRemote(g); }).catch(e => banner(e.message));
  }

  async function pushOnline(final) {
    if (!online) return;
    try {
      const data = packOnline();
      if (final) data.winner = game.winner;
      const r = await Online.putGame(online.id, data, online.sha, final ? "game over" : "sync");
      if (!r.conflict) { online.sha = r.sha; onlineOutbox = []; }
    } catch (e) { /* best effort */ }
  }

  // Option A live spectating: while it's my turn, publish the state at each phase
  // boundary (turnSeat stays mine, so the opponent watches but can't take over)
  // so their board tracks my progress in near real time. Best-effort — a failed
  // spectate push never interrupts play; the authoritative handoff is pushAndWait.
  async function pushSpectate() {
    if (!online || !iControl(game.current)) return;
    try {
      const r = await Online.putGame(online.id, packOnline(), online.sha, "live: " + PHASE_LABEL[game.phase]);
      if (r && !r.conflict && r.sha) { online.sha = r.sha; }
    } catch (e) { /* best effort — never block the turn */ }
  }

  // ================= modal helpers =================
  function showOverlay(content) {
    const ov = div("overlay");
    ov.appendChild(content);
    $("#modal-root").appendChild(ov);
    return ov;
  }
  function openModal(title, bodyEl, buttons) {
    return new Promise((resolve) => {
      const m = div("modal");
      m.appendChild(div("modal-title", title));
      const b = div("modal-body"); b.appendChild(bodyEl); m.appendChild(b);
      const btns = div("modal-btns");
      for (const bt of buttons) {
        const x = div("btn " + (bt.cls || ""), bt.label);
        x.onclick = () => { ov.remove(); resolve("value" in bt ? bt.value : undefined); };
        btns.appendChild(x);
      }
      m.appendChild(btns);
      const ov = showOverlay(m);
    });
  }
  function confirmModal(title, text) {
    return openModal(title, div("modal-note", text), [
      { label: "CANCEL", cls: "", value: false },
      { label: "CONTINUE", cls: "primary", value: true },
    ]);
  }
  const pause = (ms) => new Promise(r => setTimeout(r, ms));

  // ================= home =================
  function refreshHome() {
    const has = !!localStorage.getItem(saveKey);
    $("#btn-continue").style.display = has ? "" : "none";
    if (has) {
      try {
        const d = JSON.parse(localStorage.getItem(saveKey));
        $("#btn-continue").innerHTML = `CONTINUE — <small>${d.title}${d.online ? " · 🌐 " + d.online.id : ""}</small>`;
      } catch (e) {}
    }
  }

  function init() {
    initNewGameScreen();
    refreshHome();
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      window.__uiInit = { handleInvite, inviteLink };
    // invite link? (#join=ID&k=TOKEN) — scrub it from the URL, then auto-join
    if (location.hash.startsWith("#join=")) {
      const h = new URLSearchParams(location.hash.slice(1));
      const id = (h.get("join") || "").toUpperCase(), key = h.get("k"), r = h.get("r");
      history.replaceState(null, "", location.pathname + location.search);
      if (id) setTimeout(() => handleInvite(id, key, r), 50);
    }
    $("#btn-new").onclick = () => {
      territoryOverrides = {}; online = null; onlineCreateMode = false;
      initNewGameScreen(); show("#screen-new");
    };
    $("#btn-continue").onclick = () => loadAutosave();
    $("#btn-online-new").onclick = openOnlineCreate;
    $("#btn-online-join").onclick = openOnlineGames;
    $("#btn-edit-territories").onclick = openTerritoryEditor;
    $("#custom-territories").addEventListener("change", (e) => {
      $("#btn-edit-territories").style.display = e.target.checked ? "" : "none";
      if (e.target.checked) openTerritoryEditor();
    });
    $("#new-back").onclick = () => { onlineCreateMode = false; show("#screen-home"); };
  }

  return { init, show };
})();
