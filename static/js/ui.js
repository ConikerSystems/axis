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
  const UNIT_NAME = { infantry: "Infantry", artillery: "Artillery", tank: "Tank", aaa: "Antiaircraft Artillery",
    factory: "Industrial Complex", fighter: "Fighter", bomber: "Bomber", submarine: "Submarine",
    transport: "Transport", destroyer: "Destroyer", cruiser: "Cruiser", carrier: "Aircraft Carrier",
    battleship: "Battleship" };

  let game = null, board = null, phaseSnapshot = null, saveKey = "axis.autosave";

  // ================= screens =================
  function show(id) {
    for (const s of document.querySelectorAll(".screen")) s.classList.remove("active");
    $(id).classList.add("active");
  }

  // ================= new game =================
  function initNewGameScreen() {
    const grid = $("#powers-grid");
    grid.innerHTML = "";
    for (const p of ["germany", "japan", "soviet", "uk", "us"]) { // axis left, allies right
      const card = div("power-card " + SIDES[p]);
      card.innerHTML = `
        <div class="power-emblem">${EMBLEM[p]}</div>
        <div class="power-name">${POWER_NAMES[p].toUpperCase()}</div>
        <select data-power="${p}" class="ptype">
          <option value="human">HUMAN</option>
          <option value="ai">COMPUTER</option>
        </select>
        <input type="text" data-power="${p}" class="pname" placeholder="PLAYER NAME" maxlength="14">`;
      grid.appendChild(card);
      card.querySelector(".ptype").addEventListener("change", (e) => {
        card.querySelector(".pname").style.visibility = e.target.value === "ai" ? "hidden" : "visible";
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

  function startNewGame() {
    const players = {};
    for (const p of POWERS) {
      const type = document.querySelector(`.ptype[data-power=${p}]`).value;
      const name = document.querySelector(`.pname[data-power=${p}]`).value.trim() ||
        (type === "ai" ? "Computer" : POWER_NAMES[p]);
      players[p] = { type, name };
    }
    const options = {
      straits: $("#opt-straits").checked,
      interceptors: $("#opt-interceptors").checked,
      totalVictory: $("#opt-total").checked,
    };
    const overrides = $("#custom-territories").checked ? territoryOverrides : {};
    game = new Game({ mapData: MAP, players, options, territoryOverrides: overrides });
    game.title = $("#game-title").value.trim() || "1942 Campaign";
    enterGame();
  }

  // ================= game screen =================
  function enterGame() {
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
      window.__ui = { get game() { return game; }, onDrop, onDragStart, onStackTap, openMovePicker, board: () => board };
    startPhase();
  }

  function topBar() {
    $("#tb-round").textContent = game.round;
    const seq = $("#tb-powers");
    seq.innerHTML = "";
    POWERS.forEach((p, i) => {
      const e = div("tb-power " + SIDES[p] + (i === game.turnIndex ? " current" : ""), EMBLEM[p]);
      e.title = POWER_NAMES[p];
      seq.appendChild(e);
    });
    $("#tb-phase").textContent = PHASE_LABEL[game.phase].toUpperCase();
    const dots = $("#tb-dots"); dots.innerHTML = "";
    Object.keys(PHASE_LABEL).forEach((ph) => {
      dots.appendChild(div("dot" + (ph === game.phase ? " on" : "")));
    });
    const ax = game.victoryCityCount("axis"), al = game.victoryCityCount("allies");
    const need = game.options.totalVictory ? [13, 13] : [9, 10];
    $("#tb-vc").innerHTML = `<span class="ax">AXIS ${ax}/${need[0]}</span><span class="al">ALLIES ${al}/${need[1]}</span>`;
    const pl = game.players[game.current];
    $("#tb-ipc").textContent = game.ipc[game.current] + " IPC";
    $("#tb-player").textContent = `${POWER_NAMES[game.current].toUpperCase()} — ${pl.name}${pl.type === "ai" ? " (COMPUTER)" : ""}`;
    $("#btn-undo").style.display = (game.phase === "combatMove" || game.phase === "noncombatMove") ? "" : "none";
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
      }));
    } catch (e) { /* storage full */ }
  }
  function loadAutosave() {
    try {
      const d = JSON.parse(localStorage.getItem(saveKey) || "null");
      if (!d) return false;
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
    sidePanel(null);
    autosave();
    if (game.winner) return victoryScreen();
    const pl = game.players[game.current];
    if (pl.type === "ai") return runAITurn();

    switch (game.phase) {
      case "purchase":
        if (!game.capitalHeld(game.current)) { game.endPurchase(); return startPhase(); }
        phaseSnapshot = null;
        openPurchasePanel();
        break;
      case "combatMove":
        phaseSnapshot = game.snapshot();
        banner("COMBAT MOVE — drag your units into hostile spaces. Tap a space for details & special orders.");
        sidePanel(moveHelpPanel(true));
        break;
      case "combat":
        runCombatPhase();
        break;
      case "noncombatMove":
        phaseSnapshot = game.snapshot();
        banner("NONCOMBAT MOVE — reposition units and land your aircraft.");
        sidePanel(moveHelpPanel(false));
        break;
      case "mobilize":
        if (!game.purchases.some(p => p.qty > 0)) { game.endMobilize(); return startPhase(); }
        openMobilizePanel();
        break;
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
    // hotseat handoff splash
    const b = div("", `<div class="handoff">
      <div class="handoff-emblem ${SIDES[game.current]}">${EMBLEM[game.current]}</div>
      <h2>${POWER_NAMES[game.current].toUpperCase()}</h2>
      <p>Round ${game.round} — pass the device to <b>${pl.name}</b></p></div>`);
    openModal("NEXT PLAYER", b, [{ label: "BEGIN TURN", cls: "primary" }]).then(() => startPhase());
  }

  $("#btn-end-phase").addEventListener("click", async () => {
    if (!game || game.players[game.current].type === "ai") return;
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
  });

  $("#btn-undo").addEventListener("click", () => {
    if (phaseSnapshot && (game.phase === "combatMove" || game.phase === "noncombatMove")) {
      const title = game.title;
      game = Game.restore(phaseSnapshot, MAP);
      game.title = title;
      phaseSnapshot = game.snapshot();
      board.setGame(game);
      topBar();
      banner("Moves undone — phase restarted.");
    }
  });

  $("#btn-menu").addEventListener("click", async () => {
    const choice = await openModal("MENU", div("", `<p class="modal-note">${game ? game.title : ""}</p>`), [
      { label: "RESUME", cls: "" },
      { label: "SAVE & EXIT TO MENU", cls: "", value: "exit" },
      { label: "GAME LOG", cls: "", value: "log" },
    ]);
    if (choice === "exit") { autosave(); show("#screen-home"); refreshHome(); }
    if (choice === "log") {
      const body = div("log-view", game.log.slice(-120).map(l =>
        `<div><b>R${l.round}</b> ${POWER_NAMES[l.power] || ""} <i>${PHASE_LABEL[l.phase] || ""}</i> — ${l.msg}</div>`).join(""));
      openModal("GAME LOG", body, [{ label: "CLOSE", cls: "primary" }]);
    }
  });

  // ================= side panels =================
  function sidePanel(content) {
    const sp = $("#side-panel");
    sp.innerHTML = "";
    if (!content) { sp.classList.remove("open"); return; }
    sp.appendChild(content);
    sp.classList.add("open");
  }
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
    const end = div("panel-cta", `Then press <b>END PHASE</b> ↗`);
    d.appendChild(end);
    return d;
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
      d.appendChild(div("panel-title", "PURCHASE UNITS"));
      d.appendChild(div("panel-sub", "Units are mobilized during the Mobilize phase"));
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
      d.appendChild(div("stat-head", `<span>ATK</span><span>DEF</span><span>MOV</span><span>COST</span><span>BUY</span>`));
      for (const ut of TABS[tab]) {
        const u = UNITS[ut];
        const line = game.purchases.find(p => p.unit === ut);
        const qty = line ? line.qty : 0;
        const row = div("unit-row");
        row.innerHTML = `
          <div class="unit-label">${UNIT_NAME[ut].toUpperCase()}</div>
          <div class="unit-stats">
            <span>${u.attack || "–"}</span><span>${u.defense || "–"}</span><span>${u.move || "–"}</span>
            <span class="green">${u.cost}</span>
            <span class="stepper"><button class="minus">−</button><b>${qty}</b><button class="plus">+</button></span>
          </div>`;
        row.querySelector(".plus").onclick = () => {
          try { game.buy(ut, 1); } catch (e) { banner("Not enough IPCs"); }
          render(); topBar();
        };
        row.querySelector(".minus").onclick = () => {
          if (qty > 0) { game.buy(ut, -1); render(); topBar(); }
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
  function openMobilizePanel() {
    const d = div("panel");
    let selected = null;
    const render = () => {
      d.innerHTML = "";
      d.appendChild(div("panel-title", "MOBILIZE NEW UNITS"));
      d.appendChild(div("panel-sub", "Select a unit, then tap a highlighted space"));
      for (const p of game.purchases) {
        if (p.qty <= 0) continue;
        const row = div("unit-row selectable" + (selected === p.unit ? " on" : ""));
        row.innerHTML = `<div class="unit-label">${UNIT_NAME[p.unit].toUpperCase()}</div>
          <div class="unit-stats"><b>×${p.qty}</b></div>`;
        row.onclick = () => { selected = p.unit; render(); highlightPlacement(p.unit); };
        d.appendChild(row);
      }
      if (!game.purchases.some(p => p.qty > 0))
        d.appendChild(div("panel-body", "All units placed. Unplaced purchases are refunded when you end the phase."));
      d.appendChild(div("panel-cta", `Press <b>END PHASE</b> to finish ↗`));
    };
    const highlightPlacement = (ut) => {
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
    };
    render();
    sidePanel(d);
  }
  let mobilizeTarget = null;

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
        game.place(mobilizeTarget.unit, id);
        board.render(); topBar();
        const line = game.purchases.find(p => p.unit === mobilizeTarget.unit);
        if (!line || line.qty <= 0) { mobilizeTarget = null; board.clearHighlight(); }
        openMobilizePanel();
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
    game.players[game.current].type === "human";

  function onDragStart(spaceId, power) {
    if (!isMovePhase() || power !== game.current) return null;
    const targets = new Set();
    const movers = game.unitsAt(spaceId, u => u.power === power && !UNITS[u.type].facility &&
      !u.onTransport && !u.onCarrier);
    for (const u of movers) {
      for (const [id] of game.reachable(u, game.phase)) targets.add(id);
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
    for (const t of types) {
      const row = div("unit-row");
      row.innerHTML = `<div class="unit-label">${chipHtml(t, power)} ${UNIT_NAME[t].toUpperCase()}</div>
        <div class="unit-stats"><span class="stepper"><button class="minus">−</button><b>${takes[t]}</b><button class="plus">+</button></span></div>`;
      const num = row.querySelector("b");
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
      board.highlight([...targets], "target");
      banner(`Tap a highlighted space to ${game.phase === "combatMove" ? "move / attack" : "move"} — tap anywhere else to cancel.`, true);
    });
  }

  function selectionTargets(from, power, takes) {
    const targets = new Set();
    const groups = moverGroups(from, power);
    for (const [type, n] of Object.entries(takes)) {
      if (n <= 0 || !groups[type]) continue;
      for (const u of groups[type]) {
        for (const [id] of game.reachable(u, game.phase)) targets.add(id);
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
    banner(null);
    if (!silent) banner("Move cancelled.");
  }

  function executeMoveSelect(to) {
    const { from, power, takes } = moveSelect;
    moveSelect = null;
    board.clearHighlight(); banner(null);
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
      const isAI = !answeringPower || game.players[answeringPower].type === "ai";
      let ans;
      if (isAI) { ans = AI.answer(game, battle, d); await pause(350); }
      else ans = await modal.humanDecision(d);
      battle.decide(ans);
    }
    flushEvents();
    modal.refreshSides();
    bRec.resolved = true;
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

    const sideHtml = (units, label) => {
      const groups = {};
      for (const u of units) {
        const k = u.type + (u.hits ? "*" : "") + (u.submerged ? "~" : "");
        groups[k] = groups[k] || { type: u.type, n: 0, hits: u.hits, sub: u.submerged };
        groups[k].n++;
      }
      return `<div class="bs-label">${label}</div>` + Object.values(groups).map(g =>
        `<div class="bs-unit">${chipHtml(g.type, units[0] && units[0].power)}
         ${UNIT_NAME[g.type]}${g.hits ? " (damaged)" : ""}${g.sub ? " (submerged)" : ""} <b>×${g.n}</b></div>`).join("") || "<i>none</i>";
    };
    const refreshSides = () => {
      const att = battle.attAlive, def = battle.defFiring;
      attEl.innerHTML = sideHtml(att, "ATTACKER — " + POWER_NAMES[battle.attacker].toUpperCase());
      defEl.innerHTML = sideHtml(def, "DEFENDER" + (battle.defPower ? " — " + POWER_NAMES[battle.defPower].toUpperCase() : ""));
    };
    refreshSides();

    const addEvent = (e) => {
      if (e.type === "dice") {
        const diceHtml = (e.detail || [{ dice: e.dice, hits: e.hits, value: null }]).map(dd =>
          `<span class="dice-group">${dd.value ? `<i>@${dd.value}</i>` : ""}${(dd.dice || []).map(x =>
            `<span class="die${dd.value != null && x <= dd.value ? " hit" : ""}">${x}</span>`).join("")}</span>`).join("");
        evEl.appendChild(div("ev", `<b>${e.label}</b> ${diceHtml} <em>${e.hits} hit(s)</em>`));
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
  async function runAITurn() {
    const p = game.current, pl = game.players[p];
    banner(`<b>${POWER_NAMES[p].toUpperCase()}</b> (Computer) is taking its turn…`, true);
    await pause(500);
    AI.purchase(game); topBar();
    AI.combatMove(game); board.render();
    await pause(400);
    game.resolveUnopposed(); board.render();
    for (const b of game.pendingBattles()) {
      const defHuman = game.unitsAt(b.space, u => !game.isFriendly(p, u.power))
        .some(u => game.players[u.power] && game.players[u.power].type === "human");
      if (defHuman) { banner(null); await runBattle(b); banner(`<b>${POWER_NAMES[p].toUpperCase()}</b> continues…`, true); }
      else {
        const battle = new Combat.Battle(game, b.space, { sbr: b.sbr });
        let d, guard = 0;
        while ((d = battle.pending()) && guard++ < 400) battle.decide(AI.answer(game, battle, d));
        b.resolved = true;
        board.render();
        await pause(120);
      }
    }
    game.endCombat();
    AI.noncombat(game); board.render();
    AI.mobilize(game); board.render();
    game.collectIncome();
    banner(null);
    topBar(); autosave();
    if (game.winner) return victoryScreen();
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
      show("#screen-home"); refreshHome();
    });
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
        $("#btn-continue").innerHTML = `CONTINUE — <small>${d.title}</small>`;
      } catch (e) {}
    }
  }

  function init() {
    initNewGameScreen();
    refreshHome();
    $("#btn-new").onclick = () => { territoryOverrides = {}; show("#screen-new"); };
    $("#btn-continue").onclick = () => loadAutosave();
    $("#btn-edit-territories").onclick = openTerritoryEditor;
    $("#custom-territories").addEventListener("change", (e) => {
      $("#btn-edit-territories").style.display = e.target.checked ? "" : "none";
      if (e.target.checked) openTerritoryEditor();
    });
    $("#new-back").onclick = () => show("#screen-home");
  }

  return { init, show };
})();
