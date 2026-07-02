/* Full-game smoke test: five AI powers play complete games.
   Verifies no exceptions, state stays consistent, and games progress.
   Run: node tests/smoke.test.js [rounds] [games] */
global.window = {};
require("../static/js/map-data.js");
const Engine = require("../static/js/engine.js");
const Combat = require("../static/js/combat.js");
const AI = require("../static/js/ai.js");

const ROUNDS = +process.argv[2] || 6;
const GAMES = +process.argv[3] || 3;

let allOk = true;
for (let game = 0; game < GAMES; game++) {
  const seed = 1000 + game * 77;
  const players = {};
  for (const p of Engine.POWERS) players[p] = { type: "ai", name: "AI " + p };
  const g = new Engine.Game({ mapData: window.MAP_DATA, seed, players });
  let turns = 0;
  try {
    while (g.round <= ROUNDS && !g.winner) {
      AI.takeTurn(g, Combat);
      turns++;
      // invariants
      for (const u of g.units) {
        if (u.dead) throw new Error("dead unit not pruned");
        if (!g.space(u.space)) throw new Error("unit in unknown space " + u.space);
        const info = Engine.UNITS[u.type];
        if (info.sea && !g.space(u.space).sea) throw new Error(`${u.type} on land at ${u.space}`);
        if (info.land && g.space(u.space).sea && !u.onTransport) throw new Error(`${u.type} at sea unloaded (${u.space})`);
      }
      for (const p of Engine.POWERS) if (g.ipc[p] < 0) throw new Error("negative IPC for " + p);
      if (turns > ROUNDS * 5 + 5) throw new Error("turn counter runaway");
      // snapshot/restore consistency check midway
      if (turns === 7) {
        const snap = g.snapshot();
        const g2 = Engine.Game.restore(snap, window.MAP_DATA);
        if (g2.units.length !== g.units.length) throw new Error("restore unit mismatch");
      }
    }
    const axis = g.victoryCityCount("axis"), allies = g.victoryCityCount("allies");
    console.log(`game ${game + 1} (seed ${seed}): ${turns} turns, round ${g.round}, ` +
      `VC axis ${axis} / allies ${allies}, winner: ${g.winner || "none yet"}, units ${g.units.length}, ` +
      `IPCs ${Engine.POWERS.map(p => g.ipc[p]).join("/")}`);
  } catch (e) {
    allOk = false;
    console.log(`game ${game + 1} FAILED at round ${g.round}, ${g.current} ${g.phase}: ${e.message}`);
    if (process.env.V) console.log(e.stack);
  }
}
console.log(allOk ? "SMOKE OK" : "SMOKE FAILED");
process.exit(allOk ? 0 : 1);
