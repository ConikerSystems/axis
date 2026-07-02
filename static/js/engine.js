/* Axis & Allies 1942 Second Edition — rules engine.
   Pure game logic: no DOM. Runs in the browser (window.Engine) and in node
   (module.exports) so the same code is unit-tested and drives the UI/AI.

   The engine is a state machine over the six-phase turn sequence
   (purchase → combat move → conduct combat → noncombat move → mobilize →
   collect income) with the full 1942.2 movement and combat rules. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POWERS = ["soviet", "germany", "uk", "japan", "us"]; // official order of play
  const SIDES = { soviet: "allies", germany: "axis", uk: "allies", japan: "axis", us: "allies" };
  const POWER_NAMES = { soviet: "Soviet Union", germany: "Germany", uk: "United Kingdom", japan: "Japan", us: "United States" };

  const UNITS = {
    infantry: { cost: 3, move: 1, attack: 1, defense: 2, land: true },
    artillery: { cost: 4, move: 1, attack: 2, defense: 2, land: true, supportsInfantry: true },
    tank: { cost: 6, move: 2, attack: 3, defense: 3, land: true, blitz: true },
    aaa: { cost: 5, move: 1, attack: 0, defense: 0, land: true, aa: true },
    factory: { cost: 15, move: 0, attack: 0, defense: 0, facility: true },
    fighter: { cost: 10, move: 4, attack: 3, defense: 4, air: true },
    bomber: { cost: 12, move: 6, attack: 4, defense: 1, air: true },
    submarine: { cost: 6, move: 2, attack: 2, defense: 1, sea: true, sub: true },
    transport: { cost: 7, move: 2, attack: 0, defense: 0, sea: true, transport: true, capacity: true },
    destroyer: { cost: 8, move: 2, attack: 2, defense: 2, sea: true, surface: true, antiSub: true },
    cruiser: { cost: 12, move: 2, attack: 3, defense: 3, sea: true, surface: true, bombard: 3 },
    carrier: { cost: 14, move: 2, attack: 1, defense: 2, sea: true, surface: true, carrier: true },
    battleship: { cost: 20, move: 2, attack: 4, defense: 4, sea: true, surface: true, bombard: 4, twoHit: true },
  };
  const PHASES = ["purchase", "combatMove", "combat", "noncombatMove", "mobilize", "income"];

  // ---------- RNG (seeded, replayable) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Game {
    // config: { mapData, seed, players:{power:{type,name}}, options:{straits,interceptors,totalVictory},
    //           territoryOverrides: {spaceId: power} }
    constructor(config) {
      this.map = config.mapData;
      this.options = Object.assign({ straits: false, interceptors: false, totalVictory: false }, config.options);
      this.players = config.players;
      this.seed = config.seed == null ? Math.floor(Math.random() * 2 ** 31) : config.seed;
      this._rngCalls = 0;
      this.rng = mulberry32(this.seed);
      this.log = [];
      this.nextUnitId = 1;

      // dynamic space state
      this.owner = {};        // spaceId -> power|null (land only; null = sea/neutral)
      this.icDamage = {};     // spaceId -> damage on industrial complex
      for (const [id, s] of Object.entries(this.map.spaces)) {
        if (!s.sea) this.owner[id] = s.owner || null;
      }
      // custom layout: reassign starting territories (and their starting units)
      const overrides = config.territoryOverrides || {};
      for (const [id, power] of Object.entries(overrides)) {
        if (this.map.spaces[id] && !this.map.spaces[id].sea && this.owner[id]) this.owner[id] = power;
      }

      // units
      this.units = [];
      for (const line of this.map.setup) {
        const owningSpaceOwner = overrides[line.space];
        const power = owningSpaceOwner || line.power;
        for (let i = 0; i < line.qty; i++) this._spawn(line.unit, power, line.space);
      }
      // carriers start with fighters aboard where colocated (pair them up)
      this._autoLoadStartingCarriers();

      this.ipc = {};
      const START_IPC = { soviet: 24, germany: 41, uk: 31, japan: 30, us: 42 };
      for (const p of POWERS) this.ipc[p] = START_IPC[p];
      // with custom layouts, starting treasury = actual starting income
      if (Object.keys(overrides).length) for (const p of POWERS) this.ipc[p] = this.production(p);

      this.round = 1;
      this.turnIndex = 0;
      this.phase = "purchase";
      this.purchases = [];       // [{unit, qty}] current power
      this.moves = [];           // record of moves this phase (for undo/desc)
      this.assaults = {};        // territoryId -> {from: seaZoneId} declared amphibious assaults
      this.declaredSeaAttacks = new Set(); // optional attacks on subs/transports-only zones
      this.battles = [];         // pending battles for combat phase
      this.capturedThisTurn = new Set();
      this.winner = null;
      this._log(`Game start. Seed ${this.seed}.`);
    }

    // ---------- helpers ----------
    _log(msg) { this.log.push({ round: this.round, power: this.current, phase: this.phase, msg }); }
    roll(n, label) {
      const dice = [];
      for (let i = 0; i < n; i++) { this._rngCalls++; dice.push(1 + Math.floor(this.rng() * 6)); }
      if (label) this._log(`${label}: rolled [${dice.join(", ")}]`);
      return dice;
    }
    get current() { return POWERS[this.turnIndex]; }
    space(id) { return this.map.spaces[id]; }
    side(power) { return SIDES[power]; }
    isFriendly(power, other) { return SIDES[power] === SIDES[other]; }
    unitsAt(spaceId, pred) {
      return this.units.filter(u => u.space === spaceId && !u.dead && (!pred || pred(u)));
    }
    unit(id) { return this.units.find(u => u.id === id); }
    _spawn(type, power, space) {
      const u = { id: this.nextUnitId++, type, power, space, moved: 0, hits: 0, cargo: [] };
      this.units.push(u); return u;
    }
    _autoLoadStartingCarriers() {
      for (const c of this.units.filter(u => u.type === "carrier")) {
        const figs = this.unitsAt(c.space, u => u.type === "fighter" && u.power === c.power && !u.onCarrier);
        for (const f of figs.slice(0, 2)) { f.onCarrier = c.id; }
      }
    }
    carrierFighters(carrier) { return this.units.filter(u => !u.dead && u.onCarrier === carrier.id); }
    cargoOf(t) { return this.units.filter(u => !u.dead && u.onTransport === t.id); }

    production(power) {
      let sum = 0;
      for (const [id, own] of Object.entries(this.owner)) if (own === power) sum += this.space(id).ipc || 0;
      return sum;
    }
    capitalOf(power) {
      for (const [id, s] of Object.entries(this.map.spaces)) if (s.capital === power) return id;
      return null;
    }
    capitalHeld(power) { const c = this.capitalOf(power); return this.owner[c] === power; }

    victoryCityCount(side) {
      let n = 0;
      for (const [id, s] of Object.entries(this.map.spaces))
        if (s.vc && this.owner[id] && SIDES[this.owner[id]] === side) n++;
      return n;
    }

    // hostile = enemy-controlled land, or sea zone containing enemy surface warships
    isHostileSpace(power, spaceId) {
      const s = this.space(spaceId);
      if (s.sea) return this.unitsAt(spaceId, u => !this.isFriendly(power, u.power) &&
        UNITS[u.type].surface).length > 0;
      const own = this.owner[spaceId];
      return own != null && !this.isFriendly(power, own);
    }
    hasEnemyUnits(power, spaceId) {
      return this.unitsAt(spaceId, u => !this.isFriendly(power, u.power)).length > 0;
    }

    // ---------- canals & adjacency for sea movement ----------
    _canalBlocked(power, a, b) {
      // optional rule: Turkey closed the straits — no sea units into or out of sz16
      if (this.options.straits && (a === "sz16" || b === "sz16")) return true;
      for (const c of Object.values(this.map.canals)) {
        const zs = c.seaZones;
        if ((zs[0] === a && zs[1] === b) || (zs[0] === b && zs[1] === a)) {
          const ok = c.landTerritories.every(t => this.owner[t] != null && this.isFriendly(power, this.owner[t]));
          if (!ok) return true;
        }
      }
      return false;
    }

    // ---------- movement legality ----------
    // Reachable spaces for a unit in a phase. Returns Map(spaceId -> {cost, stops:boolean path info}).
    // This is the single source of truth used by drag-drop highlighting, AI, and validation.
    reachable(u, phase) {
      const power = u.power, info = UNITS[u.type];
      const res = new Map();
      if (u.dead || info.facility) return res;
      const mv = info.move - u.moved;
      if (mv <= 0) return res;
      if (u.onTransport) return res; // cargo moves by offload, not standalone
      if (u.type === "aaa" && phase === "combatMove") return res; // AAA only in noncombat

      const combat = phase === "combatMove";
      const frontier = [{ at: u.space, used: 0, blitzed: false }];
      const seen = new Map([[u.space, 0]]);
      const prev = new Map(); // for path reconstruction (blitz capture, retreat routes)
      res._prev = prev;
      while (frontier.length) {
        const cur = frontier.shift();
        for (const nb of this.space(cur.at).conn) {
          const ns = this.space(nb);
          const cost = cur.used + 1;
          if (cost > mv) continue;
          if (seen.has(nb) && seen.get(nb) <= cost) continue;
          prev.set(nb, cur.at);

          if (info.air) {
            // air moves anywhere except neutral/impassable territories
            if (!ns.sea && ns.impassable) continue;
            seen.set(nb, cost);
            res.set(nb, { cost });
            frontier.push({ at: nb, used: cost });
            continue;
          }
          if (info.land) {
            if (ns.sea) continue; // loading handled separately
            if (ns.impassable) continue;
            const hostile = this.isHostileSpace(power, nb) || this.hasEnemyUnits(power, nb);
            if (!combat) {
              if (hostile || (this.owner[nb] != null && !this.isFriendly(power, this.owner[nb]))) continue;
              seen.set(nb, cost); res.set(nb, { cost });
              frontier.push({ at: nb, used: cost });
            } else {
              seen.set(nb, cost);
              res.set(nb, { cost, hostile });
              if (!hostile) { frontier.push({ at: nb, used: cost }); }
              else if (info.blitz && cost < mv && !this.hasEnemyUnits(power, nb) && !this.unitsAt(nb, x => UNITS[x.type].facility || UNITS[x.type].aa).length) {
                // tank may blitz through empty hostile territory
                frontier.push({ at: nb, used: cost, blitzed: true });
              }
            }
            continue;
          }
          if (info.sea) {
            if (!ns.sea) continue;
            if (this._canalBlocked(power, cur.at, nb)) continue;
            const hostile = this.isHostileSpace(power, nb);
            const enemyDD = this.unitsAt(nb, x => !this.isFriendly(power, x.power) && UNITS[x.type].antiSub).length > 0;
            const enemySubOrTr = this.unitsAt(nb, x => !this.isFriendly(power, x.power) && (UNITS[x.type].sub || UNITS[x.type].transport)).length > 0;
            if (!combat) {
              if (info.sub) {
                seen.set(nb, cost); res.set(nb, { cost });
                if (!enemyDD) frontier.push({ at: nb, used: cost });
              } else {
                if (hostile) continue;
                seen.set(nb, cost); res.set(nb, { cost, enemySubOrTr });
                frontier.push({ at: nb, used: cost });
              }
            } else {
              if (info.sub) {
                seen.set(nb, cost); res.set(nb, { cost, hostile: hostile || enemySubOrTr });
                if (!enemyDD) frontier.push({ at: nb, used: cost });
              } else if (info.transport) {
                // transports stop when encountering hostile surface warships
                seen.set(nb, cost); res.set(nb, { cost, hostile });
                if (!hostile) frontier.push({ at: nb, used: cost });
              } else {
                seen.set(nb, cost); res.set(nb, { cost, hostile: hostile || enemySubOrTr });
                if (!hostile) frontier.push({ at: nb, used: cost });
              }
            }
          }
        }
      }
      res.delete(u.space);
      return res;
    }

    // Move a unit (and its cargo/deck load implicitly). Validates against reachable().
    moveUnit(unitId, to, phase) {
      const u = this.unit(unitId);
      if (!u) throw new Error("no unit");
      if (phase !== this.phase) throw new Error("wrong phase");
      const r = this.reachable(u, phase);
      if (!r.has(to)) throw new Error("illegal move");
      const cost = r.get(to).cost;
      const from = u.space;
      u.moved += cost;
      u.space = to;
      // reconstruct the BFS path for blitz captures and retreat routes
      const path = [to];
      let at = to;
      while (r._prev && r._prev.has(at) && at !== from) { at = r._prev.get(at); path.unshift(at); }
      if (u.movePath) u.movePath = u.movePath.concat(path.slice(1));
      else u.movePath = path;
      // blitz capture: if tank passed through empty hostile territory it captures it.
      // (For simplicity we capture when the drop target itself is empty-hostile in combat move;
      //  intermediate blitz capture handled in endCombatMove sweep.)
      const info = UNITS[u.type];
      if (info.carrier) for (const f of this.carrierFighters(u)) f.space = to; // deck cargo rides along
      if (info.transport || info.capacity) for (const c of this.cargoOf(u)) c.space = to;
      if (info.air && u.onCarrier) delete u.onCarrier; // launching
      this.moves.push({ unitId, from, to, phase, cost });
      this._log(`${POWER_NAMES[u.power]} moved ${u.type} ${this.space(from).name} → ${this.space(to).name}`);
      return u;
    }

    // Transport loading (land unit walks onto adjacent transport)
    canLoad(landUnit, transport) {
      const info = UNITS[landUnit.type];
      if (!info.land || landUnit.power !== this.current) return false;
      if (!this.isFriendly(transport.power, landUnit.power)) return false;
      if (landUnit.moved > 0 || landUnit.onTransport) return false;
      const tz = transport.space;
      if (this.isHostileSpace(this.current, tz)) return false;
      if (!this.space(landUnit.space).conn.includes(tz)) return false;
      // capacity: any one land unit plus one additional infantry (max 2 units, ≤1 non-infantry)
      const cargo = this.cargoOf(transport);
      if (cargo.length >= 2) return false;
      const nonInf = cargo.filter(c => c.type !== "infantry").length + (landUnit.type !== "infantry" ? 1 : 0);
      return nonInf <= 1;
    }
    loadUnit(landUnitId, transportId) {
      const u = this.unit(landUnitId), t = this.unit(transportId);
      if (!this.canLoad(u, t)) throw new Error("cannot load");
      u.onTransport = t.id; u.space = t.space; u.moved = UNITS[u.type].move; // loading = entire move
      this._log(`${u.type} loaded onto transport in ${this.space(t.space).name}`);
    }
    offloadTransport(transportId, territoryId) {
      // noncombat offload into friendly territory, or flag amphibious in combat move
      const t = this.unit(transportId);
      const cargo = this.cargoOf(t);
      if (!cargo.length) throw new Error("empty transport");
      if (!this.space(t.space).conn.includes(territoryId)) throw new Error("not adjacent");
      const s = this.space(territoryId);
      if (s.sea) throw new Error("must offload to land");
      if (this.phase === "noncombatMove") {
        if (this.isHostileSpace(this.current, territoryId)) throw new Error("hostile");
        if (t.usedThisTurn) throw new Error("transport already offloaded");
        for (const c of cargo) { delete c.onTransport; c.space = territoryId; c.moved = UNITS[c.type].move; }
        t.usedThisTurn = true; t.moved = UNITS.transport.move;
        this._log(`Transport offloaded into ${s.name}`);
      } else if (this.phase === "combatMove") {
        // declare amphibious assault
        if (!this.isHostileSpace(this.current, territoryId) && !this.hasEnemyUnits(this.current, territoryId))
          throw new Error("not hostile — offload in noncombat phase");
        this.assaults[territoryId] = this.assaults[territoryId] || { from: {}, units: [] };
        this.assaults[territoryId].from[t.space] = true;
        for (const c of cargo) { c.amphibTarget = territoryId; }
        t.usedThisTurn = true;
        this._log(`Amphibious assault declared on ${s.name} from ${this.space(t.space).name}`);
      } else throw new Error("wrong phase");
    }

    // fighters landing on carriers in noncombat handled via moveUnit then landOnCarrier
    landOnCarrier(fighterId, carrierId) {
      const f = this.unit(fighterId), c = this.unit(carrierId);
      if (f.space !== c.space) throw new Error("not same sea zone");
      if (!this.isFriendly(f.power, c.power)) throw new Error("enemy carrier");
      if (this.carrierFighters(c).length >= 2) throw new Error("carrier full");
      f.onCarrier = c.id;
      this._log(`Fighter landed on carrier in ${this.space(c.space).name}`);
    }

    // ---------- phase: purchase ----------
    buy(unitType, qty) {
      if (this.phase !== "purchase") throw new Error("wrong phase");
      const cost = UNITS[unitType].cost * qty;
      const spent = this.purchases.reduce((s, p) => s + UNITS[p.unit].cost * p.qty, 0);
      if (spent + cost > this.ipc[this.current]) throw new Error("not enough IPCs");
      const ex = this.purchases.find(p => p.unit === unitType);
      if (ex) ex.qty += qty; else this.purchases.push({ unit: unitType, qty });
      if ((ex ? ex.qty : qty) < 0) throw new Error("negative");
    }
    repairIC(spaceId, points) {
      if (this.phase !== "purchase") throw new Error("wrong phase");
      const dmg = this.icDamage[spaceId] || 0;
      const pay = Math.min(points, dmg, this.ipc[this.current] - this.purchaseSpent());
      this.icDamage[spaceId] = dmg - pay;
      this.repairSpent = (this.repairSpent || 0) + pay;
      this._log(`Repaired ${pay} damage at ${this.space(spaceId).name}`);
    }
    purchaseSpent() {
      return this.purchases.reduce((s, p) => s + UNITS[p.unit].cost * p.qty, 0) + (this.repairSpent || 0);
    }
    endPurchase() {
      this.ipc[this.current] -= this.purchaseSpent();
      this.repairSpent = 0;
      this._log(`Purchased: ${this.purchases.map(p => p.qty + " " + p.unit).join(", ") || "nothing"}`);
      this.phase = "combatMove";
    }

    // ---------- phase: combat move ----------
    // declare a strategic bombing raid for a bomber sitting over an enemy IC territory
    setSBR(unitId) {
      const u = this.unit(unitId);
      if (!u || u.type !== "bomber") throw new Error("not a bomber");
      const s = this.space(u.space);
      if (s.sea || !this.isHostileSpace(u.power, u.space) ||
        !this.unitsAt(u.space, x => x.type === "factory").length) throw new Error("no enemy IC here");
      u.sbr = u.space;
      this._log(`Strategic bombing raid declared on ${s.name}`);
    }
    // toggle an optional attack on a sea zone holding only enemy subs/transports
    toggleSeaAttack(spaceId) {
      if (this.declaredSeaAttacks.has(spaceId)) this.declaredSeaAttacks.delete(spaceId);
      else this.declaredSeaAttacks.add(spaceId);
    }
    endCombatMove() {
      // blitz sweep: tanks capture empty hostile territories they passed through
      for (const u of this.units) {
        if (u.dead || u.power !== this.current || !UNITS[u.type].blitz || !u.movePath) continue;
        for (const t of u.movePath.slice(1, -1)) {
          const s = this.space(t);
          if (!s.sea && this.owner[t] != null && !this.isFriendly(this.current, this.owner[t]) &&
            !this.hasEnemyUnits(this.current, t)) this.captureTerritory(t, this.current);
        }
      }
      this._collectBattles();
      this.phase = "combat";
      this._log(`Combat move complete. ${this.battles.length} battle(s).`);
      return this.battles;
    }
    _collectBattles() {
      this.battles = [];
      const power = this.current;
      const contested = new Set(), sbrTargets = new Set();
      for (const u of this.units) {
        if (u.dead || u.power !== power) continue;
        if (u.sbr) { sbrTargets.add(u.sbr); continue; }
        if (u.onTransport && !u.amphibTarget) continue; // plain cargo
        const at = u.amphibTarget || u.space;
        const s = this.space(at);
        // moved into a contested space — or stayed in a sea zone with enemy surface warships
        const involved = u.moved > 0 || u.amphibTarget || (s.sea && UNITS[u.type].sea);
        if (!involved) continue;
        if (u.amphibTarget) { contested.add(at); continue; }
        if (this.hasEnemyUnits(power, at) && (!s.sea || !this.unitsAt(at, x =>
          !this.isFriendly(power, x.power)).every(x => UNITS[x.type].facility))) {
          // a sea zone holding only enemy subs/transports is attacked only by declaration
          if (s.sea && !this.isHostileSpace(power, at) && !this.declaredSeaAttacks.has(at)) continue;
          contested.add(at);
        } else if (!s.sea && this.isHostileSpace(power, at) && !UNITS[u.type].air) {
          contested.add(at); // empty hostile territory (capture)
        }
      }
      for (const id of contested) this.battles.push({ space: id, sea: !!this.space(id).sea,
        amphib: !!this.assaults[id], resolved: false });
      for (const id of sbrTargets) this.battles.push({ space: id, sbr: true, resolved: false });
      // resolve order: sea battles first (amphib sources), then SBR, then land
      this.battles.sort((a, b) => (b.sea ? 2 : b.sbr ? 1 : 0) - (a.sea ? 2 : a.sbr ? 1 : 0));
    }

    // ---------- phase: mobilize ----------
    mobilizeCapacity(icSpaceId) {
      const s = this.space(icSpaceId);
      const cap = Math.max(0, (s.ipc || 0) - (this.icDamage[icSpaceId] || 0));
      return cap;
    }
    eligibleICs(power) {
      return Object.keys(this.map.spaces).filter(id =>
        this.owner[id] === power &&
        !this.capturedThisTurn.has(id) &&
        this.unitsAt(id, u => u.type === "factory" && !u.placedThisTurn).length > 0);
    }
    place(unitType, spaceId) {
      if (this.phase !== "mobilize") throw new Error("wrong phase");
      const power = this.current;
      const pool = this.purchases.find(p => p.unit === unitType && p.qty > 0);
      if (!pool) throw new Error("none purchased");
      const info = UNITS[unitType];
      const s = this.space(spaceId);
      if (info.facility) {
        if (s.sea || this.owner[spaceId] !== power || (s.ipc || 0) < 1 ||
          this.capturedThisTurn.has(spaceId) ||
          this.unitsAt(spaceId, u => u.type === "factory").length) throw new Error("illegal IC placement");
        const u = this._spawn("factory", power, spaceId); u.placedThisTurn = true;
      } else {
        // find governing IC + capacity
        let icSpace = null;
        if (s.sea) {
          for (const nb of s.conn) {
            if (this.eligibleICs(power).includes(nb) && this._placedCount(nb) < this.mobilizeCapacity(nb)) { icSpace = nb; break; }
          }
          if (!info.sea && unitType !== "fighter") throw new Error("only sea units in sea zones");
        } else {
          if (info.sea) throw new Error("sea unit must go to sea zone");
          if (!this.eligibleICs(power).includes(spaceId)) throw new Error("no eligible IC");
          if (this._placedCount(spaceId) >= this.mobilizeCapacity(spaceId)) throw new Error("IC at capacity");
          icSpace = spaceId;
        }
        if (!icSpace) throw new Error("no eligible IC with capacity adjacent");
        let carrierForFighter = null;
        if (unitType === "fighter" && s.sea) {
          carrierForFighter = this.unitsAt(spaceId, x => x.type === "carrier" && x.power === power &&
            this.carrierFighters(x).length < 2)[0];
          if (!carrierForFighter) throw new Error("no carrier space");
        }
        const u = this._spawn(unitType, power, spaceId);
        u.placedThisTurn = true; u.icSpace = icSpace;
        if (carrierForFighter) u.onCarrier = carrierForFighter.id;
      }
      pool.qty--;
      this._log(`Mobilized ${unitType} in ${s.name}`);
    }
    _placedCount(icSpace) {
      return this.units.filter(u => !u.dead && u.placedThisTurn && u.icSpace === icSpace).length;
    }
    endMobilize() {
      // refund unplaceable units
      let refund = 0;
      for (const p of this.purchases) if (p.qty > 0) refund += p.qty * UNITS[p.unit].cost;
      if (refund) { this.ipc[this.current] += refund; this._log(`Refunded ${refund} IPCs for unplaced units`); }
      this.purchases = [];
      this.phase = "income";
    }

    // ---------- phase: income & turn end ----------
    collectIncome() {
      const p = this.current;
      if (this.capitalHeld(p)) {
        const amt = this.production(p);
        this.ipc[p] += amt;
        this._log(`${POWER_NAMES[p]} collects ${amt} IPCs (treasury ${this.ipc[p]})`);
      } else {
        this._log(`${POWER_NAMES[p]} capital occupied — no income collected`);
      }
      this._endTurn();
    }
    _endTurn() {
      for (const u of this.units) {
        u.moved = 0; delete u.movePath; delete u.usedThisTurn; delete u.placedThisTurn;
        delete u.icSpace; delete u.amphibTarget; delete u.sbr;
        if (u.type === "battleship" && !u.dead) u.hits = 0; // battleships repair at turn end
      }
      this.moves = []; this.assaults = {}; this.battles = [];
      this.capturedThisTurn = new Set(); this.declaredSeaAttacks = new Set();
      if (this.turnIndex === POWERS.length - 1) {
        // victory check after US turn
        const axisVC = this.victoryCityCount("axis"), alliesVC = this.victoryCityCount("allies");
        const need = this.options.totalVictory ? { axis: 13, allies: 13 } : { axis: 9, allies: 10 };
        if (axisVC >= need.axis) this.winner = "axis";
        else if (alliesVC >= need.allies) this.winner = "allies";
        this.turnIndex = 0; this.round++;
        this._log(`Round ${this.round - 1} complete. VC axis ${axisVC} / allies ${alliesVC}.`);
      } else this.turnIndex++;
      this.phase = "purchase";
      // skip phases for capital-less powers is handled by UI (purchase/income disabled)
    }

    // ---------- capture ----------
    captureTerritory(spaceId, byPower) {
      const s = this.space(spaceId);
      const prevOwner = this.owner[spaceId];
      if (prevOwner == null) return;
      const original = s.owner; // printed original controller
      let newOwner = byPower;
      // liberation: original controller is a friend of capturer and their capital is free
      if (original && this.isFriendly(byPower, original) && original !== byPower) {
        newOwner = this.capitalHeld(original) ? original : byPower;
      }
      this.owner[spaceId] = newOwner;
      this.capturedThisTurn.add(spaceId);
      // capital capture: loot treasury
      if (s.capital && s.capital === prevOwner) {
        const loot = this.ipc[prevOwner];
        this.ipc[prevOwner] = 0; this.ipc[byPower] += loot;
        this._log(`${POWER_NAMES[byPower]} captured ${s.name}! Looted ${loot} IPCs from ${POWER_NAMES[prevOwner]}.`);
      } else if (s.capital && this.isFriendly(byPower, s.capital) && newOwner !== byPower) {
        // liberated a friendly capital: territories of that power held by friends revert
        for (const [id2] of Object.entries(this.owner)) {
          const sp2 = this.space(id2);
          if (sp2.owner === s.capital && this.owner[id2] && this.isFriendly(this.owner[id2], s.capital) && this.owner[id2] !== s.capital)
            this.owner[id2] = s.capital;
        }
        this._log(`${s.name} liberated!`);
      } else {
        this._log(`${POWER_NAMES[byPower]} ${newOwner === byPower ? "captured" : "liberated"} ${s.name}`);
      }
      // destroy/capture enemy AAA & IC stays; enemy AAA in captured territory is destroyed via combat rules
    }

    // ---------- serialization ----------
    snapshot() {
      return JSON.stringify({
        seed: this.seed, rngCalls: this._rngCalls, options: this.options, players: this.players,
        owner: this.owner, icDamage: this.icDamage, units: this.units, nextUnitId: this.nextUnitId,
        ipc: this.ipc, round: this.round, turnIndex: this.turnIndex, phase: this.phase,
        purchases: this.purchases, moves: this.moves, assaults: this.assaults,
        battles: this.battles, capturedThisTurn: [...this.capturedThisTurn],
        winner: this.winner, log: this.log.slice(-400),
      });
    }
    static restore(json, mapData) {
      const d = typeof json === "string" ? JSON.parse(json) : json;
      const g = Object.create(Game.prototype);
      g.map = mapData; g.options = d.options; g.players = d.players; g.seed = d.seed;
      g.rng = mulberry32(d.seed); g._rngCalls = 0;
      for (let i = 0; i < d.rngCalls; i++) { g.rng(); g._rngCalls++; }
      g.owner = d.owner; g.icDamage = d.icDamage; g.units = d.units; g.nextUnitId = d.nextUnitId;
      g.ipc = d.ipc; g.round = d.round; g.turnIndex = d.turnIndex; g.phase = d.phase;
      g.purchases = d.purchases; g.moves = d.moves; g.assaults = d.assaults;
      g.battles = d.battles; g.capturedThisTurn = new Set(d.capturedThisTurn);
      g.winner = d.winner; g.log = d.log;
      return g;
    }
  }

  return { Game, UNITS, POWERS, SIDES, POWER_NAMES, PHASES, mulberry32 };
});
