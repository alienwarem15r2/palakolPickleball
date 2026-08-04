# Pickleball Mini-Tournament Tracker — Design Spec

**Date:** 2026-08-04
**Status:** Approved (design phase)

## 1. Purpose

A web app to run and track a one-day pickleball mini-tournament (23 players, 2
courts, ~3.5 hrs, novice–intermediate). The organizer runs everything from one
device; players open a link on their phones to watch live standings, the court
queues, who's up next, and the finals bracket.

The app implements the "Split Pools + King of the Court" format: two skill-balanced
pools, a "winner stays / challenger rotates in" rotation with a fairness rule, live
standings with point-differential tiebreak, and an 8-player single-elimination
doubles finals.

## 2. Roles

- **Viewer (default, read-only):** No login. Sees live courts, queues/next-up,
  standings, and the finals bracket. Auto-refreshes every ~3 seconds.
- **Organizer (edit mode):** Unlocked with a passcode. The only role that can
  record scores, advance rotations, manage queues, run timers, and run the finals.
  The passcode is validated **server-side** on every write, so viewers cannot edit.
  This is a convenience lock, not real security — acceptable for a friendly event.

Mobile-first layout (players on phones; organizer on a phone/tablet).

## 3. Architecture

- **Framework:** Next.js (App Router) deployed on Vercel.
- **Storage:** Vercel KV (Upstash Redis) holding a **single JSON state object** for
  the whole tournament under one key. No schema, no migrations.
- **Engine:** All tournament logic (rotation, next-up selection, standings,
  seeding, bracket progression) is implemented as pure client-side functions
  operating on the state object.
- **API routes:**
  - `GET /api/state` → returns the current state JSON.
  - `POST /api/state` → validates the passcode header + a `version` field, then
    persists the full state. Rejects stale writes (see §8).
- **Sync:** Viewers and the organizer poll `GET /api/state` every ~3s. The
  organizer's UI updates optimistically, then confirms via the poll.

Environment variables (set in Vercel):
- `KV_*` — Vercel KV connection vars (auto-provided when you add KV).
- `ORGANIZER_PASSCODE` — the edit-mode passcode.

## 4. State model (single JSON object)

```jsonc
{
  "version": 12,               // monotonically increasing; bumped on every write
  "phase": "setup",            // "setup" | "rotation" | "finals"
  "updatedAt": 1699999999999,

  "players": [
    { "id": "p1", "name": "Ina", "pool": "A", "skill": "intermediate" }
    // ...23 players; pool: "A" | "B" | null
  ],

  "stats": {
    "p1": { "gp": 0, "w": 0, "pf": 0, "pa": 0 }   // pointDiff = pf - pa
    // one entry per player
  },

  "courts": {
    "A": {
      "team1": ["p1", "p2"],   // currently on court, or null
      "team2": ["p3", "p4"],
      "queue": ["p5", "p6", "..."],
      "timerStartedAt": null    // epoch ms when 12-min game clock started, or null
    },
    "B": { "team1": null, "team2": null, "queue": [], "timerStartedAt": null }
  },

  "games": [                    // append-only rotation log
    { "court": "A", "team1": ["p1","p2"], "team2": ["p3","p4"],
      "score1": 11, "score2": 7, "ts": 1699999999999 }
  ],

  "finals": {
    "finalists": { "A": ["p1","p2","p3","p4"], "B": ["p10","..."] },
    "teams": [                  // 4 seeded doubles teams
      { "seedPair": [1,8], "players": ["p1","pX"] }
      // ...
    ],
    "matches": {
      "semi1": { "teamA": 0, "teamB": 1, "score1": null, "score2": null },
      "semi2": { "teamA": 2, "teamB": 3, "score1": null, "score2": null },
      "final": { "teamA": null, "teamB": null, "score1": null, "score2": null }
    },
    "champion": null
  }
}
```

## 5. Phase: Setup

1. **Roster** — preloaded with the 23 names from the tournament doc; each row is
   editable (rename, add, remove) and has an optional skill tag (novice /
   intermediate) to aid balancing.
2. **Pool assignment** — preloaded with the doc's A (12) / B (11) split; tap to
   move a player between pools. A running count per pool is shown.
3. **Seed courts** — for each court, the organizer confirms the initial 4 players
   (as two teams of 2); the remaining pool players form the initial queue in the
   listed order.
4. **Start rotation** — transitions `phase` to `"rotation"`. `stats` initialized to
   zero for every player.

## 6. Phase: Rotation (the core engine)

Each court runs an independent "King of the Court" loop.

**Game rules (rotation):** first to 11, win by 1, hard cap 12 minutes. The optional
per-court countdown timer starts when the organizer taps "Start timer"; it shows
remaining time and alerts at 0:00. The timer is a visual aid — the organizer still
enters the final score.

**Recording a game** (organizer enters `score1`, `score2` for the on-court match):
1. For all four players: `gp += 1`; winners `w += 1`; each player's `pf` += own
   team score, `pa` += opponent score.
2. Append the game to `games`.
3. **Winner stays** on court (kept together as a team).
4. **Loser pair** is appended to the back of that court's `queue`.
5. **Next-up selection (fairness rule):** from the queue, pick the **2 players with
   the fewest games played**; ties broken by longest wait (earliest queue index).
   These become the new challenger team. The court's `timerStartedAt` resets to
   null.
6. UI highlights the computed **"Next up"** pair; organizer confirms to set the new
   game. Organizer may override the auto-pick by manually reordering the queue.

Winners can keep winning indefinitely (intended "King of the Court" behavior);
fairness is enforced on the challenger side via fewest-games-played selection.

**Manual controls:** the organizer can edit the queue order, swap players between
teams, correct a mis-entered score (recompute stats), and pause a court.

## 7. Phase: Standings

Two live tables (Pool A, Pool B). Columns: **Games Played · Wins · Point Diff**
(pf − pa). Sorted by Wins desc, then Point Diff desc. This ordering produces each
pool's ranking, used to seed the finals.

## 8. Phase: Finals

**Qualification:** top 4 by Wins (tiebreak: Point Diff) from each pool = 8
finalists. If two players tie on **both** Wins and Point Diff for the last spot,
the app flags the tie and the organizer chooses.

**Cross-pool seeding:** interleave pool ranks into seeds 1–8:
A1=1, B1=2, A2=3, B2=4, A3=5, B3=6, A4=7, B4=8.

**Team pairing (seeded, default):** 1&8, 4&5, 3&6, 2&7 → 4 doubles teams. The
organizer can **shuffle** (random re-draw) or hand-edit teams before locking.

**Bracket:** Semifinals (Team[1&8] vs Team[4&5] on Court 1; Team[3&6] vs Team[2&7]
on Court 2) → Final between the two semi winners. Games to **11, win by 2, no cap**.
The organizer records each match score; the app advances winners and declares the
`champion`.

## 9. Sync & concurrency

- Single editor expected. Each write bumps `version`. `POST /api/state` rejects a
  write whose `version` doesn't match the stored one (HTTP 409); the client then
  refetches and reapplies. This protects against the organizer having two tabs open.
- Last-write-wins otherwise. No realtime push — ~3s polling is sufficient for a
  2-court event.

## 10. Reset

A passcode-gated **Reset** control clears state back to a fresh `setup` phase
(roster/pools preloaded again). Used for testing and for re-running the format.

## 11. Out of scope (YAGNI)

- Scorekeeper / line-caller duty rotation (operational, done off-app).
- Real user accounts / OAuth (passcode gate is enough).
- Multiple simultaneous editors and realtime push.
- Offline mode / PWA install.
- Persisting multiple past tournaments (single active tournament only).

## 12. Testing

- **Engine unit tests** (pure functions, no network): stat accumulation on a
  recorded game; winner-stays / loser-to-queue transition; fewest-games next-up
  selection incl. tie-by-wait; standings sort with point-diff tiebreak; finalist
  qualification incl. flagged ties; cross-pool seeding + seeded pairing; bracket
  advancement to champion.
- **API route tests:** passcode rejection; stale-version 409; successful write bumps
  version.
- **Manual smoke test:** full run-through setup → a few rotation games on both
  courts → finals → champion, verified in the browser with a viewer tab open.
