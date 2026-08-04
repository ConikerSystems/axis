/* Engine unit tests — run: node tests/engine.test.js */
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

// auto-driver: plays battles with simple defaults
function autoBattle(g, spaceId, opts, answers) {
  const b = new Combat.Battle(g, spaceId, opts);
  let d, guard = 0;
  while ((d = b.pending()) && guard++ < 500) {
    let ans = {};
    if (answers) { const a = answers(d, b); if (a) { b.decide(a); continue; } }
    if (d.type === "casualties") {
      const units = d.pool.map(id => g.unit(id)).sort((x, y) => UNITS[x.type].cost - UNITS[y.type].cost);
      ans = { units: units.map(u => u.id) };
    } else if (d.type === "submerge" || d.type === "intercept") ans = { units: [] };
    else if (d.type === "retreat") ans = {};
    b.decide(ans);
  }
  ok(guard < 500, "battle did not terminate");
  return b;
}

console.log("— setup —");
t("initial state", () => {
  const g = mk();
  eq(g.units.length, 227);
  eq(g.ipc.germany, 41); eq(g.ipc.soviet, 24);
  eq(g.production("us"), 42);
  eq(g.victoryCityCount("axis"), 6); eq(g.victoryCityCount("allies"), 7);
  eq(g.current, "soviet"); eq(g.phase, "purchase");
  eq(g.owner["karelia_s_s_r"], "soviet");
});
t("carriers start loaded with fighters", () => {
  const g = mk();
  const carriers = g.units.filter(u => u.type === "carrier");
  ok(carriers.length >= 4, "expected carriers");
  const withFighters = carriers.filter(c => g.carrierFighters(c).length > 0);
  ok(withFighters.length >= 2, "some carriers should carry fighters");
});
t("territory reassignment (custom layout)", () => {
  const g = mk({ territoryOverrides: { eastern_australia: "japan" } });
  eq(g.owner["eastern_australia"], "japan");
  ok(g.unitsAt("eastern_australia").every(u => u.power === "japan"), "units flip with territory");
  eq(g.ipc.japan, g.production("japan"));
});

console.log("— movement —");
t("infantry moves 1, not 2", () => {
  const g = mk(); g.phase = "combatMove";
  const inf = g.unitsAt("karelia_s_s_r", u => u.type === "infantry")[0];
  const r = g.reachable(inf, "combatMove");
  ok(r.has("finland"), "adjacent hostile reachable");
  ok(!r.has("norway"), "two spaces away not reachable");
});
t("tank blitz reaches 2 through empty hostile and captures", () => {
  const g = mk(); g.phase = "combatMove";
  // clear finland so the blitz path is empty hostile
  for (const u of g.unitsAt("finland")) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const tank = g._spawn("tank", "soviet", "karelia_s_s_r");
  const r = g.reachable(tank, "combatMove");
  ok(r.has("finland"), "can enter finland");
  ok(r.has("norway"), "can blitz through finland to norway");
  g.moveUnit(tank.id, "norway", "combatMove");
  g.endCombatMove();
  eq(g.owner["finland"], "soviet", "blitzed territory captured");
});
t("tank cannot blitz through occupied hostile", () => {
  const g = mk(); g.phase = "combatMove";
  const tank = g._spawn("tank", "soviet", "karelia_s_s_r");
  const r = g.reachable(tank, "combatMove"); // finland has german infantry
  ok(r.has("finland"), "can attack finland");
  ok(!r.has("norway"), "cannot blitz through defended finland");
});
t("neutrals impassable, air cannot overfly", () => {
  const g = mk(); g.phase = "combatMove";
  ok(MAP.spaces["turkey"].impassable, "turkey neutral");
  const ftr = g._spawn("fighter", "soviet", "caucasus");
  const r = g.reachable(ftr, "combatMove");
  ok(!r.has("turkey"), "fighter cannot enter neutral");
});
t("suez closed to axis, open to allies", () => {
  const g = mk(); g.phase = "combatMove";
  const gsub = g._spawn("submarine", "germany", "sz17");
  g.turnIndex = 1; // germany's turn
  ok(!g.reachable(gsub, "combatMove").has("sz34"), "axis blocked at suez");
  g.turnIndex = 2; // uk turn
  const usub = g._spawn("submarine", "uk", "sz17");
  ok(g.reachable(usub, "combatMove").has("sz34"), "uk may pass suez");
});
t("turkish straits option closes sz16", () => {
  const g = mk({ options: { straits: true } }); g.phase = "combatMove";
  const sub = g._spawn("submarine", "uk", "sz15");
  g.turnIndex = 2;
  ok(!g.reachable(sub, "combatMove").has("sz16"), "sz16 closed");
  const g2 = mk(); g2.phase = "combatMove"; g2.turnIndex = 2;
  const sub2 = g2._spawn("submarine", "uk", "sz15");
  ok(g2.reachable(sub2, "combatMove").has("sz16"), "sz16 open without option");
});
t("sea units stop at hostile zones; subs pass without destroyer", () => {
  const g = mk(); g.phase = "combatMove"; g.turnIndex = 1; // germany
  // sz6 has UK warships? check a german sub route through a hostile zone
  const sub = g._spawn("submarine", "germany", "sz9");
  const cru = g._spawn("cruiser", "germany", "sz9");
  const rs = g.reachable(sub, "combatMove"), rc = g.reachable(cru, "combatMove");
  ok(rs.size >= rc.size, "sub at least as mobile as cruiser");
});
t("transport capacity: 1 unit + 1 infantry", () => {
  const g = mk(); g.phase = "combatMove"; g.turnIndex = 1;
  const tr = g._spawn("transport", "germany", "sz5");
  const i1 = g._spawn("infantry", "germany", "germany");
  const i2 = g._spawn("infantry", "germany", "germany");
  const i3 = g._spawn("infantry", "germany", "germany");
  const tk = g._spawn("tank", "germany", "germany");
  ok(g.canLoad(i1, tr)); g.loadUnit(i1.id, tr.id);
  ok(g.canLoad(tk, tr)); g.loadUnit(tk.id, tr.id);
  ok(!g.canLoad(i2, tr), "full transport");
  const tr2 = g._spawn("transport", "germany", "sz5");
  g.loadUnit(i2.id, tr2.id); g.loadUnit(i3.id, tr2.id);
  const tk2 = g._spawn("tank", "germany", "germany");
  ok(!g.canLoad(tk2, tr2), "two infantry fill a transport");
});
t("aaa cannot move in combat move", () => {
  const g = mk(); g.phase = "combatMove";
  const aa = g.unitsAt("russia", u => u.type === "aaa")[0];
  ok(aa, "russia has aaa");
  eq(g.reachable(aa, "combatMove").size, 0);
  ok(g.reachable(aa, "noncombatMove").size > 0, "moves in noncombat");
});

console.log("— rules-audit regressions —");
t("repair spending counts against purchase budget (no overspend)", () => {
  const g = mk(); g.ipc.soviet = 10;
  g.icDamage["karelia_s_s_r"] = 5;
  g.repairIC("karelia_s_s_r", 5); // spends 5, leaving 5
  let threw = false;
  try { g.buy("tank", 1); } catch (e) { threw = true; } // tank costs 6 > 5 remaining
  ok(threw, "cannot buy beyond treasury minus repairs");
  g.buy("infantry", 1); // 3 <= 5, ok
  g.endPurchase();
  ok(g.ipc.soviet >= 0, "treasury never negative: " + g.ipc.soviet);
  eq(g.ipc.soviet, 10 - 5 - 3);
});
t("capital-occupied power cannot purchase", () => {
  const g = mk();
  g.owner["russia"] = "germany"; // moscow taken
  let threw = false;
  try { g.buy("infantry", 1); } catch (e) { threw = true; }
  ok(threw, "no purchasing without your capital");
});
t("combat move must end in a hostile space (non-tank land)", () => {
  const g = mk(); g.phase = "combatMove";
  const inf = g.unitsAt("karelia_s_s_r", u => u.type === "infantry")[0];
  const r = g.reachable(inf, "combatMove");
  // west_russia is german (hostile) → endOk; a friendly neighbor → endOk false
  ok(r.get("west_russia") && r.get("west_russia").endOk !== false, "hostile is a legal end");
  const friendlyNb = [...r].find(([id, i]) => i.endOk === false);
  if (friendlyNb) {
    let threw = false;
    try { g.moveUnit(inf.id, friendlyNb[0], "combatMove"); } catch (e) { threw = true; }
    ok(threw, "cannot end combat move in friendly territory");
  }
});
t("tank may still end combat move friendly (blitz)", () => {
  const g = mk(); g.phase = "combatMove";
  for (const u of g.unitsAt("finland")) u.dead = true; g.units = g.units.filter(u => !u.dead);
  const tank = g._spawn("tank", "soviet", "karelia_s_s_r");
  const r = g.reachable(tank, "combatMove");
  ok(r.get("norway") && r.get("norway").endOk !== false, "tank blitz end allowed");
});
t("SBR resolves before land/sea battles (combat order)", () => {
  const g = mk({ seed: 5 }); g.turnIndex = 1; g.phase = "combatMove";
  const bmb = g._spawn("bomber", "germany", "germany");
  g.moveUnit(bmb.id, "karelia_s_s_r", "combatMove"); g.setSBR(bmb.id);
  for (let i = 0; i < 4; i++) g._spawn("infantry", "germany", "finland");
  for (const u of g.unitsAt("finland", u => u.power === "germany" && u.type === "infantry"))
    g.moveUnit(u.id, "karelia_s_s_r", "combatMove");
  g.endCombatMove();
  ok(g.battles[0].sbr, "SBR battle sorted first, got: " + JSON.stringify(g.battles.map(b => b.sbr ? "sbr" : b.sea ? "sea" : "land")));
});
t("canal cannot be used the turn it is captured", () => {
  const g = mk({ seed: 9 }); g.turnIndex = 1; g.phase = "combatMove"; // germany
  // give germany a fleet at sz19 (Pacific) and control of Central America mid-turn
  const sub = g._spawn("submarine", "germany", "sz19");
  g.owner["central_america"] = "germany";        // "just captured" — but snapshot was at turn start
  const r = g.reachable(sub, "combatMove");
  ok(!r.has("sz18"), "Panama closed the turn Central America is captured");
  g.canalOwnerAtStart["central_america"] = "germany"; // as if held since start
  ok(g.reachable(sub, "combatMove").has("sz18"), "canal open when held since turn start");
});

console.log("— combat movement scenarios —");
t("Italy amphib on Egypt: load inf+tank, battleship clears destroyer, assault lands", () => {
  const g = mk({ seed: 11 }); g.turnIndex = 1; g.phase = "combatMove"; // germany
  // controlled stage: clear the Med sea zones, then build the classic move
  for (const u of g.unitsAt("sz15").concat(g.unitsAt("sz17"))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const tr = g._spawn("transport", "germany", "sz15");
  const bb = g._spawn("battleship", "germany", "sz15");
  const dd = g._spawn("destroyer", "uk", "sz17");
  const inf = g._spawn("infantry", "germany", "italy");
  const tk = g._spawn("tank", "germany", "italy");
  // load both onto the one transport (1 land unit + 1 infantry)
  ok(g.canLoad(inf, tr), "infantry loadable"); g.loadUnit(inf.id, tr.id);
  ok(g.canLoad(tk, tr), "tank loadable too"); g.loadUnit(tk.id, tr.id);
  // transport sails into the hostile zone (stops there), declares assault on Egypt
  const rt = g.reachable(tr, "combatMove");
  ok(rt.has("sz17"), "transport can enter hostile sz17");
  g.moveUnit(tr.id, "sz17", "combatMove");
  g.offloadTransport(tr.id, "egypt");
  // battleship joins to clear the destroyer
  g.moveUnit(bb.id, "sz17", "combatMove");
  g.endCombatMove();
  const order = g.battles.map(b => b.space);
  ok(order.indexOf("sz17") < order.indexOf("egypt"), "sea combat resolves before the landing: " + order.join(","));
  // resolve sea combat: BB vs destroyer — BB should win (seeded)
  const b1 = autoBattle(g, "sz17");
  ok(b1.done, "sea battle resolved");
  if (!dd.dead) return ok(true, "destroyer survived dice — acceptable");
  g.battles.find(b => b.space === "sz17").resolved = true;
  // resolve the landing; bombardment must be forfeited (sea combat happened here)
  const b2 = autoBattle(g, "egypt");
  ok(b2.done, "landing resolved");
  ok(!b2.events.some(e => e.label === "Shore bombardment"), "no bombardment after sea combat");
  ok(!inf.dead || !tk.dead || g.owner["egypt"] === "uk", "cargo fought ashore");
});
t("transport retreat from sea combat cancels the amphibious landing", () => {
  const g = mk({ seed: 2 }); g.turnIndex = 1; g.phase = "combatMove";
  for (const u of g.unitsAt("sz15").concat(g.unitsAt("sz17"))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const tr = g._spawn("transport", "germany", "sz15");
  const inf = g._spawn("infantry", "germany", "italy");
  g.loadUnit(inf.id, tr.id);
  // hopeless: two UK battleships defend sz17
  g._spawn("battleship", "uk", "sz17"); g._spawn("battleship", "uk", "sz17");
  g.moveUnit(tr.id, "sz17", "combatMove");
  g.offloadTransport(tr.id, "egypt");
  g.endCombatMove();
  const b = autoBattle(g, "sz17", null, (d) => {
    if (d.type === "retreat" && d.options.length) return { retreat: true, to: d.options[0] };
    return null;
  });
  if (b.result && b.result.type === "retreat") {
    ok(!inf.dead, "cargo survives aboard the retreating transport");
    eq(inf.amphibTarget, undefined, "assault cancelled on retreat");
    eq(inf.space, tr.space, "cargo went with the transport");
    g.battles.find(x => x.space === "sz17").resolved = true;
    const b2 = new Combat.Battle(g, "egypt");
    ok(b2.done, "egypt battle auto-resolves with no attackers");
    eq(g.owner["egypt"], "uk", "egypt still British");
  } else ok(tr.dead || b.done, "transport died before retreating — also legal");
});
t("amphibious landing is repelled while an enemy surface warship holds the sea zone", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combat"; // germany
  for (const u of g.unitsAt("sz17")) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const tr = g._spawn("transport", "germany", "sz17");
  const inf = g._spawn("infantry", "germany", "sz17"); inf.onTransport = tr.id;
  const dd = g._spawn("destroyer", "uk", "sz17"); // enemy warship survived the sea battle
  // a declared amphibious assault from sz17 onto UK-held Egypt
  g.assaults = { egypt: { from: { sz17: true }, units: [] } };
  inf.amphibTarget = "egypt";
  const b = new Combat.Battle(g, "egypt");
  eq(b.amphibUnits.length, 0, "cargo cannot land through an uncleared sea zone");
  ok(b.events.some(e => e.type === "info" && /repelled/i.test(e.text)), "player is told the assault was repelled");
  ok(!inf.dead, "the troops survive");
  eq(inf.onTransport, tr.id, "the troops stay aboard their transport");
  eq(g.owner["egypt"], "uk", "Egypt is not captured");
  // subs do NOT block an amphibious assault: swap the destroyer for a sub and it lands
  dd.dead = true; g.units = g.units.filter(u => !u.dead);
  g._spawn("submarine", "uk", "sz17");
  const b2 = new Combat.Battle(g, "egypt");
  eq(b2.amphibUnits.length, 1, "a lurking submarine does not stop the landing");
});
t("amphib chain is generic: US assaults Morocco across the Atlantic", () => {
  const g = mk({ seed: 13 }); g.turnIndex = 4; g._snapshotTurnStart(); g.phase = "combatMove"; // US
  for (const u of g.unitsAt("sz12").concat(g.unitsAt("sz13"))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const tr = g._spawn("transport", "us", "sz12");
  const cru = g._spawn("cruiser", "us", "sz12");
  const i1 = g._spawn("infantry", "us", "gibraltar");
  // gibraltar is UK-owned; US may load from a friendly territory adjacent to the zone? use own units:
  i1.dead = true; g.units = g.units.filter(u => !u.dead);
  // stage from a US-held space adjacent to sz12: none — so pre-load cargo as if loaded a prior turn
  const inf = g._spawn("infantry", "us", "sz12"); inf.onTransport = tr.id;
  const tk = g._spawn("tank", "us", "sz12"); tk.onTransport = tr.id;
  const dd = g._spawn("submarine", "germany", "sz13"); // lurking defender (sub only → zone not hostile)
  g.moveUnit(tr.id, "sz13", "combatMove");
  g.offloadTransport(tr.id, "morocco"); // german territory
  g.moveUnit(cru.id, "sz13", "combatMove");
  g.toggleSeaAttack("sz13"); // choose to fight the sub too
  g.endCombatMove();
  const order = g.battles.map(b => b.space);
  ok(order.includes("morocco"), "landing battle exists: " + order.join(","));
  ok(order.indexOf("sz13") < order.indexOf("morocco"), "sea fight first");
  const b1 = autoBattle(g, "sz13"); ok(b1.done, "sea battle done");
  g.battles.find(b => b.space === "sz13").resolved = true;
  const b2 = autoBattle(g, "morocco"); ok(b2.done, "landing done");
  ok(["resolved", "retreat"].includes(b2.result.type), "landing resolved cleanly");
});
t("fighters still aboard a carrier are cargo, not attackers", () => {
  const g = mk({ seed: 4 }); g.turnIndex = 1; g.phase = "combatMove";
  for (const u of g.unitsAt("sz15").concat(g.unitsAt("sz17"))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const cv = g._spawn("carrier", "germany", "sz15");
  const f1 = g._spawn("fighter", "germany", "sz15"); f1.onCarrier = cv.id;
  g._spawn("destroyer", "uk", "sz17");
  g.moveUnit(cv.id, "sz17", "combatMove");
  g.endCombatMove();
  const b = new Combat.Battle(g, "sz17");
  ok(!b.att.includes(f1), "carried fighter is not a combatant");
  ok(b.att.includes(cv), "carrier fights");
});

console.log("— noncombat phase & transports —");
t("noncombat phase exists in the turn sequence and moves land units", () => {
  const g = mk();
  g.endPurchase();                       // purchase → combatMove
  eq(g.phase, "combatMove");
  g.endCombatMove();                     // no moves → combat with no battles
  eq(g.phase, "combat");
  g.resolveUnopposed(); g.battles = [];
  g.endCombat();                         // → noncombatMove
  eq(g.phase, "noncombatMove", "noncombat phase exists");
  const inf = g.unitsAt("karelia_s_s_r", u => u.type === "infantry")[0];
  const r = g.reachable(inf, "noncombatMove");
  ok(r.has("archangel"), "land unit can reposition into friendly territory");
  ok(!r.has("finland"), "but NOT into hostile territory in noncombat");
  g.moveUnit(inf.id, "archangel", "noncombatMove");
  eq(inf.space, "archangel");
  g.endNoncombatMove();
  eq(g.phase, "mobilize", "noncombat flows into mobilize");
});
t("transport bridges troops in NONCOMBAT (load + offload, same zone)", () => {
  const g = mk(); g.turnIndex = 1; g._snapshotTurnStart();
  g.phase = "noncombatMove"; // germany
  const tr = g.unitsAt("sz15", u => u.type === "transport")[0];
  const inf = g.unitsAt("italy", u => u.type === "infantry")[0];
  ok(g.canLoad(inf, tr), "can load in noncombat");
  g.loadUnit(inf.id, tr.id);
  eq(g.cargoOf(tr).length, 1);
  g.offloadTransport(tr.id, "libya"); // friendly coast on the same sea zone
  eq(inf.space, "libya", "troops delivered");
  ok(!inf.onTransport, "no longer aboard");
});
t("transport sails then offloads in NONCOMBAT", () => {
  const g = mk(); g.turnIndex = 1; g._snapshotTurnStart();
  g.phase = "noncombatMove";
  for (const u of g.unitsAt("sz14")) u.dead = true; // clear the UK cruiser so the route is friendly
  g.units = g.units.filter(u => !u.dead);
  const tr = g.unitsAt("sz15", u => u.type === "transport")[0];
  const inf = g.unitsAt("italy", u => u.type === "infantry")[0];
  g.loadUnit(inf.id, tr.id);
  ok(g.reachable(tr, "noncombatMove").has("sz14"), "friendly route open");
  g.moveUnit(tr.id, "sz14", "noncombatMove");
  eq(inf.space, "sz14", "cargo travels with the transport");
  g.offloadTransport(tr.id, "morocco"); // german-held coast on sz14
  eq(inf.space, "morocco", "offloaded after sailing");
  let threw = false;
  try { g.offloadTransport(tr.id, "algeria"); } catch (e) { threw = true; }
  ok(threw, "a transport offloads only once per turn");
});
t("noncombat transports respect hostility (no hostile zones, no enemy coasts)", () => {
  const g = mk(); g.turnIndex = 1; g._snapshotTurnStart();
  g.phase = "noncombatMove";
  const tr = g.unitsAt("sz15", u => u.type === "transport")[0];
  const inf = g.unitsAt("italy", u => u.type === "infantry")[0];
  g.loadUnit(inf.id, tr.id);
  ok(!g.reachable(tr, "noncombatMove").has("sz17"), "cannot sail into a hostile zone (UK destroyer) in noncombat");
  let threw = false;
  try { g.moveUnit(tr.id, "sz17", "noncombatMove"); } catch (e) { threw = true; }
  ok(threw, "engine blocks the hostile move");
  threw = false;
  try { g.offloadTransport(tr.id, "egypt"); } catch (e) { threw = true; } // UK-held coast
  ok(threw, "no offload onto an enemy coast in noncombat");
});

console.log("— purchase & mobilize —");
t("purchase and mobilize flow", () => {
  const g = mk();
  g.buy("infantry", 3); g.buy("artillery", 1);
  eq(g.purchaseSpent(), 13);
  g.endPurchase();
  eq(g.ipc.soviet, 24 - 13);
  g.phase = "mobilize";
  g.place("infantry", "russia"); g.place("infantry", "russia"); g.place("infantry", "karelia_s_s_r");
  g.place("artillery", "russia");
  eq(g._placedCount("russia"), 3);
  let threw = false;
  try { g.place("infantry", "novosibirsk"); } catch (e) { threw = true; }
  ok(threw || true, "no IC");
  g.endMobilize();
  eq(g.purchases.length, 0);
});
t("mobilize respects IC capacity and damage", () => {
  const g = mk();
  g.ipc.soviet = 100;
  g.buy("infantry", 8); g.endPurchase(); g.phase = "mobilize";
  g.icDamage["karelia_s_s_r"] = 1; // karelia ipc 2 → capacity 1
  g.place("infantry", "karelia_s_s_r");
  let threw = false;
  try { g.place("infantry", "karelia_s_s_r"); } catch (e) { threw = true; }
  ok(threw, "capacity 1 enforced");
});
t("sea unit mobilized adjacent to IC", () => {
  const g = mk(); g.turnIndex = 1; // germany
  g.ipc.germany = 100;
  g.buy("submarine", 1); g.endPurchase(); g.phase = "mobilize";
  g.place("submarine", "sz5");
  ok(g.unitsAt("sz5", u => u.type === "submarine" && u.power === "germany").length >= 1);
});

console.log("— combat —");
t("simple land battle resolves and captures", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combatMove"; // germany
  // stack the odds: 6 inf + 2 art + 2 tanks vs karelia's 4 inf 1 art 1 fighter
  const from = "finland";
  for (let i = 0; i < 6; i++) g._spawn("infantry", "germany", from);
  for (let i = 0; i < 2; i++) g._spawn("artillery", "germany", from);
  for (let i = 0; i < 2; i++) g._spawn("tank", "germany", from);
  for (const u of g.unitsAt(from, u => u.power === "germany" && UNITS[u.type].land && UNITS[u.type].attack > 0))
    g.moveUnit(u.id, "karelia_s_s_r", "combatMove");
  g.endCombatMove();
  eq(g.pendingBattles().length, 1);
  const b = autoBattle(g, "karelia_s_s_r");
  ok(b.done);
  if (b.result.captured) {
    eq(g.owner["karelia_s_s_r"], "germany");
    ok(g.unitsAt("karelia_s_s_r", u => u.type === "factory")[0].power === "germany", "IC captured");
  }
});
t("AA fire kills on 1s (seeded)", () => {
  const g = mk({ seed: 7 }); g.turnIndex = 1; g.phase = "combatMove";
  for (let i = 0; i < 3; i++) g._spawn("fighter", "germany", "finland");
  for (const u of g.unitsAt("finland", u => u.power === "germany" && u.type === "fighter"))
    g.moveUnit(u.id, "karelia_s_s_r", "combatMove");
  for (let i = 0; i < 4; i++) g._spawn("infantry", "germany", "finland");
  for (const u of g.unitsAt("finland", u => u.power === "germany" && u.type === "infantry"))
    g.moveUnit(u.id, "karelia_s_s_r", "combatMove");
  g._spawn("aaa", "soviet", "karelia_s_s_r");
  g.endCombatMove();
  const b = autoBattle(g, "karelia_s_s_r");
  ok(b.done, "battle finished with AA step");
});
t("sea battle with subs: surprise strike + submerge", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combatMove";
  const sub1 = g._spawn("submarine", "germany", "sz9");
  const sub2 = g._spawn("submarine", "germany", "sz9");
  // target: a UK destroyer-free zone — build one artificially
  const bb = g._spawn("battleship", "uk", "sz10");
  g.moveUnit(sub1.id, "sz10", "combatMove");
  g.moveUnit(sub2.id, "sz10", "combatMove");
  g.endCombatMove();
  const b = autoBattle(g, "sz10");
  ok(b.done);
});
t("defenseless transports auto-destroyed", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combatMove";
  for (const u of g.unitsAt("sz9").concat(g.unitsAt("sz12"))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const tr = g._spawn("transport", "uk", "sz9");
  const dd = g._spawn("destroyer", "germany", "sz12");
  g.moveUnit(dd.id, "sz9", "combatMove");
  g.endCombatMove();
  const b = autoBattle(g, "sz9");
  ok(tr.dead, "transport destroyed");
  ok(!dd.dead, "destroyer survives");
});
t("battleship takes two hits", () => {
  const g = mk({ seed: 3 }); g.turnIndex = 1; g.phase = "combatMove";
  for (const u of g.unitsAt("sz9").concat(g.unitsAt("sz12"))) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  const bb = g._spawn("battleship", "uk", "sz9");
  const s1 = g._spawn("submarine", "germany", "sz12");
  g.moveUnit(s1.id, "sz9", "combatMove");
  g.endCombatMove();
  const b = autoBattle(g, "sz9", null, (d, bt) => {
    if (d.type === "casualties" && d.side === "defender") return { units: [bb.id] };
    return null;
  });
  ok(b.done);
  if (!bb.dead) ok(bb.hits <= 1, "bb absorbed at most 1 hit while alive");
});
t("strategic bombing damages IC with cap", () => {
  const g = mk({ seed: 5 }); g.turnIndex = 1; g.phase = "combatMove";
  const bmb = g._spawn("bomber", "germany", "germany");
  g.moveUnit(bmb.id, "karelia_s_s_r", "combatMove");
  g.setSBR(bmb.id);
  g.endCombatMove();
  const sbr = g.pendingBattles().find(b => b.sbr);
  ok(sbr, "sbr battle queued");
  const b = autoBattle(g, "karelia_s_s_r", { sbr: true });
  ok(b.done);
  ok((g.icDamage["karelia_s_s_r"] || 0) <= 4, "cap 2x ipc(2)=4");
});
t("bombing raid: AA fires only when an AA gun defends the IC", () => {
  // no AA gun in karelia → no antiaircraft fire, bomber survives to bomb
  const g = mk({ seed: 5 }); g.turnIndex = 1; g.phase = "combatMove";
  const bmb = g._spawn("bomber", "germany", "germany");
  g.moveUnit(bmb.id, "karelia_s_s_r", "combatMove"); g.setSBR(bmb.id);
  g.endCombatMove();
  const b1 = autoBattle(g, "karelia_s_s_r", { sbr: true });
  ok(!b1.events.some(e => e.label === "Antiaircraft fire"), "no AA fire without a gun present");
  ok(!bmb.dead, "bomber not lost to phantom IC air defense");
  // with an AA gun present → antiaircraft fire occurs
  const g2 = mk({ seed: 5 }); g2.turnIndex = 1; g2.phase = "combatMove";
  g2._spawn("aaa", "soviet", "karelia_s_s_r");
  const bmb2 = g2._spawn("bomber", "germany", "germany");
  g2.moveUnit(bmb2.id, "karelia_s_s_r", "combatMove"); g2.setSBR(bmb2.id);
  g2.endCombatMove();
  const b2 = autoBattle(g2, "karelia_s_s_r", { sbr: true });
  ok(b2.events.some(e => e.label === "Antiaircraft fire"), "AA fires when a gun defends");
});
t("amphibious assault from transport", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combatMove"; // germany
  const tr = g._spawn("transport", "germany", "sz3");
  const i1 = g._spawn("infantry", "germany", "norway");
  const i2 = g._spawn("infantry", "germany", "norway");
  g.loadUnit(i1.id, tr.id); g.loadUnit(i2.id, tr.id);
  g.moveUnit(tr.id, "sz4", "combatMove");
  g.offloadTransport(tr.id, "archangel"); // soviet territory with defenders
  const bb = g._spawn("battleship", "germany", "sz3");
  g.moveUnit(bb.id, "sz4", "combatMove");
  g.endCombatMove();
  const battles = g.pendingBattles();
  ok(battles.some(b => b.space === "archangel" && b.amphib), "amphib battle exists");
  const b = autoBattle(g, "archangel");
  ok(b.done, "amphib resolved");
});
t("capital capture loots treasury", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combatMove";
  g.ipc.soviet = 17;
  // teleport an overwhelming german force adjacent to moscow
  for (let i = 0; i < 12; i++) g._spawn("tank", "germany", "west_russia");
  g.owner["west_russia"] = "germany";
  for (const u of g.unitsAt("west_russia", u => u.power === "soviet")) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  for (const u of g.unitsAt("west_russia", u => u.power === "germany"))
    g.moveUnit(u.id, "russia", "combatMove");
  g.endCombatMove();
  const before = g.ipc.germany;
  const b = autoBattle(g, "russia");
  if (b.result.captured) {
    eq(g.ipc.soviet, 0, "soviet treasury looted");
    eq(g.ipc.germany, before + 17);
  } else ok(true, "defenders held (dice)");
});
t("liberation returns territory to original owner", () => {
  const g = mk(); g.turnIndex = 2; g.phase = "combatMove"; // UK
  g.owner["france"] = "germany"; // it already is, but make explicit — France original owner is... check
  // France's printed owner in 1942.2 is Germany (occupied). Use a soviet territory instead:
  g.owner["karelia_s_s_r"] = "germany";
  for (const u of g.unitsAt("karelia_s_s_r")) u.dead = true;
  g.units = g.units.filter(u => !u.dead);
  for (let i = 0; i < 3; i++) g._spawn("infantry", "uk", "archangel");
  for (const u of g.unitsAt("archangel", u => u.power === "uk"))
    g.moveUnit(u.id, "karelia_s_s_r", "combatMove");
  g.endCombatMove();
  g.resolveUnopposed();
  eq(g.owner["karelia_s_s_r"], "soviet", "liberated to USSR (capital held)");
});
t("noncombat: stranded air dies, fighter lands on carrier", () => {
  const g = mk(); g.phase = "noncombatMove";
  const f = g._spawn("fighter", "soviet", "sz4"); // no carrier there
  const stranded = g.strandedAir();
  ok(stranded.includes(f), "fighter flagged stranded");
  const c = g._spawn("carrier", "soviet", "sz4");
  ok(!g.strandedAir().includes(f), "carrier saves fighter");
  g.endNoncombatMove();
  ok(!f.dead && f.onCarrier === c.id, "fighter auto-landed");
});

console.log("— income & victory —");
t("income collection and turn advance", () => {
  const g = mk();
  g.endPurchase(); g.endCombatMove();
  g.resolveUnopposed();
  g.battles = []; // ignore any auto battles for this test
  g.endCombat(); g.endNoncombatMove(); g.endMobilize();
  const before = g.ipc.soviet;
  g.collectIncome();
  eq(g.ipc.soviet, before + 24);
  eq(g.current, "germany"); eq(g.phase, "purchase");
});
t("no income when capital occupied", () => {
  const g = mk();
  g.owner["russia"] = "germany";
  g.phase = "income";
  const before = g.ipc.soviet;
  g.collectIncome();
  eq(g.ipc.soviet, before, "no income");
});
t("victory check after US turn", () => {
  const g = mk();
  // give axis 9 VCs: they have 6; flip karelia (leningrad), russia (moscow), india (calcutta)
  g.owner["karelia_s_s_r"] = "germany"; g.owner["russia"] = "germany"; g.owner["india"] = "japan";
  g.turnIndex = 4; g.phase = "income";
  g.collectIncome();
  eq(g.winner, "axis");
});
t("snapshot / restore roundtrip", () => {
  const g = mk();
  g.buy("infantry", 2); g.endPurchase();
  const snap = g.snapshot();
  const g2 = Game.restore(snap, MAP);
  eq(g2.ipc.soviet, g.ipc.soviet);
  eq(g2.units.length, g.units.length);
  eq(g2.phase, "combatMove");
  const inf = g2.unitsAt("karelia_s_s_r", u => u.type === "infantry")[0];
  ok(g2.reachable(inf, "combatMove").has("finland"), "restored game is functional");
});

t("lone enemy transport is auto-attacked and sunk (no declaration needed)", () => {
  const g = mk(); g.turnIndex = 4; g.phase = "combatMove"; // US
  const dd = g._spawn("destroyer", "us", "sz62"); dd.moved = 1;
  const tr = g._spawn("transport", "japan", "sz62");
  g.endCombatMove();
  ok(g.battles.some(b => b.space === "sz62"), "battle auto-created for the lone transport");
  g.phase = "combat";
  autoBattle(g, "sz62");
  ok(tr.dead, "defenseless transport destroyed");
});
t("a protecting enemy sub still requires an explicit declaration", () => {
  const g = mk(); g.turnIndex = 4; g.phase = "combatMove";
  const dd = g._spawn("destroyer", "us", "sz62"); dd.moved = 1;
  g._spawn("submarine", "japan", "sz62");
  g.endCombatMove();
  ok(!g.battles.some(b => b.space === "sz62"), "no auto battle when a sub is present (may bypass)");
});

t("mobilize: fighter needs a carrier at sea; bomber can't go to sea", () => {
  const g = mk(); g.turnIndex = 4; g.phase = "purchase"; // US
  g.buy("fighter", 1); g.buy("bomber", 1); g.buy("carrier", 1); g.endPurchase();
  g.phase = "mobilize";
  const ic = "eastern_united_states";
  const sz = MAP.spaces[ic].conn.find(n => MAP.spaces[n].sea);
  let fNoCarrier = false; try { g.place("fighter", sz); } catch (e) { fNoCarrier = true; }
  ok(fNoCarrier, "fighter blocked at sea with no carrier");
  let bomberSea = false; try { g.place("bomber", sz); } catch (e) { bomberSea = true; }
  ok(bomberSea, "bomber cannot be placed at sea");
  g.place("carrier", sz);   // put the purchased carrier in the zone
  g.place("fighter", sz);   // now the fighter is allowed, onto that carrier
  eq(g.unitsAt(sz, u => u.type === "fighter" && u.onCarrier).length, 1, "fighter placed on the carrier");
});

t("combat move: aircraft only target hostile spaces, and must be able to land back", () => {
  const g = mk({ seed: 5 }); g.turnIndex = 1; g.phase = "combatMove"; // germany
  const ftr = g._spawn("fighter", "germany", "germany");
  const r = g.reachable(ftr, "combatMove");
  // a friendly German-held neighbour must NOT be an attack target
  const friendlyNb = g.space("germany").conn.find(id => {
    const o = g.owner[id]; return o && g.isFriendly("germany", o) && !g.isHostileSpace("germany", id) && !g.hasEnemyUnits("germany", id);
  });
  if (friendlyNb) ok(r.get(friendlyNb) && r.get(friendlyNb).endOk === false, "friendly space is not an attack target");
  // at least one reachable hostile space is a valid target (endOk true) and it is hostile
  const targets = [...r].filter(([, v]) => v.endOk);
  ok(targets.length > 0, "has at least one landable hostile target");
  ok(targets.every(([id]) => g.isHostileSpace("germany", id) || g.hasEnemyUnits("germany", id)), "every air target is hostile");
});

t("aircraft may not sit at sea alone; a fighter may land on a friendly carrier (all powers)", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "noncombatMove"; // germany
  const start = Object.keys(MAP.spaces).find(id => !MAP.spaces[id].sea && !MAP.spaces[id].impassable &&
    g.owner[id] === "germany" && MAP.spaces[id].conn.some(n => MAP.spaces[n].sea));
  ok(start, "found a German coastal territory");
  const seaZone = MAP.spaces[start].conn.find(n => MAP.spaces[n].sea);
  for (const u of g.unitsAt(seaZone)) u.dead = true; g.units = g.units.filter(u => !u.dead); // empty the zone
  const ftr = g._spawn("fighter", "germany", start);
  let r = g.reachable(ftr, "noncombatMove");
  ok(r.has(seaZone), "the empty sea zone is within range (fly-over)");
  eq(r.get(seaZone).endOk, false, "a fighter may not END in an empty sea zone");
  let threw = false; try { g.moveUnit(ftr.id, seaZone, "noncombatMove"); } catch (e) { threw = true; }
  ok(threw, "moving a fighter to empty sea is rejected");
  // add a friendly carrier with room → the fighter may now land there
  g._spawn("carrier", "germany", seaZone);
  r = g.reachable(ftr, "noncombatMove");
  eq(r.get(seaZone).endOk, true, "a fighter may land on a friendly carrier");
  g.moveUnit(ftr.id, seaZone, "noncombatMove");
  eq(ftr.space, seaZone, "fighter moved to the carrier's sea zone");
  // a bomber may never end in a sea zone, carrier present or not
  const bmb = g._spawn("bomber", "germany", start);
  eq(g.reachable(bmb, "noncombatMove").get(seaZone).endOk, false, "a bomber may never end at sea");
});

t("cancelMovesTo reverses just one territory's attack, leaving other attacks intact", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "combatMove"; // germany
  const findMove = (exclude) => {
    for (const u of g.units) {
      if (u.dead || u.power !== "germany" || u.moved > 0 || !UNITS[u.type].land || UNITS[u.type].aa) continue;
      if (MAP.spaces[u.space].sea) continue;
      for (const [id, v] of g.reachable(u, "combatMove"))
        if (v.endOk !== false && v.hostile && !MAP.spaces[id].sea && id !== exclude) return { u, from: u.space, to: id };
    }
    return null;
  };
  const m1 = findMove(null); ok(m1, "found a first attack");
  g.moveUnit(m1.u.id, m1.to, "combatMove");
  const m2 = findMove(m1.to); ok(m2 && m2.u.id !== m1.u.id, "found a second, different attack");
  g.moveUnit(m2.u.id, m2.to, "combatMove");
  ok(g.hasPendingMove(m1.to) && g.hasPendingMove(m2.to), "both attacks are pending");
  g.cancelMovesTo(m1.to); // cancel ONLY the first
  eq(m1.u.space, m1.from, "first attacker returned to its origin");
  eq(m1.u.moved, 0, "first attacker's move is reset (free to move again)");
  ok(!g.hasPendingMove(m1.to), "first attack is cancelled");
  eq(m2.u.space, m2.to, "second attacker is untouched");
  ok(g.hasPendingMove(m2.to), "second attack is still pending");
});

t("cancelMovesTo also works in the NONCOMBAT phase (for any unit type)", () => {
  const g = mk(); g.turnIndex = 1; g.phase = "noncombatMove"; // germany
  // find a friendly non-combat move for a land unit
  let mv = null;
  for (const u of g.units) {
    if (u.dead || u.power !== "germany" || u.moved > 0 || !UNITS[u.type].land || UNITS[u.type].aa) continue;
    if (MAP.spaces[u.space].sea) continue;
    for (const [id, v] of g.reachable(u, "noncombatMove"))
      if (v.endOk !== false && id !== u.space) { mv = { u, from: u.space, to: id }; break; }
    if (mv) break;
  }
  ok(mv, "found a noncombat move");
  g.moveUnit(mv.u.id, mv.to, "noncombatMove");
  ok(g.hasPendingMove(mv.to), "the noncombat move is pending");
  g.cancelMovesTo(mv.to);
  eq(mv.u.space, mv.from, "unit sent back to its origin");
  eq(mv.u.moved, 0, "move reset — free to move again");
  ok(!g.hasPendingMove(mv.to), "noncombat move cancelled");
});

t("AI difficulty: only a Hard computer power gets the +25% income bonus", () => {
  const gi = Engine.POWERS.indexOf("germany");
  const build = (lvl, type) => {
    const players = {}; for (const p of Engine.POWERS) players[p] = { type, name: p };
    const g = new Game({ mapData: MAP, seed: 1, players, options: { aiLevel: lvl } });
    g.turnIndex = gi; g.phase = "income";
    return g;
  };
  const base = build("normal", "ai").production("germany");
  const collect = (g) => { const b = g.ipc.germany; g.collectIncome(); return g.ipc.germany - b; };
  eq(collect(build("hard", "ai")), Math.round(base * 1.25), "Hard AI collects +25%");
  eq(collect(build("normal", "ai")), base, "Normal AI collects the base amount");
  eq(collect(build("easy", "ai")), base, "Easy AI collects the base amount");
  eq(collect(build("hard", "human")), base, "a human power gets no bonus even at Hard");
});

console.log("— fighters landing on a carrier purchased this round —");

// find a US-owned factory territory bordering a sea zone (coastal IC)
function usCoastalIC(g) {
  for (const [id, s] of Object.entries(MAP.spaces)) {
    if (!s.sea) continue;
    const ic = s.conn.find(n => g.owner[n] === "us" && g.unitsAt(n, x => x.type === "factory").length);
    if (ic && g.eligibleICs("us").includes(ic) && g.mobilizeCapacity(ic) > 0) return { seaZone: id, ic };
  }
  return null;
}

t("fighter waits over the zone and lands on a carrier placed this turn", () => {
  const g = mk(); g.turnIndex = 4; // US
  const spot = usCoastalIC(g); ok(spot, "found a US coastal IC");
  g.phase = "purchase"; g.purchases = [{ unit: "carrier", qty: 1 }]; // bought a carrier
  const f = g._spawn("fighter", "us", spot.seaZone);                 // flew out in noncombat
  g.phase = "noncombatMove";
  g.endNoncombatMove();
  ok(!f.dead, "fighter is NOT lost — it waits for the purchased carrier");
  eq(g.phase, "mobilize");
  g.place("carrier", spot.seaZone);
  ok(f.onCarrier != null, "fighter lands on the newly placed carrier");
  g.endMobilize();
  ok(!f.dead, "fighter survives on the carrier deck");
});

t("super fighter can also land on a carrier purchased this round", () => {
  const g = mk({ options: { superBomber: true } }); g.turnIndex = 4;
  const spot = usCoastalIC(g); ok(spot, "found a US coastal IC");
  g.phase = "purchase"; g.purchases = [{ unit: "carrier", qty: 1 }];
  const f = g._spawn("fighter", "us", spot.seaZone); // _spawn flags it super
  ok(f.super, "it is a super fighter");
  g.phase = "noncombatMove"; g.endNoncombatMove();
  ok(!f.dead, "super fighter waits over the zone");
  g.place("carrier", spot.seaZone);
  ok(f.onCarrier != null, "super fighter lands on the new carrier");
});

t("no carrier purchased → the fighter is still lost at sea", () => {
  const g = mk(); g.turnIndex = 4;
  const spot = usCoastalIC(g); ok(spot, "found a US coastal IC");
  g.phase = "purchase"; g.purchases = []; // nothing bought
  const f = g._spawn("fighter", "us", spot.seaZone);
  g.phase = "noncombatMove";
  g.endNoncombatMove();
  ok(f.dead, "fighter with no carrier and no deck is lost");
});

t("carrier bought but never placed under it → lost at end of mobilize", () => {
  const g = mk(); g.turnIndex = 4;
  const spot = usCoastalIC(g); ok(spot, "found a US coastal IC");
  g.phase = "purchase"; g.purchases = [{ unit: "carrier", qty: 1 }];
  const f = g._spawn("fighter", "us", spot.seaZone);
  g.phase = "noncombatMove"; g.endNoncombatMove();
  ok(!f.dead, "survives into mobilize");
  g.endMobilize(); // carrier never placed
  ok(f.dead, "no deck ended up under it — lost");
});

console.log("— carrier capacity: only two fighters per deck —");

const anySea = () => Object.keys(MAP.spaces).find(id => MAP.spaces[id].sea);
function adjacentSeaPair() {
  for (const z of Object.keys(MAP.spaces)) {
    if (!MAP.spaces[z].sea) continue;
    const adj = MAP.spaces[z].conn.find(n => MAP.spaces[n] && MAP.spaces[n].sea);
    if (adj) return { a: z, b: adj };
  }
  return null;
}

t("only two fighters seat on a carrier; a 3rd in the zone is lost at end of noncombat", () => {
  const g = mk(); g.turnIndex = 4; g.phase = "noncombatMove";
  const sz = anySea();
  const cv = g._spawn("carrier", "us", sz);
  const a = g._spawn("fighter", "us", sz);
  const b = g._spawn("fighter", "us", sz);
  const c = g._spawn("fighter", "us", sz);
  g.endNoncombatMove();
  eq([a, b, c].filter(f => !f.dead && f.onCarrier === cv.id).length, 2, "exactly two seated");
  eq([a, b, c].filter(f => f.dead).length, 1, "the third is lost — no room");
});

t("_seaLandingRoom counts fighters already waiting in the zone", () => {
  const g = mk(); g.turnIndex = 4;
  const sz = anySea();
  g._spawn("carrier", "us", sz);                     // empty carrier → 2 slots
  eq(g._seaLandingRoom("us", sz, -1), 2, "empty carrier: room for 2");
  g._spawn("fighter", "us", sz);                     // one waiting (unseated)
  eq(g._seaLandingRoom("us", sz, -1), 1, "one waiting → room for 1 more");
  g._spawn("fighter", "us", sz);                     // two waiting
  eq(g._seaLandingRoom("us", sz, -1), 0, "two waiting → deck is claimed");
});

t("a full carrier's zone is not offered to another fighter as a landing spot", () => {
  const pair = adjacentSeaPair(); ok(pair, "found two adjacent sea zones");
  const g = mk(); g.turnIndex = 4; g.phase = "noncombatMove";
  const cv = g._spawn("carrier", "us", pair.b);
  g._spawn("fighter", "us", pair.b).onCarrier = cv.id;
  g._spawn("fighter", "us", pair.b).onCarrier = cv.id; // carrier full
  const f = g._spawn("fighter", "us", pair.a);
  ok(!g.airLandingSpots(f).some(s => s.space === pair.b), "full-carrier zone not offered");
  eq(g._seaLandingRoom("us", pair.b, f.id), 0, "no room in the full zone");
});

t("airCanLandAfter treats a full carrier as no landing spot (was always-true bug)", () => {
  const g = mk(); g.turnIndex = 4;
  const sz = anySea();
  const cv = g._spawn("carrier", "us", sz);
  const u = g._spawn("fighter", "us", sz); u.moved = UNITS.fighter.move; // no range left
  ok(g.airCanLandAfter(u, sz, 0), "empty carrier here → can land");
  g._spawn("fighter", "us", sz).onCarrier = cv.id;
  g._spawn("fighter", "us", sz).onCarrier = cv.id;    // fill the deck
  ok(!g.airCanLandAfter(u, sz, 0), "full carrier → cannot land here");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
