# HANDOFF — Axis 1942

_Updated: 2026-08-01 (v1.9.0)_

## v1.9.0 (2026-08-01) — "war table" visual overhaul (match A&A 1942 Online look)
- **Map format redesigned** to the reference aesthetic: the world map now reads as an
  aged sea chart torn from a larger sheet and laid on a light "war table" (torn deckle
  edges via an SVG displacement filter + drop shadow; light neutral surround). Ocean is a
  muted grey-teal with a fractal-noise chart texture + faint graticule; sea zones are
  transparent so the textured base shows through. Territory tints nudged to the muted
  historical palette. All in `static/js/board.js` (defs + torn sheet) — no map-data edits.
- **Charcoal topbar** with **historical nation roundels** (USSR gold star, German
  Balkenkreuz, RAF/UK target, Japan rising-sun, US star) replacing the emoji, current
  power ringed in gold. `roundel()` SVG helper in `ui.js`.
- **Victory Cities tug-of-war bar** (centered): 13-segment red↔blue track filling from
  each side, boxed counts (held / needed-to-win), flanked by each side's roundels —
  replaces the old plain-text VC readout.
- **Bottom-left contextual phase card** (title + one-liner + themed sepia glyph tile,
  self-contained — no external photo) that taps through to the detail side-panel.
- **Purchase panel rebuilt to the reference row format**: each unit shows a large
  **golden sculpted "miniature"** (the existing `unit-icons.js` silhouette rendered in a
  brass gradient with a dark relief layer + top highlight — no new art), a red ✕ close
  tab, boxed IPC/PURCHASED readouts, aligned ATK/DEF/MOV/COST/PURCHASE columns, and a
  blue **?** info dot per row that banners the unit's role. `goldPiece()` helper in `ui.js`.
- **Bottom-right round red END PHASE / HOLD button**: press-and-hold ~600ms (radial fill)
  to end the phase, so the big button can't fire on an accidental tap. Old topbar
  END PHASE button retired (handler refactored to `endPhaseAction`, still bound).
- **Fullscreen ⛶ toggle** (Fullscreen API; iPhone Safari falls back to an "Add to Home
  Screen" hint). **Pinch-to-zoom** verified working (unchanged gesture code; wheel/pinch
  share the same zoom path — confirmed scale change in a headless render).
- Version bumped `1.8.3 → 1.9.0`; `sw.js` cache `axis-v13 → axis-v14`. All 43 engine
  tests + AI-vs-AI smoke games still pass (pure view/CSS change).

## v1.8.3 (2026-07-05) — iPad touch fix
- Tap detection: total travel from press point > 14px = movement (was 3px per event —
  finger wobble killed every tap on iPad, so nothing registered). Map no longer pans
  under an undecided tap; pieces got 36px invisible touch targets; user-select disabled.
- Noncombat phase + transports verified with 4 new engine tests (exists in sequence,
  friendly-only land moves, NCM bridge/sail/offload, hostility respected). 43 tests pass.

## v1.8 (2026-07-05) — game list + delete/cancel
- Home button JOIN ONLINE GAME → **MY ONLINE GAMES**: lists every game on the relay
  (title, players, whose turn, date) with ▶ OPEN and 🗑 DELETE (confirm; clears a stale
  local Continue). JOIN BY GAME ID kept as a fallback inside the list.
- In-game menu gains 🗑 CANCEL GAME (DELETE FOR BOTH) for online games.
- online.js: listGames() + deleteGame().

## v1.7 (2026-07-05) — one-tap invites
- Player 2 needs ZERO setup: the creator taps 📲 INVITE and texts a link
  (…/axis/#join=<ID>&k=<token> — the fragment never reaches any server). Tapping it
  asks only for a name, then drops them into the game/turn report. RESEND INVITE on
  the waiting screen; setup modal now has a copy-token-page helper for the host.

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
