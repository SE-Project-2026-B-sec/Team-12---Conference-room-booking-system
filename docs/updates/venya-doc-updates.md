# Venya documentation handoff - CRBS-45

Prepared 5 November 2026 from the merged API contracts and Venya's requirement branches. Srika owns copying these notes into the SRS, SAD, Test Plan and final RTM. Unexecuted acceptance cases below remain unverified; they are not converted to Passed.

## Source and review order

- CRBS-27: `f718d92`, PR #22. My Bookings and cancellation. 46 client tests, build and lint passed; GitHub CI run 42067344307 passed for that commit.
- CRBS-30: PR #23 / merge commit `d9f8f38`, merged on main after CRBS-27. Admin create/edit/list. 68 client tests, build and lint passed locally.
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
- CD/deployment evidence is owned by Harish. The CD pipeline (PR #28) is merged on main and its first run was green, as reported by Harish. The self-hosted deploy job remains gated by DEPLOY_ENABLED; a green pipeline run is not, by itself, proof that a deployment ran. See docs/updates/harish-doc-updates.md for deployment evidence.

## Browser acceptance handoff

The historical pending notes above are supplemented by the guided manual results below; they are not a claim that the entire browser matrix was rerun.

## NFR03 / NFR04 acceptance evidence

Date: 6 November 2026. Manual operator: Venya; guided in chat. Application under test: local `CRBS-36-focus-ring-fix`, commit `f63fc0e`, frontend on port 5173, Express on port 3000, PostgreSQL in Docker. This identifies the tested code, rather than assuming the latest main was tested. Firefox version: **159.0.1 (64-bit)**, confirmed by About screenshot. Chrome version: **not recorded; Chrome not run**. Harish separately reported Chromium 158 and Firefox 159 checks on pre-fix main; those are separate evidence.

### Firefox functional smoke test - operator-reported pass

- Seeded regular-user and admin login worked. Empty login submission was blocked with the required-email message. At 360x800 and 1366x768, Venya confirmed the login layout fits; at both sizes keyboard outlines were reported visible on email, password and Sign in.
- Availability search for 8 November 2026, 10:00-11:00 returned four rooms in the test data then present. Conference Room A booking #21 was created with purpose Firefox smoke test and remained Confirmed with the correct details after reload.
- Two tabs selected Conference Room A for 8 November, 11:00-12:00 before either submitted. The first succeeded; the second displayed "That room was just booked for this time. Choose another room or search a different time." Screenshot confirms the UI conflict message; the HTTP status was not captured in Network tools.
- Booking #18 cancellation: initial dialog screenshot shows Keep booking's dark ring. Venya reported Tab moved to Yes cancel then wrapped to Keep booking; Escape closed the dialog and restored the opener. Actual cancellation changed #18 to Cancelled; it remained cancelled after reload with no cancellation action.
- Admin created Firefox Test Room at Test Floor, capacity 8, facilities Projector; changed capacity to 10 and confirmed persistence after reload. Normal-user navigation did not show Manage rooms. Direct forced access/HTTP 403 was not independently rerun here.
- Fresh authenticated reload followed by first Tab reached Skip to main content. Enter activated it; subsequent keyboard traversal reached Date, From, Until, Minimum capacity and Find rooms with visible outlines, as reported by Venya. An initially uncertain date outline was explicitly rechecked and confirmed visible.
- Invalid interval From 11:00 / Until 10:00 showed "Choose an end 30 to 240 minutes after the start." Venya confirmed focus moved to Until. At 360x800, empty admin create submission displayed required-field errors and focused Name without creating a room.

### Exact-size checks explicitly performed by Venya

- Firefox 360x800: login fit, validation and keyboard outlines; search page controls fit without horizontal scrolling; My Bookings details/actions fit, cancellation dialog fit with Escape/opener restore; admin form/list/Create/Edit fit, required-field errors and Name focus. **Pass for these stated checks.** Complete end-to-end booking/admin writes were exercised earlier in the session, not separately repeated at each exact size.
- Firefox 1366x768: admin form/list/actions, Find a room and My Bookings fit without horizontal scrolling; login fit and email/password/Sign in keyboard outlines. **Pass for these stated checks.** Dialog/overlap and every control on every page were not separately repeated at this exact size.
- Chrome 1366x768: **not run**.
- Chrome 360x800: **not run**.

Screenshots are in `docs/evidence/CRBS-40/`: Firefox About, login with 360x800 toolbar (earlier pre-fix visual evidence), post-fix dialog focus, cancelled booking #18, overlap message and From focus. Cropped screenshots do not establish exact viewport sizes; the size-specific results above are Venya's explicit observations. The dialog ring is visibly present, but its appearance before any Tab was not separately confirmed for a keyboard-opened Firefox dialog. Quantitative contrast measurement and complete post-fix cross-browser signoff remain pending. Do not mark unexecuted matrix entries Passed or infer them from unit tests.

After the requirement PRs merge, execute the checklist in `docs/CRBS-36-keyboard-accessibility.md` at both exact sizes and run the core login/list/search/book/cancel flows in Firefox, recording version, commit, steps, outcome and screenshots. Then update CRBS-36/40 evidence and copy the final results into the formal documents. These notes are ready for review; the pending browser outcomes still prevent a full final test-summary signoff.
