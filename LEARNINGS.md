# Cross-App Learnings — reusable technical & UX playbook

Portable engineering and UI learnings distilled from building **Axis 1942** (a static,
installable PWA with an online relay). Written to be **app-agnostic** so it can be copied
into, or referenced by, other business apps. Nothing here is game-specific.

> How to use: skim the principles (**bold lead lines**), then borrow the concrete
> techniques under each. Sections are independent — take what fits.

---

## 1. Security & the "zero-human-error" credential approach

The scenario: an app needs a third‑party credential (here, a GitHub token for an online
relay) that may travel inside a shareable link. The risk: one mistake exposes the user's
**entire** account. The goal we set was a *zero human-error guarantee* — make the only easy
path the safe one, and design so that a mistake can't expose more than a throwaway blast
radius.

**Contain the blast radius with a dedicated identity per integration.**
- Use a separate, throwaway account that owns **only** the one resource the integration
  needs — nothing else of value lives there. If its credential leaks, the loss is bounded to
  that one resource, never the user's primary account.
- Keep the sensitive account and the integration account strictly segregated.

**Least privilege, narrowly scoped, and expiring — never long-lived broad tokens.**
- Prefer fine-grained / scoped credentials limited to a single resource with the minimum
  permissions (e.g. read/write on one repo, nothing org-wide).
- Always set an expiry, and record it where the user can see it.
- **Hard-lock the credential *type*** at the boundary: validate the token shape/prefix and
  refuse anything broader (e.g. accept only `github_pat_…` fine-grained tokens; reject
  classic tokens). Fail closed.

**Bake the secure provisioning steps into the product itself.**
- Put the "how to generate this credential" instructions *in the app*: the exact URL, the
  exact permissions to grant, and the expiry to set. Humans reproduce the secure setup
  without guessing — the dominant source of credential mistakes is people improvising the
  setup.
- Note *which account* the credential belongs to, and remind the user to store it in a
  password manager.

**Treat any credential that travels as eventually-compromised.**
- Anything in a URL, QR code, or shared link can be cached, indexed, or forwarded. Scope the
  credential so that outcome is survivable (see blast-radius containment).
- Never log or echo secrets. Assume anything sent to an external service is retained even if
  later deleted.

**Reusable checklist for the next app:**
- [ ] Does this integration get its **own** identity with nothing else attached?
- [ ] Is the credential **scoped to one resource**, **least-privilege**, and **expiring**?
- [ ] Do we **validate the credential type** and fail closed on anything broader?
- [ ] Are the **provisioning steps in-product** (URL, permissions, expiry, which account)?
- [ ] If the credential leaks via a shared link, is the worst case **bounded and recoverable**?

---

## 2. Mobile / touch UI responsiveness (iPad / iOS especially)

Symptom set we hit: sluggish pinch-zoom, laggy finger drag, unresponsive taps. Almost none
of it was "slow JavaScript" — it was the **compositor**. The mobile GPU was doing expensive
work every frame.

**Profile the compositor, not just your logic.** The usual mobile killers:
- **Full-viewport SVG filters** (`feTurbulence`, `feDisplacementMap`, `feDropShadow`) that
  live *inside* a transformed group get **re-rasterized every pinch/pan frame**. This was our
  #1 jank source.
- **`backdrop-filter: blur()`** forces a full-screen repaint on every frame an element (or
  the content behind it) moves.
- **Continuous CSS animations** on large translucent fills = constant compositing cost.
- **Synchronous hit-testing** (`elementFromPoint` + toggling `pointer-events`) on every
  `pointermove` forces a style/layout flush — several per frame under coalesced events.
- **Full DOM rebuilds** (`innerHTML = …`) per interaction — GC and layout churn.

**Two-tier rendering: rich on desktop, lean on touch, from one codebase.**
- Detect the device class with `matchMedia('(pointer: coarse)')`. On coarse pointers, drop
  the expensive decorative filters and keep flat fills; desktop keeps the full look. One code
  path, a single capability query — no separate mobile build.
- Gate continuous animations behind `@media (pointer: coarse)` too.
- Replace `backdrop-filter` on frequently-repainted controls with a solid (slightly opaque)
  background — visually equivalent, far cheaper.

**rAF-coalesce anything that runs per input event and touches layout.**
- Keep the cheap, visible feedback **immediate** (e.g. the drag ghost follows the finger on
  every event); defer the **expensive** part (hit-testing) into **one `requestAnimationFrame`
  per frame**. iOS fires several pointer events per frame — collapse them.

**Get the touch fundamentals right.**
- Use **Pointer Events** + `setPointerCapture` for one unified mouse/touch/pen path.
- `touch-action: none` on the canvas / `manipulation` on buttons to kill the ~300 ms tap
  delay and stop the browser hijacking gestures; `preventDefault` native gesture events.
- Use a **generous tap-vs-drag threshold** (~14 px of total travel) so fingertip wobble
  doesn't silently turn a tap into a tiny pan that never registers.
- `-webkit-tap-highlight-color: transparent` and disable text/callout selection on
  interactive surfaces.

**Principle:** make the cheap visible response instant; make the expensive computation rare.

---

## 3. Broader technical patterns that paid off

**No-build static PWA.** Plain HTML/CSS/vanilla JS served on a static host. Fast iteration,
nothing to compile, no toolchain rot, trivial to host and cache. Great default for
small-to-mid business apps that don't need a framework.

**Single-source versioning + explicit cache busting.** One version constant *and* the service
worker cache name are bumped **together every deploy**, with an in-app "Update" button. This
is the fix for the classic PWA "users stuck on a stale cached build" bug. Show the version in
the footer so users can report exactly what they're on.

**Model core logic as a pure state machine; the UI acts *only* through its APIs.** Illegal
states become impossible by construction, not by UI discipline. Bonus: any automated
actor (an AI, a bot, a script) uses the **same** APIs, so it physically can't do something a
human couldn't — no separate "cheating" path to audit.

**One snapshot/restore mechanism, many features.** Serializable state snapshots powered undo,
saves, *and* online sync from a single implementation. Put config/options **inside** the
snapshot so settings persist across save/load/online for free.

**Estimate by replaying the real engine, not a re-implementation.** For probabilities or
"what-if" estimates (we did Monte-Carlo battle odds), run the **actual** rules engine on
throwaway cloned state many times. It stays correct automatically as the rules evolve —
you never maintain a parallel model that silently drifts.

**Deterministic core + a testing pyramid.**
- Keep randomness out of core logic; use a **seeded RNG** so tests are reproducible.
- Layer tests: fast **deterministic unit tests** for rules, a **full end-to-end smoke run**
  (drive the whole thing to completion and assert invariants — no exceptions, no impossible
  states), and **targeted browser checks** (Playwright) for the DOM/interaction wiring.
- Run the smoke across **all configurations** (here: every player, every difficulty) so a
  change is exercised broadly, not just on the happy path.

**A disciplined, reversible ship relay.** Every change: run tests → bump version → work on a
branch → open a (draft) PR → merge to the main branch → that branch is the single source →
redeploy. Any bad merge is a one-command `git revert`; the branch/PR is the audit trail and
rollback point. "Done" means *merged*, never parked on a dangling branch.

---

## 4. UX patterns that consistently worked

- **Show the consequence before the commitment.** Surfacing win/outcome probabilities *before*
  an irreversible action helped users decide well and trust the system.
- **Block when a safe path exists; only warn-and-confirm when genuinely stuck.** We refused to
  end a phase while a recoverable mistake was pending (aircraft that could still land), but
  allowed an explicit confirmed override when there was truly no alternative. Don't let users
  silently lose things they could have saved.
- **Scope actions to intent.** Dragging one piece moves *that* piece, not the whole pile;
  moving the whole set is an explicit opt-in. Match the default to what the gesture implies.
- **Targeted undo *and* global undo.** A global step-back is table stakes; add a "cancel *this*
  one thing" so users don't have to unwind everything after it to fix one mistake.
- **Highlight the actionable next step in color.** Red = needs your action, green = a valid
  target, and refresh the highlight as state changes. Users should never wonder "what now?"
- **Offer quick presets over a single fixed default.** MIN / MAX / 1-each buttons beat always
  defaulting to the maximum and making users decrement.
- **Announce state transitions.** A brief phase/mode notice orients the user; pair it with a
  clear statement of what that mode expects them to do.
- **Difficulty/config as tuned parameters + one honest lever.** A believable "harder" opponent
  came from tuning behavior thresholds *plus* a transparent resource handicap — and we were
  explicit about the difference (smarter play vs. more resources) rather than pretending to
  deeper intelligence.

---

_Source project: Axis 1942 (static PWA, GitHub Pages, GitHub-as-master). Copy this file into
new repos or the shared standards hub and prune to taste._
