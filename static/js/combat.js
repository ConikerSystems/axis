/* Axis & Allies 1942.2 — combat resolution.
   A Battle is a decision-driven state machine: callers loop
     while (d = battle.pending()) { battle.decide(answerFor(d)); }
   so the human UI (async dialogs) and the AI (instant answers) drive the
   exact same rules code.

   Hits are tracked by CLASS to enforce assignment constraints:
     sub hits    → sea units only
     air hits    → cannot be assigned to enemy subs unless a friendly destroyer is in the battle
     normal hits → any unit
   Defender casualties go "behind the casualty strip" (doomedFlag) and return
   fire before dying; surprise-strike casualties die immediately; bombardment
   casualties fire back in the land combat. Transports are chosen last. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.Combat = factory(root.Engine);
})(typeof self !== "undefined" ? self : this, function (Engine) {
  "use strict";
  const { UNITS, POWER_NAMES } = Engine;
  const Game = Engine.Game;

  const isSub = (u) => !!UNITS[u.type].sub;
  const isAir = (u) => !!UNITS[u.type].air;
  const isLand = (u) => !!UNITS[u.type].land;
  const isTransport = (u) => !!UNITS[u.type].transport;
  const hitClass = (u) => isSub(u) ? "sub" : isAir(u) ? "air" : "normal";
  // Effective attack/defense pip for a unit. A US "super fighter" (u.super — set by the
  // engine when the USA Super Bomber option is on) attacks AND defends at 6, a guaranteed
  // hit on a d6, matching the boosted US air arm that flies with the Super Bomber.
  const pip = (u, attacking) =>
    (u.type === "fighter" && u.super)
      ? 6
      : (attacking ? UNITS[u.type].attack : UNITS[u.type].defense);

  class Battle {
    constructor(game, spaceId, opts) {
      this.g = game;
      this.space = spaceId;
      this.s = game.space(spaceId);
      this.sea = !!this.s.sea;
      this.sbr = !!(opts && opts.sbr);
      this.round = 0;
      this.events = [];
      this.attacker = game.current;

      // amphibious cargo only lands if its transport is still alive in a declared staging zone
      // AND that sea zone has been cleared of enemy surface warships. Per the rulebook you must
      // defeat any defending destroyers/cruisers/battleships/carriers before offloading; subs and
      // enemy transports don't block. Sea battles resolve before land battles (see battle order),
      // so a warship still alive in the staging zone means the assault from it is repelled.
      const assault = game.assaults[spaceId];
      const zoneBlocked = (zone) => game.unitsAt(zone, x =>
        !game.isFriendly(this.attacker, x.power) && UNITS[x.type].sea &&
        !UNITS[x.type].sub && !UNITS[x.type].transport).length > 0;
      const declaredAmphib = game.units.filter(u => !u.dead && u.amphibTarget === spaceId &&
        assault && assault.from[u.space]);
      this.amphibUnits = declaredAmphib.filter(u => !zoneBlocked(u.space));
      const repelled = declaredAmphib.filter(u => zoneBlocked(u.space));
      if (repelled.length) {
        const zone = game.space(repelled[0].space).name;
        this._ev("info", { text: "Amphibious assault repelled — enemy warships still control " + zone +
          "; the troops stay aboard their transports." });
      }
      // fighters still aboard a carrier are cargo — they fight only if they launched (moved off)
      this.att = game.unitsAt(spaceId, u => u.power === this.attacker &&
        !UNITS[u.type].facility && !u.onTransport && !u.sbrDone && !u.onCarrier);
      if (!this.sea && this.amphibUnits.length) {
        for (const u of this.amphibUnits) { delete u.onTransport; u.space = spaceId; }
        this.att = this.att.concat(this.amphibUnits.filter(u => !this.att.includes(u)));
      }
      if (this.sea) this.att = this.att.filter(u => !isLand(u)); // cargo isn't a combatant
      this.def = game.unitsAt(spaceId, u => !game.isFriendly(this.attacker, u.power) && !UNITS[u.type].facility);
      for (const d of this.def) if (d.onCarrier) delete d.onCarrier; // defending fighters launch

      this.defPower = this.def.length ? this.def[0].power : (game.owner[spaceId] || null);
      this.queue = [];
      this.done = false; this.result = null;
      if (this.sbr) { this.bombers = this.att.filter(u => (u.type === "bomber" || u.type === "superbomber") && u.sbr === spaceId); this._planSBR(); }
      else if (!this.attAlive.length) this._finish();
      else this._planRound(true);
    }

    _ev(type, data) { this.events.push(Object.assign({ type }, data)); }
    alive(list) { return list.filter(u => !u.dead); }
    get attAlive() { return this.alive(this.att); }
    get defAlive() { return this.alive(this.def).filter(u => !u.doomedFlag); }
    get defFiring() { return this.alive(this.def); } // includes casualty-strip units

    // ---------- decision pump ----------
    pending() {
      if (this.done) return null;
      while (!this._pending && !this.done) {
        if (!this.queue.length) { this._finish(); break; }
        this._exec(this.queue.shift());
      }
      return this._pending || null;
    }
    decide(answer) {
      const p = this._pending;
      if (!p) throw new Error("no pending decision");
      this._pending = null;
      p.resolve(answer || {});
      return this.pending();
    }
    _ask(decision, resolve) { this._pending = Object.assign({}, decision, { resolve }); }

    // ---------- planning ----------
    _planSBR() {
      this.queue = [];
      if (this.g.options.interceptors) {
        const figs = this.g.unitsAt(this.space, u => u.type === "fighter" && !this.g.isFriendly(this.attacker, u.power));
        if (figs.length) this.queue.push({ step: "interceptDecision" });
      }
      this.queue.push({ step: "icAA" }, { step: "sbrDamage" }, { step: "endSBR" });
    }
    _planRound(first) {
      this.round++;
      const q = this.queue = [];
      if (first && !this.sea) {
        if (this.def.some(u => u.type === "aaa") && this.att.some(isAir)) q.push({ step: "aaFire" });
      }
      // Super Bomber strike: one shot, after AA (so AA/fighter-soak resolves first). Land or sea.
      if (first && this.att.some(u => u.type === "superbomber" && !u.superFired)) q.push({ step: "superStrike" });
      if (first && !this.sea && this.g.assaults[this.space]) q.push({ step: "bombard" });
      if (this.sea) {
        const defDD = this.def.some(u => !u.dead && UNITS[u.type].antiSub);
        const attDD = this.att.some(u => !u.dead && UNITS[u.type].antiSub);
        if ((this.attAlive.some(isSub) && !defDD) || (this.defAlive.some(isSub) && !attDD))
          q.push({ step: "subPhase" });
      }
      q.push({ step: "attFire" }, { step: "defFire" }, { step: "cleanup" }, { step: "endCheck" });
    }

    // ---------- casualty selection ----------
    // Sequential class-constrained asks. spec: [{count, pool, immediate}]
    _askCasualties(side, specs, then) {
      const next = (i) => {
        while (i < specs.length && (specs[i].count <= 0 || !specs[i].pool.length)) i++;
        if (i >= specs.length) { if (then) then(); return; }
        const sp = specs[i];
        const capacity = sp.pool.reduce((s, u) => s + ((UNITS[u.type].twoHit && u.hits === 0) ? 2 : 1), 0);
        const count = Math.min(sp.count, capacity);
        if (!count) { next(i + 1); return; }
        // transports last: if non-transports exist in pool, exclude transports unless hits exceed others' capacity
        let pool = sp.pool;
        const nonTr = pool.filter(u => !isTransport(u));
        const nonTrCap = nonTr.reduce((s, u) => s + ((UNITS[u.type].twoHit && u.hits === 0) ? 2 : 1), 0);
        if (nonTr.length && nonTrCap >= count) pool = nonTr;
        this._ask({ type: "casualties", side, count, pool: pool.map(u => u.id),
          label: sp.label, text: `Assign ${count} hit(s)${sp.label ? " (" + sp.label + ")" : ""}` },
          (ans) => {
            let remaining = count;
            const ids = (ans.units || []).slice();
            for (const id of ids) {
              if (remaining <= 0) break;
              const u = this.g.unit(id);
              if (!u || u.dead || !pool.includes(u)) continue;
              if (UNITS[u.type].twoHit && u.hits === 0) { u.hits = 1; remaining--; continue; }
              this._casualty(u, side, sp.immediate);
              remaining--;
            }
            // auto-assign any unpicked remainder (cheapest first) so the battle can't stall
            while (remaining > 0) {
              const left = pool.filter(u => !u.dead && !(side === "defender" && u.doomedFlag));
              if (!left.length) break;
              left.sort((a, b) => UNITS[a.type].cost - UNITS[b.type].cost);
              const u = left.find(x => UNITS[x.type].twoHit && x.hits === 0) && left.some(x => !UNITS[x.type].twoHit) ?
                left.find(x => !UNITS[x.type].twoHit) : left[0];
              if (UNITS[u.type].twoHit && u.hits === 0) { u.hits = 1; remaining--; continue; }
              this._casualty(u, side, sp.immediate);
              remaining--;
            }
            next(i + 1);
          });
      };
      next(0);
    }
    _casualty(u, side, immediate) {
      if (side === "defender" && !immediate) { u.doomedFlag = true; } // fires back, dies at cleanup
      else this._reallyKill(u);
    }
    _kill(ids) { for (const id of ids) { const u = this.g.unit(id); if (u) this._reallyKill(u); } }
    _reallyKill(u) {
      u.dead = true; delete u.doomedFlag;
      if (UNITS[u.type].transport) for (const c of this.g.cargoOf(u)) c.dead = true;
      if (UNITS[u.type].carrier) for (const f of this.g.carrierFighters(u)) {
        if (this.def.includes(f) || this.att.includes(f)) { delete f.onCarrier; continue; }
        f.dead = true; // guest/cargo fighters go down with the ship
      }
    }

    // ---------- firing ----------
    _fire(units, attacking) {
      let support = 0;
      if (attacking && !this.sea) support = units.filter(u => u.type === "artillery" && !u.dead).length;
      const groups = {}; // key: class|value
      for (const u of units) {
        let v = pip(u, attacking);
        if (attacking && u.type === "infantry" && support > 0) { v = 2; support--; }
        if (v <= 0) continue;
        const k = hitClass(u) + "|" + v;
        groups[k] = (groups[k] || 0) + 1;
      }
      const detail = [];
      const hits = { normal: 0, sub: 0, air: 0 };
      for (const [k, n] of Object.entries(groups)) {
        const [cls, v] = k.split("|");
        const dice = this.g.roll(n);
        const h = dice.filter(x => x <= +v).length;
        hits[cls] += h;
        detail.push({ cls, value: +v, dice, hits: h });
      }
      return { hits, detail };
    }
    _casualtySpecs(hits, targetsAll, shootersSide) {
      // build class-constrained specs against current live targets
      const g = this.g;
      const friendlyDD = (shootersSide === "attacker" ? this.attAlive : this.defFiring)
        .some(u => UNITS[u.type].antiSub);
      const targets = targetsAll.filter(u => !u.submerged);
      const seaT = targets.filter(u => !isAir(u));
      const nonSubT = targets.filter(u => !isSub(u) || friendlyDD);
      return [
        { count: hits.sub, pool: seaT, label: "submarine hits — ships only", immediate: shootersSide === "defender" },
        { count: hits.air, pool: nonSubT, label: friendlyDD ? "air hits" : "air hits — cannot hit submarines", immediate: shootersSide === "defender" },
        { count: hits.normal, pool: targets, immediate: shootersSide === "defender" },
      ];
    }

    // ---------- steps ----------
    _exec(item) {
      const g = this.g;
      switch (item.step) {
        case "aaFire": {
          const aas = this.defAlive.filter(u => u.type === "aaa");
          // Super Bombers are immune to antiaircraft fire — AA can only target other air.
          const airs = this.attAlive.filter(u => isAir(u) && u.type !== "superbomber");
          const shots = Math.min(aas.length * 3, airs.length);
          if (!shots) break;
          const dice = g.roll(shots, "AA fire");
          const hits = dice.filter(d => d === 1).length;
          this._ev("dice", { side: "defender", label: "Antiaircraft fire", dice, hits });
          if (hits) this._askCasualties("attacker",
            [{ count: hits, pool: airs, immediate: true, label: "AA hits — air units" }]);
          break;
        }
        case "superStrike": {
          // The Super Bomber is unstoppable: no AA can touch it (handled in aaFire) and its
          // strike ALWAYS lands — it annihilates every enemy unit here AND the industrial
          // complex (land or sea); on land the carried man drops in to seize the territory.
          const sbs = this.attAlive.filter(u => u.type === "superbomber" && !u.superFired);
          if (!sbs.length) break;
          sbs.forEach(b => b.superFired = true);
          this._ev("dice", { side: "attacker", label: "Super Bomber strike", dice: sbs.map(() => 6), hits: 1 });
          for (const u of this.def) if (!u.dead) this._reallyKill(u);         // all defenders
          // the industrial complex SURVIVES — it's captured (below), not destroyed
          this._ev("info", { text: "Super Bomber annihilates all forces at " + this.s.name });
          if (!this.sea) {
            const man = g._spawn("infantry", this.attacker, this.space);      // the carried man
            man.moved = 1; man.fromSuperBomber = true;
            this.att.push(man);
            this._ev("info", { text: "Carried infantry secures " + this.s.name });
          }
          break;
        }
        case "bombard": {
          const a = g.assaults[this.space];
          let ships = [];
          for (const z of Object.keys(a.from)) {
            if (a.seaCombat && a.seaCombat[z]) continue; // combat in that zone forfeits bombardment
            ships = ships.concat(g.unitsAt(z, u => u.power === this.attacker && UNITS[u.type].bombard && !u.bombarded));
          }
          ships = ships.slice(0, this.alive(this.amphibUnits).length);
          if (!ships.length) break;
          const dice = g.roll(ships.length, "Bombardment");
          let hits = 0;
          dice.forEach((d, i) => { ships[i].bombarded = true; if (d <= UNITS[ships[i].type].bombard) hits++; });
          this._ev("dice", { side: "attacker", label: "Shore bombardment", dice, hits });
          if (hits) this._askCasualties("defender",
            [{ count: hits, pool: this.defAlive, immediate: false, label: "bombardment" }]);
          break;
        }
        case "subPhase": {
          const defDD = this.defFiring.some(u => UNITS[u.type].antiSub);
          const attDD = this.attAlive.some(u => UNITS[u.type].antiSub);
          const attSubs = defDD ? [] : this.attAlive.filter(isSub);
          const defSubs = attDD ? [] : this.defAlive.filter(isSub);
          const strike = () => {
            const aStrikers = attSubs.filter(u => !u.submerged && !u.dead);
            const afterAtt = () => {
              const dStrikers = defSubs.filter(u => !u.submerged && !u.dead);
              if (dStrikers.length) {
                const dice = g.roll(dStrikers.length, "Defending sub surprise strike");
                const hits = dice.filter(d => d <= 1).length;
                this._ev("dice", { side: "defender", label: "Sub surprise strike", dice, hits });
                dStrikers.forEach(u => u.firedSurprise = this.round);
                if (hits) {
                  const pool = this.attAlive.filter(u => !isAir(u) && !u.submerged);
                  this._askCasualties("attacker", [{ count: hits, pool, immediate: true, label: "surprise strike — ships only" }]);
                }
              }
            };
            if (aStrikers.length) {
              const dice = g.roll(aStrikers.length, "Attacking sub surprise strike");
              const hits = dice.filter(d => d <= 2).length;
              this._ev("dice", { side: "attacker", label: "Sub surprise strike", dice, hits });
              aStrikers.forEach(u => u.firedSurprise = this.round);
              if (hits) {
                const pool = this.defAlive.filter(u => !isAir(u) && !u.submerged);
                this._askCasualties("defender", [{ count: hits, pool, immediate: true, label: "surprise strike — ships only" }], afterAtt);
                return;
              }
            }
            afterAtt();
          };
          const askDef = (after) => {
            if (defSubs.length) this._ask({ type: "submerge", side: "defender", pool: defSubs.map(u => u.id),
              text: "Submerge defending submarines? (others make a Surprise Strike)" },
              (ans) => { this._submerge(ans.units || []); after(); });
            else after();
          };
          if (attSubs.length) this._ask({ type: "submerge", side: "attacker", pool: attSubs.map(u => u.id),
            text: "Submerge attacking submarines? (others make a Surprise Strike)" },
            (ans) => { this._submerge(ans.units || []); askDef(strike); });
          else askDef(strike);
          break;
        }
        case "attFire": {
          // super bombers never fire in normal rounds — they get one super-strike only
          const units = this.attAlive.filter(u => !u.submerged && u.firedSurprise !== this.round && u.type !== "superbomber");
          if (!units.length) break;
          const { hits, detail } = this._fire(units, true);
          this._ev("dice", { side: "attacker", label: "Attacker fires", detail,
            hits: hits.normal + hits.sub + hits.air });
          this._askCasualties("defender", this._casualtySpecs(hits, this.defAlive, "attacker"));
          break;
        }
        case "defFire": {
          if (this._defenselessTransports()) {
            this._kill(this.defAlive.filter(isTransport).map(u => u.id));
            this._ev("info", { text: "Defenseless transports destroyed" });
            break;
          }
          const units = this.defFiring.filter(u => !u.submerged && u.firedSurprise !== this.round && u.type !== "aaa");
          if (!units.length) break;
          const { hits, detail } = this._fire(units, false);
          this._ev("dice", { side: "defender", label: "Defender fires", detail,
            hits: hits.normal + hits.sub + hits.air });
          this._askCasualties("attacker", this._casualtySpecs(hits, this.attAlive, "defender"));
          break;
        }
        case "cleanup": {
          for (const u of this.def) if (u.doomedFlag && !u.dead) this._reallyKill(u);
          break;
        }
        case "endCheck": {
          const a = this.attAlive.filter(u => !u.submerged), d = this.defAlive.filter(u => !u.submerged);
          const canHit = (xs, ys, side) => {
            const dd = xs.some(u => UNITS[u.type].antiSub);
            return xs.some(x => {
              const v = pip(x, side === "att");
              if (v <= 0) return false;
              return ys.some(y => !(isSub(y) && isAir(x) && !dd) && !(isAir(y) && isSub(x)));
            });
          };
          if (!a.length || !d.length || (!canHit(a, d, "att") && !canHit(d, a, "def"))) { this._finish(); break; }
          const retreats = this._retreatOptions();
          this._ask({ type: "retreat", side: "attacker", options: retreats,
            text: "Press the attack or retreat?" }, (ans) => {
            if (ans.retreat && retreats.includes(ans.to)) this._retreat(ans.to);
            else this._planRound(false);
          });
          break;
        }
        // ---- strategic bombing ----
        case "interceptDecision": {
          const figs = this.g.unitsAt(this.space, u => u.type === "fighter" && !this.g.isFriendly(this.attacker, u.power));
          this._ask({ type: "intercept", side: "defender", pool: figs.map(u => u.id),
            text: "Commit fighters to intercept the bombing raid?" }, (ans) => {
            const chosen = (ans.units || []).map(id => this.g.unit(id)).filter(Boolean);
            if (chosen.length) this._airBattle(chosen);
          });
          break;
        }
        case "icAA": {
          // Super Bombers are immune to AA even on a bombing raid.
          const hittable = () => this.alive(this.bombers).filter(b => b.type !== "superbomber");
          if (!hittable().length) break;
          // 1942.2: bombers are fired on during a raid only if an antiaircraft gun is
          // present in the target territory (an IC has no inherent air defense).
          const aaGuns = g.unitsAt(this.space, u => u.type === "aaa" && !g.isFriendly(this.attacker, u.power));
          if (!aaGuns.length) break;
          const shots = Math.min(aaGuns.length * 3, hittable().length); // 1 die/bomber, max 3 per gun
          const dice = g.roll(shots, "AA fire (bombing raid)");
          const hits = dice.filter(d => d === 1).length;
          this._ev("dice", { side: "defender", label: "Antiaircraft fire", dice, hits });
          for (let i = 0; i < hits; i++) { const b = hittable()[0]; if (b) this._reallyKill(b); }
          break;
        }
        case "sbrDamage": {
          const bombers = this.alive(this.bombers);
          if (!bombers.length) break;
          const dice = g.roll(bombers.length, "Strategic bombing");
          const dmg = dice.reduce((s, d) => s + d, 0);
          const cap = 2 * (this.s.ipc || 0);
          const cur = g.icDamage[this.space] || 0;
          const applied = Math.min(dmg, Math.max(0, cap - cur));
          g.icDamage[this.space] = cur + applied;
          this._ev("dice", { side: "attacker", label: "Bombing damage", dice, hits: applied });
          this._ev("info", { text: `${applied} damage (total ${g.icDamage[this.space]}/${cap}) at ${this.s.name}` });
          bombers.forEach(b => { b.sbrDone = true; delete b.sbr; });
          break;
        }
        case "endSBR": { this.done = true; this.result = { type: "sbr" }; break; }
      }
    }

    _airBattle(interceptors) {
      const g = this.g;
      const escorts = this.att.filter(u => u.type === "fighter" && !u.dead);
      const attN = this.alive(this.bombers).length + escorts.length;
      const d1 = g.roll(attN, "Air battle — attackers");
      let defLoss = d1.filter(x => x === 1).length;
      this._ev("dice", { side: "attacker", label: "Air battle", dice: d1, hits: defLoss });
      const liveInt = interceptors.slice();
      while (defLoss-- > 0 && liveInt.length) this._reallyKill(liveInt.pop());
      if (liveInt.length) {
        const d2 = g.roll(liveInt.length, "Air battle — interceptors");
        let attLoss = d2.filter(x => x <= 2).length;
        this._ev("dice", { side: "defender", label: "Interceptors", dice: d2, hits: attLoss });
        while (attLoss-- > 0) {
          const esc = escorts.find(u => !u.dead);
          if (esc) this._reallyKill(esc);
          else { const b = this.alive(this.bombers)[0]; if (b) this._reallyKill(b); else break; }
        }
      }
      for (const e of escorts) if (!e.dead) e.sbrDone = true;
    }

    _submerge(ids) {
      let n = 0;
      for (const id of ids) { const u = this.g.unit(id); if (u && isSub(u)) { u.submerged = true; n++; } }
      if (n) this._ev("info", { text: `${n} submarine(s) submerged` });
    }
    _defenselessTransports() {
      const d = this.defAlive.filter(u => !u.submerged);
      if (!d.length || !d.every(isTransport)) return false;
      return this.attAlive.some(u => !u.submerged &&
        (isSub(u) ? UNITS[u.type].attack > 0 : (isAir(u) || UNITS[u.type].attack > 0)));
    }

    _retreatOptions() {
      const g = this.g, opts = new Set();
      for (const u of this.attAlive) {
        if (this.amphibUnits.includes(u) || isAir(u)) continue;
        const path = (u.movePath || []).slice(0, -1);
        const candidates = path.length ? path : this.s.conn;
        for (const sId of candidates) {
          if (!this.s.conn.includes(sId)) continue;
          const sp = g.space(sId);
          if (UNITS[u.type].sea
            // sea retreat must go to a zone that was friendly at the START of the turn (p.18)
            ? (sp.sea && !g.isHostileSpace(this.attacker, sId) && !(g.seaHostileAtStart && g.seaHostileAtStart.has(sId)))
            : (!sp.sea && !sp.impassable && g.owner[sId] && g.isFriendly(this.attacker, g.owner[sId]) && !g.capturedThisTurn.has(sId)))
            opts.add(sId);
        }
      }
      return [...opts];
    }
    _retreat(to) {
      const g = this.g;
      for (const u of this.attAlive) {
        if (isAir(u)) { u.retreated = true; continue; }
        if (this.amphibUnits.includes(u)) continue; // seaborne can't retreat once ashore
        delete u.submerged;
        u.space = to;
        if (UNITS[u.type].carrier) for (const f of g.carrierFighters(u)) f.space = to;
        // a transport that retreats keeps its cargo but the amphibious assault is off
        if (UNITS[u.type].transport) for (const c of g.cargoOf(u)) { c.space = to; delete c.amphibTarget; }
      }
      for (const u of this.def) { delete u.submerged; delete u.doomedFlag; }
      this._ev("info", { text: `Attacker retreated to ${g.space(to).name}` });
      this.done = true;
      this.result = { type: "retreat" };
      g._log(`Retreat from ${this.s.name} to ${g.space(to).name}`);
    }

    _finish() {
      const g = this.g;
      this.done = true;
      const a = this.attAlive, d = this.defAlive;
      let captured = false;
      if (!this.sea && a.some(isLand) && !d.length) {
        g.captureTerritory(this.space, this.attacker);
        for (const f of g.unitsAt(this.space, u => u.type === "factory")) f.power = g.owner[this.space];
        captured = true;
      }
      // sea combat happened here: forfeit bombardment for assaults launched from this zone
      if (this.sea) for (const [target, a2] of Object.entries(g.assaults)) {
        if (a2.from[this.space]) { a2.seaCombat = a2.seaCombat || {}; a2.seaCombat[this.space] = true; }
      }
      for (const u of this.att.concat(this.def)) { delete u.submerged; delete u.doomedFlag; }
      this.result = { type: "resolved", attackerWon: !d.length && a.length > 0, captured };
      g._log(`Battle in ${this.s.name}: ${!d.length && a.length ? "attacker won" : d.length && !a.length ? "defender held" : "no survivors"}${captured ? " — captured" : ""}`);
    }
  }

  // ---------- Game phase-end extensions ----------
  Game.prototype.pendingBattles = function () {
    return this.battles.filter(b => !b.resolved);
  };

  Game.prototype.resolveUnopposed = function () {
    const power = this.current;
    for (const b of this.battles) {
      if (b.resolved || b.sbr) continue;
      const s = this.space(b.space);
      const defenders = this.unitsAt(b.space, u => !this.isFriendly(power, u.power) && !UNITS[u.type].facility);
      const realDef = defenders.filter(u => u.type !== "aaa");
      if (s.sea || realDef.length) continue;
      const attLand = this.unitsAt(b.space, u => u.power === power && UNITS[u.type].land && !u.onTransport)
        .concat(this.units.filter(u => !u.dead && u.amphibTarget === b.space));
      const attAir = this.unitsAt(b.space, u => u.power === power && UNITS[u.type].air);
      if (defenders.length && attAir.length) continue; // AAA may fire at air: use the battle UI
      if (attLand.length) {
        for (const u of attLand) if (u.amphibTarget === b.space) { delete u.onTransport; delete u.amphibTarget; u.space = b.space; }
        for (const aa of defenders) aa.dead = true;
        this.captureTerritory(b.space, power);
        for (const f of this.unitsAt(b.space, u => u.type === "factory")) f.power = this.owner[b.space];
        b.resolved = true;
      } else if (!defenders.length &&
        this.unitsAt(b.space, u => u.power === power && u.type === "superbomber").length) {
        // a Super Bomber over an undefended enemy territory drops its carried man to seize it
        const man = this._spawn("infantry", power, b.space); man.moved = 1; man.fromSuperBomber = true;
        this.captureTerritory(b.space, power);
        for (const f of this.unitsAt(b.space, u => u.type === "factory")) f.power = this.owner[b.space]; // complex captured, not destroyed
        b.resolved = true;
      }
    }
    this.units = this.units.filter(u => !u.dead);
  };

  Game.prototype.endCombat = function () {
    if (this.pendingBattles().length) throw new Error("battles remain");
    // clear per-combat flags so each unit is fresh next turn — incl. the Super Bomber's
    // one-shot marker, so every super bomber fires again on its next attack.
    for (const u of this.units) { delete u.firedSurprise; delete u.bombarded; delete u.amphibTarget;
      delete u.superFired; delete u.superMissed; }
    this.units = this.units.filter(u => !u.dead);
    this.phase = "noncombatMove";
  };

  Game.prototype.friendlyAtStart = function (spaceId) {
    const own = this.owner[spaceId];
    return own != null && this.isFriendly(this.current, own) && !this.capturedThisTurn.has(spaceId);
  };
  // spaces where an air unit can legally end the turn, within remaining movement
  Game.prototype.airLandingSpots = function (u) {
    const rem = Engine.UNITS[u.type].move - u.moved;
    const spots = [];
    if (rem <= 0) return spots;
    const dist = this._bfsAir(u.space, rem);
    for (const [id, cost] of dist) {
      if (cost === 0) continue;
      const s = this.space(id);
      if (!s.sea && this.friendlyAtStart(id)) spots.push({ space: id, cost });
      else if (s.sea && u.type === "fighter") {
        const carrier = this.unitsAt(id, x => this.isFriendly(x.power, u.power) && x.type === "carrier" &&
          this.carrierFighters(x).length < 2)[0];
        if (carrier) spots.push({ space: id, cost, carrier: carrier.id });
      }
    }
    return spots;
  };
  Game.prototype._bfsAir = function (from, max) {
    const dist = new Map([[from, 0]]);
    let frontier = [from];
    for (let d = 1; d <= max; d++) {
      const next = [];
      for (const f of frontier) for (const nb of this.space(f).conn) {
        const ns = this.space(nb);
        if (!ns.sea && ns.impassable) continue;
        if (!dist.has(nb)) { dist.set(nb, d); next.push(nb); }
      }
      frontier = next;
    }
    return dist;
  };
  Game.prototype.airCanLandAfter = function (u, target, cost) {
    const rem = Engine.UNITS[u.type].move - u.moved - cost;
    if (rem < 0) return false;
    const dist = this._bfsAir(target, rem);
    for (const [id] of dist) {
      const s = this.space(id);
      if (!s.sea && this.friendlyAtStart(id)) return true;
      if (s.sea && u.type === "fighter") {
        if (this.unitsAt(id, x => x.power === u.power && x.type === "carrier")) return true;
        const carrierReach = this.units.some(x => !x.dead && x.power === u.power && x.type === "carrier" &&
          x.moved === 0 && (x.space === id || this.space(x.space).conn.includes(id) ||
            this.space(x.space).conn.some(m => this.space(m).sea && this.space(m).conn.includes(id))));
        if (carrierReach) return true;
        const buyingCarrier = this.purchases.some(p => p.unit === "carrier" && p.qty > 0);
        if (buyingCarrier && this.space(id).conn.some(nb => this.owner[nb] === u.power &&
          this.unitsAt(nb, x => x.type === "factory").length)) return true;
      }
    }
    return false;
  };

  Game.prototype.strandedAir = function () {
    return this.units.filter(u => {
      if (u.dead || !Engine.UNITS[u.type].air || u.power !== this.current) return false;
      const s = this.space(u.space);
      if (!s.sea && this.friendlyAtStart(u.space)) return false;
      if (u.type === "fighter" && s.sea && (u.onCarrier ||
        this.unitsAt(u.space, x => this.isFriendly(x.power, u.power) && x.type === "carrier" &&
          this.carrierFighters(x).length < 2).length ||
        this._pendingCarrierZone(u.power, u.space))) return false;
      return true;
    });
  };
  Game.prototype.endNoncombatMove = function () {
    const lost = [];
    for (const u of this.units) {
      if (u.dead || !Engine.UNITS[u.type].air || u.power !== this.current) continue;
      const s = this.space(u.space);
      if (!s.sea && this.friendlyAtStart(u.space)) continue;
      if (u.type === "fighter" && s.sea) {
        if (u.onCarrier) continue;
        const c = this.unitsAt(u.space, x => this.isFriendly(x.power, u.power) && x.type === "carrier" &&
          this.carrierFighters(x).length < 2)[0];
        if (c) { u.onCarrier = c.id; continue; }
        // wait over a zone where a purchased carrier can be placed — it lands at mobilize
        if (this._pendingCarrierZone(u.power, u.space)) continue;
      }
      lost.push(u);
    }
    for (const u of lost) { u.dead = true; this._log(`${u.type} lost — no landing space`); }
    this.units = this.units.filter(u => !u.dead);
    this.phase = "mobilize";
    return lost.map(u => u.type);
  };

  return { Battle };
});
