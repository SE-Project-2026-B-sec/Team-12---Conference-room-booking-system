# CRBS-19 Server-side booking rules

`validateBookingRequest(input, now?)` in `server/src/services/booking-validation.ts` is a pure function implementing FR06 / TC05–TC06. Pass the raw request body. It returns either `{ valid: false, errors: { field: message } }` or `{ valid: true, value: { roomId, purpose, startAt, endAt } }`. The default clock is the current time; tests inject a fixed clock.

Rules: a positive integer room ID; trimmed purpose of 1–200 characters; a real YYYY-MM-DD date; HH:mm times on 30-minute boundaries; 09:00–18:00 Asia/Kolkata operating hours; duration 30–240 minutes in the same local day; a strictly future start; and booking date no more than 30 IST calendar days ahead. Returned instants are UTC Dates. Back-to-back bookings are handled by the existing overlap logic, not this validator.

CRBS-18 integration: authenticate first, validate `req.body`, return 400 with the existing `{ error: { code: "BAD_REQUEST", message: "..." } }` convention on failure (optionally include the field errors), then look up the room and use the validated values in the transactional booking creation. Derive userId from the trusted session and status on the server. This function does not check room existence, permissions or database overlaps; those remain with their assigned owners.

Tests include missing/malformed input, calendar validity, leap days, operating hours, 30-minute slots, duration limits, past/exact-now starts, 30-day boundaries across IST midnight, month/year changes and UTC conversion. No database or other unfinished story is needed to run them.
