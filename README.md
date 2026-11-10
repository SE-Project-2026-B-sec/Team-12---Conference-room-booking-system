# Conference Room Booking System

A Software Engineering mini-project for managing conference rooms in organizations and colleges. The application lets authorized users check room availability, reserve a room, view their bookings and cancel upcoming reservations. Administrators maintain room details.

## Project status

As of 10 November 2026 the following are implemented and merged to `main`: sign-in with server-side sessions (30-minute expiry, CSRF protection, login rate limiting), room listing, availability search, atomic booking with conflict prevention, My Bookings with cancellation, admin-only room create and edit, and audit logging. Pull requests run CI; every merge to `main` runs CD, which builds a commit-tagged Docker image. Evidence is under [Testing](#testing) and [CD / Deployment](#cd--deployment).

Known limitations, all logged in [docs/DEVIATIONS.md](docs/DEVIATIONS.md): GitHub branch protection (Jira CRBS-47) and the self-hosted deploy job need repository admin rights we did not have, so deployment is demonstrated with `scripts/deploy-local.sh` and a smoke test; some Firefox viewport combinations are unverified.

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

Automated tests live in `server/tests` and `client/src`; test names carry the Test Plan IDs (TC01 to TC20) where they apply. The last full verification (9 November 2026, commit `ac1cf63`) passed 72 client and 214 server tests; see [docs/updates/final-verification-2026-11-09.md](docs/updates/final-verification-2026-11-09.md). Other evidence: the failing-test-blocks-CI demonstration ([docs/ci-failure-demo.md](docs/ci-failure-demo.md)), browser and accessibility checks ([docs/evidence/](docs/evidence/)) and the demo recordings in [docs/demo/](docs/demo/). Release readiness requires passing critical checks and no unresolved critical or high-severity defects; items not yet verified (for example some Firefox viewport combinations) are listed in the verification notes.

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
- **Sprint 2 — 2–9 November 2026:** complete administration and cancellation, regression/security checks, deployment verification and acceptance testing.

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

Use Node.js 22 and npm for local development. Start Docker before running the Compose commands. Run the commands below from the repository root in Bash or Git Bash unless a step changes directories.

### First run for local development

1. Create the local environment file and start PostgreSQL.

   ```bash
   [ -f .env ] || cp .env.example .env
   docker compose up -d db
   ```

2. Install the server dependencies, generate the Prisma client, and apply the database migrations. The seed command is optional and loads the demo accounts and sample data.

   ```bash
   cd server
   npm ci
   npx prisma generate
   node --env-file=../.env node_modules/prisma/build/index.js migrate deploy
   node --env-file=../.env --import tsx prisma/seed.ts
   node --env-file=../.env --import tsx --watch src/index.ts
   ```

   The API runs at `http://localhost:3000`. Check it at `http://localhost:3000/api/health`.

3. Open another terminal at the repository root and start the frontend.

   ```bash
   cd client
   npm ci
   npm run dev
   ```

   Open `http://localhost:5173`. Vite forwards `/api` requests to the server on port `3000`.

Both `client/` and `server/` provide `npm run dev`, `npm run build`, `npm run lint`, and `npm test`. Keep `.env` out of Git.

Seeded accounts for local demos:

| Role | Email | Password |
| --- | --- | --- |
| User | `demo.user@example.com` | `User123!@#` |
| Administrator | `demo.admin@example.com` | `Admin123!@#` |

Host-run commands connect to PostgreSQL through `localhost:5432` in the default setup. Inside Docker Compose, the `app` and `migrate` services connect to the database at `db:5432`.

### Docker Compose

For a fresh setup with the default ports, apply migrations before opening the app.

```bash
[ -f .env ] || cp .env.example .env
docker compose up -d db
docker compose run --rm --build migrate
docker compose run --rm migrate npx prisma db seed  # Optional demo data
docker compose up -d --build app
curl -fsS http://localhost:3000/api/health
```

Open `http://localhost:3000` for the default Compose setup. The `app` container serves both the frontend and the API. Compose waits for PostgreSQL to become healthy before starting the app.

**Team 12 demo laptop:** Open `http://localhost:3012` and check `http://localhost:3012/api/health`. IQAC already uses the laptop’s port `3000`, so the prepared Docker setup maps host port `3012` to port `3000` inside the app container. Its PostgreSQL host port is `55433`.

If the prepared demo containers are stopped, start them again with their existing port mappings:

```bash
docker start team-12---conference-room-booking-system-db-1
docker start team-12---conference-room-booking-system-app-1
bash ./scripts/smoke-test.sh http://localhost:3012
```

For the standard Compose setup, `docker compose down` stops the services and preserves the database volume. Use `docker compose down -v` only when you intend to erase the local database and start over.

### Integration tests with PostgreSQL

The server integration tests use a separate database. The name in `DATABASE_URL_TEST` must end in `_test`. The default `.env.example` uses `crbs_test`.

With the database container running, create the test database once:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE crbs_test;"'
```

From the repository root, prepare the schema and run the tests:

```bash
cd server
npm ci
npx prisma generate
npm run test:db:prepare
npm test
```

Use `localhost:5432` in `DATABASE_URL_TEST` for the default setup. On the prepared demo laptop, use `127.0.0.1:55433` for host-run integration tests. The database name is `crbs_test` in both setups.

## CD / Deployment

The **CD** workflow in `.github/workflows/cd.yml` runs on pushes to `main` and can also be started manually.

1. **CI** runs the Server and Client checks from `ci.yml`. A failed check blocks the image build and deploy jobs.
2. **Build image** builds the Docker image and publishes it to GitHub Container Registry. It tags the image with the commit SHA and `latest`.
3. **Deploy** pulls the commit-tagged image, applies migrations, starts the Docker Compose services, and runs the smoke test. The job requires `DEPLOY_ENABLED=true` and a configured self-hosted runner.

To enable the self-hosted deployment, a repository admin must register a runner with Docker available. Put the deployment environment file at `~/crbs.env` on the runner, or set the `DEPLOY_ENV_FILE` repository variable to its location. Set `DEPLOY_ENABLED` to `true` under **Settings → Secrets and variables → Actions → Variables**.

### Deploy locally

From the repository root, use Git Bash or another Bash shell:

```bash
[ -f .env ] || cp .env.example .env
bash ./scripts/deploy-local.sh
```

For a seeded demo, run:

```bash
bash ./scripts/deploy-local.sh --seed
```

The script builds the image from the current checkout, applies pending migrations, starts the services, and runs the smoke test. With `--seed`, it also loads demo data and verifies that the demo user can sign in.

To deploy an image already published for a specific commit, use:

```bash
bash ./scripts/deploy-local.sh <commit-sha> --pull
```

If the image is private, sign in to `ghcr.io` with an account and token that can read the package before pulling it.

The smoke test checks that `/api/health` returns `200` and that an unauthenticated request to `/api/rooms` returns `401`. Pass the URL explicitly when checking the prepared demo laptop:

```bash
bash ./scripts/smoke-test.sh http://localhost:3012
```

## Contributing

- Create a branch for each Jira story, such as `CRBS-11-scaffold`.
- Start commit messages and pull request titles with the Jira key.
- Open a pull request into `main` and use the repository’s PR template. Follow the team’s review process and verify that the Server and Client checks pass before merging.
- Use synthetic test data and keep secrets and `.env` files out of Git.
- Make changes to `main` through pull requests. Repository-enforced branch protection requires admin access and is tracked in CRBS-47.

## API conventions

API errors use the shape `{ "error": { "code": "...", "message": "..." } }`. Common responses include `400` for invalid input, `401` for a missing or invalid session, `403` for forbidden actions, `404` for missing or undisclosed resources, `409` for booking conflicts, and `500` for unexpected errors.

The organization uses `Asia/Kolkata` for booking times and stores timestamps in UTC. Bookings use half-open intervals `[start, end)`, so a booking ending at 11:00 can be followed by one starting at 11:00.
