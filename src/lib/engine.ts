import { CourtState, FinalsTeam, Game, Match, Player, Pool, PlayerStats, Skill, Team, TournamentState } from "./types";

// --- Partner rotation -------------------------------------------------------
// Players should get a different partner each game, and the two teams in a game
// should have the same skill mix (e.g. if one team is intermediate+novice, so is
// the other). Pairings are chosen when four players come on court, then stored,
// so the UI never re-randomises during a render.

// Order-independent key identifying a partnership.
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface PartnerHistory {
  counts: Record<string, number>; // how often each pair has partnered
  lastGame: Record<string, number>; // index of their most recent game together
  total: number; // games recorded so far
}

// How often, and how recently, each pair has partnered — read from the game log.
export function partnerHistory(games: Game[]): PartnerHistory {
  const counts: Record<string, number> = {};
  const lastGame: Record<string, number> = {};
  games.forEach((g, i) => {
    for (const team of [g.team1, g.team2]) {
      const k = pairKey(team[0], team[1]);
      counts[k] = (counts[k] ?? 0) + 1;
      lastGame[k] = i;
    }
  });
  return { counts, lastGame, total: games.length };
}

// The three ways to split four players into two pairs.
const PAIRINGS: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

// Split four players into two teams, preferring (1) an even skill split between
// the teams, then (2) partnerships that haven't happened yet. Ties are broken
// randomly so repeated foursomes don't always produce the same teams.
export function pairFour(
  four: string[],
  players: Player[],
  history: PartnerHistory
): [Team, Team] {
  const isIntermediate = (id: string) =>
    players.find((p) => p.id === id)?.skill === "intermediate" ? 1 : 0;

  // A pairing is worse the more often — and especially the more recently — those
  // two have already partnered. Any given pair appears in only one of the three
  // pairings, so a just-played partnership can always be avoided.
  const stalePenalty = (t: Team) => {
    const k = pairKey(t[0], t[1]);
    const last = history.lastGame[k];
    const gamesAgo = last === undefined ? Infinity : history.total - last;
    const recency = gamesAgo === Infinity ? 0 : Math.max(0, 6 - gamesAgo) * 10;
    return (history.counts[k] ?? 0) + recency;
  };

  const scored = PAIRINGS.map(([x, y]) => {
    const t1: Team = [four[x[0]], four[x[1]]];
    const t2: Team = [four[y[0]], four[y[1]]];
    const skillGap = Math.abs(
      isIntermediate(t1[0]) + isIntermediate(t1[1]) - isIntermediate(t2[0]) - isIntermediate(t2[1])
    );
    // Skill balance dominates; partner freshness breaks the remaining ties.
    return {
      teams: [t1, t2] as [Team, Team],
      score: skillGap * 1000 + stalePenalty(t1) + stalePenalty(t2),
    };
  });

  const best = Math.min(...scored.map((s) => s.score));
  const options = scored.filter((s) => s.score === best);
  return options[Math.floor(Math.random() * options.length)].teams;
}

// Rebuild the queue after a game. Ordering rules, in priority order:
//   1. fewest games played comes up first (keeps games even),
//   2. among players on the same game count, those who have been waiting come
//      before the four who just walked off court,
//   3. within each of those groups the order is shuffled, so the same foursome
//      doesn't cycle round together forever.
export function reorderQueue(
  waiting: string[],
  justFinished: string[],
  stats: Record<string, PlayerStats>
): string[] {
  const byGames = (ids: string[]) => {
    const groups = new Map<number, string[]>();
    for (const id of shuffled(ids)) {
      const gp = stats[id]?.gp ?? 0;
      if (!groups.has(gp)) groups.set(gp, []);
      groups.get(gp)!.push(id);
    }
    return groups;
  };
  const waited = byGames(waiting);
  const finished = byGames(justFinished);
  const levels = [...new Set([...waited.keys(), ...finished.keys()])].sort((a, b) => a - b);
  return levels.flatMap((gp) => [...(waited.get(gp) ?? []), ...(finished.get(gp) ?? [])]);
}

// --- Roster editing ---------------------------------------------------------

// Is this player currently playing (rather than waiting)? Someone on court
// can't be removed or moved without breaking the game in progress.
export function isOnCourt(state: TournamentState, id: string): boolean {
  return (["A", "B"] as Pool[]).some((pool) => {
    const c = state.courts[pool];
    return [...(c.team1 ?? []), ...(c.team2 ?? [])].includes(id);
  });
}

// A brand-new player id. Deliberately not "highest number + 1": ids linger in
// the game log, the courts and the finals after a player is removed, so a reused
// id would silently hand the new player someone else's results.
function newPlayerId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `p${Date.now().toString(36)}${rand}`;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name can't be blank.");
  return trimmed;
}

// Add a player. During a rotation they join the back of their pool's queue —
// with zero games played they'll be first up, so latecomers start playing soon.
export function addPlayer(
  state: TournamentState,
  name: string,
  pool: Pool,
  skill: Skill = "novice"
): TournamentState {
  const id = newPlayerId();
  const players = [...state.players, { id, name: requireName(name), pool, skill }];
  const stats = { ...state.stats, [id]: { gp: 0, w: 0, pf: 0, pa: 0 } };
  const courts =
    state.phase === "rotation"
      ? {
          ...state.courts,
          [pool]: { ...state.courts[pool], queue: [...state.courts[pool].queue, id] },
        }
      : state.courts;
  return { ...state, players, stats, courts, updatedAt: Date.now() };
}

// Remove a player from the roster and any queue. Past games keep their record,
// so previously played results stay intact.
export function removePlayer(state: TournamentState, id: string): TournamentState {
  if (isOnCourt(state, id)) {
    throw new Error("That player is on court — record the current game first.");
  }
  const stats = { ...state.stats };
  delete stats[id];
  const courts = { A: { ...state.courts.A }, B: { ...state.courts.B } };
  for (const pool of ["A", "B"] as Pool[]) {
    courts[pool].queue = courts[pool].queue.filter((q) => q !== id);
  }
  return {
    ...state,
    players: state.players.filter((p) => p.id !== id),
    stats,
    courts,
    updatedAt: Date.now(),
  };
}

export function renamePlayer(state: TournamentState, id: string, name: string): TournamentState {
  const trimmed = requireName(name);
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    updatedAt: Date.now(),
  };
}

export function setPlayerSkill(state: TournamentState, id: string, skill: Skill): TournamentState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, skill } : p)),
    updatedAt: Date.now(),
  };
}

// Move a player to the other pool, keeping the court queues in step so they
// don't stay queued on the court they just left.
export function setPlayerPool(state: TournamentState, id: string, pool: Pool): TournamentState {
  if (isOnCourt(state, id)) {
    throw new Error("That player is on court — record the current game first.");
  }
  const courts = { A: { ...state.courts.A }, B: { ...state.courts.B } };
  for (const p of ["A", "B"] as Pool[]) {
    courts[p].queue = courts[p].queue.filter((q) => q !== id);
  }
  if (state.phase === "rotation") courts[pool].queue = [...courts[pool].queue, id];
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, pool } : p)),
    courts,
    updatedAt: Date.now(),
  };
}

// Seed each court from its pool: the first four players take the court (paired
// for a balanced skill split) and the rest queue in listed order. Moves the
// tournament to "rotation".
export function startRotation(state: TournamentState): TournamentState {
  const courts = { ...state.courts };
  const history = partnerHistory(state.games);
  for (const pool of ["A", "B"] as Pool[]) {
    const ids = state.players.filter((p) => p.pool === pool).map((p) => p.id);
    if (ids.length >= 4) {
      const [team1, team2] = pairFour(ids.slice(0, 4), state.players, history);
      courts[pool] = { team1, team2, queue: ids.slice(4), timerStartedAt: null };
    } else {
      courts[pool] = {
        team1: ids.length >= 2 ? [ids[0], ids[1]] : null,
        team2: null,
        queue: ids.slice(2),
        timerStartedAt: null,
      };
    }
  }
  return { ...state, phase: "rotation", courts, updatedAt: Date.now() };
}

export interface StandingRow {
  playerId: string;
  name: string;
  gp: number;
  w: number;
  pd: number; // point differential = pf - pa
  pf: number; // total points scored
}

// Ranking order: wins, then point differential, then total points scored.
// Deliberately no name tiebreak — sorting by name would hand the last finals
// spot to whoever is earlier in the alphabet. Array.prototype.sort is stable, so
// players who match on all three keep their roster order until a draw is run.
// (A fourth "fewest points allowed" rule would be a no-op: points allowed is
// pf - pd, so equal pd and equal pf forces equal points allowed.)
export function compareStanding(a: StandingRow, b: StandingRow): number {
  return b.w - a.w || b.pd - a.pd || b.pf - a.pf;
}

export function standings(state: TournamentState, pool: Pool): StandingRow[] {
  return state.players
    .filter((p) => p.pool === pool)
    .map((p) => {
      const st = state.stats[p.id];
      return { playerId: p.id, name: p.name, gp: st.gp, w: st.w, pd: st.pf - st.pa, pf: st.pf };
    })
    .sort(compareStanding);
}

export interface FinalistResult {
  A: string[];
  B: string[];
  tie: boolean;
}

// True when the players either side of the top-4 cut are level on every
// statistic, so nothing but a draw can separate them.
function poolHasCutTie(rows: StandingRow[]): boolean {
  if (rows.length <= 4) return false;
  return compareStanding(rows[3], rows[4]) === 0;
}

// Randomise the order of players who are exactly level, so that when the cut
// falls inside a tied group the spot is won by a draw rather than by list order.
function drawAmongTied(rows: StandingRow[]): StandingRow[] {
  const out: StandingRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && compareStanding(rows[i], rows[j]) === 0) j++;
    out.push(...(j - i > 1 ? shuffled(rows.slice(i, j)) : rows.slice(i, j)));
    i = j;
  }
  return out;
}

// Top four per pool. Pass { drawTies: true } when locking the finals in, so a
// dead heat at the cut is settled by a random draw instead of list order.
export function qualifyFinalists(
  state: TournamentState,
  options: { drawTies?: boolean } = {}
): FinalistResult {
  const rank = (pool: Pool) => {
    const rows = standings(state, pool);
    return options.drawTies ? drawAmongTied(rows) : rows;
  };
  const aRows = rank("A");
  const bRows = rank("B");
  return {
    A: aRows.slice(0, 4).map((r) => r.playerId),
    B: bRows.slice(0, 4).map((r) => r.playerId),
    tie: poolHasCutTie(standings(state, "A")) || poolHasCutTie(standings(state, "B")),
  };
}

export function seedFinalists(a: string[], b: string[]): string[] {
  const seeded: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (a[i]) seeded.push(a[i]);
    if (b[i]) seeded.push(b[i]);
  }
  return seeded;
}

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
    // Random draw: seed numbers are not meaningful, so [0, 0] marks "unseeded".
    seedPair: [0, 0] as [number, number],
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
  assertScores(score1, score2);
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

function cloneStats(stats: Record<string, PlayerStats>) {
  const out: Record<string, PlayerStats> = {};
  for (const k in stats) out[k] = { ...stats[k] };
  return out;
}

// Guard the last pure boundary before state is persisted: reject non-finite or
// negative scores so a bad input (e.g. an unparsed empty field -> NaN) can never
// silently corrupt stored stats.
function assertScores(score1: number, score2: number) {
  for (const s of [score1, score2]) {
    if (!Number.isFinite(s) || s < 0) {
      throw new Error(`Invalid score: ${score1}-${score2}`);
    }
  }
}

// NOTE: mutates `stats` in place. Callers must pass a freshly-cloned map
// (never `state.stats` directly), or they will corrupt shared state.
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
  assertScores(score1, score2);
  const c = state.courts[court];
  if (!c.team1 || !c.team2) throw new Error(`Court ${court} has no active game`);
  const team1 = c.team1;
  const team2 = c.team2;

  const stats = cloneStats(state.stats);
  applyGame(stats, team1, team2, score1, score2);

  // Copy the tuples into the immutable game log so the log never aliases the
  // live court arrays (protects the history if a later feature edits teams).
  const games = [
    ...state.games,
    { court, team1: [...team1] as Team, team2: [...team2] as Team, score1, score2, ts: Date.now() },
  ];

  // Count partnerships including the game just played, so the pair that just
  // partnered is the least likely to be paired again next.
  const nextCourt = advanceCourt(c, team1, team2, state.players, stats, partnerHistory(games));

  return {
    ...state,
    stats,
    games,
    courts: { ...state.courts, [court]: nextCourt },
    updatedAt: Date.now(),
  };
}

// Equal rotation ("everyone rotates"): after a game all four players rejoin the
// queue and the next four come on, so games played stay even for everyone. The
// winner is irrelevant to who plays next (it only affects standings), which also
// makes editing a past score safe — see editGame. The incoming four are paired
// fresh, so partners change from game to game.
function advanceCourt(
  court: CourtState,
  team1: Team,
  team2: Team,
  players: Player[],
  stats: Record<string, PlayerStats>,
  history: PartnerHistory
): CourtState {
  const queue = reorderQueue(court.queue, [...team1, ...team2], stats);
  // A game only happens with 4 on court, so queue.length is always >= 4 here.
  const four = queue.slice(0, 4);
  const [nextTeam1, nextTeam2] = pairFour(four, players, history);
  return {
    team1: nextTeam1,
    team2: nextTeam2,
    queue: queue.slice(4),
    timerStartedAt: null,
  };
}

// The next four players who will rotate onto a court (for the "next up" hint).
export function nextUp(queue: string[]): string[] {
  return queue.slice(0, 4);
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Randomly split every player into pools A and B, balanced by skill: shuffle the
// intermediates and novices separately, then deal each into whichever pool is
// currently smaller. That keeps both the skill mix and the pool sizes even, and
// randomizes the within-pool order so starting teams differ each shuffle.
export function shuffleBalancedPools(state: TournamentState): TournamentState {
  const intermediates = shuffled(state.players.filter((p) => p.skill === "intermediate"));
  const novices = shuffled(state.players.filter((p) => p.skill !== "intermediate"));
  const A: TournamentState["players"] = [];
  const B: TournamentState["players"] = [];
  for (const p of [...intermediates, ...novices]) {
    (A.length <= B.length ? A : B).push(p);
  }
  const players = [
    ...A.map((p) => ({ ...p, pool: "A" as const })),
    ...B.map((p) => ({ ...p, pool: "B" as const })),
  ];
  return { ...state, players, updatedAt: Date.now() };
}

// Fewest games played across all pooled players (the slowest player's count).
export function minGamesPlayed(state: TournamentState): number {
  const pooled = state.players.filter((p) => p.pool);
  if (pooled.length === 0) return 0;
  return Math.min(...pooled.map((p) => state.stats[p.id]?.gp ?? 0));
}

// Rotation is "done" once every pooled player has played the target number of
// games — the signal to show "Ready for finals".
export function readyForFinals(state: TournamentState): boolean {
  const pooled = state.players.filter((p) => p.pool);
  if (pooled.length === 0) return false;
  return pooled.every((p) => (state.stats[p.id]?.gp ?? 0) >= state.targetGames);
}

// Rebuild every player's stats from scratch by replaying the game log. Used after
// a past game's score is corrected so standings stay consistent.
export function recomputeStats(
  players: TournamentState["players"],
  games: TournamentState["games"]
): Record<string, PlayerStats> {
  const stats: Record<string, PlayerStats> = {};
  for (const p of players) stats[p.id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  const ensure = (id: string) => {
    if (!stats[id]) stats[id] = { gp: 0, w: 0, pf: 0, pa: 0 };
  };
  for (const g of games) {
    for (const id of [...g.team1, ...g.team2]) ensure(id);
    applyGame(stats, g.team1, g.team2, g.score1, g.score2);
  }
  return stats;
}

// Correct a previously recorded game's score and recompute standings. Does not
// touch the current court/queue — with equal rotation the score never affected
// who plays next, so only the stats need fixing.
export function editGame(
  state: TournamentState,
  index: number,
  score1: number,
  score2: number
): TournamentState {
  assertScores(score1, score2);
  if (index < 0 || index >= state.games.length) {
    throw new Error(`No game at index ${index}`);
  }
  const games = state.games.map((g, i) =>
    i === index ? { ...g, score1, score2 } : g
  );
  const stats = recomputeStats(state.players, games);
  return { ...state, games, stats, updatedAt: Date.now() };
}
