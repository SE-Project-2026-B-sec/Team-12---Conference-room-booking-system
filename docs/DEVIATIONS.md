# Deviations from the SRS / SAD / Test Plan

Add one line per deviation: date, story key, what differs, why.

- 2026-10-28, CRBS-11: The three .docx documents are still at the repository root, not in `docs/` as the README says. Left in place so existing README links keep working; move them in a separate change.
- 2026-11-02, CRBS-31: The `findBookingConflict` pre-check used by CRBS-18 (outside the transaction, not race-safe) is replaced in `booking-service.ts` by a check inside one transaction that first locks the room row (`SELECT ... FOR UPDATE`) and then queries overlaps on the transaction client. `booking-conflict.ts` and `booking-overlap.ts` are unchanged and no longer called by the create-booking path.
