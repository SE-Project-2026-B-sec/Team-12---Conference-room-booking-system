# Conference Room Booking System

A Software Engineering mini-project for managing conference rooms in organizations and colleges. The application will let authorized users check room availability, reserve a room, view their bookings and cancel upcoming reservations. Administrators will maintain room details.

## Project status

The architecture document and Test Plan are available. Application development, test execution and CI/CD implementation are planned across the two sprints below. Features and checks described here are intended behavior, not claims of completed implementation.

## Project documents

- [Software Architecture and Design — SAD, version 1.0](docs/SAD_Conference_Room_Booking_System.docx): layered architecture, components, booking flows, security considerations and illustrative API contracts. Prepared by Bhogala Srika.
- [Software Test Plan — STP, version 1.2](docs/Test_Plan_Conference_Room_Booking_System.docx): test strategy, 20 initial test scenarios, traceability, sprint testing activities and CI/CD verification. Maintained by Dabbugunta Venya Anand.
- **Software Requirements Specification — SRS:** to be added by its owner before the required document submission.

The Test Plan makes concrete release assumptions where SAD 1.0 leaves choices open. **Use Section 11 and Appendix A of the Test Plan when preparing the SRS**, and align the next SAD revision with those choices. Appendix A defines 15 functional requirements, 5 non-functional requirements, 2 security objectives and 5 security requirements.

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

## Architecture and planned stack

The application follows the SAD’s layered design: browser interface → application/API services → database. Authentication, room management and booking logic remain separate modules within one application.

- **Frontend:** React, TypeScript and Tailwind CSS.
- **Backend:** Node.js and Express.
- **Persistence:** PostgreSQL with Prisma.
- **Authentication:** server-side sessions stored in PostgreSQL; hashed passwords and protected session cookies.
- **Testing:** Vitest, Supertest and Playwright, plus manual browser checks.
- **Automation and deployment:** GitHub Actions, Docker and Docker Compose.

Server-side validation, role/ownership checks and atomic database operations will protect booking integrity. The browser alone must not decide whether a booking is permitted.

## Testing

The Test Plan covers unit, API/database integration, browser, security and user acceptance testing. Priority checks include simultaneous booking attempts, forbidden access to another user’s booking, cancellation, persistence and safe error handling.

The small performance check uses 5 concurrent users, 5 rooms and 100 initial bookings over a warmed-up 2-minute run. Targets are a 95th-percentile response time of at most 3 seconds for availability and booking, unexpected errors below 5%, and no duplicate active reservations. Record the test machine specifications with results.

Tests start as **Not Run**. Store actual results, evidence and Jira defect links during execution. Release readiness requires passing critical checks and no unresolved critical or high-severity defects.

## Planned CI/CD workflow

1. A pull request runs automated unit/API tests and a build on a GitHub-hosted runner, using an isolated PostgreSQL service.
2. A passing merge to `main` produces a commit-tagged Docker image.
3. A manually triggered deployment job on a team laptop’s self-hosted runner starts the application and PostgreSQL with Docker Compose, then runs an automated smoke test.
4. Failed tests block publication/deployment. Failed deployment or smoke checks mark the run failed; recovery to the previous image is manual.

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

## Repository setup

Place this README at the repository root and keep the linked Word documents in `docs/`. Add the SRS there when ready. Application startup commands, environment variables and exact software versions will be documented when the implementation is added; executable setup instructions are not yet available.
