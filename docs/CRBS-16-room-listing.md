# CRBS-16 Room listing

`GET /api/rooms` returns a JSON array of rooms with `id`, `name`, `location`, `capacity` and `facilities`, ordered by name then ID. An empty database returns `200 []`. Facilities without entries are `[]`.

Authentication integration contract for CRBS-14: mount the PostgreSQL-backed session middleware before API routers and set `req.session.userId` to the authenticated user's positive integer ID. The listing rejects missing/invalid sessions with 401. It does not accept client-supplied user IDs as authentication. Until CRBS-14 is integrated, real requests remain unauthorized.

`server/tests/rooms.test.ts` covers TC01 response values, an empty database, rooms with no facilities, missing/invalid sessions and safe error propagation. Database calls are mocked in these isolated route tests; final acceptance also requires seeded PostgreSQL and real login-session verification.

Availability search remains the existing CRBS-17 endpoint; this story does not change its behavior.
