# Conference Room Booking System

A Software Engineering mini-project for managing conference rooms in organizations and colleges. The application lets authorized users check room availability, reserve a room, view their bookings and cancel upcoming reservations. Administrators maintain room details.

## Project status

As of 10 November 2026 the following are implemented and merged to `main`: sign-in with server-side sessions (30-minute expiry, CSRF protection, login rate limiting), room listing, availability search, atomic booking with conflict prevention, My Bookings with cancellation, admin-only room create and edit, and audit logging. Pull requests run CI; every merge to `main` runs CD, which builds a commit-tagged Docker image. Evidence is under [Testing](#testing) and [CD / Deployment](#cd--deployment).

Known limitations, all logged in [docs/DEVIATIONS.md](docs/DEVIATIONS.md): GitHub branch protection (Jira CRBS-47) and the self-hosted deploy job need repository admin rights we did not have, so deployment is demonstrated with `scripts/deploy-local.sh` and a smoke test.

## Project documents

- [Software Architecture and Design — SAD, version 1.1](SAD_Conference_Room_Booking_System.docx): layered architecture, components, booking flows, security considerations and the implemented API contracts. Prepared by Bhogala Srika.
- [Software Test Plan — STP, version 1.3](Test_Plan_Conference_Room_Booking_System.docx): test strategy, 20 initial test scenarios, traceability, sprint testing activities and CI/CD verification. Maintained by Dabbugunta Venya Anand.
- [Software Requirements Specification — SRS](SRS_Conferene_Room_Booking.docx): functional, non-functional and security requirements, with evidence notes.

The Test Plan makes concrete release assumptions where the original SAD left choices open; Section 11 and Appendix A of the Test Plan are the requirements baseline. Appendix A defines 15 functional requirements, 5 non-functional requirements, 2 security objectives and 5 security requirements. Differences between the implementation and the documents are recorded in [docs/DEVIATIONS.md](docs/DEVIATIONS.md).

Keep all three deliverables and application code in this single team repository. Submit only this repository’s link in the course spreadsheet.

## Release scope

### Users

- Sign in using a seeded account; self-registration is outside this release.
- View room names, locations, capacities and facilities.
- Search availability by date and time, with an optional minimum-capacity filter.
- Create an immediately confirmed booking with a meeting purpose.
- View their own bookings and cancel eligible upcoming bookings.

### Administrators

- Create rooms and update room details.
- Use ordinary booking functions with the same ownership restrictions as other users.

Recurring reservations, approval workflows, email notifications, calendar integrations, booking edits and room deletion/deactivation are outside this release. Change a reservation by cancelling it and creating a new one.

## Booking rules

- Organizational timezone: **Asia/Kolkata**. Store timestamps in UTC and display local times consistently.
- Operating hours: **09:00–18:00 every day**.
- Start and end times must fall on 30-minute boundaries. Duration must be **30–240 minutes**, within one local calendar day.
- Start time must be in the future; the booking date may be at most 30 local calendar days ahead.
- Successful bookings receive `CONFIRMED` status. Cancelled bookings retain their records with `CANCELLED` status.
- Only confirmed bookings block a room. Overlapping reservations for the same room are rejected, including simultaneous requests.
- Back-to-back bookings are allowed without a buffer: 10:00–11:00 and 11:00–12:00 do not overlap.
- Owners may cancel strictly before the start time. Repeating an already completed cancellation has no further effect.
- A trimmed meeting purpose of 1–200 characters is required.

## Architecture and stack

The application follows the SAD’s layered design: browser interface → application/API services → database. Authentication, room management and booking logic remain separate modules within one application.

- **Frontend:** React, TypeScript and Tailwind CSS.
- **Backend:** Node.js and Express.
- **Persistence:** PostgreSQL with Prisma.
- **Authentication:** server-side sessions stored in PostgreSQL; hashed passwords and protected session cookies.
- **Testing:** Vitest (client and server) and Supertest (API), plus manual browser checks.
- **Automation and deployment:** GitHub Actions, Docker and Docker Compose.

Server-side validation, role/ownership checks and atomic database operations protect booking integrity. The browser alone must not decide whether a booking is permitted.

## Testing

The Test Plan covers unit, API/database integration, browser, security and user acceptance testing. Priority checks include simultaneous booking attempts, forbidden access to another user’s booking, cancellation, persistence and safe error handling.

The small performance check (TC19) uses 5 concurrent users, 5 rooms and 100 initial bookings over a warmed-up 2-minute run. Targets are a 95th-percentile response time of at most 3 seconds for availability and booking, unexpected errors below 5%, and no duplicate active reservations. Result (commit `ac1cf63`, Windows laptop, 8 logical CPUs, 15.7 GiB RAM): availability 595 requests, p95 170 ms; booking 595 requests, all `201`, p95 336 ms; zero unexpected failures. Details are in [docs/performance-testing/](docs/performance-testing/).

Automated tests live in `server/tests` and `client/src`; test names carry the Test Plan IDs (TC01 to TC20) where they apply. The last full verification (9 November 2026, commit `ac1cf63`) passed 72 client and 214 server tests; see [docs/updates/final-verification-2026-11-09.md](docs/updates/final-verification-2026-11-09.md). Other evidence: the failing-test-blocks-CI demonstration ([docs/ci-failure-demo.md](docs/ci-failure-demo.md)), browser and accessibility checks ([docs/evidence/](docs/evidence/)) and the demo recordings in [docs/demo/](docs/demo/). Release readiness requires passing critical checks and no unresolved critical or high-severity defects; Venya confirmed the full manual Firefox checklist passed at 360×800 and 1366×768. See the verification notes for the test scope.

## CI/CD workflow

1. A pull request runs lint, build and automated tests (`ci.yml`, jobs `Server` and `Client`) on a GitHub-hosted runner, using an isolated PostgreSQL service.
2. A merge to `main` runs `cd.yml`: CI must pass, then a commit-tagged Docker image is built and pushed to `ghcr.io`.
3. A deployment job for a self-hosted runner on a team laptop starts the application and PostgreSQL with Docker Compose, applies migrations and runs an automated smoke test. It is disabled by default because registering a runner needs repository admin rights (see [CD / Deployment](#cd--deployment)); `scripts/deploy-local.sh` is the documented fallback.
4. Failed tests block image publication and deployment (demonstrated in [docs/ci-failure-demo.md](docs/ci-failure-demo.md)). Failed deployment or smoke checks mark the run failed; recovery to the previous image is manual.

Run laptop deployment only for trusted code from `main`. Keep secrets out of the repository and run untrusted pull-request checks on GitHub-hosted runners. The laptop and Docker must be running for the demonstration. Paid hosting, Kubernetes and automatic rollback are not required by this project baseline.

Retain successful pipeline logs, evidence of a failing test blocking deployment, the deployed commit ID and smoke-test results for evaluation.

## Sprint schedule and Jira

- **27 October 2026, before Sprint 1:** submit SRS, SAD and Test Plan.
- **Sprint 1 — 27–31 October 2026:** prioritize sign-in, availability, booking, persistence, conflict prevention and initial CI.
- **Sprint 2 — 2–7 November 2026:** complete administration and cancellation, regression/security checks, deployment verification and acceptance testing.
- **Presentations — starting 9 November 2026:** demonstrate the working application, documents, Jira progress and CI/CD evidence.

These dates follow the announcement rather than the older image timeline. The announcement leaves the final submission opening date blank; follow the instructor’s clarification when provided.

Track stories, estimates, owners and defects in Jira. Follow the course-defined workflow; otherwise use `To Do → In Progress → Review → Testing → Done`. Update progress regularly and link issues to relevant code and test evidence. Mark work Done only after review and verification so the burndown reflects completed work.

## Team

- Harish Ramesh Kumar
- Bhogala Srika
- Karthik S Prabhu
- Dabbugunta Venya Anand

The Test Plan records the working responsibility allocation. All team members share implementation, review and testing responsibilities.

## Repository layout

```
client/   React + TypeScript + Tailwind (Vite): src/{pages,components,api}
server/   Express + TypeScript (Prisma + PostgreSQL): src/{routes,services,middleware,lib}, prisma/schema.prisma, tests/, performance/
docs/     DEVIATIONS.md (SRS/SAD/Test Plan are the source of truth; log any deviation there), api/, demo/, evidence/, performance-testing/, updates/
scripts/  deploy-local.sh, smoke-test.sh
.github/  workflows (ci.yml, cd.yml), pull request template, CODEOWNERS
*.docx    SRS, SAD and Test Plan (repository root)
```

## How to run

Requirements: Node.js 22 and npm (CI and the Docker image use Node 22).

```bash
cp .env.example .env        # never commit .env

# Server (http://localhost:3000, try GET /api/health)
cd server && npm install && npm run dev

# Client (http://localhost:5173, proxies /api to the server)
cd client && npm install && npm run dev
```

Scripts available in both `client/` and `server/`: `npm run dev`, `npm run build`, `npm run lint`, `npm test`.

### First run (local development)

A new database is empty; create the schema and (optionally) the demo data once:

```bash
cp .env.example .env                      # then edit the dev values if you like; never commit .env
docker compose up -d db                   # PostgreSQL, published on 127.0.0.1:5432
cd server
npm install
npx prisma generate                       # generate the Prisma client
npx prisma migrate deploy                 # create the tables (safe to repeat)
npx prisma db seed                        # optional: demo users, rooms and one booking
npm run dev                               # API on http://localhost:3000
# in another terminal: cd client && npm install && npm run dev
```

Seeded demo accounts (synthetic, for local use only):

| Role | Email | Password |
| --- | --- | --- |
| User | `demo.user@example.com` | `User123!@#` |
| Administrator | `demo.admin@example.com` | `Admin123!@#` |

`DATABASE_URL` differs by where the code runs: on the host (npm commands above) it uses `localhost:5432`, as in `.env.example`. Inside Docker Compose the `app` and `migrate` services override it to use the host name `db`, so you do not edit it for Compose.

To start over with an empty database: `docker compose down -v` (deletes the `pgdata` volume), then repeat the steps above. Integration tests use a separate `crbs_test` database; see "Integration tests".

### Docker Compose

```bash
cp .env.example .env
docker compose up --build      # app on http://localhost:3000, PostgreSQL as service `db`
docker compose run --rm migrate   # first time only: create the tables (see First run for seeding)
curl http://localhost:3000/api/health
docker compose down            # add -v to also delete the database volume
```

The single `app` image serves the API and the built client; both services have healthchecks and `app` waits for a healthy `db`.

### Integration tests (database)

`server/tests/bookings.test.ts` runs against a real PostgreSQL database named `*_test`; the tests refuse to run if the name in `DATABASE_URL_TEST` does not end with `_test`, so they cannot touch the dev database. The compose `db` service publishes port 5432 on `127.0.0.1` for this.

One-time setup (database running via `docker compose up -d db`):

```bash
# add DATABASE_URL_TEST (see .env.example) to your .env, then:
docker compose exec db psql -U "$POSTGRES_USER" -c "CREATE DATABASE crbs_test;"
cd server && npm run test:db:prepare   # applies Prisma migrations to crbs_test
npm test
```

Without `DATABASE_URL_TEST` (or the schema), `bookings.test.ts` fails with a clear message rather than skipping. Each test creates and deletes its own synthetic rows.

## CD / Deployment

`.github/workflows/cd.yml` ("CD") runs on every push to `main` and can be started by hand (workflow_dispatch):

1. **ci** reuses `ci.yml` (jobs `Server` and `Client`). If any test fails, nothing below runs.
2. **build-image** builds the `Dockerfile` and pushes `ghcr.io/<owner>/<repo>:<commit-sha>` and `:latest` using the built-in `GITHUB_TOKEN` (the image reference is printed in the job summary).
3. **deploy** pulls the commit-tagged image, applies pending database migrations (`migrate` service, see below), starts the app with `docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d` and runs `scripts/smoke-test.sh`. It is **skipped by default**.

**Enable the self-hosted deploy job:** register a self-hosted runner (needs repo admin; Docker must be running on that machine), put your real environment file at `~/crbs.env` on the runner machine (copy of `.env.example`; or set the repo variable `DEPLOY_ENV_FILE` to another path; it is never stored in git), then set the repository variable `DEPLOY_ENABLED` to `true` (Settings > Secrets and variables > Actions > Variables).

**Deploy by hand (no runner needed):**

```bash
cp .env.example .env                 # once
./scripts/deploy-local.sh            # builds crbs-app:<HEAD sha> locally, migrates the database, starts it, runs the smoke test
./scripts/deploy-local.sh --seed     # same, plus loads the demo data once and checks a demo sign-in
./scripts/deploy-local.sh <sha>      # a specific commit
./scripts/deploy-local.sh <sha> --pull   # use the ghcr.io image instead of building
docker compose down                  # stop everything afterwards
```

`scripts/smoke-test.sh [base-url]` can be run against any running instance (default `http://localhost:3000`): it waits up to 30 s, then checks `GET /api/health` returns 200 and `GET /api/rooms` without a session returns 401 with the standard error JSON.

**ghcr.io package visibility:** new packages are private. To change it, open the repository's Packages, select the package, then Package settings > Danger Zone > Change visibility (needs admin rights on the package). A private image needs `docker login ghcr.io` with a token that has `read:packages` before `--pull` works on another machine. 
**Migrations and seed in deploys:** every deploy (script or workflow) runs `prisma migrate deploy` before starting the app, so a fresh database gets its tables and a repeat run does nothing. The runtime image has no Prisma CLI, so this runs in a one-off `migrate` container (`docker-compose.yml`, profile `tools`) built from the Dockerfile's `server-build` stage. Seeding is never automatic: use `./scripts/deploy-local.sh --seed`, or tick **seed** when you start the CD workflow by hand (the deploy job also needs `DEPLOY_ENABLED=true`). With seeding on, the smoke test also signs in as the demo user (`SEED_CHECK=1`).

## Contributing: branches, commits and PRs

- Never commit to `main` directly.
- One branch per Jira story, named `CRBS-<n>-<short-name>`, e.g. `CRBS-11-scaffold`.
- Every commit message starts with the Jira key, e.g. `CRBS-11: add server skeleton`.
- One pull request per story; the PR title starts with the Jira key. Build, lint and tests must pass before review.
- No secrets in git: use `.env.example` for variable names. Use synthetic data only.
- PRs must use the pull request template, have green `Server` and `Client` checks, and get an owner review (requested automatically via CODEOWNERS) before merging.
- Direct commits to `main` are not allowed by team rule. GitHub branch protection needs repo admin rights and is tracked as Jira card CRBS-47.

## API conventions

- Errors are always `{ "error": { "code": "...", "message": "..." } }` using 400/401/403/404/409, plus a safe 500.
- Timestamps are stored in UTC; the organisation timezone is Asia/Kolkata; time intervals are half-open `[start, end)`.
