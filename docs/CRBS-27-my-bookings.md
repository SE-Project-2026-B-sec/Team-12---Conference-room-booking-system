# CRBS-27: My Bookings and cancellation frontend

Uses the merged authenticated `GET /api/bookings` wrapper `{ bookings: [...] }` and CSRF-protected `PATCH /api/bookings/:id/cancel` response `{ bookingId, status }`. Identity comes from the server session; no user ID is sent by the UI.

My bookings displays room, location, capacity, purpose, UTC timestamps formatted in IST, and booking status. Started/past and cancelled bookings have no cancellation action. A native modal confirmation offers Keep booking and Yes, cancel booking, supports Escape and prevents duplicate writes while pending. The server remains authoritative if the start time passes during confirmation.

Success updates the local row only after the write succeeds. A 409 reports a start-time conflict and reloads the real list; other failures are visible without optimistic cancellation. 401 returns to login. There are loading, empty, refresh/retry, 403 security/access and 404 states. Navigation is outside the desktop-only sidebar so both screens remain reachable on small viewports.

Validation on 5 November 2026: 46 frontend tests passed; build and lint passed. Tests cover TC10-TC12 UI states and the authenticated/CSRF cancellation contract. Existing tests for search, booking and login remain green. Browser check against the actual Express/PostgreSQL stack: created synthetic booking #12, dismissed confirmation with Keep booking, reopened and confirmed cancellation, then verified Cancelled after full page reload. No teammate-owned backend code changed.

Expanded keyboard/viewport acceptance belongs to CRBS-36. Firefox acceptance belongs to CRBS-40; these are not claimed by the unit tests.
