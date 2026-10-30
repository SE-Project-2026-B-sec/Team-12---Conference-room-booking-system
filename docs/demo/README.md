# Sprint 1 demo — CRBS-42

[Watch/download the 1-minute demo](Sprint-1-Demo.mp4)

Recorded on 30 October 2026 from application commit `eb4e44b2029e2e72097a5e261bae9e6dc74d35c1` on `main`. The MP4 is 60 seconds long, captioned, silent, and below 1 MB.

## What the video shows

- 00:00–00:09: sign in using the seeded demo user.
- 00:09–00:14: real rooms with name, location, capacity and facilities.
- 00:14–00:23: availability search for 31 October, 17:00–18:00 IST, minimum capacity 8.
- 00:23–00:35: choose Conference Room B and enter a meeting purpose.
- 00:35–00:45: booking #8 is confirmed and the occupied room is removed from the results.
- 00:45–01:00: another tab attempts the same room and slot, receives the conflict message, and refreshes availability.

Both tabs searched and selected the slot before the first booking was confirmed. This is necessary to exercise the server conflict response through the UI: a fresh search correctly hides an already occupied room. The second attempt is sequential; this video does not demonstrate simultaneous race-safe writes, which are planned separately.

## Recording environment and verification

The actual React frontend on `http://127.0.0.1:5173` called the actual Express API on port 3000 and PostgreSQL 16 in Docker. No mock API, simulated response, or screenshot substitution was used. The video uses timestamped live browser-tab captures with a caption strip; it has no microphone audio. The real booking confirmation and conflict were inspected during capture. The encoded MP4 was decoded in full without errors and representative frames were visually checked.

The database was already migrated and seeded. This laptop uses a local-only PostgreSQL port mapping of `55432`, because `5432` was unavailable. The shared Compose file was not changed, and the combined Docker application image was not verified by this recording.

## Repeat locally on the recording laptop

Open Docker Desktop, then run in the repository root:

```powershell
docker start crbs-venya-db
node --env-file=.env server/node_modules/tsx/dist/cli.mjs watch server/src/index.ts
```

In a second terminal, run `npm run dev` from `client/` and open the displayed URL. Use `demo.user@example.com` / `User123!@#` (synthetic seed account). Choose an unused future slot, within 30 days, in 30-minute increments between 09:00 and 18:00 IST. For conflict reproduction, prepare both tabs before confirming either one.

CRBS-42 also includes the two-minute Sprint 2 demo. This file supplies only its Sprint 1 deliverable; the full Jira story remains unfinished until the Sprint 2 video is uploaded.
