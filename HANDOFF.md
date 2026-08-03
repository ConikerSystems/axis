# HANDOFF — Axis 1942

_Updated: 2026-08-03 (v1.10.0)_

## v1.10.0 (2026-08-03) — USA Super Bomber (Admin experimental)
Opt-in super unit, **off by default**, fully backward-compatible (all existing tests +
smoke unchanged). Enable in **⚙ Admin → USA Super Bomber**, then tick the option at game
setup (hotseat or online).
- **Unit** (`engine.js`): `superbomber` — cost **15**, move **8**, atk 4 / def 1, air; carries
  a man. Replaces the US bomber in the purchase list; existing US bombers upgrade for +3
  (`upgradeBomber`). Option `superBomber` lives in `game.options` (serialized → syncs online).
- **Combat** (`combat.js`): a `superStrike` step runs after AA (so AA/fighter-soak resolves
  first). Each attacking super bomber rolls once — any die **≤4** annihilates every enemy unit
  at the target **and** the industrial complex (land or sea); on land the carried man drops in
  to **seize** the territory. A miss (>4) is clean — the bomber flies home. Undefended enemy
  territory: `resolveUnopposed` drops the man to seize it. Super bombers never fire in normal
  rounds and can still run strategic bombing.
- **UI**: purchase panel swap + upgrade control; Admin toggle (`axis.admin.superBomber`);
  new-game option row; names/glyph/icon (shares the bomber silhouette); SBR button accepts it.
- **Tests:** `tests/superbomber.test.js` (10) — stats, upgrade, strike hit/miss, AA shoot-down,
  fighter soak, sea, undefended seize. Browser-tested end-to-end (admin → setup → US purchase).

## v1.9.7–1.9.8 (2026-08-02) — relay moved to a dedicated throwaway account (Raj78789494/axis)

## v1.9.7–1.9.8 (2026-08-02) — relay moved to a dedicated throwaway account
- **`DEFAULT_REPO` → `Raj78789494/axis`** (`online.js`; the relay repo Joe created on that account). The online-play relay now
  lives on a separate, valueless GitHub account that owns *only* the games repo — so a
  worst-case token leak (or a mis-scoped token) touches nothing of value on the main
  `ConikerSystems` account. This is the zero-human-error guarantee from the analysis below.
- `Online.defaultRepo` is now exported; the invite-link `&r=` check in `ui.js` compares
  against it instead of a hardcoded string (so the relay owner only has to change in one
  place).
- **The host token must be created under the `Raj78789494` account**, scoped to
  `Raj78789494/axis`, Contents R/W only. Online play only — local hotseat / vs-AI
  games never touch GitHub.

### Online-play setup — recorded facts (for future sessions)
- **Relay repo:** `Raj78789494/axis` (private) on Joe's dedicated/throwaway GitHub
  account — holds only `games/<id>.json`, nothing of value.
- **Host token:** fine-grained PAT named **`axis_multiplayer`**, made under the
  `Raj78789494` account, scoped to that one repo. Permissions: **Contents: Read and
  write** + **Metadata: Read-only** (auto). Nothing else.
- **Token expires: 2027-08-02.** ⏰ Before then, regenerate a new fine-grained token the
  same way and re-paste it into the app's Online Setup, or online play stops (the app
  will reject the expired token with a 401). Local games are unaffected.
- The token value is **never** stored in this repo — it lives only in Joe's password
  manager and in `localStorage` on the host device. Do not commit it anywhere.

## v1.9.4–1.9.6 (2026-08-02) — near-real-time multiplayer + token lockdown

**v1.9.4 — live spectating (Option A from MULTIPLAYER-EVAL).** Two-player "Play by
GitHub" now feels near-live over the existing relay, no new infra:
- `online.js`: `startSpectating`/`stopSpectating`/`isSpectating` — a continuous ~4s
  poller that fires for **every** new file sha (advances the known sha internally),
  alongside the unchanged turn-handoff `startPolling`.
- `ui.js`: the active player publishes a snapshot at **each phase boundary**
  (`pushSpectate`; `turnSeat` stays theirs), and the old "WAITING" screen became
  "WATCHING" — it mirrors the opponent's in-progress board move-by-move and
  auto-unlocks when the baton (`turnSeat`) flips. CAS on the file sha unchanged.

**v1.9.5–1.9.6 — token can never expose the account.** The invite link a host texts
carries their GitHub token, so the app now hard-locks what token it will store:
- **Only fine-grained tokens** (`github_pat_…`) are accepted. Classic/OAuth tokens
  (`ghp_…`, account-wide) are **rejected outright — no override** (`openOnlineSetup`).
- **Server-confirmed** defense in depth: `Online.tokenScopes()` reads GitHub's
  `X-OAuth-Scopes` header; if the token reports any account-wide (classic) scopes it's
  refused and the bad token is cleared from storage.
- Online Setup now shows the **full numbered token steps** in-app (repo-only, contents
  R/W only, "do NOT choose All repositories").

### How to make the host token (give this to anyone hosting)
1. GitHub → avatar → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token** (or tap "COPY GITHUB TOKEN-PAGE LINK" in
   Online Setup).
2. Name it (e.g. **axis-relay**), set an expiry.
3. **Resource owner:** the **Raj78789494** account · **Repository access → Only select
   repositories → `axis`** (never "All repositories"). Sign into GitHub as that
   account (not ConikerSystems) when creating the token.
4. **Permissions → Repository → Contents → Read and write.** Everything else "No access."
5. Generate → copy (`github_pat_…`) → paste into Online Setup.

### Security analysis — separate repo vs separate account (requested)
- **The real lock is GitHub's server-side token scoping.** A fine-grained token limited
  to `axis-games` + Contents-only literally cannot read/write any other repo, or touch
  settings/billing/secrets/repo-deletion. GitHub enforces this — not our code.
- **A separate *repo* (same account) adds NO security** when the token is fine-grained
  and repo-scoped: such a token already can't see any other repo. It would only matter
  against a broad token, which the app now refuses anyway.
- **A separate *account* is the only thing that adds isolation.** A throwaway free GitHub
  account (e.g. `coniker-games`) that owns *only* `axis-games` means even a worst-case
  leak — or a mis-created "All repositories" token — touches a valueless account, never
  the main one. Cost: manage one extra free account; point `DEFAULT_REPO` in `online.js`
  at `<newaccount>/axis-games`. **Recommended if you want a zero-human-error guarantee.**
  ✅ **Done (v1.9.7–1.9.8)** — relay moved to `Raj78789494/axis` (the repo created on that account).

## v1.9.3 (2026-08-02) — selection & movement polish (7 features)
1. **Selected-piece ring**: the exact stacks you chose in the move picker get a bright
   white ring while you pick a destination. (`board.setSelected`)
2. **Active-power ring**: the current power's movable pieces wear a subtle gold ring, so
   "what can I move" is obvious at a glance.
3. **Multi-unit tap tooltip**: tapping a space now flashes the whole space's contents
   (name + every unit group), not just one type. Hover still shows the single stack.
4. **Select all / Clear** buttons in the move picker (with "of N" available counts).
5. **Attack vs move colors**: hostile destinations highlight **red**, friendly/reposition
   destinations **gold** — auto-classified in `board.highlight`. Applies to drag and tap.
6. **Step-by-step undo**: ↩ now undoes one move action at a time (snapshot stack) down to
   the start of the phase, instead of only a full-phase reset.
7. **✈ Show safe landings**: a noncombat button highlights (green) every friendly spot the
   current power's aircraft can still reach and land on this phase.
- Pure view change (`board.js`, `ui.js`, `style.css`); 44 engine tests + smoke pass.
- Version `1.9.2 → 1.9.3`; `sw.js` cache `axis-v16 → axis-v17`.
- Added **MULTIPLAYER-EVAL.md** (analysis only, not built): options for real-time 2-player
  play — improve GitHub polling (serverless) vs Supabase/Firebase realtime vs WebRTC/self-host.


## v1.9.2 (2026-08-02) — piece tooltips + roomier stacks
- **Unit identity tooltip**: hovering a piece (desktop) or tapping it (touch) pops a label
  with the power, unit name, and count — e.g. "Soviet Infantry ×4" (transports/carriers
  also show "· N aboard"). `board.js`: `NAME`/`POWER_LABEL` maps, a `.unit-tip` overlay,
  and `data-label` on each stack; hover via mouseover/mousemove, tap-flash via the pointer
  end handler (auto-hides after 1.8 s). CSS `.unit-tip`.
- **Roomier stacks**: unit stacks now spread out using each territory's polygon radius
  (`spaceExtent`) — up to ~72 px apart where there's room, floored at ~52 px so chips never
  overlap, and each row is centered. Big territories (Russia, Africa) breathe; small islands
  stay compact. Replaces the old fixed 54 px grid. `board.js` `renderUnits`.
- **Rules re-verified**, incl. transports: combat-move load counts as the land unit's whole
  move; offloading onto a hostile coast in combat move declares an amphibious assault from
  the transport's zone (cargo lands only if the transport survives there); noncombat offload
  delivers into a friendly coast. Engine + combat unchanged; 44 engine tests + smoke pass.
- Version `1.9.1 → 1.9.2`; `sw.js` cache `axis-v15 → axis-v16`.


## v1.9.1 (2026-08-01) — rules fix + label polish
- **Strategic bombing AA corrected (rules)**: a bombing raid only draws antiaircraft
  fire when an actual **AA gun is in the target territory** (1942.2) — previously every
  IC got a free 1-die-per-bomber shot even with no AA gun. Fire now follows the combat
  AA rule (1 die/bomber, max 3 per gun, hit on 1). `combat.js` `icAA` step. New engine
  test locks both cases (no gun → no AA fire; gun present → AA fires). **44 tests pass.**
- **Player label**: the top bar (and country-summary subtitle) no longer print the power
  name twice when a seat's name is left at its default — "SOVIET UNION — SOVIET UNION"
  now reads just "SOVIET UNION". `ui.js` `topBar()` + summary.
- Version `1.9.0 → 1.9.1`; `sw.js` cache `axis-v14 → axis-v15`.


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
  blue **?** info dot per row that banners the unit's role. The **Mobilize** panel shows
  the same golden pieces with a "N to place" count. `goldPiece()` helper in `ui.js`.
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
