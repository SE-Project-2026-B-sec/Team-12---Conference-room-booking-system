# Updates for the SRS / SAD / Test Plan Owner (from Karthik's Merged Stories)

**Author:** Karthik S Prabhu (Team-12)  
**Date:** 10 November 2026  
**Jira Tasks Covered:** CRBS-32, CRBS-33, CRBS-34, CRBS-38, CRBS-44  
**Source Baseline:** Merged code and tests on `main` at commit `5f55109` (CD Run [#42850851140](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42850851140)).  
**Deliverable Scope:** Test-result evidence for TC09 (Concurrency), TC16 (Authentication & Session Security), TC17 (Error Handling & Safe Logging), CI failure blocking demo (CRBS-38 / TC20), and updated RTM / Test Plan baselines.

---

## 1. Executive Summary & Suite Totals

All backend implementations and automated test suites developed under Karthik's Jira assignments have been merged into `main` via passing pull requests. Tests execute against an isolated PostgreSQL 16 database (`crbs_test`) using synthetic fixtures.

### Suite Summary Baseline on `main` (Post-CRBS-38)

- **Server Test Suite:** **13 test files**, **214 tests**, **100% passing** (0 failures, 0 skipped).
- **Client Test Suite:** **5 test files**, **72 tests**, **100% passing** (0 failures, 0 skipped).
- **Combined Test Total:** **286 automated tests, 0 failures**.
- **GitHub Actions Clean CD Run:** [#42850851140](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42850851140) (Server job: 214 passed; Client job: 72 passed).

---

## 2. TC09: Booking Concurrency & Race-Condition Prevention (CRBS-32)

- **Jira Story:** CRBS-32: `[NFR02] Concurrency test: 10 simultaneous request pairs -> exactly one booking each`.
- **Target Requirements:** NFR02 (Concurrent integrity & atomicity), FR07 (Prevent overlapping active bookings).
- **Test File:** `server/tests/booking-concurrency.test.ts`.
- **Pull Request:** PR #37 (Head commit `d943ae5`, merged to `main` as `eb7f704`).
- **GitHub Actions CI Run:** [#42406455415](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42406455415) (Server: 207 passed across 13 files).
- **Test Count:** **7 tests in file, all PASS**.
- **Status:** **PASS**.

### Concurrency Mechanism
The application enforces concurrent booking integrity within `server/src/services/booking-service.ts`:
1. Every booking attempt runs in an explicit Prisma database transaction (`prisma.$transaction`).
2. The target room row is locked immediately using pessimistic row-level locking:
   ```sql
   SELECT "id" FROM "Room" WHERE "id" = $1 FOR UPDATE
   ```
3. Inside the locked transaction, existing bookings for the room are queried for time overlap (`startAt < endAt AND endAt > startAt` with status `CONFIRMED`).
4. If an overlap exists, the transaction throws `AppError("CONFLICT", "Room is already booked for this time slot.", 409)`.
5. If free, the booking row is inserted with status `CONFIRMED`.
6. Competing requests wait on the room row lock, re-check the schedule after acquiring the lock, observe the newly committed booking, and immediately fail with HTTP 409 `CONFLICT`.

### Verified Test Scenarios

| Scenario # | Test Description | Execution Method | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| 1 | 10 sequential pairs for free interval | 10 consecutive pairs of simultaneous `Promise.all` requests targeting identical room and time slot | Exactly one 201 `CONFIRMED` and one 409 `CONFLICT` per pair | 10 pairs executed; 10 confirmed, 10 conflicts; exactly 1 active booking per pair | **PASS** |
| 2 | Burst of 10 simultaneous request pairs across 10 intervals | 20 requests launched simultaneously via `Promise.all` across 10 non-overlapping intervals in the same room | Exactly one 201 and one 409 per interval pair; exactly 10 confirmed bookings total | 10 intervals each yielded strictly 1x 201 and 1x 409; total 10 confirmed bookings | **PASS** |
| 3 | 10 simultaneous pairs across 10 distinct rooms | 20 requests launched concurrently targeting 10 different rooms for the exact same interval | Exactly one 201 and one 409 per room; exactly 1 confirmed booking per room | All 10 rooms recorded strictly 1x 201 and 1x 409; 10 confirmed bookings | **PASS** |
| 4 | 10 competing requests for identical slot | 10 concurrent requests targeting the same room and same 10:00–11:00 interval | Exactly one 201 and nine 409 responses | 1x 201 `CONFIRMED`, 9x 409 `CONFLICT`; exactly 1 row persisted in database | **PASS** |
| 5 | Partially overlapping simultaneous requests | Request A (10:00–11:30) and Request B (11:00–12:00) launched simultaneously | Exactly one 201 and one 409 | Exactly one booking confirmed, one rejected with 409 | **PASS** |
| 6 | Same interval in two different rooms | Request A in Room 1 and Request B in Room 2 (both 10:00–11:00) | Independent rooms allow both to succeed (2x 201) | Both return 201; 2 bookings persisted | **PASS** |
| 7 | Adjacent intervals in same room | Request A (10:00–11:00) and Request B (11:00–12:00) in same room | Back-to-back intervals allow both to succeed (2x 201) | Both return 201; 2 bookings persisted | **PASS** |

### Database Double-Booking Verification
In addition to HTTP response assertions, every test invokes raw SQL verification against PostgreSQL:
```sql
SELECT b1.id AS id1, b2.id AS id2
FROM "Booking" b1
JOIN "Booking" b2 ON b1."roomId" = b2."roomId" AND b1.id < b2.id
WHERE b1.status = 'CONFIRMED' AND b2.status = 'CONFIRMED'
  AND b1."startAt" < b2."endAt" AND b1."endAt" > b2."startAt"
```
Zero overlapping `CONFIRMED` booking rows were found across all runs.

---

## 3. TC16: Authentication, Session Lifecycle, and Security (CRBS-34)

- **Jira Story:** CRBS-34: `[SR03+SR04] 30-min session expiry, logout destroys session, CSRF tokens, 5 failed logins/15 min -> 429`.
- **Target Requirements:** FR01 (User authentication), SR01 (Server-side auth checks), SR02 (Password hashing & cookie security), SR03 (30-min expiry, logout destroy, CSRF), SR04 (Rate limiting 5 failed / 15 min $\to$ 429).
- **Test File:** `server/tests/auth.test.ts`.
- **Pull Request:** PR #38 (Head commit `04c7894`, merged to `main` as `7e7fbe5`).
- **GitHub Actions CI Run:** [#42408155570](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42408155570) (Server: 214 passed across 13 files).
- **Test Count:** **38 tests in file, all PASS** (expanded from original 31 baseline).
- **Status:** **PASS**.

### Breakdown of Verified Scenarios (38 Tests)

| Category | Tests | Key Behaviors Verified | Status |
|---|---|---|---|
| **Login Flow** | 11 | Valid login returns 200 with safe profile (`id`, `name`, `email`, `role`). Excludes password hash. Sets `connect.sid` cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`. Returns CSRF token in `x-csrf-token` header. Regenerates session ID to prevent session fixation. Wrong password returns 401 `UNAUTHENTICATED`. Unknown email returns identical 401 response (preventing user enumeration). 7 malformed payload permutations (missing email, missing password, non-string, whitespace-only, empty body) return 400 `BAD_REQUEST`. | **PASS** |
| **Profile Retrieval** | 2 | `GET /api/auth/me` with active session returns 200 and authenticated user profile. Calling `/api/auth/me` without session cookie returns 401 `UNAUTHENTICATED`. | **PASS** |
| **Logout & Session Invalidation** | 2 | `POST /api/auth/logout` with valid CSRF token destroys session in server store, clears `connect.sid` cookie, and returns 200. Subsequent calls to `/api/auth/me` return 401. Replaying a captured session cookie after logout is rejected with 401. | **PASS** |
| **Session Lifecycle (30-min Expiry)** | 2 | Active session remains valid within 30-minute idle window. Simulating 31 minutes of idle time (`session.cookie.maxAge = 1800000 ms`, advanced via timestamp manipulation) causes session expiration and returns 401. | **PASS** |
| **Login Rate Limiting (SR04)** | 5 | Allows up to 5 consecutive failed login attempts within a 15-minute window (`MAX_ATTEMPTS = 5`, `WINDOW_MS = 15 * 60 * 1000`). The 6th consecutive failed attempt returns HTTP 429 `TOO_MANY_REQUESTS` with safe error JSON and retry guidance. Successful login resets the failure counter. Concurrent burst of 10 failed logins allows exactly 5 attempts and blocks remaining 5 with 429. Memory store prunes expired rate-limit buckets. Expired rate-limit windows reset after 15 minutes. | **PASS** |
| **CSRF Protection (SR03)** | 7 | `GET /api/auth/csrf` issues cryptographically secure CSRF token. Unauthenticated login route is exempt from CSRF. Authenticated state-changing routes (`POST /api/bookings`, `POST /api/auth/logout`, `PATCH /api/admin/rooms/:id`) reject missing token with 403 `FORBIDDEN`. Rejects invalid/tampered token with 403. Accepts valid token via `x-csrf-token` header (200), `csrf-token` header (200), or `_csrf` body field (200). | **PASS** |
| **Production Secrets & Config** | 5 | Production startup validates `SESSION_SECRET`: rejects missing secret, empty secret, and placeholder `"change-me"`. Accepts strong secrets ($\ge 32$ chars). Development mode allows fallback secret with warning. Production rejects non-persistent MemoryStore. | **PASS** |
| **Reverse Proxy Security** | 2 | Express `trust proxy` enabled when explicitly configured (`TRUST_PROXY=true`), correctly resolving client IP from `X-Forwarded-For`. Disabled by default to prevent client IP spoofing. | **PASS** |
| **Test Isolation** | 1 | Test environment defaults to isolated in-memory session store. | **PASS** |
| **Integration Contract** | 1 | `requireSession` middleware accepts positive integer `userId` and rejects missing or malformed session state with 401. | **PASS** |

---

## 4. TC17: Consistent Error Responses, Safe Logging & Information Leak Prevention (CRBS-33 & CRBS-35)

- **Target Requirements:** FR15 (Consistent status codes & safe errors), SR04 (Input validation & parameterized queries), SR05 (Audit logging without credential leaks).
- **Combined Test Count:** **27 tests total across both files, all PASS**.
- **Overall TC17 Status:** **PASS**.

### Components of TC17 Verification

TC17 in the Test Plan specifies both safe error responses without internal information leaks and structured audit logging without credential disclosure. These capabilities were verified across two complementary test suites:

#### 1. Error Responses & Safe 500 Leak Prevention (`error-responses.test.ts` — 22 Tests)
- **Jira Story:** CRBS-33: `[FR15] Consistent 400/401/403/404/409/500 safe error responses` (Karthik S Prabhu).
- **Pull Request:** PR #36 ([Link](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/pull/36), Head commit `5655c2af3e925c48fc1a7199c336b283dc1ec9bb`, merged to `main` as `701fa600a94b41daaaee70172db773c3ee25dc4c`).
- **GitHub Actions CI Run:** [#42406060483](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42406060483) (Server job: 13 files, 205 passed; `error-responses.test.ts`: 22 passed in 529ms).
- **Test Count & Status:** **22 tests, all PASS**.

#### 2. Structured Audit Logging (`audit-logging.test.ts` — 5 Tests)
- **Jira Story:** CRBS-35: `[SR05] Audit logging` (Bhogala Srika).
- **Pull Request:** PR #27 ([Link](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/pull/27), Head commit `a8f7f0af055eab9f19dbe9ea0a7b8c38f51c2014`, merged to `main` as `fd47a1fc1ad84431c278c56e794425af1cf585e8`).
- **GitHub Actions CI Run:** [#42159076365](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42159076365) (Server job: 12 files, 183 passed; `audit-logging.test.ts`: 5 passed in 287ms).
- **Regression Verification:** Continuously re-verified in PR #36 CI Run [#42406060483](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42406060483) (205 passed) and master CD Run [#42850851140](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42850851140) (214 passed).
- **Test Count & Status:** **5 tests, all PASS**.

---

### Uniform Error JSON Envelope
Every error response across the entire API conforms strictly to the standard JSON structure:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe human-readable description"
  }
}
```
For HTTP 400 validation failures, an optional `"fields"` map keyed by field name provides specific field errors without exposing stack traces or internals:
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "fields": {
      "startTime": "Invalid start time format (HH:mm)",
      "endTime": "End time must be after start time"
    }
  }
}
```

### Verified Error Response Matrix (`error-responses.test.ts`, 22 Tests)

| Status Code | Error Code | Scenarios Tested | Verified Behavior | Status |
|---|---|---|---|---|
| **400 Bad Request** | `BAD_REQUEST` | 5 tests: malformed JSON syntax, missing login fields, invalid availability date/time query params, invalid booking body with `fields` map, invalid admin room creation fields. | Returns 400, code `BAD_REQUEST`, descriptive message, and structured `fields` map when applicable. | **PASS** |
| **401 Unauthenticated** | `UNAUTHENTICATED` | 4 tests: accessing protected route without session, invalid login credentials, calling `/api/auth/me` without session, attempting booking creation without session. | Returns 401, code `UNAUTHENTICATED`, safe message; does not distinguish between invalid email vs. password. | **PASS** |
| **403 Forbidden** | `FORBIDDEN` | 3 tests: authenticated write lacking CSRF token, authenticated write with invalid CSRF token, non-admin user attempting admin operations (`/api/admin/rooms`). | Returns 403, code `FORBIDDEN`, explains CSRF requirement or lack of administrative privileges. | **PASS** |
| **404 Not Found** | `NOT_FOUND` | 4 tests: nonexistent API route, unknown room ID during booking, unknown booking ID during retrieval, updating nonexistent room as admin. | Returns 404, code `NOT_FOUND`, resource not found message. Also conceals foreign booking records (returning 404 rather than 403) to prevent ownership enumeration. | **PASS** |
| **409 Conflict** | `CONFLICT` | 2 tests: booking an overlapping time slot for a room, cancelling a booking at or after its scheduled start time. | Returns 409, code `CONFLICT`, explains slot unavailability or non-cancellable state. | **PASS** |
| **500 Internal Error (Leak Prevention)** | `INTERNAL_ERROR` | 4 tests: controlled test fault route throwing unhandled exception, injected database failure during booking transaction, ensuring test fault route is inaccessible in production (returns 404), verifying internal logger captures error details on server while sending generic message to client. | Returns 500, code `INTERNAL_ERROR`, safe message `"An unexpected internal error occurred."`. Response body strictly verified to contain **NO** stack trace, **NO** SQL query fragments, **NO** table/column names, and **NO** server file paths. | **PASS** |

### Verified Audit Logging Matrix (`audit-logging.test.ts`, 5 Tests)

| Action Logged | Trigger | Logged Metadata Verified | Leak Prevention Verified | Status |
|---|---|---|---|---|
| `BOOKING_CREATED` | Successful `POST /api/bookings` | ISO timestamp, actor ID (`userId`), action name, target record ID (`bookingId`), room ID. | No user passwords, session cookies, or CSRF tokens logged. | **PASS** |
| `BOOKING_CANCELLED` | Successful `PATCH /api/bookings/:id/cancel` | ISO timestamp, actor ID, action name, cancelled booking ID. Idempotent repeat calls log cleanly. | Safe logging without credentials. | **PASS** |
| `ROOM_CREATED` | Successful `POST /api/admin/rooms` | ISO timestamp, admin actor ID, action name, created room ID, room name. | No secrets or system tokens. | **PASS** |
| `ROOM_UPDATED` | Successful `PATCH /api/admin/rooms/:id` | ISO timestamp, admin actor ID, action name, updated room ID. | No secrets or system tokens. | **PASS** |
| Validation Rejection | Rejected invalid booking input | Verified that no audit log entry is written for rejected requests. | Clean database state. | **PASS** |

---

## 5. CD Failure Demonstration Evidence (CRBS-38 / TC20 / CD-2)

- **Jira Story:** CRBS-38: `[CD-2] Demo failing-test branch that blocks deployment; capture evidence (run links, commit IDs)`.
- **Target Requirements:** TC20 (CI/CD pipeline verification), NFR05 (Automated build/test/deploy quality).
- **Documentation File:** `docs/ci-failure-demo.md`.
- **Pull Request:** PR #39 ([Link](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/pull/39)).
- **Base Branch:** `main` | **Feature Branch:** `CRBS-38-failing-test-demo`.

### Preserved Demonstration Evidence

1. **Demonstration Commit:** `a1e1f1f96e8c427b516cac181053516f37a020dd`
   - Added deliberately failing automated test `server/tests/ci-failure-demo.test.ts`.
   - Assertion intentionally tested `expect(true).toBe(false)` with message `"Intentional CI failure demonstration for Jira CRBS-38 / CD-2"`.
2. **Failed GitHub Actions Run:** [#42410741338](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42410741338)
   - **Trigger:** Pull request #39 opened targeting `main`.
   - **Server Job:** **FAILED** (Exit code 1 in `npm test` step; 214 passing, 1 failing test).
   - **Client Job:** **PASSED** (72 passed in 10.6s).
   - **Pipeline Result:** Workflow run conclusion = `failure`. Downstream deployment jobs blocked.
3. **Cleanup Commit:** `be3379d658f42df0cb66b6ef0a4b6ad4555abbf2`
   - Removed deliberate failing test `ci-failure-demo.test.ts`.
   - Created permanent evidence record `docs/ci-failure-demo.md`.
4. **Passing GitHub Actions Run:** [#42411612086](https://github.com/SE-Project-2026-B-sec/Team-12---Conference-room-booking-system/actions/runs/42411612086)
   - **Server Job:** **PASSED** (13 files, 214 passed in 37s).
   - **Client Job:** **PASSED** (5 files, 72 passed in 11s).
   - **Pipeline Result:** Workflow run conclusion = `success`.
5. **Merge Commit into `main`:** `cab1820921820b22a0df39a3f9547d86f7b13a3d`
   - Merged cleanly into `main` following verification.

---

## 6. Complete Server & Client Regression Breakdown

### Server Test Suite Breakdown (`main` at `5f55109`, 214 Tests across 13 Files)

| Test File | Tests | Target Requirement & Scope | Status |
|---|---|---|---|
| `server/tests/admin-rooms-update.test.ts` | 28 | FR13, TC13, TC14: Admin room PATCH updates, limits, validation | **PASS** |
| `server/tests/admin-rooms.test.ts` | 20 | FR12, TC13, TC14: Admin room POST creation, role restriction | **PASS** |
| `server/tests/audit-logging.test.ts` | 5 | SR05, TC17: Structured audit logging for booking/room actions | **PASS** |
| `server/tests/auth.test.ts` | 38 | FR01, SR01-SR04, TC16: Auth, session expiry, logout, rate limiting, CSRF | **PASS** |
| `server/tests/booking-adjacent.test.ts` | 2 | FR08, TC08: Adjacent bookings and same interval in different room | **PASS** |
| `server/tests/booking-atomicity.test.ts` | 4 | FR14, NFR02, TC15: Persistence and transactional write atomicity | **PASS** |
| `server/tests/booking-concurrency.test.ts` | 7 | FR07, NFR02, TC09: 10 concurrent pairs, bursts, SQL no-overlap check | **PASS** |
| `server/tests/booking-validation.test.ts` | 46 | FR04, FR06, TC05, TC06: Operating rules, date/time boundary constraints | **PASS** |
| `server/tests/bookings.test.ts` | 16 | FR04, FR05, TC04: Booking creation, retrieval, conflict rejection | **PASS** |
| `server/tests/error-responses.test.ts` | 22 | FR15, TC17: Uniform 400/401/403/404/409 error shape and safe 500 | **PASS** |
| `server/tests/health.test.ts` | 2 | API health check endpoint | **PASS** |
| `server/tests/rooms.integration.test.ts` | 3 | FR02, TC01: Database-backed room queries | **PASS** |
| `server/tests/rooms.test.ts` | 9 | FR02, TC01: Room listing, filtering, and availability unit logic | **PASS** |
| **Server Total** | **214** | **13 files, 100% passing** | **PASS** |

### Client Test Suite Breakdown (`main` at `5f55109`, 72 Tests across 5 Files)

| Test File | Tests | Target Requirement & Scope | Status |
|---|---|---|---|
| `client/src/AdminRooms.test.tsx` | 24 | FR12, FR13, TC13, TC14: Admin room management UI, form validation | **PASS** |
| `client/src/App.test.tsx` | 12 | FR01, FR02, FR03, TC01, TC02, TC16: App navigation, auth routing | **PASS** |
| `client/src/MyBookings.test.tsx` | 16 | FR09, FR10, TC10, TC11, TC18: Booking list, cancellation modal, keyboard | **PASS** |
| `client/src/api.test.ts` | 16 | API client transport, CSRF header attachment, uniform error extraction | **PASS** |
| `client/src/booking-rules.test.ts` | 4 | Client-side booking rule calculations and formatting | **PASS** |
| **Client Total** | **72** | **5 files, 100% passing** | **PASS** |

---

## 7. RTM and Test Plan Document Modifications

The master project documents have been updated directly on branch `CRBS-44-test-result-evidence`:

### 1. `Test_Plan_Conference_Room_Booking_System.docx`
- **Revision History (Table 0):** Added version `1.4` entry dated `10 November 2026`:
  > *"Documented test-result evidence for TC09, TC16, TC17 (CRBS-44); updated regression evidence snapshot to 214 server tests / 72 client tests across all suites."*
- **TC09 (Concurrent Booking):** Added explicit `Actual:`, `Status: PASS`, and `Evidence:` fields documenting 7 passing scenarios in `booking-concurrency.test.ts`, PR #37, and CI run #42406455415.
- **TC16 (Authentication and Transport):** Added explicit `Actual:`, `Status: PASS`, and `Evidence:` fields documenting 38 passing scenarios in `auth.test.ts`, PR #38, and CI run #42408155570.
- **TC17 (Safe Input and Logging):** Added explicit `Actual:`, `Status: PASS`, and differentiated `Evidence:` fields:
  - Error responses (FR15/SR04): PR #36 (commit `5655c2a`, merged `701fa60`), CI run #42406060483 (`error-responses.test.ts`: 22 passed).
  - Audit logging (SR05): PR #27 (CRBS-35, commit `a8f7f0a`, merged `fd47a1f`), CI run #42159076365 (`audit-logging.test.ts`: 5 passed); also regression-verified in run #42406060483 and clean CD run #42850851140.
- **Documentation Evidence Snapshot:** Added Karthik's documentation handoff snapshot detailing the final 214-test server suite and 72-test client suite (286 total passing).

### 2. `SRS_Conferene_Room_Booking.docx` (Table 9 — Requirements Traceability Matrix)
- **Row 1 (FR01 - User Authentication):** Updated execution evidence to 38 tests in `auth.test.ts` (CRBS-34, PR #38, CI run #42408155570, PASS).
- **Row 7 (FR07 - Conflict Prevention):** Updated execution evidence to 7 tests in `booking-concurrency.test.ts` (CRBS-32, PR #37, CI run #42406455415, PASS).
- **Row 14 (FR14 - Persistence & Atomic Writes):** Updated TC09 reference to 7 tests in `booking-concurrency.test.ts` (CRBS-32).
- **Row 15 (FR15 - Safe Error Responses):** Explicitly mapped to TC17 and updated evidence to 22 tests in `error-responses.test.ts` (CRBS-33, PR #36, CI run #42406060483, PASS), plus latest 214 server / 72 client baseline on `main` (commit `5f55109`, CD run #42850851140).
- **Row 17 (NFR02 - Concurrency & Atomicity):** Updated execution evidence to 7 tests in `booking-concurrency.test.ts` (CRBS-32, PR #37, CI run #42406455415, PASS).
- **Row 22 (SO02 / SR02–SR05 - Security Objectives):** Updated execution evidence to clearly delineate all contributing security suites: `auth.test.ts` (38 tests, CRBS-34, PR #38, CI run #42408155570), `error-responses.test.ts` (22 tests, CRBS-33, PR #36, CI run #42406060483), and `audit-logging.test.ts` (5 tests, CRBS-35, PR #27, CI run #42159076365) within the final 214-test server suite.
