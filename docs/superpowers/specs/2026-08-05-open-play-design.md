# Open Play Organiser — Design Spec

**Date:** 2026-08-05
**Status:** Approved (design phase)

## 1. Purpose

A second mode of the app for running casual **open play** sessions, alongside the
existing tournament tracker. Open play differs from a tournament in three ways
that drive the whole design:

- **The roster is fluid.** People arrive and leave all evening.
- **There is no ending.** No pools, no bracket, no champion.
- **The organiser's job is one question:** who is on next, and is it fair?

Players watch the same live link on their phones; the organiser edits behind the
existing passcode.

## 2. Relationship to the tournament

Open play lives at **`/open-play`** with its **own state record** in KV
(`palakol:openplay:state`), completely independent of the tournament state. One
never affects the other, and both can hold data at the same time. The two pages
link to each other from their headers.

Shared with the tournament: the passcode gate, the live-poll/optimistic-write
hook pattern, the QR share, the court timer, score entry, and — importantly —
the existing `pairFour` / `partnerHistory` pairing engine from `src/lib/engine.ts`.

## 3. Session lifecycle

`idle → running → ended`

- **idle** — nobody checked in yet. Organiser sets the number of courts and taps
  **Start session**.
- **running** — check-ins open, courts fill, games are recorded.
- **ended** — organiser taps **End session**. A summary is shown (games played,
  wins, most games, most wins) and stored as `lastSummary`. Starting a new
  session clears players, queue, courts and games, keeping only that summary.

## 4. Getting into the queue

**Self check-in (no passcode).** Players scan the QR, land on `/open-play`, tap
**I'm here**, enter a name and pick Novice / Intermediate. They are appended to
the back of the queue.

**Organiser control (passcode).** Add, rename, or change anyone's level; mark a
player **resting** (stays checked in, skipped by the queue) or **done**. A player
who is currently on court cannot be removed or set resting until their game is
recorded — same rule as the tournament roster.

**"Done" removes the player from the roster and the queue.** Games they already
played stay in the session log, so results and the end-of-session summary remain
accurate. Two people may check in under the same name; ids are unique, so the
app treats them as separate players.

Self check-in is a deliberately narrow public write (see §9).

## 5. Courts and the shared queue

- **1–6 courts**, set at session start and changeable mid-session. A court can be
  **closed** (e.g. the light goes); closing an empty court removes it from
  rotation, and a court with a game in progress must have that game recorded
  before it can be closed.
- **One shared FIFO queue.** Order is strictly first-in, first-out:
  - a new check-in joins the **back**;
  - after a game is recorded, its four players rejoin the **back**;
  - a player returning from resting joins the **back**.
- Whenever a court is open and empty and **four or more** players are waiting,
  the app **auto-fills** it with the front four.
- The four rejoining players are appended in a **shuffled order among
  themselves**, so a repeating foursome doesn't recycle in lockstep when the
  queue length is a multiple of four.

Games played is tracked and displayed, but does **not** affect queue order.
FIFO self-balances court time and is the rule players already understand from a
physical paddle rack.

## 6. Playing a game

When four players come off the queue onto a court, `pairFour` splits them into
two teams, preferring (1) an even skill split — if one team is
intermediate+novice so is the other — and (2) partners who have not played
together yet this session. This is the same mixer logic the tournament uses, fed
by this session's own game log.

Each court has an optional 12-minute timer. The organiser enters the final score
and taps record: stats update, the game is appended to the session log, the four
players rejoin the back of the queue, and the court auto-fills with the next
four.

Scores are validated by the existing `assertScores` (finite, non-negative).

## 7. Live board

- **Now Playing / Next Up** — every open court with its two teams, plus the next
  four in line. Designed to be readable on a tablet propped on the fence.
- **Leaderboard** — currently checked-in players ranked by wins, then point
  differential, then total points scored (the same rule as the tournament), with
  games played shown. Players marked done drop off the live leaderboard but still
  appear in the end-of-session summary.
- **Queue list** — full waiting order, so anyone can see their position.

Viewers see all three read-only, refreshed on the existing ~3s poll.

## 8. Editing mistakes

A **Games** list for the session mirrors the tournament's: every recorded game
with an editable score. Correcting a score recomputes stats. Editing a score
never reorders the queue, because in open play the result has no bearing on who
plays next.

## 9. Self check-in endpoint

`POST /api/open-play/checkin` — the only route in the app that writes without a
passcode. It is deliberately minimal:

- accepts `{ name, skill }` only; it cannot alter courts, scores, or other players;
- name is trimmed, must be non-empty, max 30 characters;
- rejected unless the session is `running`;
- rejected when the session already has 60 players.

The blast radius is limited to adding a name to a waiting list, and the organiser
can remove any entry. This is an acceptable trade for a friendly club session; it
is not a security boundary and the spec does not treat it as one.

All other writes go through `POST /api/open-play/state` with the existing
passcode header and version guard.

## 10. State model

```jsonc
{
  "version": 7,
  "updatedAt": 1699999999999,
  "phase": "running",              // "idle" | "running" | "ended"
  "courts": [
    { "id": "c1", "label": "Court 1", "open": true,
      "team1": ["p1","p2"], "team2": ["p3","p4"], "timerStartedAt": null }
  ],
  "players": [
    { "id": "p1", "name": "Igi", "skill": "intermediate", "resting": false }
  ],
  "queue": ["p5", "p6", "p7"],     // FIFO order of waiting players
  "stats": { "p1": { "gp": 0, "w": 0, "pf": 0, "pa": 0 } },
  "games": [
    { "courtId": "c1", "team1": ["p1","p2"], "team2": ["p3","p4"],
      "score1": 11, "score2": 7, "ts": 1699999999999 }
  ],
  "lastSummary": null              // set on End session
}
```

Players on court are referenced by the courts; `queue` holds only those waiting.
A player is therefore in exactly one of: on a court, in the queue, or resting.

## 11. File structure

```
src/lib/openPlay/types.ts        # OpenPlayState and friends
src/lib/openPlay/state.ts        # createInitialOpenPlayState()
src/lib/openPlay/engine.ts       # pure logic: check-in, queue, fill, record, edit
src/lib/openPlay/engine.test.ts  # unit tests
src/lib/openPlay/kv.ts           # read/write the open-play record
src/app/api/open-play/state/route.ts    # GET + passcode-gated POST
src/app/api/open-play/checkin/route.ts  # narrow public POST (§9)
src/app/open-play/page.tsx              # page shell + tabs
src/hooks/useOpenPlay.ts                # poll + optimistic write (mirrors useTournament)
src/components/openPlay/CheckInCard.tsx # "I'm here" + organiser roster controls
src/components/openPlay/CourtsBoard.tsx # now playing + next up
src/components/openPlay/QueueList.tsx
src/components/openPlay/LeaderboardScreen.tsx
src/components/openPlay/SessionBar.tsx  # start/end session, court count
```

`pairFour`, `partnerHistory`, `assertScores` and `CourtTimer` / `ScoreEntry` are
imported from the existing tournament code rather than duplicated.

## 12. Out of scope (YAGNI)

- Court bookings, scheduling, or fixed time slots.
- Payments, attendance fees, or member records.
- User accounts (the passcode remains the only gate).
- History beyond the single most recent session summary.
- Enforcing skill-restricted courts (a court can be *labelled*, but the shared
  queue still feeds every court).

## 13. Testing

**Engine unit tests (pure functions):**
- check-in appends to the back; duplicate names allowed; blank rejected.
- FIFO: recorded game sends its four to the back; next four come off the front.
- auto-fill runs only when a court is open, empty, and four are waiting.
- resting removes from the queue; returning appends to the back.
- a player on court cannot be removed or set resting.
- pairing: both teams get an even skill split; partners are fresh.
- scoring updates gp/w/pf/pa; invalid scores throw.
- editing a past score recomputes stats and leaves the queue untouched.
- ending a session produces a summary and preserves it through the next start.

**API tests:** check-in rejects blank/oversized names, rejects when not running,
rejects past the player cap, and cannot modify anything but the roster; state
route keeps the passcode and version guard.

**Manual smoke test:** start a session on 2 courts, self check in 6 players from a
second browser tab, confirm auto-fill and the queue order, record a game, confirm
rotation and leaderboard, edit a score, end the session and read the summary.
