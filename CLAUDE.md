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
- Tests: `node tests/engine.test.js` (29 rules unit tests) and
  `node tests/smoke.test.js` (full AI-vs-AI games). Run both before any deploy.

<!-- SOURCE-POLICY:START -->
## Source of truth: local Mac (master) — managed by Claude Hub

**The Mac is the master for Axis 1942;** GitHub is the synced backup. Edit on the Mac; the session pushes to GitHub at the end. Databases/data stay local — GitHub holds code only.
<!-- SOURCE-POLICY:END -->
