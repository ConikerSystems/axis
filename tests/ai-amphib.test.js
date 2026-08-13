/* AI amphibious invasions — run: node tests/ai-amphib.test.js */
global.window = {};
require("../static/js/map-data.js");
const MAP = window.MAP_DATA;
const Engine = require("../static/js/engine.js");
const Combat = require("../static/js/combat.js");
const AI = require("../static/js/ai.js");
const { Game, UNITS } = Engine;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + " — " + e.message); if (process.env.V) console.log(e.stack); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "") + ` expected ${b}, got ${a}`); }
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); }

const PLAYERS = {};
for (const p of Engine.POWERS) PLAYERS[p] = { type: "ai", name: p };

// A clean, hand-built beachhead: one sea zone touching a territory we own and one the
// enemy owns, with every pre-existing unit in those three spaces cleared away.
function beachhead(phase) {
  const g = new Game({ mapData: MAP, seed: 7, players: PLAYERS });
  g.turnIndex = Engine.POWERS.indexOf("us");
  let found = null;
  for (const [sz, s] of Object.entries(MAP.spaces)) {
    if (!s.sea) continue;
    const lands = s.conn.filter(n => !MAP.spaces[n].sea && !MAP.spaces[n].impassable);
    if (lands.length >= 2) { found = { sz, home: lands[0], target: lands[1] }; break; }
  }
  if (!found) throw new Error("no sea zone touching two land spaces");
  const { sz, home, target } = found;
  for (const u of g.unitsAt(sz).concat(g.unitsAt(home), g.unitsAt(target))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  g.owner[home] = "us";
  g.owner[target] = "germany";
  g._snapshotTurnStart();
  g.phase = phase;
  return Object.assign({ g }, found);
}

console.log("— loading troops onto transports —");

t("loadTransports fills a transport from an adjacent friendly coast", () => {
  const { g, sz, home } = beachhead("noncombatMove");
  const tr = g._spawn("transport", "us", sz);
  g._spawn("infantry", "us", home);
  g._spawn("infantry", "us", home);
  g._spawn("tank", "us", home);
  AI.loadTransports(g);
  eq(g.cargoOf(tr).length, 2, "transport is full");
  ok(g.cargoOf(tr).some(u => u.type === "tank"), "took the heaviest unit it could");
});

t("loadTransports never strips a territory's last defender", () => {
  const { g, sz, home } = beachhead("noncombatMove");
  const tr = g._spawn("transport", "us", sz);
  g._spawn("infantry", "us", home); // the only unit holding the ground
  AI.loadTransports(g);
  eq(g.cargoOf(tr).length, 0, "the lone defender stays put");
  eq(g.unitsAt(home, u => u.type === "infantry").length, 1, "still garrisoned");
});

t("loadTransports respects transport capacity (never a 3rd unit)", () => {
  const { g, sz, home } = beachhead("noncombatMove");
  const tr = g._spawn("transport", "us", sz);
  for (let i = 0; i < 5; i++) g._spawn("infantry", "us", home);
  AI.loadTransports(g);
  ok(g.cargoOf(tr).length <= 2, "at most two aboard, got " + g.cargoOf(tr).length);
});

console.log("— sailing toward the enemy shore —");

t("invasionSeaMap marks a zone on an enemy shore as distance 0", () => {
  const { g, sz } = beachhead("noncombatMove");
  const dist = AI.invasionSeaMap(g, "us");
  eq(dist.get(sz), 0, "our beachhead zone borders enemy-held land");
});

t("sailTransports moves a loaded transport no further from the enemy shore", () => {
  const { g, sz } = beachhead("noncombatMove");
  const tr = g._spawn("transport", "us", sz);
  const inf = g._spawn("infantry", "us", sz); inf.onTransport = tr.id;
  const dist = AI.invasionSeaMap(g, "us");
  const before = dist.get(sz) ?? 99;
  AI.sailTransports(g, dist);
  const after = dist.get(tr.space) ?? 99;
  ok(after <= before, `distance did not grow (${before} → ${after})`);
});

t("sailTransports leaves an empty transport where it is", () => {
  const { g, sz } = beachhead("noncombatMove");
  const tr = g._spawn("transport", "us", sz);
  AI.sailTransports(g, AI.invasionSeaMap(g, "us"));
  eq(tr.space, sz, "nothing to deliver — no reason to sail into danger");
});

console.log("— declaring the assault —");

t("amphibiousAssaults declares a landing on an undefended enemy coast", () => {
  const { g, sz, target } = beachhead("combatMove");
  const tr = g._spawn("transport", "us", sz);
  const inf = g._spawn("infantry", "us", sz); inf.onTransport = tr.id;
  const tk = g._spawn("tank", "us", sz); tk.onTransport = tr.id;
  AI.amphibiousAssaults(g);
  ok(g.assaults[target], "an assault is declared on the enemy coast");
  eq(inf.amphibTarget, target, "infantry is committed to the landing");
  eq(tk.amphibTarget, target, "tank is committed to the landing");
});

t("a declared landing resolves into a capture", () => {
  const { g, sz, target } = beachhead("combatMove");
  const tr = g._spawn("transport", "us", sz);
  const inf = g._spawn("infantry", "us", sz); inf.onTransport = tr.id;
  const tk = g._spawn("tank", "us", sz); tk.onTransport = tr.id;
  AI.amphibiousAssaults(g);
  g.endCombatMove();
  g.resolveUnopposed();
  // note: an Allied-original territory is LIBERATED to its original owner rather than
  // annexed, so assert the side that holds it, not the exact power
  ok(g.isFriendly("us", g.owner[target]),
    "the coast is in Allied hands, got " + g.owner[target]);
  ok(!inf.onTransport, "the troops are ashore");
  eq(inf.space, target, "and standing on the captured territory");
});

t("no assault is staged through a sea zone an enemy warship holds", () => {
  const { g, sz, target } = beachhead("combatMove");
  const tr = g._spawn("transport", "us", sz);
  tr.moved = UNITS.transport.move; // pinned here — sz is the only possible staging zone
  const inf = g._spawn("infantry", "us", sz); inf.onTransport = tr.id;
  g._spawn("destroyer", "germany", sz); // enemy surface warship holds the water
  ok(g.isHostileSpace("us", sz), "the zone really is contested");
  AI.amphibiousAssaults(g);
  ok(!g.assaults[target], "no landing declared into a contested zone");
  eq(inf.onTransport, tr.id, "the troops stay aboard");
});

t("a coast too strong to take is left alone", () => {
  const { g, sz, target } = beachhead("combatMove");
  const tr = g._spawn("transport", "us", sz);
  tr.moved = UNITS.transport.move; // only this beach is on the table
  const inf = g._spawn("infantry", "us", sz); inf.onTransport = tr.id;
  for (let i = 0; i < 10; i++) g._spawn("infantry", "germany", target); // dug in hard
  AI.amphibiousAssaults(g);
  ok(!g.assaults[target], "the AI declines a hopeless landing");
  eq(inf.onTransport, tr.id, "the troops stay aboard for a better chance");
});

t("two transports don't both pile onto the same undefended target", () => {
  const { g, sz, target } = beachhead("combatMove");
  const t1 = g._spawn("transport", "us", sz);
  const t2 = g._spawn("transport", "us", sz);
  t1.moved = UNITS.transport.move; t2.moved = UNITS.transport.move;
  const a = g._spawn("infantry", "us", sz); a.onTransport = t1.id;
  const b = g._spawn("infantry", "us", sz); b.onTransport = t2.id;
  AI.amphibiousAssaults(g);
  const committed = [a, b].filter(u => u.amphibTarget === target).length;
  eq(committed, 1, "only one transport claims the beach");
});

console.log("— the invasion never breaks the rules —");

t("a full AI-vs-AI run keeps every land unit either ashore or aboard", () => {
  const g = new Game({ mapData: MAP, seed: 2024, players: PLAYERS });
  let turns = 0, assaults = 0;
  while (!g.winner && g.round <= 6 && turns < 35) {
    AI.purchase(g);
    AI.combatMove(g);
    assaults += Object.keys(g.assaults || {}).length;
    AI.runBattles(g, Combat, false, null);
    AI.noncombat(g);
    AI.mobilize(g);
    g.collectIncome();
    for (const u of g.units) {
      if (u.dead) continue;
      const s = g.space(u.space);
      if (UNITS[u.type].land && s.sea && !u.onTransport)
        throw new Error(`${u.type} adrift at sea in ${u.space}`);
      if (UNITS[u.type].sea && !s.sea) throw new Error(`${u.type} beached at ${u.space}`);
    }
    turns++;
  }
  ok(assaults > 0, "the AI actually ran invasions (" + assaults + " declared)");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
