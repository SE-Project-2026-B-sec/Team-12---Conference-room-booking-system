# CRBS-22 Sprint 1 frontend

Implements Venya's login, room list/search and booking form using the real API contracts already merged for CRBS-14, CRBS-17 and CRBS-18. It also needs CRBS-16's `GET /api/rooms`; merge that story before end-to-end acceptance of this PR. No backend routes, database schema or teammate-owned services are changed here.

The browser restores sessions with `GET /api/auth/me`, signs in with `POST /api/auth/login` and lists rooms with `GET /api/rooms`. Availability uses `GET /api/rooms/availability` with date, startTime, endTime and optional capacity. Booking uses `POST /api/bookings`; logout uses `POST /api/auth/logout`. Session cookies use same-origin credentials. CSRF tokens returned in the auth response header are kept only in memory and attached to writes; passwords/tokens are never put in localStorage or logs.

The UI validates IST dates, the 30-calendar-day horizon, 30-minute boundaries, 09:00–18:00 hours, 30–240-minute duration, capacity and purpose. The server remains authoritative. Changing search criteria invalidates previous availability/selection. Confirmation shows the actual server booking ID and times only after a successful response. A 409 conflict refreshes availability; expired sessions return to login; pending booking submissions disable repeat clicks. Loading, empty results, failed requests and retry are handled explicitly.

Run the existing client scripts: `npm test`, `npm run build`, `npm run lint`, and `npm run dev`. The Vite proxy forwards /api to the server on port 3000. Start the database, apply migrations and seed synthetic accounts using the existing project instructions before a real browser demo. Keep .env untracked.

Test mapping: TC01 room details; TC02 search and empty results; TC04 successful creation; TC05/TC06 inline validation and server errors; TC07 stale availability conflicts; TC16 session/CSRF request handling. Vitest UI tests mock the API boundary and are distinct from PostgreSQL integration and real-browser acceptance.

My bookings, cancellation screens, administrator screens, a Firefox acceptance run and expanded accessibility testing belong to later assigned stories and are not implemented here. No CI or deployment workflow changes are included.
