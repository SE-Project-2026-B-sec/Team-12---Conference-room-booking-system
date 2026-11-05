# CRBS-36: Keyboard access and focus

Implemented skip links, focusable main content, focus after screen navigation, search-result focus, automatic meeting-purpose focus, return focus on cancelling a room selection, validation focus, and focus on success/error feedback. Required login fields are explained and booking purpose is exposed as required. Admin fields already have required labels and connected errors.

The native cancellation dialog initially focuses Keep booking. Tab and Shift+Tab explicitly wrap through the enabled dialog buttons; Escape dismisses without a request and restores the opener. While cancellation is pending, focus remains in the dialog and Escape cannot dismiss it. Success then focuses its visible status message. Inputs, buttons and links have a dark high-contrast visible focus ring. Navigation remains available when the desktop sidebar is hidden; narrow containers and long text can wrap.

## Verified on 5 November 2026

- 71 client tests passed; build and lint passed.
- Real browser + real API/PostgreSQL: skip link moved to main; Tab reached Date; Enter submitted search and moved to the results heading; Enter on a room moved focus to purpose; Tab reached Cancel selection then Confirm booking; Enter created booking #13 and focused success.
- Keyboard cancellation: native modal, Keep booking, Escape restore and status focus were verified. A final check with synthetic booking #14 confirmed Tab => Yes cancel, Tab => Keep booking, Shift+Tab => Yes cancel. The final booking was then cancelled successfully.
- JSON observation trace is `docs/evidence/CRBS-36-keyboard.json`.

## Acceptance still pending

The required viewport checks are **NOT VERIFIED**. The browser tool accepted 360x800 and 1366x768 overrides, but the page reported 678x668; a fresh tab reported 1280x720. The override did not establish the required dimensions, so those checks are not counted as passed. Firefox is also not installed and has not been tested. Unit tests do not prove browser focus rendering or mobile layout.

Before marking Done, check in browser responsive/device tools at exactly **360x800**, then **1366x768**:

1. Record browser version and confirm the displayed CSS viewport dimensions.
2. Keyboard-only sign in: Tab/Shift+Tab through labelled inputs and submit with Enter.
3. Use Skip to main content. Tab through date, time, capacity and Find rooms; use native arrow keys for selections.
4. Trigger an invalid interval and verify focus reaches its labelled field/error. Then search a valid free slot.
5. Choose a room, type purpose and confirm with keyboard; check visible feedback and focus.
6. Open My bookings, cancel an eligible booking: Keep booking, Escape, forward/backward Tab wrapping, then actual cancellation. Verify status after reload.
7. As admin, create/edit a synthetic room using keyboard; verify required/invalid fields and visible feedback. As ordinary user, confirm admin navigation is absent.
8. At both sizes check for horizontal clipping, inaccessible controls and visible focus throughout. Keep screenshots and actual results. Do not mark unexecuted steps Passed.

PR is built on CRBS-30, which is built on CRBS-27. Review/merge the stack in that order and run main-targeting CI before each merge.
