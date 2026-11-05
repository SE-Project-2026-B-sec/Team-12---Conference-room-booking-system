# Venya documentation handoff - CRBS-45

Prepared 5 November 2026 from the merged API contracts and Venya's requirement branches. Srika owns copying these notes into the SRS, SAD, Test Plan and final RTM. Unexecuted acceptance cases below remain unverified; they are not converted to Passed.

## Source and review order

- CRBS-27: `f718d92`, PR #22. My Bookings and cancellation. 46 client tests, build and lint passed; GitHub CI run 42067344307 passed for that commit.
- CRBS-30: `2665e5f`, PR #23, built on CRBS-27. Admin create/edit/list. 68 client tests, build and lint passed locally.
- CRBS-36: `3f961ed`, built on CRBS-30. Keyboard/focus implementation. 71 client tests, build and lint passed locally. Exact required viewports remain unverified.
- Review and merge the requirement PRs in order. PRs based on another requirement branch need retargeting to main after that branch merges; the current CI workflow only triggers for PRs targeting main. Do not copy a local test result into the GitHub CI column.

## SAD API rows used by the frontend

- GET `/api/rooms`: session cookie; array of `{ id, name, location, capacity, facilities }`. Used for room search/list and admin list.
- GET `/api/rooms/availability?date=YYYY-MM-DD&startTime=HH:mm&endTime=HH:mm&capacity=...`: `{ rooms: [...] }`; capacity omitted if blank.
- POST `/api/bookings`: session plus CSRF header, JSON `{ roomId, date, startTime, endTime, purpose }`; success 201 `{ bookingId, status, roomId, startAt, endAt }`. No client-supplied user identity.
- GET `/api/bookings`: session cookie; `{ bookings: [...] }`. Each item contains `id`, `roomId`, `startAt`, `endAt`, `purpose`, `status`, `createdAt` and room `{ name, location, capacity }`. Only the server-owned list is rendered; no user-ID filter is supplied.
- PATCH `/api/bookings/{id}/cancel`: session plus CSRF header; no JSON identity/body required; success 200 `{ bookingId, status: "CANCELLED" }`. UI handles 401 by returning to login, 403 with security/access guidance, 404 as no longer available, 409 as already started with a list refresh, and other failures without optimistic cancellation.
- POST `/api/admin/rooms`: admin session plus CSRF; `{ name, location, capacity, facilities }`; returns created room, 201.
- PATCH `/api/admin/rooms/{id}`: same security, sends editable room fields; returns updated room, 200. Omitted fields are supported by the API, although the UI sends the full editable draft. Sending an empty facilities array clears facilities.

Admin limits exactly match `docs/api/admin-rooms.md`: name 1-100, location 1-200, integer capacity 1-10000, up to 50 facilities of 1-100 trimmed characters. UI textarea uses one facility per line. 400 fields are linked to their labels/errors; 401/403/404/500 have visible feedback. Updating room details does not change bookings.

## SRS UI text for Srika to incorporate

My Bookings lists the signed-in user's booking room, location, capacity, purpose, interval in IST and current status. Only future confirmed bookings expose cancellation. Cancellation requires a labelled confirmation with Keep booking and Yes cancel; the server decides if a start-time boundary has passed. Success updates the row only after the server succeeds; conflict, access, not-found and network errors are distinct. A refresh/retry action is available.

Manage rooms is visible only to administrators and is guarded again at component level. Administrators list, create and prefill/edit room details with required labels, inline validation, pending-submit protection and preserved drafts on failure. The server remains responsible for authorization. Successful room changes refresh the booking-screen room data.

Keyboard behavior includes skip links, labelled native controls, visible focus, focus after navigation, search results, room choice, validation and feedback. The cancellation modal initially focuses Keep booking, wraps Tab and Shift+Tab, supports Escape without a write, restores its opener, and holds focus while a cancellation is pending. Both 360x800 and 1366x768 remain mandatory targets; do not remove those requirements because local acceptance is pending.

## RTM and actual execution notes

FR02 / TC01: existing room-list unit/contract tests pass; actual seeded-user/admin browser listings were displayed, including a newly persisted admin room. This is UI evidence, not a replacement for the backend room-field tests.

FR03 / TC02-TC03: availability/error component and API-client tests pass. Actual real-API searches returned free rooms during booking and cancellation checks. A full seeded overlap matrix belongs to backend TC07/TC08; no new claim that every TC02/TC03 endpoint case was manually repeated.

FR04-FR08 / TC04-TC06: existing form-validation tests remain green. Actual UI created synthetic bookings 12, 13 and 14. The server validation suite provides operating-rule boundary evidence; frontend tests do not certify every backend boundary or concurrent integrity.

FR09-FR11 / TC10-TC12: `client/src/MyBookings.test.tsx` and the cancellation API-client contract verify list, empty/retry, confirmation, Keep/Escape, pending submits, success, conflict and failure/session states. Actual booking 12 was cancelled and remained cancelled after reload. Bookings 13 and 14 exercised keyboard cancellation. Foreign-owner endpoint authorization is not established by these UI tests.

FR12-FR13 / TC13-TC14: `client/src/AdminRooms.test.tsx` plus API-client tests cover admin-only UI, create/edit/cancel-edit, limits, error responses, retry and duplicate submits. Seeded admin created CRBS-30 Demo Room with capacity 12, updated it to 14 and verified persistence and refreshed Find a room data. Direct API role-tampering is covered by Harish's backend tests, not claimed by UI visibility tests.

NFR03 / TC18: implementation and focus regression tests pass. Real browser trace verified skip to main, date control, search heading, purpose, action order, booking feedback, dialog wrapping, Escape/opener restore and cancellation feedback. See `docs/evidence/CRBS-36-keyboard.json`. **Partial execution only:** requested 360x800 and 1366x768 overrides did not produce those actual dimensions, so those viewport cases remain NOT VERIFIED. Observed sizes included 678x668 and 1280x720.

NFR04 / Firefox: **NOT RUN**. Firefox was not found in the standard system/user installation locations. No Firefox version or compatibility pass is invented. The in-app browser checks above are not recorded as the required Firefox manual smoke test or a completed automated Chromium suite. Record actual Chromium/Firefox versions during the final browser run.

UI unit checks currently total **71 passed**, across App, MyBookings, AdminRooms, API client and booking-rule tests. Builds and lint passed locally after the final focus change. Unit tests use mocked API responses; the explicitly described real browser checks use the actual Express/PostgreSQL stack. Do not combine those evidence types.

## Alignment items for Srika

- The Test Plan's TC12 expects 403 for another user's booking, while the merged CRBS-25/26 API deliberately hides such records with 404. This is a backend-owned baseline alignment question; I did not change the endpoint behavior. Align the final RTM/SRS/SAD with the agreed owner decision.
- Retain exact viewport and Firefox cases as pending until real execution evidence is supplied.
- CRBS-42's Sprint 1 video is merged; the two-minute Sprint 2 recording is still required. Venya intends to record it herself.
- CD/deployment evidence is still owned by Harish. Only ci.yml is currently present; no deployment success is claimed in these UI notes.

## Browser acceptance handoff

After the requirement PRs merge, execute the checklist in `docs/CRBS-36-keyboard-accessibility.md` at both exact sizes and run the core login/list/search/book/cancel flows in Firefox, recording version, commit, steps, outcome and screenshots. Then update CRBS-36/40 evidence and copy the final results into the formal documents. These notes are ready for review; the pending browser outcomes still prevent a full final test-summary signoff.
