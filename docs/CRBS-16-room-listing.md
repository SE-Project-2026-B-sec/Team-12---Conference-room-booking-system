# CRBS-16 Room listing

`GET /api/rooms` returns a JSON array of rooms with `id`, `name`, `location`, `capacity` and `facilities`, ordered by name then ID. An empty database returns `200 []`. Facilities without entries are `[]`.

Uses the shared CRBS-14 session middleware and `requireSession` guard. Sign in with `POST /api/auth/login` first; the listing requires the resulting session cookie and rejects missing/invalid sessions with 401. It never accepts a client-supplied user ID as authentication.

`server/tests/rooms.test.ts` covers TC01 response values, an empty database, rooms with no facilities, missing/invalid sessions and safe error propagation. `server/tests/rooms.integration.test.ts` also checks real login, PostgreSQL-backed room data, stable ordering, missing authentication and logout. Run integration tests only against the configured `_test` database using the existing test setup.

Availability search remains the existing CRBS-17 endpoint; this story does not change its behavior.

Verification on 29 October 2026: all 109 server tests passed against an isolated PostgreSQL 16 test database, including real login, exact room fields/order and post-logout rejection. TypeScript build and ESLint also passed. The live CRBS-22 browser check displayed the seeded rooms using this compiled backend. Local Windows port 5432 was unavailable, so only the ignored .env was adjusted to port 55432; shared Compose/scripts were not changed.
