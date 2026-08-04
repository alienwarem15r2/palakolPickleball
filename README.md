# Pickleball Mini-Tournament Tracker

Live tracker for a 23-player, 2-court pickleball mini-tournament: split pools →
King-of-the-Court rotation → 8-player doubles finals. One organizer edits;
everyone else opens the link to watch live.

## Run locally

```bash
npm install
cp .env.example .env.local   # set ORGANIZER_PASSCODE (KV vars optional locally)
npm run dev                  # http://localhost:3000
npm test                     # run the engine + API tests
```

Local dev works **without** a Vercel KV store: if the `KV_REST_API_*` vars are
absent, the app uses an in-memory store (per server-process, resets on restart)
so you can develop and demo immediately. Set `ORGANIZER_PASSCODE` in `.env.local`
to unlock edit mode. For persistent local data, create a KV store and pull its
vars with `vercel env pull .env.local`.

## Deploy to Vercel

1. Push this repo to GitHub and "Import Project" in Vercel.
2. In the project's **Storage** tab, create a **KV** database and connect it —
   Vercel injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically. (With a
   KV store attached, state persists across deploys and server restarts.)
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

## How it works

- **Next.js (App Router)** on Vercel. The whole tournament is one JSON object in
  **Vercel KV** (`tournament:state`).
- Viewers poll `GET /api/state` every ~3s (read-only). The organizer writes via
  `POST /api/state`, which validates `ORGANIZER_PASSCODE` server-side and rejects
  stale writes by version (optimistic concurrency).
- All tournament rules live in pure, unit-tested functions in `src/lib/engine.ts`.
