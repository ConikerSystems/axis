# Axis 1942 — repo pointer

This is a **static web app / installable PWA** (like Simpli Piano). Cloud/app sessions:
read **[HANDOFF.md](HANDOFF.md)** first for current state and next steps.

- Follow the Hub conventions: PWA + offline service worker, single-source versioning
  (`static/js/version.js` + `sw.js` cache name bumped together every deploy), in-app
  **🔄 Update** button, Coniker Systems™ footer + About page. (See the Hub's
  `WEB_APP_STANDARDS.md` on the Mac — not in this repo.)
- **No build step.** Plain HTML/CSS/vanilla JS from repo root; served on GitHub Pages.
- Board data is **generated** from the TripleA 1942 2E map by `tools/convert-triplea.js`
  into `static/js/map-data.js` (verified against the official rulebook: incomes
  24/41/31/30/42, 13 victory cities). Don't hand-edit `map-data.js`.
- Rules live in `static/js/engine.js` (state machine) + `static/js/combat.js` (battle
  resolver). `static/js/ai.js` is the computer opponent. `static/js/board.js` renders the
  SVG map; `static/js/ui.js` orchestrates screens/phases/drag-drop.
- Tests: `node tests/engine.test.js` (rules unit tests), `node tests/superbomber.test.js`,
  `node tests/ai-amphib.test.js` (AI seaborne invasions), and `node tests/smoke.test.js`
  (full AI-vs-AI games). Run all four before any deploy. (`tests/online.test.js` is manual —
  it needs a network token.)

## Source of truth: GitHub — one rule for every program

GitHub holds the code. Work wherever suits the task — the Mac, claude.ai/code, or the
Claude app on iPhone — and let the state of the repo decide what happens, not a setting:

- **Session start** fast-forwards this repo when the Mac copy is clean and level with
  GitHub, and **refuses to pull** — naming exactly what is in the way — when it holds
  uncommitted or unpushed work.
- **Session end** commits, runs this repo's test gate (`.claude/source.json` → `"test"`)
  and pushes.

Databases and data stay local on the Mac regardless — GitHub holds code only.

_There used to be a per-app `master` flag here, and a line telling you not to develop on
the Mac. Both went on 2026-09-20: the flag was a string nobody corroborated, while the
sync state is measured from git every session._

<!-- SYNC-MERGE-POLICY:START -->
## "Sync to GitHub" = merge to `main` (deploy policy)

For any Coniker app, "sync to GitHub" means the whole relay, not just a push: **commit → push the working branch → merge it into `main` → `main` is the single up-to-date source.** A change parked on an un-merged branch is **not "done"** — don't leave dangling branches for Joe to manage.

- **Claude tests before merging.** Runs/loads the app off the branch in the cloud and verifies the change does what was asked. Joe does not read or review code. (For Axis, that includes running `node tests/engine.test.js` and `node tests/smoke.test.js` before merging.)
- **Visual/substantial changes:** Claude sends Joe a **preview screenshot** of the running branch and gets an OK before merging (he reviews a picture, not code). Trivial/docs changes merge without a preview.
- **Reversible:** any merged change that misbehaves is reverted immediately (`git revert`) — `main` returns to its prior state, so merging is never a one-way door.
- The working branch/PR stays as the audit trail + rollback point.
- **After merge:** `main` is the current source — the live app/site redeploys where applicable, and the Mac replica picks it up on its next pull.

_(Hub-wide convention — see `WEB_APP_STANDARDS.md` and the universal `CLAUDE.md` workflow in Claude Hub.)_
<!-- SYNC-MERGE-POLICY:END -->
