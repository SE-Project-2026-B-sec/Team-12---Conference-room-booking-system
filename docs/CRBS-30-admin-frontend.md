# CRBS-30: Admin room management frontend

The administrator-only Manage rooms screen lists real rooms, creates rooms with POST /api/admin/rooms and edits them with PATCH /api/admin/rooms/:id. Both writes use the shared session-cookie and CSRF API client. Ordinary users have no admin navigation; the component also refuses non-admin users. Server-side authorization remains authoritative.

Validation mirrors docs/api/admin-rooms.md: trimmed name 1-100, location 1-200, numeric integer capacity 1-10000, up to 50 facilities of 1-100 characters. Facilities are entered one per line; blank lines are ignored and empty input sends []. Edits prefill existing data and send the editable fields. Existing bookings are not altered. Success uses the server-returned row, and the booking-screen room cache is refreshed too.

Includes loading, empty, retry, validation, session-expiry, security/access, not-found and generic failure states. Failed edits preserve the draft; repeat submits are disabled. Shared sign-out errors remain visible on all workspace screens.

Validation on 5 November 2026: 68 frontend tests, build and lint passed. TC13/TC14 tests include ordinary-user exclusion, create/edit/cancel-edit flows, validation boundaries, 400/401/403/404/500 states, retry, repeated-submit prevention and POST/PATCH CSRF contracts. Live browser: seeded administrator created synthetic CRBS-30 Demo Room at Demo floor with capacity 12, changed it to 14, reloaded, and verified the persisted room also appears with capacity 14 in Find a room. No backend files or dependencies changed.

This story is built on CRBS-27's workspace navigation. Review/merge CRBS-27 first, then retarget this PR to main so its diff contains only admin changes and the main-targeting CI runs. Full keyboard/mobile acceptance is CRBS-36 and Firefox acceptance is CRBS-40.
