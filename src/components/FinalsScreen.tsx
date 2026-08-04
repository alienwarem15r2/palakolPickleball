"use client";
import { useTournament } from "@/hooks/useTournament";
import { recordFinalsMatch, seedFinalists, buildSeededTeams, shuffleTeams, startFinals } from "@/lib/engine";
import { ScoreEntry } from "./ScoreEntry";
import { Match, TournamentState } from "@/lib/types";

type T = ReturnType<typeof useTournament>;

// Top-level (stable) component. It must NOT be defined inside FinalsScreen —
// a component redefined on each render gets remounted every poll, which would
// wipe the ScoreEntry inputs mid-typing.
function MatchCard({
  t,
  teamName,
  label,
  mkey,
  m,
}: {
  t: T;
  teamName: (idx: number | null) => string;
  label: string;
  mkey: "semi1" | "semi2" | "final";
  m: Match;
}) {
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
}

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
        <MatchCard t={t} teamName={teamName} label="Semifinal 1 · Court 1" mkey="semi1" m={f.matches.semi1} />
        <MatchCard t={t} teamName={teamName} label="Semifinal 2 · Court 2" mkey="semi2" m={f.matches.semi2} />
      </div>
      <MatchCard t={t} teamName={teamName} label="Final" mkey="final" m={f.matches.final} />
    </div>
  );
}
