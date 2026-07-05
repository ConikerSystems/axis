/* "Play by GitHub" — async two-player sync through a private GitHub repo.
   The game snapshot (already deterministic JSON) is stored as
   games/<id>.json in the relay repo; every save is a commit. Only the seat
   holding the "baton" (whose turn it is) writes; writes use the file SHA as
   compare-and-swap so a stale device can never clobber the game. */
window.Online = (function () {
  "use strict";
  const CFG_KEY = "axis.online.cfg";     // {token, repo, name}
  const SEAT_KEY = "axis.online.seats";  // {gameId: "p1"|"p2"}
  const API = "https://api.github.com";
  const DEFAULT_REPO = "ConikerSystems/axis-games";

  // ---------- config ----------
  function config() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch (e) { return null; }
  }
  function saveConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
  function seat(gameId) {
    try { return (JSON.parse(localStorage.getItem(SEAT_KEY) || "{}"))[gameId] || null; } catch (e) { return null; }
  }
  function setSeat(gameId, s) {
    const m = JSON.parse(localStorage.getItem(SEAT_KEY) || "{}");
    m[gameId] = s; localStorage.setItem(SEAT_KEY, JSON.stringify(m));
  }

  // ---------- unicode-safe base64 ----------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---------- GitHub contents API ----------
  async function gh(path, opts) {
    const cfg = config();
    if (!cfg || !cfg.token) throw new Error("Online play is not set up (no token)");
    const res = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({
        "Authorization": "Bearer " + cfg.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      }, (opts && opts.headers) || {}),
    }));
    if (res.status === 404) return { notFound: true, status: 404 };
    if (res.status === 401) throw new Error("GitHub rejected the token — re-enter it in Online Setup");
    if (res.status === 409 || res.status === 422) return { conflict: true, status: res.status };
    if (!res.ok) throw new Error("GitHub error " + res.status);
    return res.json();
  }
  const repo = () => (config() && config().repo) || DEFAULT_REPO;
  const filePath = (id) => `/repos/${repo()}/contents/games/${id}.json`;

  async function getGame(id) {
    const r = await gh(filePath(id) + "?_=" + Date.now());
    if (r.notFound) return null;
    return { data: JSON.parse(b64decode(r.content)), sha: r.sha };
  }
  // sha=null creates; sha set updates with compare-and-swap
  async function putGame(id, data, sha, message) {
    const body = { message: message || ("axis turn — " + id), content: b64encode(JSON.stringify(data)) };
    if (sha) body.sha = sha;
    const r = await gh(filePath(id), { method: "PUT", body: JSON.stringify(body) });
    if (r.conflict) return { conflict: true };
    return { sha: r.content.sha };
  }
  async function verifyToken() {
    const r = await gh(`/repos/${repo()}`);
    if (r.notFound) throw new Error("Token works but cannot see " + repo());
    return true;
  }

  // ---------- game ids ----------
  function newId() {
    const words = ["EAGLE", "TIGER", "BISON", "COBRA", "RAVEN", "SHARK", "WOLF", "LION", "HAWK", "ORCA"];
    const w = words[Math.floor(Math.random() * words.length)];
    const n = Math.floor(1000 + Math.random() * 9000);
    return w + "-" + n;
  }

  // ---------- polling ----------
  let pollTimer = null;
  function startPolling(id, knownSha, onUpdate, intervalMs) {
    stopPolling();
    const tick = async () => {
      try {
        const g = await getGame(id);
        if (g && g.sha !== knownSha) { stopPolling(); onUpdate(g); }
      } catch (e) { /* transient network errors: keep polling */ }
    };
    pollTimer = setInterval(tick, intervalMs || 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && pollTimer) tick(); });
    tick();
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  return { config, saveConfig, seat, setSeat, getGame, putGame, verifyToken, newId,
    startPolling, stopPolling, repo };
})();
