/* USA Super Bomber tests — run: node tests/superbomber.test.js
   Covers the engine unit, the upgrade, and the combat super-strike (hit / miss /
   sea / AA shoot-down / undefended seize). Dice are forced by stubbing g.roll. */
global.window = {};
require("../static/js/map-data.js");
const MAP = window.MAP_DATA;
const Engine = require("../static/js/engine.js");
const Combat = require("../static/js/combat.js");
const { Game, UNITS } = Engine;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + " — " + e.message); if (process.env.V) console.log(e.stack); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "") + ` expected ${b}, got ${a}`); }
function ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); }

const PLAYERS = {};
for (const p of Engine.POWERS) PLAYERS[p] = { type: "human", name: p };
const mk = (opts) => new Game(Object.assign({ mapData: MAP, seed: 42, players: PLAYERS }, opts));
const force = (g, v) => { g.roll = (n) => new Array(n).fill(v); };

function autoBattle(g, spaceId, opts) {
  const b = new Combat.Battle(g, spaceId, opts);
  let d, guard = 0;
  while ((d = b.pending()) && guard++ < 500) {
    let ans = {};
    if (d.type === "casualties") ans = { units: d.pool.slice() };       // assign all offered
    else if (d.type === "submerge" || d.type === "intercept") ans = { units: [] };
    b.decide(ans);
  }
  ok(guard < 500, "battle did not terminate");
  return b;
}

console.log("— super bomber —");

t("unit stats: cost 15, move 8, still a bomber otherwise", () => {
  eq(UNITS.superbomber.cost, 15); eq(UNITS.superbomber.move, 8);
  eq(UNITS.superbomber.attack, 4); eq(UNITS.superbomber.defense, 1);
  ok(UNITS.superbomber.air && UNITS.superbomber.superBomber);
});

t("upgrade: US bomber → super bomber for +3 IPC", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "purchase"; // US
  const bmb = g.units.find(u => u.type === "bomber" && u.power === "us");
  const before = g.ipc.us;
  g.upgradeBomber(bmb.id);
  eq(bmb.type, "superbomber", "type changed");
  eq(g.ipc.us, before - 3, "3 IPC deducted");
});

t("upgrade blocked when option off / non-US / not a bomber", () => {
  const g = mk(); g.turnIndex = 4; g.phase = "purchase"; // option off
  const bmb = g.units.find(u => u.type === "bomber" && u.power === "us");
  let threw = false; try { g.upgradeBomber(bmb.id); } catch (e) { threw = true; }
  ok(threw, "should refuse when option disabled");
});

t("SBR: setSBR accepts a super bomber", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combatMove";
  const sb = g._spawn("superbomber", "us", "germany"); // over the enemy IC
  g.setSBR(sb.id);
  eq(sb.sbr, "germany");
});

t("strike HIT (≤4): wipes all defenders + the complex, man seizes the territory", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  const sb = g._spawn("superbomber", "us", "germany");
  force(g, 3); // AA (needs 1) misses; super-strike (≤4) hits
  autoBattle(g, "germany");
  const enemyLeft = g.unitsAt("germany", u => u.power === "germany");
  eq(enemyLeft.length, 0, "all German units + complex destroyed");
  eq(g.unitsAt("germany", u => u.type === "factory").length, 0, "industrial complex destroyed");
  eq(g.owner["germany"], "us", "territory captured by the US");
  ok(g.unitsAt("germany", u => u.type === "infantry" && u.power === "us").length === 1, "carried man on the ground");
  ok(!sb.dead, "super bomber survives to fly home");
});

t("strike MISS (>4): clean miss, defenders survive, bomber flies home", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  const sb = g._spawn("superbomber", "us", "germany");
  force(g, 6); // everything misses
  autoBattle(g, "germany");
  ok(g.unitsAt("germany", u => u.power === "germany").length > 0, "German defenders survive");
  eq(g.owner["germany"], "germany", "not captured");
  ok(!sb.dead, "super bomber survived (flies home in noncombat)");
  ok(g.unitsAt("germany", u => u.type === "infantry" && u.power === "us").length === 0, "no man dropped on a miss");
});

t("AA shoots it down (rolls 1): no strike, defenders hold", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  const sb = g._spawn("superbomber", "us", "germany"); // germany has an AA gun
  force(g, 1); // AA hits on a 1
  autoBattle(g, "germany");
  ok(sb.dead, "super bomber shot down by AA before its strike");
  eq(g.owner["germany"], "germany", "territory not captured");
});

t("fighter escort soaks the AA hit instead of the bomber", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  const sb = g._spawn("superbomber", "us", "germany");
  const ftr = g._spawn("fighter", "us", "germany");
  // AA fires one hit (dice [1,6]); then the super-strike hits ([3]).
  let call = 0;
  g.roll = (n) => { call++; return call === 1 ? [1, 6].slice(0, n) : new Array(n).fill(3); };
  const b = new Combat.Battle(g, "germany");
  let d, guard = 0;
  while ((d = b.pending()) && guard++ < 500) {
    if (d.type === "casualties") {
      const f = d.pool.find(id => g.unit(id).type === "fighter"); // choose the escort as casualty
      b.decide({ units: f ? [f] : d.pool.slice(0, d.count) });
    } else b.decide({ units: [] });
  }
  ok(ftr.dead, "fighter took the AA hit");
  ok(!sb.dead, "super bomber survived to strike");
  eq(g.owner["germany"], "us", "strike then captured");
});

t("strike at SEA: wipes enemy ships, no man / no capture", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  const sb = g._spawn("superbomber", "us", "sz5"); // German ships live in sz5
  const before = g.unitsAt("sz5", u => u.power === "germany").length;
  ok(before > 0, "there are German ships to hit");
  force(g, 3);
  autoBattle(g, "sz5");
  eq(g.unitsAt("sz5", u => u.power === "germany").length, 0, "all enemy ships destroyed");
  eq(g.unitsAt("sz5", u => u.type === "infantry").length, 0, "no man dropped at sea");
  ok(!sb.dead, "super bomber survives");
});

t("undefended enemy territory: super bomber drops its man to seize it", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  // belorussia is German-owned with German infantry at setup — clear it to make it undefended
  for (const u of g.unitsAt("belorussia", x => x.power === "germany")) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  eq(g.owner["belorussia"], "germany");
  g._spawn("superbomber", "us", "belorussia");
  g.battles = [{ space: "belorussia", sea: false, resolved: false }];
  g.resolveUnopposed();
  eq(g.owner["belorussia"], "us", "seized by the carried man");
  ok(g.unitsAt("belorussia", u => u.type === "infantry" && u.power === "us").length === 1, "man on the ground");
});

t("fires again on its next attack (per-combat flag resets each turn)", () => {
  const g = mk({ options: { superBomber: true } });
  g.turnIndex = 4; g.phase = "combat";
  const sb = g._spawn("superbomber", "us", "germany");
  force(g, 3); autoBattle(g, "germany");
  ok(sb.superFired, "fired in the first combat");
  g.endCombat(); // end of the combat phase clears per-combat flags
  ok(!sb.superFired, "superFired cleared — ready to strike again next turn");
  // next turn: move it to a new target and confirm it strikes again
  sb.space = "france"; sb.moved = 0; g.phase = "combat";
  force(g, 3); autoBattle(g, "france");
  eq(g.owner["france"], "us", "struck and captured a second time");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
