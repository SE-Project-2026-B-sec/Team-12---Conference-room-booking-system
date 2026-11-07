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
- These are in-app browser results, not a new Chrome/Firefox acceptance pass. Firefox-specific rendering of the fix and exact 360x800/1366x768 retests remain pending. Harish reported pre-fix checks in Chromium 158 at both sizes and Firefox 159 at 1366x768; those results identified the defects, and are not recorded as post-fix evidence.

## Verified on 5 November 2026

- 71 client tests passed; build and lint passed.
- Real browser + real API/PostgreSQL: skip link moved to main; Tab reached Date; Enter submitted search and moved to the results heading; Enter on a room moved focus to purpose; Tab reached Cancel selection then Confirm booking; Enter created booking #13 and focused success.
- Keyboard cancellation: native modal, Keep booking, Escape restore and status focus were verified. A final check with synthetic booking #14 confirmed Tab => Yes cancel, Tab => Keep booking, Shift+Tab => Yes cancel. The final booking was then cancelled successfully.
- JSON observation trace is `docs/evidence/CRBS-36-keyboard.json`.

## Acceptance still pending

The original 5 November viewport overrides did not establish the required actual dimensions. Firefox 159.0.1 (64-bit) is now installed, confirmed by Venya's About screenshot. Her pre-fix Firefox 360x800 screenshots show login, search, booking #17 confirmation, cancellation dialog and cancellation feedback; they do not prove the corrected focus styles. Harish has also reported the pre-fix checks listed above. Post-fix exact-size and Firefox validation remain **NOT VERIFIED**. Unit tests do not prove browser focus rendering or mobile layout.

Before marking Done, check in browser responsive/device tools at exactly **360x800**, then **1366x768**:

1. Record browser version and confirm the displayed CSS viewport dimensions.
2. Keyboard-only sign in: Tab/Shift+Tab through labelled inputs and submit with Enter.
3. Use Skip to main content. Tab through date, time, capacity and Find rooms; use native arrow keys for selections.
4. Trigger an invalid interval and verify focus reaches its labelled field/error. Then search a valid free slot.
5. Choose a room, type purpose and confirm with keyboard; check visible feedback and focus.
6. Open My bookings, cancel an eligible booking: Keep booking, Escape, forward/backward Tab wrapping, then actual cancellation. Verify status after reload.
7. As admin, create/edit a synthetic room using keyboard; verify required/invalid fields and visible feedback. As ordinary user, confirm admin navigation is absent.
8. At both sizes check for horizontal clipping, inaccessible controls and visible focus throughout. Keep screenshots and actual results. Do not mark unexecuted steps Passed.

The original stack is merged. Review this follow-up against main and wait for Server/Client CI; retain the pending post-fix manual acceptance checks above.
