# Real-time two-player multiplayer — evaluation (no build; for review)

_Written 2026-08-02. Analysis only — nothing here is wired up yet._

## The question
Two people in **different locations playing at the same time**. GitHub **public** is acceptable.

## First, an important framing
Axis & Allies is **strictly sequential**: the turn order is Russia → Germany → UK → Japan → US, and within a turn one player works through six phases. Two humans are **never** meant to act simultaneously. So "real-time" here really means three things:

1. **Live presence** — both players connected at once, no "text me when it's my turn."
2. **Instant handoff** — when the active player ends their turn, the other player's board updates within a second or two, not on a manual refresh.
3. **Live spectating** — the waiting player can watch the active player's moves/battles as they happen.

That's a much smaller problem than true concurrent multiplayer, and it fits this app well.

## What already exists (`static/js/online.js`)
- **"Play by GitHub"**: the whole game is one deterministic JSON snapshot stored as `games/<id>.json` in a private repo (`ConikerSystems/axis-games`). Every turn = one commit.
- **Baton model**: only the seat whose turn it is writes; writes use the file **SHA as compare-and-swap**, so a stale device can't clobber the game.
- **Sync**: polling every ~15 s + on tab focus. A player parks on a WAITING screen until it's their turn.
- Verdict: solid and **serverless**, but it's **async/near-real-time (10–15 s lag)** and only syncs at turn boundaries, not move-by-move.

## Constraints that shape the options
- The app is a **static GitHub Pages site — no backend of our own.** Any real-time transport must be a hosted service (or peer-to-peer).
- Game state is already a **small deterministic JSON blob** (a few KB–tens of KB) with snapshot/restore — ideal for syncing; we can send the whole state or just deltas.
- Want it **free** and low-maintenance.

## Options, ranked

### A. Improve the current GitHub polling (0 new infrastructure)
- Drop the poll interval to ~3–5 s while both seats are active; sync **after each phase** (or each battle) instead of only at end-of-turn, so the opponent watches your progress.
- **Real-time feel:** "good enough" (2–5 s). **Effort:** small. **Cost:** free.
- **Downsides:** GitHub API rate limits (5,000 req/hr authenticated — fine for 2 players; unauthenticated is only 60/hr so a token is required), and it's polling, not push, so there's always a few seconds of lag. **GitHub public repo would expose every game's state publicly** — keep the relay repo **private** even though public is "acceptable."

### B. Free real-time backend (recommended for true live play)
Use a hosted realtime DB with a browser SDK; the app stays on GitHub Pages and just talks to it.
- **Supabase Realtime** (Postgres + realtime channels) or **Firebase Realtime Database / Firestore** — both have free tiers that dwarf a 2-player game's needs. Write the snapshot to one row/doc; the other client gets a **push** in <1 s.
- **Ably / Pusher / PartyKit** — purpose-built realtime channels, generous free tiers; even simpler if we only broadcast state, no persistence.
- **Real-time feel:** true push, ~instant. **Effort:** medium (add SDK + a tiny channel/table + auth rules). **Cost:** free tier.
- **Downsides:** a third-party dependency and an API key in the client (scope it to anon/public with row rules). Best overall balance.

### C. Peer-to-peer (WebRTC via PeerJS)
- Direct browser↔browser data channel; no server carries game data, lowest latency.
- **Effort:** medium. **Cost:** free data path, but you still need a **signaling** step to introduce the two peers (PeerJS's free broker, or reuse GitHub to exchange the offer/answer) and usually a **TURN** server for players behind strict NATs (free TURN is scarce/unreliable).
- **Downsides:** NAT traversal is the classic pain; both players must be online at the same instant to connect. Great when it works, flaky across some networks.

### D. Tiny WebSocket relay we host (most control)
- ~100 lines on **Cloudflare Workers + Durable Objects**, **Deno Deploy**, or **Fly.io** free tier: clients open a WebSocket to a room keyed by game ID; the server just rebroadcasts state + presence.
- **Real-time feel:** true push, ~instant, plus presence/"opponent is online". **Effort:** medium-high (now we operate a service). **Cost:** free tier, but it's infra to maintain.

## Recommendation
1. **Quick win (this app's spirit — serverless):** do **Option A** — tighten polling to ~3 s and sync per-phase/per-battle. Gets to "watchable, near-live" with the code that already exists and zero new services. Keep the relay repo **private**.
2. **If you want genuinely instant + presence:** do **Option B** with **Supabase Realtime** (or Firebase). It's the least-effort path to true push updates and an "opponent online / your turn now" indicator, and it coexists with the existing snapshot model (store the same JSON, just in a realtime row instead of a git commit).
3. Keep **P2P (C)** and **self-hosted WS (D)** as later options only if you want lowest latency or full ownership; both add operational complexity that isn't worth it for a 2-player turn-based game.

## Rough effort / trade-off table
| Option | Real-time feel | New infra | Effort | Cost | Main risk |
|---|---|---|---|---|---|
| A. Faster GitHub polling | 2–5 s | none | S | free | API limits; keep repo private |
| B. Supabase/Firebase realtime | ~instant | hosted SDK | M | free tier | 3rd-party key in client |
| C. WebRTC P2P (PeerJS) | ~instant | signaling/TURN | M | mostly free | NAT traversal flakiness |
| D. Self-hosted WebSocket | ~instant | our service | M–L | free tier | we operate a service |

## Notes on "GitHub public is fine"
Public **hosting** of the app is already the case (Pages). But the **game-state relay** should stay **private** regardless — a public `axis-games` repo would let anyone read (and, with a token, tamper with) in-progress games. If we move to Option B/D, the realtime store should likewise be locked to the two seats (row-level rules / room tokens).

## Suggested next step (when you want to act)
Start with **Option A** (small, in-repo, no new accounts). If the ~3 s feel isn't "live" enough, layer in **Option B** behind the same `Online` interface so the rest of the app doesn't change. Both keep the deterministic-snapshot design that already works.
