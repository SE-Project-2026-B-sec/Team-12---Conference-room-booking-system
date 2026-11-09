# Sprint 1 demo — CRBS-42

[Watch/download Venya's Sprint 1 recording](Sprint-1-Demo.mp4)

This is Venya's own screen recording, supplied on 1 November 2026. It replaces the earlier automated capture. The submitted MP4 is approximately one minute (60 seconds), 1920 × 874, and approximately 3.1 MB.

## What it demonstrates

The recording starts in an already signed-in session. It shows the room list, room facilities and capacities, availability search for 2 November 2026 at 10:00–11:00 IST, selection of Conference Room A, meeting-purpose entry and booking submission. A second prepared tab attempts the same room and slot and displays the conflict message; availability then excludes the occupied room.

Both tabs selected the slot before the first booking was submitted. This exercises sequential duplicate-booking prevention through the real frontend; it does not demonstrate simultaneous race-safe writes. Login itself is not shown in this recording.

## Editing and verification

The original `sprint1.mp4` was approximately 74.4 seconds. Removed only source 00:44.0–00:58.4, a lengthy portion of typing the explanatory meeting-purpose text, to meet the one-minute target. Preserved the remaining screen recording and its audio track. No synthetic application screens, captions, responses or outcomes were added. The original recording on Venya's laptop was not changed.

The submitted video decoded fully with a successful exit status. Frames at the edit boundary and the final conflict message were visually checked. This is demo evidence, not verification of the combined Docker application image.

## Reproduce the conflict

Sign in with a seeded development account. Choose an unused future slot within 30 days, using 30-minute increments between 09:00 and 18:00 IST. In two tabs, search and select the same room and slot before confirming either one. Submit the first booking, then submit the other tab's stale selection to see the conflict. Do not sign out between tabs.

## Sprint 2 demo

[Watch or download the two-minute subtitled recording](Sprint-2-Demo.mp4). The demo shows login, room search, booking and conflict handling, cancellation, room creation and editing, and the GitHub Actions checks and image build.
