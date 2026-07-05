# HANDOFF — Axis 1942

_Updated: 2026-07-05 (v1.3.0)_

## v1.6 (2026-07-05) — ONLINE TWO-PLAYER ("Play by GitHub")
- **Async multiplayer through GitHub**: game snapshots sync via the private repo
  `ConikerSystems/axis-games` (games/<id>.json, every turn = a commit). No server.
- `static/js/online.js`: contents-API get/put with SHA compare-and-swap, unicode-safe
  base64, polling (15s + visibilitychange). Home buttons 🌐 CREATE / JOIN ONLINE GAME;
  one-time setup modal (shared fine-grained PAT + player name, stored in localStorage).
- Create flow assigns powers to Player 1 (creator) / Player 2 / Computer; Game ID
  (e.g. WOLF-7086) is texted to the other player. Turn "baton": a device plays its own
  powers + any AI powers, then pushes when the other seat's human power comes up and
  parks on a WAITING screen (poll + CHECK NOW). Receiver gets "IT'S YOUR TURN" with a
  while-you-were-away battle report. Remote defender casualties auto-resolved (AI rules).
  CONTINUE re-syncs online games from GitHub (source of truth). Conflict-safe (CAS).
- **Joe must create the shared token** (fine-grained PAT, only axis-games repo,
  Contents read/write) and give it to player 2. Never commit it anywhere.
- Verified: node sync tests vs the real repo (CAS + stale-write rejection), full
  two-device protocol E2E (create→P2 plays Germany→back to P1 at UK), and the whole
  browser UI flow with a mocked GitHub API. v1.5.1 also fixed island paint order (Borneo).

## v1.5 (2026-07-05)
- **Readability overhaul**: chips 23px (was 17), icons redrawn & 1.5× (fighter=single-engine
  w/ prop vs bomber=wide 4-engine; soldier vs cannon clearly distinct), count badges 16px,
  territory names 25px bold w/ cream outline, IPC badges + sea-zone numbers + VC stars + IC
  icons all bigger.
- **📊 Country Summary** in the top bar: per-power IPC in hand, territory production,
  territories, victory cities, unit counts + Axis/Allies totals.
- **Battle screen simplified**: strength table per side (×count @value = total, artillery
  support shown as @1–2) with ATTACK/DEFENSE TOTALs; dice grouped by "hits on ≤N".
- **Mobilize UX**: sticky unit selection, place one per tap across any territories, live
  capacity re-highlight, auto-advance to next unit type; first type preselected.
- Amphib generality proven with a second-power test (US assault on Morocco). 39 tests pass.

## v1.4 (2026-07-05)
- **AI turns fully automatic**: no confirmations even vs human defenders (AI assigns
  the defender's casualties); live action feed (#ai-feed) shows purchases, captures,
  each battle with losses, mobilize/income; `aiPause` skips when tab hidden (throttle-proof)
  and the whole turn has try/catch failsafes so it can never strand mid-phase.
- **Combat-movement fixes** (verified vs the real Italy→Egypt amphib with battleship
  clearing the UK destroyer in sz17): amphib cargo only lands if its transport is
  alive in a declared staging zone; transport retreat cancels the assault; fighters
  still aboard carriers are cargo, not combatants; AAA can't load in combat move.
- 38 engine tests pass.

## Latest session (v1.1–v1.3)
- **Deployed & public:** live at https://conikersystems.github.io/axis/ (repo ConikerSystems/axis).
- **v1.1:** silhouette unit icons + reference-matched nation chip colors.
- **v1.2:** tap-to-select movement (tap a piece → pick exact units → tap highlighted destination); drag still works.
- **v1.3:** sculpted piece art (detailed miniatures with relief shadow + plastic dome sheen) and a
  full 3-agent rules audit with fixes: repair spending counts against buy budget; capital-occupied
  power can't purchase; SBR resolves before other combat; canal control read at turn start;
  non-tank land units must END combat moves in hostile spaces; sea retreats need turn-start-friendly
  zones. 35 engine tests pass. Known accepted approximations: bombardment ship cap is per-battle
  (not per-source-zone); air landing-range enforced at UI/AI layer, not in moveUnit itself;
  allied-carrier landing uses isFriendly (broader than owner-only).

## Where things stand
A **complete, playable** digital edition of Axis & Allies 1942 Second Edition as an
installable PWA. Engine, combat resolver, AI opponent, SVG board, and full UI are built
and verified. All 29 engine unit tests pass; full AI-vs-AI smoke games run to victory.
Verified end-to-end in a browser: setup → purchase → drag-drop combat move → dice battle
board (with artillery support, casualties, capture) → noncombat with stranded-air rescue
→ mobilize/income → hotseat handoff → AI turns → round rollover and victory-city tracking.

## What we built
- **`tools/convert-triplea.js`** — converts the TripleA `world_war_ii_v5_1942` community
  map into `static/js/map-data.js`. Cross-checks incomes (24/41/31/30/42) and the 13
  victory cities against the official rulebook; fails loudly on mismatch. 96 land + 65 sea
  spaces, 403 adjacencies, canals (Panama/Suez), full starting setup, and simplified SVG
  polygon geometry for the faithful board.
- **`static/js/engine.js`** — six-phase turn state machine, movement legality (blitz, subs,
  transports, carriers, air range + landing demonstration, canals, Turkish Straits option),
  purchase/mobilize with IC capacity + damage, capture/liberation/capital looting, income,
  victory check. Seeded RNG + snapshot/restore. **Territory reassignment** for custom layouts.
- **`static/js/combat.js`** — decision-driven `Battle` (same code for human dialogs and AI):
  AA fire, sub surprise strike/submerge, shore bombardment, strategic bombing, class-based
  hit assignment (subs/air constraints, transports last), battleship two-hit, defenseless
  transports, retreat, capture. Plus air-landing helpers for noncombat.
- **`static/js/ai.js`** — rules-legal computer opponent: heuristic purchases, expected-value
  attack selection, capital defense, front-line reinforcement, safe air landing.
- **`static/js/board.js`** — SVG world map with pan/zoom (touch + wheel), unit stacks with
  counts/cargo badges, victory-city stars, IC + damage markers, drag-and-drop with
  legal-target highlighting.
- **`static/js/ui.js`** — setup screen (human/computer, names, optional-rule toggles,
  CUSTOMIZE TERRITORIES editor), top bar (round/phase/VC/IPC), purchase & mobilize panels,
  battle modal with dice, hotseat handoff, AI turn runner, autosave/continue, undo, game log.
- PWA shell: `index.html`, `about.html`, `manifest.webmanifest`, `sw.js` (network-first),
  icons, footer/version, Update button, Share/Feedback.

## Unfinished / future
- **Deploy to GitHub Pages** is the only remaining step — needs Joe's OK to create the
  public `ConikerSystems/axis` repo (a cloud classifier blocked the auto-create). Once
  authorized: `gh repo create ConikerSystems/axis --public --source . --push`, then enable
  Pages on `main` root. URL will be `conikersystems.github.io/axis/`.
- AI v2: amphibious invasions and strategic bombing (v1 AI fights on land/sea, not by sea
  invasion or bombing).
- Larry Harris Gencon 3.0 alternate scenario (needs its alternate setup data).
- Low Luck dice mode.

## How to run / test
- Local preview: `python3 -m http.server 8642` in the repo root → open `localhost:8642`.
  (A `.claude/launch.json` "axis" config exists for the preview tool.)
- Tests: `node tests/engine.test.js` and `node tests/smoke.test.js`. Run both before deploy.
- Regenerate board data: clone `github.com/triplea-maps/world_war_ii_v5_1942`, then
  `node tools/convert-triplea.js <that repo>`.

## Next steps
1. Get Joe's go-ahead to create the public GitHub repo, push, enable Pages.
2. On iPad Safari: open the Pages URL → Share → Add to Home Screen. Use the in-app 🔄
   Update button after future deploys.
3. Playtest; gather feedback via the in-app button.
