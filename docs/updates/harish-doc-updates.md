# Updates for the SRS / SAD / Test Plan owner (from Harish's merged stories)

Source: merged code and tests on `main` (CRBS-11, 12, 18, 24, 28, 29, 31). Each statement was checked against the code or test files. Items marked "to confirm" could not be verified from the repository. Matching deviation lines are in `docs/DEVIATIONS.md`; the admin API is in `docs/api/admin-rooms.md`.

## (a) SAD 4.3 API Design: rows to add or change

All errors use `{ "error": { "code": "...", "message": "..." } }`. Validation failures (400) add a `"fields"` map keyed by field name. Codes in use: `BAD_REQUEST` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500, generic message). Authenticated state-changing requests also need the CSRF token in the `x-csrf-token` header; a missing or wrong token returns 403 `FORBIDDEN`.

| Endpoint | Method | Request | Success / error responses |
| --- | --- | --- | --- |
| `/api/bookings` (change) | POST | JSON `{ roomId, date: "YYYY-MM-DD", startTime: "HH:mm", endTime: "HH:mm", purpose }`. `userId` and `status` in the body are ignored. | 201 `{ bookingId, status: "CONFIRMED", roomId, startAt, endAt }` (UTC ISO timestamps); 400 `BAD_REQUEST` + `fields`; 401; 403 (CSRF); 404 room not found; 409 `CONFLICT` overlap |
| `/api/admin/rooms` (change) | POST | JSON `{ name, location, capacity, facilities? }` | 201 `{ id, name, location, capacity, facilities }`; 400 + `fields`; 401; 403 (not ADMIN, or CSRF) |
| `/api/admin/rooms/{id}` (add) | PATCH | JSON, any subset of `{ name, location, capacity, facilities }` | 200 updated room (same shape as above); 400 + `fields` (invalid value, empty body or no editable field, or `id` not a positive integer); 401; 403; 404 room not found |

Admin room rules (same for POST and PATCH): `name` 1-100 characters, `location` 1-200, `capacity` whole number 1-10000, `facilities` at most 50 entries of 1-100 characters (default `[]` on create), all text trimmed, unknown fields ignored. The role comes from the server-side session only. Updating a room never changes its bookings.

SAD 4.4 can add: 409 is returned for booking conflicts and 500 returns a generic message with no database detail.

## (b) RTM rows I implemented

Tests run against a real PostgreSQL test database. Counts are test cases in the file (parameterised cases counted separately).

| Requirement | Test IDs | Test file(s) | Tests |
| --- | --- | --- | --- |
| FR04 Create booking | TC04, TC05 | `server/tests/bookings.test.ts` | TC04: 3, TC05: 13 |
| FR05 Confirmed booking, ID returned | TC04 | `server/tests/bookings.test.ts` | included above |
| FR07 No overlapping active bookings, atomic | TC09 (and TC07/TC08 sequential cases) | `server/tests/booking-concurrency.test.ts`; overlap and adjacent also in `bookings.test.ts` | TC09: 5 |
| FR12 Admin creates room | TC13, TC14 | `server/tests/admin-rooms.test.ts` | TC13: 17, TC14: 3 |
| FR13 Admin updates room | TC13, TC14 | `server/tests/admin-rooms-update.test.ts` | TC13: 25, TC14: 3 |
| FR14 Persistence and atomic writes | TC15 | `server/tests/booking-atomicity.test.ts` | TC15: 4 |
| NFR02 Reliability / integrity | TC09, TC15 | `booking-concurrency.test.ts`, `booking-atomicity.test.ts` | 5 + 4 |

Notes for the RTM:
- In `bookings.test.ts` the overlap (409) and adjacent (201) check is named TC04. If the RTM treats TC07/TC08 as the formal overlap and adjacent cases, map that one test there (to confirm against the Test Plan wording).
- Booking-write atomicity: the room row is locked (`SELECT ... FOR UPDATE`) and the overlap is checked inside the same transaction as the insert (`server/src/services/booking-service.ts`). TC09 covers 10 simultaneous pairs on one room and interval: exactly one 201 and one 409 per pair, one CONFIRMED row each.
- TC15 covers a simulated failure after the insert (zero rows remain), a safe 500 with no database detail, and persistence after the database client is disconnected and recreated. It does not restart the whole server process.
- A database-level exclusion constraint was considered and not added (see DEVIATIONS).

## (c) Test Plan notes

- Local database tests use a separate database `crbs_test` (variable `DATABASE_URL_TEST`); the tests refuse to run unless its name ends in `_test`. One-time setup and `npm run test:db:prepare` are in the README.
- Test files run one after another (`server/vitest.config.ts`, `fileParallelism: false`) because they share one database.
- Each DB test creates its own synthetic users and rooms and deletes only those rows afterwards. Test users' passwords are hashed at bcrypt cost 4 (production cost is 12).
- CI (`.github/workflows/ci.yml`, run on pull requests to `main`) has two jobs named `Server` and `Client`. `Server` starts a PostgreSQL 16 service with database `crbs_test`, then runs `npm ci`, `prisma generate`, lint, build, `npm run test:db:prepare` and `npm test`. `Client` runs `npm ci`, lint, build and `npm test`.
- Branch protection is not enabled (needs repo admin); the PR template and CODEOWNERS stand in, so "checks must pass" is a team rule, not an enforced one.

## (d) Test results today (server, `npm test`, main at f7329e6)

11 test files, **166 tests, all passing**.

| File | Tests |
| --- | --- |
| admin-rooms-update.test.ts | 28 |
| admin-rooms.test.ts | 20 |
| auth.test.ts | 31 |
| booking-adjacent.test.ts | 2 |
| booking-atomicity.test.ts | 4 |
| booking-concurrency.test.ts | 5 |
| booking-validation.test.ts | 46 |
| bookings.test.ts | 16 |
| health.test.ts | 2 |
| rooms.integration.test.ts | 3 |
| rooms.test.ts | 9 |

For my stories: TC04 (3), TC05 (13), TC09 (5), TC13 (42), TC14 (6) and TC15 (4) all pass. Client tests were not run for this note.
