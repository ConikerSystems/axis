/* Online sync test — exercises the real GitHub relay (axis-multiplayer repo).
   Run manually: GH_TOKEN=$(gh auth token) node tests/online.test.js
   Not part of the offline suite (needs network + token). */
global.window = {};
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
require("../static/js/online.js");
const Online = window.Online;

const token = process.env.GH_TOKEN;
if (!token) { console.error("Set GH_TOKEN"); process.exit(1); }
Online.saveConfig({ name: "TestRunner", token, repo: "ConikerSystems/axis-multiplayer" });

(async () => {
  let failed = 0;
  const ok = (v, msg) => { console.log((v ? "  ok  " : "FAIL  ") + msg); if (!v) failed++; };

  await Online.verifyToken();
  ok(true, "token verified against relay repo");

  const id = "TEST-" + Math.floor(Math.random() * 100000);
  const data1 = { v: 1, id, title: "Sync Test", turnSeat: "p1", snap: JSON.stringify({ big: "x".repeat(50000) }), summary: ["⚔ test"], updated: 1 };
  const c = await Online.putGame(id, data1, null, "test create");
  ok(!!c.sha, "create game file (50kB payload)");

  const g = await Online.getGame(id);
  ok(g && g.data.title === "Sync Test" && g.data.snap.length === data1.snap.length, "read back matches (unicode-safe base64)");
  ok(g.sha === c.sha, "sha consistent");

  const u = await Online.putGame(id, Object.assign({}, data1, { turnSeat: "p2", updated: 2 }), g.sha, "test update");
  ok(!!u.sha && u.sha !== g.sha, "compare-and-swap update");

  const stale = await Online.putGame(id, Object.assign({}, data1, { updated: 3 }), g.sha, "stale write");
  ok(stale.conflict === true, "stale sha rejected (no clobber)");

  const g2 = await Online.getGame(id);
  ok(g2.data.turnSeat === "p2" && g2.data.updated === 2, "state is the CAS winner's");

  const missing = await Online.getGame("NOPE-00000");
  ok(missing === null, "missing game returns null");

  // cleanup
  const cfg = Online.config();
  const del = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/games/${id}.json`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ message: "cleanup " + id, sha: g2.sha }),
  });
  ok(del.ok, "cleanup test file");

  console.log(failed ? "ONLINE SYNC FAILED" : "ONLINE SYNC OK");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
