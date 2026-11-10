# CRBS-36: Keyboard access and focus

Implemented skip links, focusable main content, focus after screen navigation, search-result focus, automatic meeting-purpose focus, return focus on cancelling a room selection, validation focus, and focus on success/error feedback. Required login fields are explained and booking purpose is exposed as required. Admin fields already have required labels and connected errors.

The native cancellation dialog explicitly focuses Keep booking when opened. Tab and Shift+Tab wrap through the enabled dialog buttons; Escape dismisses without a request and restores the opener. While cancellation is pending, focus remains in the dialog and Escape cannot dismiss it. Success then focuses its visible status message. Navigation remains available when the desktop sidebar is hidden; narrow containers and long text can wrap. The original dark-ring claim was incorrect for buttons/links because an older, more-specific rule overrode it; see the follow-up below.

## Focus follow-up on 6 November 2026

Branch `CRBS-36-focus-ring-fix` starts from main `145ec51`, after PR #25 (merge `8756e83`) and PR #26 merged.

- Removed the older pale button/link outline rule. Explicit button/link focus-visible selectors now apply the dark `#123e32` ring with a white separator. The skip link and dialog buttons also receive this ring on `:focus`, so programmatic initial dialog focus does not depend on Firefox's focus-visible heuristic. Existing input focus styling remains unchanged.
- Initial workspace rendering no longer focuses main. The previous-page ref compares actual navigation changes, including under Strict Mode; navigation to another workspace screen still focuses main.
- Opening cancellation explicitly focuses Keep booking. Escape still closes without a cancellation request and returns focus to the opener.
- Local client lint and production build passed; 72 client tests passed, including initial document focus/first control and initial Keep booking focus regression checks.
- In-app browser at an observed 1280x720: fresh authenticated reload followed by Tab reached Skip to main content, then Sign out. Computed outlines were dark `rgb(18, 62, 50)` with a white separator. Visual inspection confirmed the skip-link ring. Workspace navigation focused main; keyboard opening of booking #17's dialog focused Keep booking with the dark outline immediately. Escape closed the dialog and returned focus to Cancel booking #17; no booking was cancelled. Screenshot: `docs/evidence/CRBS-36-dialog-focus-fix.png`.
- The in-app observations above are distinct from browser acceptance evidence. Harish subsequently reported passing post-fix PR-branch checks in Chromium 158 and Firefox 159. Venya's guided Chrome/Firefox results are recorded below with their exact-size scope; see Retest results and evidence. Earlier pre-fix findings remain historical defect evidence.

## Verified on 5 November 2026

- 71 client tests passed; build and lint passed.
- Real browser + real API/PostgreSQL: skip link moved to main; Tab reached Date; Enter submitted search and moved to the results heading; Enter on a room moved focus to purpose; Tab reached Cancel selection then Confirm booking; Enter created booking #13 and focused success.
- Keyboard cancellation: native modal, Keep booking, Escape restore and status focus were verified. A final check with synthetic booking #14 confirmed Tab => Yes cancel, Tab => Keep booking, Shift+Tab => Yes cancel. The final booking was then cancelled successfully.
- JSON observation trace is `docs/evidence/CRBS-36-keyboard.json`.

## Retest results and evidence

The 5 November override failure is historical, not the current retest status. On 7 November, Harish reported that his run on the PR #30 focus-fix branch passed in Chromium 158 and Firefox 159. This is attributed team-reported evidence; the raw run log and exact viewport breakdown were not supplied in that update. Venya also completed guided manual checks on focus-fix commit f63fc0e in Firefox 159.0.1 (64-bit) and Chrome 157.0.8103.39 (64-bit), including the immediate dialog ring, Tab loop, Escape/opener return, first workspace Tab stop, core flows, validation and explicitly recorded 360x800/1366x768 layout checks. Results, size-specific scope and six screenshots are merged via PR #33 in docs/updates/venya-doc-updates.md under NFR03 / NFR04 acceptance evidence and docs/evidence/CRBS-40/. On 10 November, Venya confirmed that the full manual Firefox checklist passed at 360×800 and 1366×768. Her confirmation supersedes the earlier incomplete Firefox viewport annotations. Unit tests do not replace browser evidence.

Repeatable regression checklist for browser responsive/device tools at exactly **360x800**, then **1366x768**:

1. Record browser version and confirm the displayed CSS viewport dimensions.
2. Keyboard-only sign in: Tab/Shift+Tab through labelled inputs and submit with Enter.
3. Use Skip to main content. Tab through date, time, capacity and Find rooms; use native arrow keys for selections.
4. Trigger an invalid interval and verify focus reaches its labelled field/error. Then search a valid free slot.
5. Choose a room, type purpose and confirm with keyboard; check visible feedback and focus.
6. Open My bookings, cancel an eligible booking: Keep booking, Escape, forward/backward Tab wrapping, then actual cancellation. Verify status after reload.
7. As admin, create/edit a synthetic room using keyboard; verify required/invalid fields and visible feedback. As ordinary user, confirm admin navigation is absent.
8. At both sizes check for horizontal clipping, inaccessible controls and visible focus throughout. Keep screenshots and actual results. Do not mark unexecuted steps Passed.

PR #25 (8756e83), focus follow-up PR #30 and manual evidence PR #33 are merged. Use the recorded retests above and retain the evidence matrix limitations when preparing final test results.
