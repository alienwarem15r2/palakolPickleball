import { Skill } from "@/lib/types";
import { OpenPlayPlayer, OpenPlayState } from "./types";
import { pairFour, partnerHistory } from "@/lib/engine";

// Unique id. Never reuses an id, so a new player can't inherit the record of
// someone who checked out earlier in the session.
function newId(): string {
  return `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name can't be blank.");
  return trimmed;
}

export function isPlaying(state: OpenPlayState, id: string): boolean {
  return state.courts.some((c) =>
    [...(c.team1 ?? []), ...(c.team2 ?? [])].includes(id)
  );
}

function assertNotPlaying(state: OpenPlayState, id: string) {
  if (isPlaying(state, id)) {
    throw new Error("That player is on court — record the current game first.");
  }
}

export function checkIn(state: OpenPlayState, name: string, skill: Skill): OpenPlayState {
  const player: OpenPlayPlayer = {
    id: newId(),
    name: requireName(name),
    skill,
    resting: false,
    left: false,
  };
  return {
    ...state,
    players: [...state.players, player],
    queue: [...state.queue, player.id], // back of the line
    stats: { ...state.stats, [player.id]: { gp: 0, w: 0, pf: 0, pa: 0 } },
    updatedAt: Date.now(),
  };
}

function mapPlayer(
  state: OpenPlayState,
  id: string,
  change: (p: OpenPlayPlayer) => OpenPlayPlayer
): OpenPlayState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? change(p) : p)),
    updatedAt: Date.now(),
  };
}

export function renamePlayer(state: OpenPlayState, id: string, name: string): OpenPlayState {
  const trimmed = requireName(name);
  return mapPlayer(state, id, (p) => ({ ...p, name: trimmed }));
}

export function setSkill(state: OpenPlayState, id: string, skill: Skill): OpenPlayState {
  return mapPlayer(state, id, (p) => ({ ...p, skill }));
}

// Resting leaves the queue; returning rejoins at the back.
export function setResting(state: OpenPlayState, id: string, resting: boolean): OpenPlayState {
  assertNotPlaying(state, id);
  const queue = state.queue.filter((q) => q !== id);
  return {
    ...mapPlayer(state, id, (p) => ({ ...p, resting })),
    queue: resting ? queue : [...queue, id],
  };
}

// A player who never played is deleted outright; one with games is kept (marked
// left) so the end-of-session summary can still name them.
export function removePlayer(state: OpenPlayState, id: string): OpenPlayState {
  assertNotPlaying(state, id);
  const played = (state.stats[id]?.gp ?? 0) > 0;
  const queue = state.queue.filter((q) => q !== id);
  if (played) {
    return { ...mapPlayer(state, id, (p) => ({ ...p, left: true })), queue };
  }
  const stats = { ...state.stats };
  delete stats[id];
  return {
    ...state,
    players: state.players.filter((p) => p.id !== id),
    stats,
    queue,
    updatedAt: Date.now(),
  };
}

// The next four in line (for the "next up" display).
export function nextUp(state: OpenPlayState): string[] {
  return state.queue.slice(0, 4);
}

// Put the front four of the queue onto every open, empty court. Teams are chosen
// by the tournament's mixer pairing: even skill split first, then partners who
// haven't played together this session.
export function fillCourts(state: OpenPlayState): OpenPlayState {
  const history = partnerHistory(state.games);
  let queue = [...state.queue];
  const courts = state.courts.map((court) => {
    const empty = court.team1 === null && court.team2 === null;
    if (!court.open || !empty || queue.length < 4) return court;
    const four = queue.slice(0, 4);
    queue = queue.slice(4);
    const [team1, team2] = pairFour(four, state.players, history);
    return { ...court, team1, team2, timerStartedAt: null };
  });
  return { ...state, courts, queue, updatedAt: Date.now() };
}
