# Final verification on 9 November 2026

Application commit `ac1cf63`. The client build, server build and lint checks passed. The client suite passed 72 tests and the server suite passed 214 tests against an isolated PostgreSQL database.

## TC19 mixed load

Five authenticated workers searched availability and booked separate rooms against a dedicated PostgreSQL test database. It started with five users, five rooms and 100 bookings. A preflight search confirmed an occupied room was excluded. Each worker sent one availability request and one booking request per second when responses arrived within the second. The run used a 10-second warm-up followed by a two-minute measurement window.

- Availability returned 595 HTTP 200 responses, with p95 of 170.45 ms and zero unexpected failures. Each response included the intended free room.
- Booking returned 595 HTTP 201 responses, with p95 of 335.73 ms and zero unexpected failures. Each response contained a booking ID.
- Both endpoints met the TC19 limits of p95 at most 3 seconds and fewer than 5% unexpected errors.

The compiled Express server ran on the Windows demo machine with PostgreSQL in Docker. Machine specifications and response counts are in the [measurement summary](../performance-testing/TC19-mixed-load-results.json).

## TC18 and CRBS-40 browser checks

The Chromium-based in-app browser ran the core search, booking and cancellation flows at CSS viewports of 360×800 and 1366×768. The date and time fields and meeting purpose were accessible by their labels. Keyboard activation of search moved focus to the results heading, room selection moved focus to the meeting purpose, and booking confirmation displayed the reservation. There was no horizontal overflow. Focus on the results heading, cancellation controls and cancellation confirmation had a solid dark-green outline. The meeting purpose field had a solid green outline.

At 360×800 the first Tab reached the skip link. Booking #29 was created and cancelled. At 1366×768 booking #30 was created and cancelled. At both sizes the cancellation dialog initially focused Keep booking, trapped focus when tabbing past a boundary, and returned focus to the cancel button on Escape. The second opening was used to confirm the cancellation. The exact Chromium version was unavailable from the in-app browser session.

Venya confirmed on 10 November that the full [manual Firefox checklist](../CRBS-36-keyboard-accessibility.md#retest-results-and-evidence) passed in Firefox 159.0.1 at 360×800 and 1366×768. This is the manual tester’s confirmation and supersedes the incomplete viewport annotations in the original handoff.

## TC20 deployment

The seeded local Docker deployment on port 3012 passed migration and smoke checks for application health, login, authenticated room listing and unauthenticated rejection. The [failed-test blocking evidence](../ci-failure-demo.md) records the earlier deliberate CI failure. The separate GitHub Actions deployment job requires an administrator to register a compatible self-hosted runner, provision the runner environment file, and enable `DEPLOY_ENABLED`. See [the project README](../../README.md#cd--deployment).
