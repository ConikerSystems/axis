/* Axis & Allies 1942.2 — computer opponent (v1: solid heuristics, always rules-legal).
   The AI only acts through engine APIs (reachable/moveUnit/buy/place/Battle answers),
   so it can never make an illegal move. It also answers battle decisions when a
   human attacks an AI-defended space.

   v1 scope: strong purchase/defense/attack/reinforce play on land and at sea.
   Not yet: amphibious invasions, strategic bombing raids. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.AI = factory(root.Engine);
})(typeof self !== "undefined" ? self : this, function (Engine) {
  "use strict";
  const { UNITS } = Engine;

  // ---------- quick battle estimator (expected-value rounds, no dice) ----------
  function punch(units, attacking, land) {
    let support = attacking && land ? units.filter(u => u.type === "artillery").length : 0;
    let p = 0;
    for (const u of units) {
      let v = attacking ? UNITS[u.type].attack : UNITS[u.type].defense;
      if (attacking && land && u.type === "infantry" && support > 0) { v = 2; support--; }
      p += v;
    }
    return p / 6;
  }
  function hitPoints(units) {
    return units.reduce((s, u) => s + (UNITS[u.type].twoHit ? 2 : 1), 0);
  }
  // returns {winProb approx 0..1, expectedSurvivors}
  function estimate(att, def, land) {
    let a = att.slice().sort((x, y) => UNITS[x.type].cost - UNITS[y.type].cost);
    let d = def.slice().sort((x, y) => UNITS[x.type].cost - UNITS[y.type].cost);
    let aHP = hitPoints(a), dHP = hitPoints(d);
    for (let round = 0; round < 30 && aHP > 0 && dHP > 0; round++) {
      const aHits = punch(a, true, land), dHits = punch(d, false, land);
      dHP -= aHits; aHP -= dHits;
      // trim casualty lists roughly (cheapest die first)
      while (a.length && hitPoints(a) > Math.max(0, aHP)) a.shift();
      while (d.length && hitPoints(d) > Math.max(0, dHP)) d.shift();
    }
    if (dHP <= 0 && aHP > 0) return { win: Math.min(0.95, 0.6 + 0.35 * (aHP / Math.max(1, hitPoints(att)))), survivors: a.length };
    if (aHP <= 0) return { win: 0.05, survivors: 0 };
    return { win: 0.4, survivors: a.length };
  }

  const val = (g, id) => {
    const s = g.space(id);
    return (s.ipc || 0) + (s.vc ? 5 : 0) + (s.capital ? 8 : 0) +
      (g.unitsAt(id, u => u.type === "factory").length ? 4 : 0);
  };

  // ---------- battle decisions ----------
  function answer(g, battle, d) {
    if (d.type === "casualties") {
      const units = d.pool.map(id => g.unit(id)).filter(Boolean);
      // absorb with undamaged battleships first, then lose cheapest (transports auto-last via pool)
      units.sort((a, b) => {
        const aBB = UNITS[a.type].twoHit && a.hits === 0 ? -1 : 0;
        const bBB = UNITS[b.type].twoHit && b.hits === 0 ? -1 : 0;
        if (aBB !== bBB) return aBB - bBB;
        return UNITS[a.type].cost - UNITS[b.type].cost;
      });
      return { units: units.map(u => u.id) };
    }
    if (d.type === "submerge") {
      // submerge if we're clearly outgunned
      const mine = d.pool.map(id => g.unit(id)).filter(Boolean);
      const attacking = d.side === "attacker";
      const opp = attacking ? battle.defAlive : battle.attAlive;
      const est = estimate(attacking ? battle.attAlive : battle.defAlive, opp, false);
      return { units: (attacking ? est.win < 0.4 : est.win > 0.75) ? mine.map(u => u.id) : [] };
    }
    if (d.type === "retreat") {
      const est = estimate(battle.attAlive, battle.defAlive, !battle.sea);
      if (est.win < 0.35 && d.options.length) return { retreat: true, to: d.options[0] };
      return {};
    }
    if (d.type === "intercept") return { units: d.pool }; // defend the factory
    return {};
  }

  // ---------- purchase ----------
  function purchase(g) {
    const p = g.current;
    let budget = g.ipc[p];
    // repair a damaged home IC first
    for (const [id, dmg] of Object.entries(g.icDamage)) {
      if (dmg > 0 && g.owner[id] === p && budget > 6) {
        const fix = Math.min(dmg, Math.floor(budget / 3));
        g.repairIC(id, fix); budget -= fix;
      }
    }
    const capThreat = capitalThreatened(g, p);
    const myTransports = g.units.filter(u => !u.dead && u.power === p && u.type === "transport").length;
    const wantTransport = (p === "uk" || p === "us" || p === "japan") && myTransports < 2 && budget >= 7 && !capThreat;
    if (wantTransport) { g.buy("transport", 1); budget -= 7; }
    // core land mix — infantry-heavy when threatened
    const mix = capThreat ? [["infantry", 1]] :
      [["infantry", 3], ["artillery", 1], ["tank", 1]];
    let i = 0, guard = 0;
    while (budget >= 3 && guard++ < 100) {
      const [unit] = mix[i % mix.length];
      const c = UNITS[unit].cost;
      if (budget >= c) { g.buy(unit, 1); budget -= c; }
      i++;
    }
    g.endPurchase();
  }
  function capitalThreatened(g, p) {
    const cap = g.capitalOf(p);
    if (!cap || g.owner[cap] !== p) return true;
    let enemy = 0, mine = 0;
    for (const nb of g.space(cap).conn) {
      enemy += g.unitsAt(nb, u => !g.isFriendly(p, u.power) && UNITS[u.type].attack > 0).length;
    }
    mine = g.unitsAt(cap, u => g.isFriendly(p, u.power) && UNITS[u.type].defense > 0).length;
    return enemy > mine * 0.8;
  }

  // ---------- combat move ----------
  function combatMove(g) {
    const p = g.current;
    // candidate targets: enemy land territories & hostile sea zones adjacent to my forces
    const targets = new Map(); // id -> attackers[]
    for (const u of g.units) {
      if (u.dead || u.power !== p || u.onTransport || UNITS[u.type].attack <= 0) continue;
      if (u.type === "aaa" || UNITS[u.type].facility) continue;
      const r = g.reachable(u, "combatMove");
      for (const [id, info] of r) {
        if (!info.hostile && !(g.space(id).sea && g.isHostileSpace(p, id))) continue;
        if (!g.hasEnemyUnits(p, id) && g.space(id).sea) continue;
        if (UNITS[u.type].air && !g.airCanLandAfter(u, id, info.cost)) continue;
        if (!targets.has(id)) targets.set(id, []);
        targets.get(id).push({ u, cost: info.cost });
      }
    }
    // score targets, best first
    const scored = [...targets.entries()].map(([id, atk]) => {
      const def = g.unitsAt(id, x => !g.isFriendly(p, x.power) && !UNITS[x.type].facility);
      const est = estimate(atk.map(a => a.u), def, !g.space(id).sea);
      return { id, atk, def, est, score: est.win * (val(g, id) + 2) - (1 - est.win) * 3 };
    }).filter(t => {
      if (!t.def.length && !g.space(t.id).sea) return true;   // free capture
      return t.est.win >= 0.6 && t.score > 0;
    }).sort((a, b) => b.score - a.score);

    const used = new Set();
    for (const t of scored) {
      const def = g.unitsAt(t.id, x => !g.isFriendly(p, x.power) && !UNITS[x.type].facility);
      const avail = t.atk.filter(a => !used.has(a.u.id));
      if (!avail.length) continue;
      if (def.length) {
        const est = estimate(avail.map(a => a.u), def, !g.space(t.id).sea);
        if (est.win < 0.6) continue;
      }
      // send land units first, then support; cap force at ~2.5x defenders for efficiency
      avail.sort((a, b) => UNITS[a.u.type].cost - UNITS[b.u.type].cost);
      const capN = def.length ? Math.max(2, Math.ceil(def.length * 2.5)) : 1;
      let sent = 0;
      for (const a of avail) {
        if (sent >= capN) break;
        try {
          const r = g.reachable(a.u, "combatMove");
          if (!r.has(t.id)) continue;
          if (UNITS[a.u.type].air && !g.airCanLandAfter(a.u, t.id, r.get(t.id).cost)) continue;
          g.moveUnit(a.u.id, t.id, "combatMove");
          used.add(a.u.id); sent++;
        } catch (e) { /* another move changed legality — skip */ }
      }
      // if we couldn't actually send anyone meaningful to a defended space, that's fine —
      // _collectBattles only creates battles where our units actually are.
    }
    g.endCombatMove();
  }

  // ---------- run battles (AI attacking) ----------
  function runBattles(g, Combat, humanDefends, uiHooks) {
    g.resolveUnopposed();
    for (const b of g.pendingBattles()) {
      const battle = new Combat.Battle(g, b.space, { sbr: b.sbr });
      let d, guard = 0;
      while ((d = battle.pending()) && guard++ < 400) {
        battle.decide(answer(g, battle, d));
      }
      b.resolved = true;
      if (uiHooks && uiHooks.onBattle) uiHooks.onBattle(b.space, battle);
    }
    g.endCombat();
  }

  // ---------- noncombat ----------
  function noncombat(g) {
    const p = g.current;
    // distance map to nearest enemy-owned land (through friendly/neutral-free paths, land graph approx)
    const dist = enemyDistanceMap(g, p);
    for (const u of g.units.slice()) {
      if (u.dead || u.power !== p || u.onTransport) continue;
      const info = UNITS[u.type];
      if (info.facility || u.moved >= info.move) continue;
      if (info.air) { landAir(g, u); continue; }
      if (info.sea) continue; // v1: fleet holds position unless landing fighters (carriers stay)
      // land units walk toward the front
      const r = g.reachable(u, "noncombatMove");
      let best = null, bestD = dist.get(u.space) ?? 99;
      for (const [id] of r) {
        const d2 = dist.get(id) ?? 99;
        if (d2 < bestD) { bestD = d2; best = id; }
      }
      if (best) { try { g.moveUnit(u.id, best, "noncombatMove"); } catch (e) {} }
    }
    // land any remaining aircraft
    for (const u of g.strandedAir()) landAir(g, u);
    g.endNoncombatMove();
  }
  function landAir(g, u) {
    if (u.dead || u.moved >= UNITS[u.type].move) return;
    const s = g.space(u.space);
    if (!s.sea && g.friendlyAtStart(u.space)) return; // already safe
    if (u.type === "fighter" && s.sea && g.unitsAt(u.space, x => g.isFriendly(x.power, u.power) &&
      x.type === "carrier" && g.carrierFighters(x).length < 2).length) return; // will auto-land
    const spots = g.airLandingSpots(u);
    if (!spots.length) return;
    spots.sort((a, b) => a.cost - b.cost);
    try { g.moveUnit(u.id, spots[0].space, "noncombatMove"); } catch (e) {}
  }
  function enemyDistanceMap(g, p) {
    const dist = new Map();
    const q = [];
    for (const [id, own] of Object.entries(g.owner)) {
      if (own != null && !g.isFriendly(p, own)) { dist.set(id, 0); q.push(id); }
    }
    while (q.length) {
      const cur = q.shift();
      for (const nb of g.space(cur).conn) {
        const s = g.space(nb);
        if (s.sea || s.impassable) continue;
        if (!dist.has(nb)) { dist.set(nb, dist.get(cur) + 1); q.push(nb); }
      }
    }
    return dist;
  }

  // ---------- mobilize ----------
  function mobilize(g) {
    const p = g.current;
    const dist = enemyDistanceMap(g, p);
    const ics = g.eligibleICs(p).sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99));
    for (const buyLine of g.purchases.slice()) {
      let guard = 0;
      while (buyLine.qty > 0 && guard++ < 50) {
        let placed = false;
        for (const ic of ics) {
          try {
            if (UNITS[buyLine.unit].sea) {
              const zone = g.space(ic).conn.find(z => g.space(z).sea);
              if (!zone) continue;
              g.place(buyLine.unit, zone);
            } else if (UNITS[buyLine.unit].facility) {
              continue; // v1 AI doesn't buy ICs
            } else {
              g.place(buyLine.unit, ic);
            }
            placed = true; break;
          } catch (e) { /* try next IC */ }
        }
        if (!placed) break;
      }
    }
    g.endMobilize();
  }

  // ---------- full turn ----------
  function takeTurn(g, Combat, uiHooks) {
    purchase(g);
    combatMove(g);
    runBattles(g, Combat, false, uiHooks);
    noncombat(g);
    mobilize(g);
    g.collectIncome();
  }

  return { takeTurn, purchase, combatMove, runBattles, noncombat, mobilize, answer, estimate };
});
