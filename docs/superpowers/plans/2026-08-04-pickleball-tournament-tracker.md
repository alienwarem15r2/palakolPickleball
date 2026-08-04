# Pickleball Tournament Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first web app that runs and live-tracks a 23-player, 2-court pickleball mini-tournament (split pools → King-of-the-Court rotation → 8-player doubles finals), deployable on Vercel.

**Architecture:** Next.js (App Router) app on Vercel. The entire tournament is one JSON object stored in Vercel KV. All tournament logic lives in pure client-side engine functions (fully unit-tested). Viewers poll `GET /api/state` every ~3s (read-only); the organizer unlocks edit mode with a passcode and writes via `POST /api/state`, which validates the passcode server-side and rejects stale writes by version.

**Tech Stack:** TypeScript, Next.js 14 (App Router), React, Vercel KV (`@vercel/kv`), Vitest for unit tests, plain CSS (no UI framework).

---

## File Structure

```
package.json                     # deps + scripts
tsconfig.json                    # TS config
next.config.mjs                  # Next config
vitest.config.ts                 # Vitest config
.gitignore
.env.example                     # documents required env vars
README.md                        # setup + Vercel/KV deploy steps

src/
  lib/
    types.ts                     # all TournamentState types
    initialData.ts               # 23 preloaded players + default A/B pools
    state.ts                     # createInitialState()
    engine.ts                    # pure logic: stats, rotation, standings, finals
    engine.test.ts               # Vitest unit tests for engine
    kv.ts                        # server-only KV read/write of the state blob
  app/
    api/state/route.ts           # GET (read) + POST (passcode-gated write)
    api/state/route.test.ts      # route tests (mocked KV)
    layout.tsx                   # root layout
    globals.css                  # styles
    page.tsx                     # dashboard shell (phase router + edit-mode)
  hooks/
    useTournament.ts             # client: poll state, optimistic write, undo stack
  components/
    EditModeBar.tsx              # passcode unlock + reset
    SetupScreen.tsx              # roster + pools + seed courts + start
    CourtsScreen.tsx             # both courts: match, score entry, queue, timer
    CourtCard.tsx                # one court (used by CourtsScreen)
    CourtTimer.tsx               # 12-min countdown
    StandingsScreen.tsx          # Pool A/B tables
    FinalsScreen.tsx             # seeded teams + semis + final + champion
    ScoreEntry.tsx               # reusable two-number score input
```

**Rule for all tasks:** run commands from the project root `D:\Claude\Pickleball\Mini tournament web`. Commit after each task.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pickleball-tournament-tracker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vercel/kv": "^2.0.0",
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "typescript": "5.5.3",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
.next
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 6: Create `.env.example`**

```
# Vercel KV connection (auto-added by Vercel when you attach a KV store).
KV_REST_API_URL=
KV_REST_API_TOKEN=
# Passcode the organizer types to unlock edit mode.
ORGANIZER_PASSCODE=changeme
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: dependencies install, `node_modules` created, no fatal errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Vitest project"
```

---

### Task 2: Types, initial data, and initial state

**Files:**
- Create: `src/lib/types.ts`, `src/lib/initialData.ts`, `src/lib/state.ts`
- Test: `src/lib/engine.test.ts` (create with the first test)

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export type Pool = "A" | "B";
export type Phase = "setup" | "rotation" | "finals";
export type Skill = "novice" | "intermediate";

export interface Player {
  id: string;
  name: string;
  pool: Pool | null;
  skill?: Skill;
}

export interface PlayerStats {
  gp: number; // games played
  w: number; // wins
  pf: number; // points for
  pa: number; // points against
}

export type Team = [string, string]; // two player ids

export interface CourtState {
  team1: Team | null;
  team2: Team | null;
  queue: string[];
  timerStartedAt: number | null;
}

export interface Game {
  court: Pool;
  team1: Team;
  team2: Team;
  score1: number;
  score2: number;
  ts: number;
}

export interface FinalsTeam {
  seedPair: [number, number]; // e.g. [1, 8]
  players: Team;
}

export interface Match {
  teamA: number | null; // index into finals.teams
  teamB: number | null;
  score1: number | null;
  score2: number | null;
}

export interface Finals {
  finalists: { A: string[]; B: string[] };
  teams: FinalsTeam[];
  matches: { semi1: Match; semi2: Match; final: Match };
  champion: number | null; // index into finals.teams
}

export interface TournamentState {
  version: number;
  phase: Phase;
  updatedAt: number;
  players: Player[];
  stats: Record<string, PlayerStats>;
  courts: { A: CourtState; B: CourtState };
  games: Game[];
  finals: Finals;
}
```

- [ ] **Step 2: Create `src/lib/initialData.ts`**

```ts
import { Player, Pool } from "./types";

// Preloaded roster + default skill-balanced split from the tournament doc.
// Organizer can edit names, pools, and skill during Setup.
const A: [string, "novice" | "intermediate"][] = [
  ["Ina", "intermediate"], ["Kaye", "intermediate"], ["Mauie", "novice"],
  ["Richard", "intermediate"], ["Tsiki", "novice"], ["Kye", "novice"],
  ["Charm", "novice"], ["Lai", "novice"], ["Raphy", "novice"],
  ["Jaja", "novice"], ["Goody", "novice"], ["Coy", "novice"],
];
const B: [string, "novice" | "intermediate"][] = [
  ["Igi", "intermediate"], ["Yas", "intermediate"], ["Ma-ann", "novice"],
  ["May", "novice"], ["Ten", "novice"], ["Ruben", "novice"],
  ["Bot", "novice"], ["Hans", "novice"], ["There", "novice"],
  ["Ayma", "novice"], ["Kathy", "novice"],
];

export function initialPlayers(): Player[] {
  const players: Player[] = [];
  let n = 1;
  const push = (list: typeof A, pool: Pool) => {
    for (const [name, skill] of list) {
      players.push({ id: `p${n++}`, name, pool, skill });
    }
  };
  push(A, "A");
  push(B, "B");
  return players;
}
```

- [ ] **Step 3: Create `src/lib/state.ts`**

```ts
import { PlayerStats, TournamentState } from "./types";
import { initialPlayers } from "./initialData";

export function createInitialState(): TournamentState {
  const players = initialPlayers();
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  const emptyCourt = () => ({
    team1: null,
    team2: null,
    queue: [] as string[],
    timerStartedAt: null,
  });
  return {
    version: 1,
    phase: "setup",
    updatedAt: Date.now(),
    players,
    stats,
    courts: { A: emptyCourt(), B: emptyCourt() },
    games: [],
    finals: {
      finalists: { A: [], B: [] },
      teams: [],
      matches: {
        semi1: { teamA: null, teamB: null, score1: null, score2: null },
        semi2: { teamA: null, teamB: null, score1: null, score2: null },
        final: { teamA: null, teamB: null, score1: null, score2: null },
      },
      champion: null,
    },
  };
}
```

- [ ] **Step 4: Write the failing test for initial state — create `src/lib/engine.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";

describe("createInitialState", () => {
  it("has 23 players split 12/11 into pools A/B with zeroed stats", () => {
    const s = createInitialState();
    expect(s.players).toHaveLength(23);
    expect(s.players.filter((p) => p.pool === "A")).toHaveLength(12);
    expect(s.players.filter((p) => p.pool === "B")).toHaveLength(11);
    expect(s.phase).toBe("setup");
    for (const p of s.players) {
      expect(s.stats[p.id]).toEqual({ gp: 0, w: 0, pf: 0, pa: 0 });
    }
    // ids are unique
    expect(new Set(s.players.map((p) => p.id)).size).toBe(23);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test`
Expected: PASS (implementation already written in steps 1–3).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tournament types, preloaded roster, and initial state"
```

---

### Task 3: Engine — record a rotation game (stat accumulation)

**Files:**
- Create: `src/lib/engine.ts`
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Write the failing test — append to `src/lib/engine.test.ts`**

```ts
import { recordRotationGame } from "./engine";

describe("recordRotationGame — stats", () => {
  function seededRotationState() {
    const s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = ["p5", "p6", "p7", "p8"];
    return s;
  }

  it("updates gp, w, pf, pa for all four players", () => {
    const s = seededRotationState();
    const next = recordRotationGame(s, "A", 11, 7);
    // winners p1,p2
    expect(next.stats.p1).toEqual({ gp: 1, w: 1, pf: 11, pa: 7 });
    expect(next.stats.p2).toEqual({ gp: 1, w: 1, pf: 11, pa: 7 });
    // losers p3,p4
    expect(next.stats.p3).toEqual({ gp: 1, w: 0, pf: 7, pa: 11 });
    expect(next.stats.p4).toEqual({ gp: 1, w: 0, pf: 7, pa: 11 });
  });

  it("appends the game to the log and does not mutate the input state", () => {
    const s = seededRotationState();
    const next = recordRotationGame(s, "A", 11, 9);
    expect(next.games).toHaveLength(1);
    expect(next.games[0]).toMatchObject({
      court: "A", team1: ["p1", "p2"], team2: ["p3", "p4"], score1: 11, score2: 9,
    });
    expect(s.games).toHaveLength(0); // input unchanged
    expect(next.version).toBe(s.version); // engine does not bump version (API does)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `recordRotationGame` is not exported / not defined.

- [ ] **Step 3: Create `src/lib/engine.ts` with a minimal implementation**

```ts
import { CourtState, Pool, PlayerStats, Team, TournamentState } from "./types";

function cloneStats(stats: Record<string, PlayerStats>) {
  const out: Record<string, PlayerStats> = {};
  for (const k in stats) out[k] = { ...stats[k] };
  return out;
}

function applyGame(
  stats: Record<string, PlayerStats>,
  team1: Team,
  team2: Team,
  score1: number,
  score2: number
) {
  const winners = score1 >= score2 ? team1 : team2;
  for (const id of team1) {
    stats[id].gp += 1;
    stats[id].pf += score1;
    stats[id].pa += score2;
  }
  for (const id of team2) {
    stats[id].gp += 1;
    stats[id].pf += score2;
    stats[id].pa += score1;
  }
  for (const id of winners) stats[id].w += 1;
}

export function recordRotationGame(
  state: TournamentState,
  court: Pool,
  score1: number,
  score2: number
): TournamentState {
  const c = state.courts[court];
  if (!c.team1 || !c.team2) throw new Error(`Court ${court} has no active game`);
  const team1 = c.team1;
  const team2 = c.team2;

  const stats = cloneStats(state.stats);
  applyGame(stats, team1, team2, score1, score2);

  const games = [
    ...state.games,
    { court, team1, team2, score1, score2, ts: Date.now() },
  ];

  const nextCourt = advanceCourt(c, stats, team1, team2, score1, score2);

  return {
    ...state,
    stats,
    games,
    courts: { ...state.courts, [court]: nextCourt },
    updatedAt: Date.now(),
  };
}

// Placeholder — implemented in Task 4.
function advanceCourt(
  court: CourtState,
  _stats: Record<string, PlayerStats>,
  _team1: Team,
  _team2: Team,
  _score1: number,
  _score2: number
): CourtState {
  return court;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS for the two "stats" tests (court transition still a no-op, tested next task).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): record rotation game stat accumulation"
```

---

### Task 4: Engine — court transition (winner stays, loser to queue, fewest-games next-up)

**Files:**
- Modify: `src/lib/engine.ts` (replace `advanceCourt`, add `selectNextChallengers`)
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Write the failing tests — append to `src/lib/engine.test.ts`**

```ts
import { selectNextChallengers } from "./engine";

describe("selectNextChallengers — fairness (fewest games played)", () => {
  it("picks the two queue members with the fewest games played", () => {
    const stats = {
      p5: { gp: 2, w: 0, pf: 0, pa: 0 },
      p6: { gp: 0, w: 0, pf: 0, pa: 0 },
      p7: { gp: 1, w: 0, pf: 0, pa: 0 },
      p8: { gp: 0, w: 0, pf: 0, pa: 0 },
    } as any;
    // p6 and p8 have 0 games -> chosen
    expect(selectNextChallengers(["p5", "p6", "p7", "p8"], stats)).toEqual(["p6", "p8"]);
  });

  it("breaks ties by longest wait (earliest queue index)", () => {
    const stats = {
      p5: { gp: 1, w: 0, pf: 0, pa: 0 },
      p6: { gp: 1, w: 0, pf: 0, pa: 0 },
      p7: { gp: 1, w: 0, pf: 0, pa: 0 },
    } as any;
    // all equal -> first two in queue order
    expect(selectNextChallengers(["p5", "p6", "p7"], stats)).toEqual(["p5", "p6"]);
  });

  it("returns null when fewer than two are waiting", () => {
    expect(selectNextChallengers(["p5"], {} as any)).toBeNull();
  });
});

describe("recordRotationGame — court transition", () => {
  function seeded() {
    const s = createInitialState();
    s.phase = "rotation";
    s.courts.A.team1 = ["p1", "p2"];
    s.courts.A.team2 = ["p3", "p4"];
    s.courts.A.queue = ["p5", "p6", "p7", "p8"];
    return s;
  }

  it("keeps winners on court, sends losers to back of queue, pulls next-up as new team", () => {
    const s = seeded();
    const next = recordRotationGame(s, "A", 11, 7); // team1 (p1,p2) win
    const c = next.courts.A;
    expect(c.team1).toEqual(["p1", "p2"]); // winners stay
    // losers p3,p4 appended after remaining queue; next-up p5,p6 pulled out
    expect(c.team2).toEqual(["p5", "p6"]);
    expect(c.queue).toEqual(["p7", "p8", "p3", "p4"]);
    expect(c.timerStartedAt).toBeNull();
  });

  it("when team2 wins, they become the staying team1", () => {
    const s = seeded();
    const next = recordRotationGame(s, "A", 7, 11); // team2 (p3,p4) win
    const c = next.courts.A;
    expect(c.team1).toEqual(["p3", "p4"]); // winners become team1
    expect(c.team2).toEqual(["p5", "p6"]);
    expect(c.queue).toEqual(["p7", "p8", "p1", "p2"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `selectNextChallengers` undefined; transition assertions fail (advanceCourt is a no-op).

- [ ] **Step 3: Replace `advanceCourt` and add `selectNextChallengers` in `src/lib/engine.ts`**

Replace the placeholder `advanceCourt` function with:

```ts
export function selectNextChallengers(
  queue: string[],
  stats: Record<string, PlayerStats>
): Team | null {
  if (queue.length < 2) return null;
  const ranked = queue
    .map((id, index) => ({ id, index, gp: stats[id]?.gp ?? 0 }))
    .sort((a, b) => a.gp - b.gp || a.index - b.index);
  return [ranked[0].id, ranked[1].id];
}

function advanceCourt(
  court: CourtState,
  stats: Record<string, PlayerStats>,
  team1: Team,
  team2: Team,
  score1: number,
  score2: number
): CourtState {
  const winners: Team = score1 >= score2 ? team1 : team2;
  const losers: Team = score1 >= score2 ? team2 : team1;

  // Losers go to the back of the queue.
  const queueWithLosers = [...court.queue, ...losers];

  const challengers = selectNextChallengers(queueWithLosers, stats);
  if (!challengers) {
    // Not enough players waiting: keep winners on, no opponent yet.
    return { ...court, team1: winners, team2: null, queue: queueWithLosers, timerStartedAt: null };
  }
  const remaining = queueWithLosers.filter((id) => !challengers.includes(id));
  return { team1: winners, team2: challengers, queue: remaining, timerStartedAt: null };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (all engine tests so far).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): winner-stays rotation with fewest-games next-up"
```

---

### Task 5: Engine — standings

**Files:**
- Modify: `src/lib/engine.ts` (add `standings`)
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Write the failing test — append to `src/lib/engine.test.ts`**

```ts
import { standings } from "./engine";

describe("standings", () => {
  it("sorts a pool by wins desc, then point differential desc", () => {
    const s = createInitialState();
    // Use pool A's first three players for a focused check.
    s.stats.p1 = { gp: 3, w: 3, pf: 33, pa: 20 }; // pd +13
    s.stats.p2 = { gp: 3, w: 2, pf: 30, pa: 25 }; // pd +5
    s.stats.p3 = { gp: 3, w: 2, pf: 30, pa: 28 }; // pd +2
    const rows = standings(s, "A");
    const ids = rows.map((r) => r.playerId);
    // p1 (3 wins) first; p2 and p3 both 2 wins -> higher pd (p2) before p3
    expect(ids.indexOf("p1")).toBe(0);
    expect(ids.indexOf("p2")).toBeLessThan(ids.indexOf("p3"));
    expect(rows[0]).toMatchObject({ playerId: "p1", gp: 3, w: 3, pd: 13 });
  });

  it("only includes players from the requested pool", () => {
    const s = createInitialState();
    const rows = standings(s, "A");
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => s.players.find((p) => p.id === r.playerId)?.pool === "A")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `standings` is not defined.

- [ ] **Step 3: Add `standings` to `src/lib/engine.ts`**

```ts
import { Player, Pool } from "./types"; // extend existing import line

export interface StandingRow {
  playerId: string;
  name: string;
  gp: number;
  w: number;
  pd: number; // point differential = pf - pa
}

export function standings(state: TournamentState, pool: Pool): StandingRow[] {
  return state.players
    .filter((p) => p.pool === pool)
    .map((p) => {
      const st = state.stats[p.id];
      return { playerId: p.id, name: p.name, gp: st.gp, w: st.w, pd: st.pf - st.pa };
    })
    .sort((a, b) => b.w - a.w || b.pd - a.pd || a.name.localeCompare(b.name));
}
```

Note: ensure `Player` and `Pool` are imported (merge into the existing import from `./types`).

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): pool standings sorted by wins then point diff"
```

---

### Task 6: Engine — qualify finalists (with tie flag)

**Files:**
- Modify: `src/lib/engine.ts` (add `qualifyFinalists`)
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Write the failing test — append to `src/lib/engine.test.ts`**

```ts
import { qualifyFinalists } from "./engine";

describe("qualifyFinalists", () => {
  it("returns top 4 by wins (tiebreak pd) from each pool", () => {
    const s = createInitialState();
    const a = s.players.filter((p) => p.pool === "A").map((p) => p.id);
    // Give A's players descending wins so order is deterministic.
    a.forEach((id, i) => (s.stats[id] = { gp: 5, w: 12 - i, pf: 50, pa: 40 }));
    const b = s.players.filter((p) => p.pool === "B").map((p) => p.id);
    b.forEach((id, i) => (s.stats[id] = { gp: 5, w: 11 - i, pf: 50, pa: 40 }));
    const res = qualifyFinalists(s);
    expect(res.A).toEqual(a.slice(0, 4));
    expect(res.B).toEqual(b.slice(0, 4));
    expect(res.tie).toBe(false);
  });

  it("flags a tie when the 4th and 5th players are equal on wins AND point diff", () => {
    const s = createInitialState();
    const a = s.players.filter((p) => p.pool === "A").map((p) => p.id);
    // Make positions 4 and 5 identical (same w and pd).
    a.forEach((id, i) => {
      const w = i < 3 ? 10 : 5; // top 3 clear, rest tied at 5 wins
      s.stats[id] = { gp: 5, w, pf: 30, pa: 20 }; // identical pd for the tied group
    });
    const res = qualifyFinalists(s);
    expect(res.tie).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `qualifyFinalists` is not defined.

- [ ] **Step 3: Add `qualifyFinalists` to `src/lib/engine.ts`**

```ts
export interface FinalistResult {
  A: string[];
  B: string[];
  tie: boolean;
}

function poolHasCutTie(rows: StandingRow[]): boolean {
  if (rows.length <= 4) return false;
  const fourth = rows[3];
  const fifth = rows[4];
  return fourth.w === fifth.w && fourth.pd === fifth.pd;
}

export function qualifyFinalists(state: TournamentState): FinalistResult {
  const aRows = standings(state, "A");
  const bRows = standings(state, "B");
  return {
    A: aRows.slice(0, 4).map((r) => r.playerId),
    B: bRows.slice(0, 4).map((r) => r.playerId),
    tie: poolHasCutTie(aRows) || poolHasCutTie(bRows),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): qualify top-4 finalists per pool with tie flag"
```

---

### Task 7: Engine — seeding, team pairing, and bracket advancement

**Files:**
- Modify: `src/lib/engine.ts` (add `seedFinalists`, `buildSeededTeams`, `shuffleTeams`, `startFinals`, `recordFinalsMatch`)
- Test: `src/lib/engine.test.ts` (append)

- [ ] **Step 1: Write the failing tests — append to `src/lib/engine.test.ts`**

```ts
import {
  seedFinalists, buildSeededTeams, startFinals, recordFinalsMatch,
} from "./engine";

describe("finals seeding and bracket", () => {
  const A = ["a1", "a2", "a3", "a4"];
  const B = ["b1", "b2", "b3", "b4"];

  it("interleaves pools into seeds 1..8", () => {
    // seed1=a1, seed2=b1, seed3=a2, seed4=b2, seed5=a3, seed6=b3, seed7=a4, seed8=b4
    expect(seedFinalists(A, B)).toEqual(["a1", "b1", "a2", "b2", "a3", "b3", "a4", "b4"]);
  });

  it("builds seeded teams 1&8, 4&5, 3&6, 2&7", () => {
    const seeded = seedFinalists(A, B); // index i = seed i+1
    const teams = buildSeededTeams(seeded);
    expect(teams.map((t) => t.seedPair)).toEqual([[1, 8], [4, 5], [3, 6], [2, 7]]);
    expect(teams[0].players).toEqual([seeded[0], seeded[7]]); // seeds 1 & 8
    expect(teams[1].players).toEqual([seeded[3], seeded[4]]); // seeds 4 & 5
  });

  it("startFinals sets phase, teams, and semifinal pairings (team0v1, team2v3)", () => {
    const s = createInitialState();
    const withFinalists = { ...s, finals: { ...s.finals, finalists: { A, B } } };
    const next = startFinals(withFinalists, buildSeededTeams(seedFinalists(A, B)));
    expect(next.phase).toBe("finals");
    expect(next.finals.matches.semi1).toMatchObject({ teamA: 0, teamB: 1 });
    expect(next.finals.matches.semi2).toMatchObject({ teamA: 2, teamB: 3 });
  });

  it("advances semi winners into the final and records the champion", () => {
    const s = createInitialState();
    let st = startFinals(
      { ...s, finals: { ...s.finals, finalists: { A, B } } },
      buildSeededTeams(seedFinalists(A, B))
    );
    st = recordFinalsMatch(st, "semi1", 11, 6); // team0 wins
    st = recordFinalsMatch(st, "semi2", 8, 11); // team3 wins
    expect(st.finals.matches.final).toMatchObject({ teamA: 0, teamB: 3 });
    st = recordFinalsMatch(st, "final", 11, 9); // team0 champion
    expect(st.finals.champion).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — the new functions are undefined.

- [ ] **Step 3: Add the functions to `src/lib/engine.ts`**

```ts
import { FinalsTeam, Match } from "./types"; // merge into existing ./types import

export function seedFinalists(a: string[], b: string[]): string[] {
  const seeded: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (a[i]) seeded.push(a[i]);
    if (b[i]) seeded.push(b[i]);
  }
  return seeded; // index 0 = seed 1, ... index 7 = seed 8
}

// Pairings by seed number: 1&8, 4&5, 3&6, 2&7 (seed n -> index n-1).
const SEED_PAIRS: [number, number][] = [[1, 8], [4, 5], [3, 6], [2, 7]];

export function buildSeededTeams(seeded: string[]): FinalsTeam[] {
  return SEED_PAIRS.map(([s1, s2]) => ({
    seedPair: [s1, s2] as [number, number],
    players: [seeded[s1 - 1], seeded[s2 - 1]] as Team,
  }));
}

export function shuffleTeams(seeded: string[]): FinalsTeam[] {
  const pool = [...seeded];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [0, 1, 2, 3].map((k) => ({
    seedPair: [0, 0] as [number, number], // random draw: seeds not meaningful
    players: [pool[k * 2], pool[k * 2 + 1]] as Team,
  }));
}

export function startFinals(state: TournamentState, teams: FinalsTeam[]): TournamentState {
  return {
    ...state,
    phase: "finals",
    finals: {
      ...state.finals,
      teams,
      matches: {
        semi1: { teamA: 0, teamB: 1, score1: null, score2: null },
        semi2: { teamA: 2, teamB: 3, score1: null, score2: null },
        final: { teamA: null, teamB: null, score1: null, score2: null },
      },
      champion: null,
    },
    updatedAt: Date.now(),
  };
}

function winnerIndex(m: Match): number | null {
  if (m.teamA === null || m.teamB === null || m.score1 === null || m.score2 === null) return null;
  return m.score1 >= m.score2 ? m.teamA : m.teamB;
}

export function recordFinalsMatch(
  state: TournamentState,
  key: "semi1" | "semi2" | "final",
  score1: number,
  score2: number
): TournamentState {
  const matches = {
    semi1: { ...state.finals.matches.semi1 },
    semi2: { ...state.finals.matches.semi2 },
    final: { ...state.finals.matches.final },
  };
  matches[key] = { ...matches[key], score1, score2 };

  let champion = state.finals.champion;
  if (key === "final") {
    champion = winnerIndex(matches.final);
  } else {
    // If both semis are decided, populate the final.
    const w1 = winnerIndex(matches.semi1);
    const w2 = winnerIndex(matches.semi2);
    if (w1 !== null && w2 !== null) {
      matches.final = { teamA: w1, teamB: w2, score1: null, score2: null };
    }
  }

  return {
    ...state,
    finals: { ...state.finals, matches, champion },
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (entire engine suite green).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): finals seeding, pairing, and bracket advancement"
```

---

### Task 8: KV storage + API route (GET read, POST passcode-gated write)

**Files:**
- Create: `src/lib/kv.ts`, `src/app/api/state/route.ts`
- Test: `src/app/api/state/route.test.ts`

- [ ] **Step 1: Create `src/lib/kv.ts`**

```ts
import { kv } from "@vercel/kv";
import { TournamentState } from "./types";
import { createInitialState } from "./state";

const KEY = "tournament:state";

export async function readState(): Promise<TournamentState> {
  const existing = await kv.get<TournamentState>(KEY);
  if (existing) return existing;
  const fresh = createInitialState();
  await kv.set(KEY, fresh);
  return fresh;
}

export async function writeState(state: TournamentState): Promise<void> {
  await kv.set(KEY, state);
}
```

- [ ] **Step 2: Write the failing route test — create `src/app/api/state/route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialState } from "@/lib/state";

// In-memory fake KV shared across the route module.
const store: Record<string, unknown> = {};
vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (k: string) => store[k] ?? null),
    set: vi.fn(async (k: string, v: unknown) => { store[k] = v; }),
  },
}));

const PASS = "secret";
beforeEach(() => {
  for (const k in store) delete store[k];
  process.env.ORGANIZER_PASSCODE = PASS;
  vi.resetModules();
});

async function loadRoute() {
  return await import("./route");
}

describe("POST /api/state", () => {
  it("rejects writes with a wrong passcode (401)", async () => {
    const { POST } = await loadRoute();
    const body = createInitialState();
    const res = await POST(new Request("http://x/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": "wrong" },
      body: JSON.stringify(body),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects a stale version (409)", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json(); // version 1 stored
    const stale = { ...current, version: 0 }; // client thinks it's older
    const res = await POST(new Request("http://x/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": PASS },
      body: JSON.stringify(stale),
    }));
    expect(res.status).toBe(409);
  });

  it("accepts a matching-version write and bumps the stored version", async () => {
    const { GET, POST } = await loadRoute();
    const current = await (await GET()).json(); // version 1
    const res = await POST(new Request("http://x/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": PASS },
      body: JSON.stringify(current),
    }));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.version).toBe(current.version + 1);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `./route` has no `GET`/`POST` exports yet.

- [ ] **Step 4: Create `src/app/api/state/route.ts`**

```ts
import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/kv";
import { TournamentState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const passcode = req.headers.get("x-passcode");
  if (!process.env.ORGANIZER_PASSCODE || passcode !== process.env.ORGANIZER_PASSCODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const incoming = (await req.json()) as TournamentState;
  const current = await readState();

  if (incoming.version !== current.version) {
    return NextResponse.json(
      { error: "stale", current },
      { status: 409 }
    );
  }

  const saved: TournamentState = {
    ...incoming,
    version: current.version + 1,
    updatedAt: Date.now(),
  };
  await writeState(saved);
  return NextResponse.json(saved);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS (route + engine suites).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): KV-backed state route with passcode + version guard"
```

---

### Task 9: Client hook — polling, optimistic writes, undo stack

**Files:**
- Create: `src/hooks/useTournament.ts`

- [ ] **Step 1: Create `src/hooks/useTournament.ts`**

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TournamentState } from "@/lib/types";

const POLL_MS = 3000;
const PASS_KEY = "organizer-passcode";

export function useTournament() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [passcode, setPasscodeState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoStack = useRef<TournamentState[]>([]);
  const editing = passcode !== null;

  useEffect(() => {
    setPasscodeState(localStorage.getItem(PASS_KEY));
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = (await res.json()) as TournamentState;
      // Don't stomp a newer local optimistic state with an older poll.
      setState((prev) => (prev && prev.version > data.version ? prev : data));
    } catch {
      /* transient network error; keep last state */
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  const setPasscode = useCallback((code: string) => {
    localStorage.setItem(PASS_KEY, code);
    setPasscodeState(code);
  }, []);

  const clearPasscode = useCallback(() => {
    localStorage.removeItem(PASS_KEY);
    setPasscodeState(null);
  }, []);

  // Apply a pure transform, push previous onto undo stack, persist optimistically.
  const commit = useCallback(
    async (transform: (s: TournamentState) => TournamentState) => {
      if (!state || !passcode) return;
      const previous = state;
      const next = transform(state);
      undoStack.current.push(previous);
      setState(next);
      setError(null);
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": passcode },
        body: JSON.stringify(next),
      });
      if (res.status === 401) { setError("Wrong passcode."); return; }
      if (res.status === 409) {
        const { current } = await res.json();
        setState(current);
        setError("Someone else updated first — reloaded latest. Re-apply your change.");
        return;
      }
      const saved = (await res.json()) as TournamentState;
      setState(saved);
    },
    [state, passcode]
  );

  const undo = useCallback(async () => {
    const previous = undoStack.current.pop();
    if (!previous || !passcode) return;
    // Re-post the previous snapshot at the CURRENT version so the server accepts it.
    const res = await fetch("/api/state", { cache: "no-store" });
    const live = (await res.json()) as TournamentState;
    const restore = { ...previous, version: live.version };
    await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": passcode },
      body: JSON.stringify(restore),
    });
    fetchState();
  }, [passcode, fetchState]);

  return { state, editing, error, setPasscode, clearPasscode, commit, undo, refetch: fetchState };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(client): useTournament hook with polling, optimistic write, undo"
```

---

### Task 10: App shell, layout, styles, and edit-mode bar

**Files:**
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/components/EditModeBar.tsx`

- [ ] **Step 1: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pickleball Mini-Tournament",
  description: "Live tournament tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `src/app/globals.css`**

```css
:root {
  --bg: #0f172a; --card: #1e293b; --line: #334155;
  --text: #e2e8f0; --muted: #94a3b8; --accent: #22c55e; --accent2: #38bdf8;
  --warn: #f59e0b; --danger: #ef4444;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.container { max-width: 960px; margin: 0 auto; padding: 12px; }
.tabs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.tab { padding: 8px 14px; border-radius: 999px; background: var(--card);
  border: 1px solid var(--line); color: var(--text); cursor: pointer; }
.tab.active { background: var(--accent2); color: #06283d; font-weight: 600; }
.card { background: var(--card); border: 1px solid var(--line);
  border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
button.btn { background: var(--accent); color: #052e16; border: none;
  padding: 9px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
button.btn.secondary { background: var(--card); color: var(--text); border: 1px solid var(--line); }
button.btn.warn { background: var(--warn); color: #3a2a00; }
button.btn.danger { background: var(--danger); color: #fff; }
input, select { background: #0b1220; color: var(--text);
  border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
.muted { color: var(--muted); }
.pill { padding: 2px 8px; border-radius: 999px; background: #0b1220; border: 1px solid var(--line); font-size: 12px; }
.err { color: var(--danger); margin: 8px 0; }
.nextup { color: var(--accent); font-weight: 600; }
.champion { font-size: 1.3rem; color: var(--accent); font-weight: 700; }
```

- [ ] **Step 3: Create `src/components/EditModeBar.tsx`**

```tsx
"use client";
import { useState } from "react";

export function EditModeBar(props: {
  editing: boolean;
  onUnlock: (code: string) => void;
  onLock: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="card row" style={{ justifyContent: "space-between" }}>
      {props.editing ? (
        <>
          <span className="pill" style={{ color: "var(--accent)" }}>● Organizer mode</span>
          <span className="row">
            <button className="btn secondary" onClick={props.onUndo}>Undo</button>
            <button className="btn danger" onClick={props.onReset}>Reset</button>
            <button className="btn secondary" onClick={props.onLock}>Lock</button>
          </span>
        </>
      ) : (
        <span className="row">
          <input
            type="password" placeholder="Organizer passcode" value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn" onClick={() => props.onUnlock(code)}>Unlock edit</button>
          <span className="muted">Viewers see live updates automatically.</span>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/page.tsx` (shell wiring; screen components added in later tasks)**

```tsx
"use client";
import { useState } from "react";
import { useTournament } from "@/hooks/useTournament";
import { EditModeBar } from "@/components/EditModeBar";
import { createInitialState } from "@/lib/state";
import { SetupScreen } from "@/components/SetupScreen";
import { CourtsScreen } from "@/components/CourtsScreen";
import { StandingsScreen } from "@/components/StandingsScreen";
import { FinalsScreen } from "@/components/FinalsScreen";

type Tab = "courts" | "standings" | "finals" | "setup";

export default function Page() {
  const t = useTournament();
  const [tab, setTab] = useState<Tab>("courts");

  if (!t.state) return <div className="container">Loading…</div>;
  const phase = t.state.phase;

  return (
    <div className="container">
      <h1>🏓 Pickleball Mini-Tournament</h1>
      {t.editing && (
        <div className="tabs">
          {(["setup", "courts", "standings", "finals"] as Tab[]).map((x) => (
            <button key={x} className={`tab ${tab === x ? "active" : ""}`} onClick={() => setTab(x)}>
              {x[0].toUpperCase() + x.slice(1)}
            </button>
          ))}
        </div>
      )}
      {!t.editing && (
        <div className="tabs">
          {(["courts", "standings", "finals"] as Tab[]).map((x) => (
            <button key={x} className={`tab ${tab === x ? "active" : ""}`} onClick={() => setTab(x)}>
              {x[0].toUpperCase() + x.slice(1)}
            </button>
          ))}
        </div>
      )}

      <EditModeBar
        editing={t.editing}
        onUnlock={t.setPasscode}
        onLock={t.clearPasscode}
        onUndo={t.undo}
        onReset={() => {
          if (confirm("Reset the whole tournament to setup?")) {
            t.commit(() => ({ ...createInitialState(), version: t.state!.version }));
          }
        }}
      />
      {t.error && <div className="err">{t.error}</div>}

      {t.editing && tab === "setup" && <SetupScreen t={t} />}
      {tab === "courts" && (phase === "setup"
        ? <div className="card muted">Tournament not started. {t.editing ? "Use the Setup tab." : "Waiting for organizer…"}</div>
        : <CourtsScreen t={t} />)}
      {tab === "standings" && <StandingsScreen t={t} />}
      {tab === "finals" && <FinalsScreen t={t} />}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): app shell, styles, and edit-mode bar"
```

> Note: `page.tsx` imports four screen components created in Tasks 11–14. The app will not type-check/build cleanly until those exist — that's expected; the build is verified at the end of Task 14.

---

### Task 11: Setup screen (roster, pools, seed courts, start)

**Files:**
- Create: `src/components/SetupScreen.tsx`

- [ ] **Step 1: Create `src/components/SetupScreen.tsx`**

```tsx
"use client";
import { useTournament } from "@/hooks/useTournament";
import { Player, Pool, TournamentState } from "@/lib/types";

type T = ReturnType<typeof useTournament>;

function movePlayer(s: TournamentState, id: string, pool: Pool): TournamentState {
  return { ...s, players: s.players.map((p) => (p.id === id ? { ...p, pool } : p)) };
}

function startRotation(s: TournamentState): TournamentState {
  const courts = { ...s.courts };
  for (const pool of ["A", "B"] as Pool[]) {
    const ids = s.players.filter((p) => p.pool === pool).map((p) => p.id);
    courts[pool] = {
      team1: ids.length >= 2 ? [ids[0], ids[1]] : null,
      team2: ids.length >= 4 ? [ids[2], ids[3]] : null,
      queue: ids.slice(4),
      timerStartedAt: null,
    };
  }
  return { ...s, phase: "rotation", courts };
}

export function SetupScreen({ t }: { t: T }) {
  const s = t.state!;
  const pools: Pool[] = ["A", "B"];
  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Setup — roster & pools</strong>
          <button className="btn" onClick={() => t.commit(startRotation)}>
            Start rotation →
          </button>
        </div>
        <p className="muted">
          First 4 in each pool start on court (as two teams); the rest form the queue in listed order.
        </p>
      </div>
      <div className="grid2">
        {pools.map((pool) => {
          const players = s.players.filter((p) => p.pool === pool);
          return (
            <div className="card" key={pool}>
              <strong>Pool {pool} · Court {pool === "A" ? 1 : 2} ({players.length})</strong>
              <table>
                <tbody>
                  {players.map((p: Player, i) => (
                    <tr key={p.id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <input
                          value={p.name}
                          onChange={(e) =>
                            t.commit((st) => ({
                              ...st,
                              players: st.players.map((x) =>
                                x.id === p.id ? { ...x, name: e.target.value } : x
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>{p.skill === "intermediate" ? "⭐" : ""}</td>
                      <td>
                        <button
                          className="btn secondary"
                          onClick={() => t.commit((st) => movePlayer(st, p.id, pool === "A" ? "B" : "A"))}
                        >
                          → {pool === "A" ? "B" : "A"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(ui): setup screen with roster, pools, and start rotation"
```

---

### Task 12: Courts screen (match, score entry, queue, timer)

**Files:**
- Create: `src/components/ScoreEntry.tsx`, `src/components/CourtTimer.tsx`, `src/components/CourtCard.tsx`, `src/components/CourtsScreen.tsx`

- [ ] **Step 1: Create `src/components/ScoreEntry.tsx`**

```tsx
"use client";
import { useState } from "react";

export function ScoreEntry({ onSubmit, label }: { onSubmit: (a: number, b: number) => void; label: string }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <input style={{ width: 64 }} inputMode="numeric" placeholder="0" value={a} onChange={(e) => setA(e.target.value)} />
      <span className="muted">–</span>
      <input style={{ width: 64 }} inputMode="numeric" placeholder="0" value={b} onChange={(e) => setB(e.target.value)} />
      <button
        className="btn"
        onClick={() => {
          const x = parseInt(a, 10), y = parseInt(b, 10);
          if (Number.isNaN(x) || Number.isNaN(y)) return;
          onSubmit(x, y); setA(""); setB("");
        }}
      >
        {label}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/CourtTimer.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

const CAP_MS = 12 * 60 * 1000;

export function CourtTimer({ startedAt, onStart, editing }: {
  startedAt: number | null; onStart: (v: number | null) => void; editing: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = startedAt ? Math.max(0, CAP_MS - (now - startedAt)) : CAP_MS;
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  const expired = startedAt && remaining === 0;
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <span className="pill" style={{ color: expired ? "var(--danger)" : "var(--accent2)" }}>
        ⏱ {mm}:{ss}{expired ? " — CAP" : ""}
      </span>
      {editing && (
        <>
          <button className="btn secondary" onClick={() => onStart(Date.now())}>Start 12:00</button>
          <button className="btn secondary" onClick={() => onStart(null)}>Reset</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/CourtCard.tsx`**

```tsx
"use client";
import { Pool, TournamentState } from "@/lib/types";
import { recordRotationGame, selectNextChallengers } from "@/lib/engine";
import { ScoreEntry } from "./ScoreEntry";
import { CourtTimer } from "./CourtTimer";
import { useTournament } from "@/hooks/useTournament";

type T = ReturnType<typeof useTournament>;

export function CourtCard({ t, pool }: { t: T; pool: Pool }) {
  const s = t.state!;
  const c = s.courts[pool];
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
  const nextUp = selectNextChallengers(c.queue, s.stats);

  return (
    <div className="card">
      <strong>Court {pool === "A" ? 1 : 2} · Pool {pool}</strong>
      {c.team1 && c.team2 ? (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span>{name(c.team1[0])} &amp; {name(c.team1[1])}</span>
            <span className="muted">vs</span>
            <span>{name(c.team2[0])} &amp; {name(c.team2[1])}</span>
          </div>
          <CourtTimer
            startedAt={c.timerStartedAt}
            editing={t.editing}
            onStart={(v) => t.commit((st) => ({
              ...st, courts: { ...st.courts, [pool]: { ...st.courts[pool], timerStartedAt: v } },
            }))}
          />
          {t.editing && (
            <ScoreEntry label="Record" onSubmit={(a, b) => t.commit((st) => recordRotationGame(st, pool, a, b))} />
          )}
        </>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>Waiting for enough players to form a game.</div>
      )}

      <div style={{ marginTop: 10 }}>
        <div className="muted">Queue</div>
        {c.queue.length === 0 ? <div className="muted">—</div> : (
          <ol style={{ margin: "4px 0 0 18px" }}>
            {c.queue.map((id) => (
              <li key={id} className={nextUp?.includes(id) ? "nextup" : ""}>
                {name(id)} {nextUp?.includes(id) ? "· next up" : ""}
                <span className="muted"> ({s.stats[id].gp} gp)</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/CourtsScreen.tsx`**

```tsx
"use client";
import { useTournament } from "@/hooks/useTournament";
import { CourtCard } from "./CourtCard";
import { qualifyFinalists, seedFinalists, buildSeededTeams, startFinals } from "@/lib/engine";

type T = ReturnType<typeof useTournament>;

export function CourtsScreen({ t }: { t: T }) {
  const finalists = qualifyFinalists(t.state!);
  return (
    <div>
      <div className="grid2">
        <CourtCard t={t} pool="A" />
        <CourtCard t={t} pool="B" />
      </div>
      {t.editing && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Rotation phase. When you're ready, lock in the finals from current standings.</span>
            <button
              className="btn"
              onClick={() => {
                if (finalists.tie && !confirm("There's a tie at the finals cut. Continue with current order?")) return;
                t.commit((st) => {
                  const q = qualifyFinalists(st);
                  const seeded = seedFinalists(q.A, q.B);
                  return startFinals(
                    { ...st, finals: { ...st.finals, finalists: { A: q.A, B: q.B } } },
                    buildSeededTeams(seeded)
                  );
                });
              }}
            >
              Start finals →
            </button>
          </div>
          {finalists.tie && <div className="err">⚠ Tie at the top-4 cut — review Standings before starting.</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): courts screen with score entry, queue next-up, and timer"
```

---

### Task 13: Standings screen

**Files:**
- Create: `src/components/StandingsScreen.tsx`

- [ ] **Step 1: Create `src/components/StandingsScreen.tsx`**

```tsx
"use client";
import { useTournament } from "@/hooks/useTournament";
import { standings } from "@/lib/engine";
import { Pool } from "@/lib/types";

type T = ReturnType<typeof useTournament>;

export function StandingsScreen({ t }: { t: T }) {
  const s = t.state!;
  const pools: Pool[] = ["A", "B"];
  return (
    <div className="grid2">
      {pools.map((pool) => {
        const rows = standings(s, pool);
        return (
          <div className="card" key={pool}>
            <strong>Pool {pool} standings</strong>
            <table>
              <thead>
                <tr><th>#</th><th>Player</th><th>GP</th><th>W</th><th>Diff</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.playerId} className={i < 4 ? "nextup" : ""}>
                    <td>{i + 1}</td>
                    <td>{r.name}{i < 4 ? " ✓" : ""}</td>
                    <td>{r.gp}</td>
                    <td>{r.w}</td>
                    <td>{r.pd > 0 ? `+${r.pd}` : r.pd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 6 }}>Top 4 (✓) qualify for finals.</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(ui): live standings screen with finals-cut highlight"
```

---

### Task 14: Finals screen + full build verification

**Files:**
- Create: `src/components/FinalsScreen.tsx`

- [ ] **Step 1: Create `src/components/FinalsScreen.tsx`**

```tsx
"use client";
import { useTournament } from "@/hooks/useTournament";
import { recordFinalsMatch, seedFinalists, buildSeededTeams, shuffleTeams, startFinals } from "@/lib/engine";
import { ScoreEntry } from "./ScoreEntry";
import { Match, TournamentState } from "@/lib/types";

type T = ReturnType<typeof useTournament>;

export function FinalsScreen({ t }: { t: T }) {
  const s = t.state!;
  if (s.phase !== "finals") {
    return <div className="card muted">Finals haven’t started yet. The organizer starts them from the Courts tab once the rotation is done.</div>;
  }
  const f = s.finals;
  const teamName = (idx: number | null) => {
    if (idx === null) return "TBD";
    const team = f.teams[idx];
    if (!team) return "TBD";
    const nm = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
    return `${nm(team.players[0])} & ${nm(team.players[1])}`;
  };

  const MatchCard = ({ label, mkey, m }: { label: string; mkey: "semi1" | "semi2" | "final"; m: Match }) => {
    const decided = m.score1 !== null && m.score2 !== null;
    return (
      <div className="card">
        <strong>{label}</strong>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <span>{teamName(m.teamA)}</span>
          <span className="muted">vs</span>
          <span>{teamName(m.teamB)}</span>
        </div>
        {decided ? (
          <div className="pill" style={{ marginTop: 6 }}>Final: {m.score1}–{m.score2}</div>
        ) : t.editing && m.teamA !== null && m.teamB !== null ? (
          <ScoreEntry label="Record" onSubmit={(a, b) => t.commit((st) => recordFinalsMatch(st, mkey, a, b))} />
        ) : (
          <div className="muted" style={{ marginTop: 6 }}>Awaiting result…</div>
        )}
      </div>
    );
  };

  return (
    <div>
      {f.champion !== null && (
        <div className="card"><div className="champion">🏆 Champions: {teamName(f.champion)}</div></div>
      )}
      {t.editing && (
        <div className="card row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Adjust the four finals teams:</span>
          <span className="row">
            <button className="btn secondary" onClick={() => t.commit((st: TournamentState) =>
              startFinals(st, buildSeededTeams(seedFinalists(st.finals.finalists.A, st.finals.finalists.B))))}>
              Re-seed (1&8,4&5,3&6,2&7)
            </button>
            <button className="btn secondary" onClick={() => t.commit((st: TournamentState) =>
              startFinals(st, shuffleTeams(seedFinalists(st.finals.finalists.A, st.finals.finalists.B))))}>
              Random draw
            </button>
          </span>
        </div>
      )}
      <div className="grid2">
        <MatchCard label="Semifinal 1 · Court 1" mkey="semi1" m={f.matches.semi1} />
        <MatchCard label="Semifinal 2 · Court 2" mkey="semi2" m={f.matches.semi2} />
      </div>
      <MatchCard label="Final" mkey="final" m={f.matches.final} />
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all engine + route tests green.

- [ ] **Step 3: Type-check and production build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; `next build` completes successfully (all four screen imports in `page.tsx` now resolve).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): finals bracket screen; full app builds"
```

---

### Task 15: README with local run + Vercel/KV deploy steps; manual smoke test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Pickleball Mini-Tournament Tracker

Live tracker for a 23-player, 2-court pickleball mini-tournament: split pools →
King-of-the-Court rotation → 8-player doubles finals. One organizer edits;
everyone else opens the link to watch live.

## Run locally

```bash
npm install
cp .env.example .env.local   # set ORGANIZER_PASSCODE; KV vars needed for real data
npm run dev                  # http://localhost:3000
npm test                     # run the engine + API tests
```

Local dev needs a Vercel KV store to persist state. Create one (below) and pull
its env vars with `vercel env pull .env.local`, or use `vercel dev`.

## Deploy to Vercel

1. Push this repo to GitHub and "Import Project" in Vercel.
2. In the project's **Storage** tab, create a **KV** database and connect it —
   Vercel injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically.
3. In **Settings → Environment Variables**, add `ORGANIZER_PASSCODE` (the code
   you'll type to unlock edit mode). Redeploy.
4. Open the deployed URL. Tap **Unlock edit**, enter the passcode, and use the
   **Setup** tab to confirm rosters/pools, then **Start rotation**.

## Using it on the day

- **Setup:** confirm the 23 names and the A/B split, then Start rotation.
- **Courts:** enter each game's final score; the app keeps the winners on, sends
  losers to the queue, and highlights the next-up pair (fewest games played).
  Optionally start the 12-minute cap timer per court.
- **Standings:** live wins + point differential; top 4 per pool (✓) qualify.
- **Finals:** from Courts, tap **Start finals** to seed the 4 teams; record the
  two semifinals and the final to crown the champions.
- **Undo** reverts the last change; **Reset** clears back to setup.
````

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`, open `http://localhost:3000`. With `ORGANIZER_PASSCODE` set and a KV store connected:
1. Unlock edit → Setup → Start rotation.
2. On Courts, record a few games on both courts; confirm winner stays, loser goes to back of queue, and "next up" highlights the fewest-games pair.
3. Open a second browser tab (no passcode) and confirm it reflects changes within ~3s (viewer mode).
4. Start finals → record semis → record final → confirm champion banner.
5. Undo and Reset behave as described.

Expected: all behaviors match the spec.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: README with local run, Vercel/KV deploy, and day-of usage"
```

---

## Self-Review Notes (coverage against the spec)

- Roles/viewer-vs-organizer + server passcode → Tasks 8, 10, 9.
- Single-JSON KV state + GET/POST + version guard → Tasks 8, 9.
- Setup (preloaded roster/pools, seed courts, start) → Tasks 2, 11.
- Rotation engine (stats, winner-stays, loser-to-queue, fewest-games next-up, timer) → Tasks 3, 4, 12.
- Standings (wins then point diff) → Tasks 5, 13.
- Finals (top-4 + tie flag, interleaved seeding, seeded pairs + shuffle, semis→final, champion) → Tasks 6, 7, 12, 14.
- Sync/concurrency (~3s poll, optimistic, 409 refetch), undo, reset → Tasks 9, 10.
- Tests (engine units + route) → Tasks 3–8; manual smoke test → Task 15.
- Out-of-scope items (duty rotation, accounts, realtime, offline, multi-tournament) correctly omitted.
