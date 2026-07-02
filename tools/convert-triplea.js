#!/usr/bin/env node
/* Converts the TripleA "world_war_ii_v5_1942" map data (the community port of
   Axis & Allies 1942 Second Edition) into our static/js/map-data.js.
   Source of truth for: space list, adjacency graph, IPC values, owners,
   victory cities, capitals, canals, starting units, and board geometry.
   Run: node tools/convert-triplea.js <path-to-triplea-repo> */
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node convert-triplea.js <triplea repo dir>"); process.exit(1); }
const xml = fs.readFileSync(path.join(SRC, "map/games/WW2v5_1942_2nd.xml"), "utf8")
  .replace(/<!--[\s\S]*?-->/g, ""); // strip comments (they contain stale attachments)
const polyTxt = fs.readFileSync(path.join(SRC, "map/polygons.txt"), "utf8");
const centersTxt = fs.readFileSync(path.join(SRC, "map/centers.txt"), "utf8");

const POWER = { Russians: "soviet", Germans: "germany", British: "uk", Japanese: "japan", Americans: "us" };
const UNIT = { infantry: "infantry", artillery: "artillery", armour: "tank", aaGun: "aaa", factory: "factory",
  fighter: "fighter", bomber: "bomber", transport: "transport", submarine: "submarine",
  destroyer: "destroyer", cruiser: "cruiser", carrier: "carrier", battleship: "battleship" };
const VICTORY_CITY_NAMES = {
  "Karelia S.S.R.": "Leningrad", "Russia": "Moscow", "Germany": "Berlin", "France": "Paris",
  "Italy": "Rome", "United Kingdom": "London", "Eastern United States": "Washington",
  "Western United States": "San Francisco", "Hawaiian Islands": "Honolulu", "India": "Calcutta",
  "Kiangsu": "Shanghai", "Philippine Islands": "Manila", "Japan": "Tokyo" };

// id: stable key from TripleA name; display: human name
const idOf = (name) => name.replace(/ Sea Zone$/, "").match(/^\d+$/) ? "sz" + name.replace(/ Sea Zone$/, "") :
  (name.endsWith(" Sea Zone") ? "sz" + name.split(" ")[0] : name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
const displayOf = (name) => name.endsWith(" Sea Zone") ? "Sea Zone " + name.split(" ")[0] : name;

// --- territories ---
const spaces = {};
for (const m of xml.matchAll(/<territory name="([^"]+)"( water="true")?\s*\/>/g)) {
  const [, name, water] = m;
  spaces[name] = { id: idOf(name), name: displayOf(name), sea: !!water, ipc: 0, owner: null,
    connections: [], impassable: false };
}

// --- territory attachments (production, victoryCity, capital, impassable) ---
const attRe = /<attachment name="territoryAttachment" attachTo="([^"]+)"[^>]*>([\s\S]*?)<\/attachment>/g;
for (const m of xml.matchAll(attRe)) {
  const t = spaces[m[1]]; if (!t) { console.error("attachment for unknown territory " + m[1]); process.exit(1); }
  const opts = {};
  for (const o of m[2].matchAll(/<option name="([^"]+)" value="([^"]+)"\/>/g)) opts[o[1]] = o[2];
  if (opts.production) t.ipc = +opts.production;
  if (opts.victoryCity) t.victoryCity = VICTORY_CITY_NAMES[m[1]] || m[1];
  if (opts.capital) t.capital = POWER[opts.capital];
  if (opts.isImpassable) t.impassable = true;
}

// --- connections ---
let nConn = 0;
for (const m of xml.matchAll(/<connection t1="([^"]+)" t2="([^"]+)"\/>/g)) {
  const a = spaces[m[1]], b = spaces[m[2]];
  if (!a || !b) { console.error("bad connection " + m[1] + " / " + m[2]); process.exit(1); }
  a.connections.push(b.id); b.connections.push(a.id); nConn++;
}

// --- owners ---
for (const m of xml.matchAll(/<territoryOwner territory="([^"]+)" owner="([^"]+)"\/>/g)) {
  spaces[m[1]].owner = POWER[m[2]];
}
// land, no owner, not impassable => strict neutral (impassable per 1942.2 rules)
for (const t of Object.values(spaces)) if (!t.sea && !t.owner && !t.impassable) t.impassable = true, t.neutral = true;

// --- canals ---
const canals = {};
const canRe = /<attachment name="canalAttachment[^"]*" attachTo="([^"]+)"[^>]*>([\s\S]*?)<\/attachment>/g;
for (const m of xml.matchAll(canRe)) {
  const opts = {};
  for (const o of m[2].matchAll(/<option name="([^"]+)" value="([^"]+)"\/>/g)) opts[o[1]] = o[2];
  const nm = opts.canalName;
  canals[nm] = canals[nm] || { seaZones: [], landTerritories: (opts.landTerritories || "").split(":").map(n => idOf(n)) };
  canals[nm].seaZones.push(idOf(m[1]));
}

// --- starting units ---
const setup = [];
for (const m of xml.matchAll(/<unitPlacement unitType="([^"]+)" territory="([^"]+)" quantity="(\d+)" owner="([^"]+)"\/>/g)) {
  setup.push({ unit: UNIT[m[1]], space: spaces[m[2]].id, qty: +m[3], power: POWER[m[4]] });
  if (!UNIT[m[1]]) { console.error("unknown unit " + m[1]); process.exit(1); }
}

// --- geometry: polygons + centers, with light simplification ---
function parsePointGroups(line) {
  // "Name  <  (x,y) (x,y) ...  >  <  ... >" possibly multiple polygons
  const i = line.indexOf("<");
  const name = line.slice(0, i).trim();
  const polys = [];
  for (const g of line.slice(i).split("<").filter(s => s.trim())) {
    const pts = [...g.matchAll(/\((\d+),(\d+)\)/g)].map(p => [+p[1], +p[2]]);
    if (pts.length >= 3) polys.push(pts);
  }
  return { name, polys };
}
// Douglas-Peucker
function simplify(pts, eps) {
  if (pts.length < 5) return pts;
  const dp = (arr, s, e, keep) => {
    let maxD = 0, idx = -1;
    const [x1, y1] = arr[s], [x2, y2] = arr[e];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * arr[i][0] - dx * arr[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) { dp(arr, s, idx, keep); keep.add(idx); dp(arr, idx, e, keep); }
  };
  const keep = new Set([0, pts.length - 1]);
  dp(pts, 0, pts.length - 1, keep);
  return [...keep].sort((a, b) => a - b).map(i => pts[i]);
}
const geometry = {}, centers = {};
for (const line of polyTxt.split("\n")) {
  if (!line.trim()) continue;
  const { name, polys } = parsePointGroups(line);
  if (!spaces[name]) { console.error("polygon for unknown space: " + name); process.exit(1); }
  geometry[spaces[name].id] = polys.map(p => simplify(p, 1.5));
}
for (const line of centersTxt.split("\n")) {
  if (!line.trim()) continue;
  const m = line.match(/^(.*?)\s+\((\d+),(\d+)\)/);
  if (m && spaces[m[1]]) centers[spaces[m[1]].id] = [+m[2], +m[3]];
}

// --- sanity checks against the official rulebook ---
const income = {};
for (const t of Object.values(spaces)) if (t.owner) income[t.owner] = (income[t.owner] || 0) + t.ipc;
const expected = { soviet: 24, germany: 41, uk: 31, japan: 30, us: 42 };
for (const [p, v] of Object.entries(expected))
  if (income[p] !== v) { console.error(`INCOME MISMATCH ${p}: got ${income[p]}, rulebook says ${v}`); process.exit(1); }
const vcs = Object.values(spaces).filter(t => t.victoryCity);
if (vcs.length !== 13) { console.error("victory city count " + vcs.length); process.exit(1); }
const missingGeo = Object.values(spaces).filter(t => !geometry[t.id]);
if (missingGeo.length) { console.error("missing geometry: " + missingGeo.map(t => t.name)); process.exit(1); }

// --- emit ---
const byId = {};
for (const t of Object.values(spaces)) {
  byId[t.id] = { name: t.name, sea: t.sea || undefined, ipc: t.ipc || undefined, owner: t.owner || undefined,
    vc: t.victoryCity || undefined, capital: t.capital || undefined, impassable: t.impassable || undefined,
    conn: [...new Set(t.connections)] };
  for (const k of Object.keys(byId[t.id])) if (byId[t.id][k] === undefined) delete byId[t.id][k];
}
const out = `/* GENERATED by tools/convert-triplea.js — do not hand-edit.
   Axis & Allies 1942 Second Edition board data (spaces, adjacency, IPCs,
   starting setup, canals, geometry). Derived from the TripleA community map
   "world_war_ii_v5_1942", cross-checked against the official rulebook. */
window.MAP_DATA = {
  width: 3500, height: 2000,
  spaces: ${JSON.stringify(byId)},
  canals: ${JSON.stringify(canals)},
  setup: ${JSON.stringify(setup)},
  centers: ${JSON.stringify(centers)},
  geometry: ${JSON.stringify(geometry)}
};
`;
fs.writeFileSync(path.join(__dirname, "../static/js/map-data.js"), out);
const land = Object.values(spaces).filter(t => !t.sea).length, sea = Object.values(spaces).filter(t => t.sea).length;
console.log(`OK: ${land} land + ${sea} sea spaces, ${nConn} connections, ${setup.length} setup lines, ` +
  `${vcs.length} victory cities. Incomes verified: ${JSON.stringify(income)}. ` +
  `Size: ${(out.length / 1024).toFixed(0)}kB`);
