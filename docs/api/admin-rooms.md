# Admin rooms API

For the frontend developer. Admin-only endpoints for managing rooms (FR12, FR13, SR01).

## Endpoints

| Method | Path | Status |
| --- | --- | --- |
| POST | `/api/admin/rooms` | Available (CRBS-28) |
| PATCH | `/api/admin/rooms/:id` | Coming in CRBS-29 |

## What the request needs

- **Session cookie:** sign in first with `POST /api/auth/login`; send the cookie on every request (`credentials: "include"` with fetch). The account must have role `ADMIN`. The role is read from the server-side session only; any `role` in the body is ignored.
- **CSRF token:** required on every state-changing request. Login returns it in the `x-csrf-token` response header and in the `crbs.csrf` cookie. Send it back as the `x-csrf-token` request header.
- `Content-Type: application/json`.

## POST /api/admin/rooms

Creates a room. Unknown body fields are ignored.

| Field | Required | Rules |
| --- | --- | --- |
| `name` | yes | string, trimmed, 1–100 characters |
| `location` | yes | string, trimmed, 1–200 characters |
| `capacity` | yes | whole number (JSON number) from 1 to 10000; strings, decimals, 0 and negatives are rejected |
| `facilities` | no (default `[]`) | array of at most 50 non-empty strings, each trimmed, up to 100 characters |

Request:

```json
{
  "name": "Boardroom A",
  "location": "Floor 2, East wing",
  "capacity": 12,
  "facilities": ["Projector", "Whiteboard"]
}
```

Success: `201 Created`, with the room in the same shape as items from `GET /api/rooms`:

```json
{
  "id": 7,
  "name": "Boardroom A",
  "location": "Floor 2, East wing",
  "capacity": 12,
  "facilities": ["Projector", "Whiteboard"]
}
```

## Errors

Every error is `{ "error": { "code": "...", "message": "..." } }`.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Validation failed, or malformed JSON. Validation errors add a `fields` map. |
| 401 | `UNAUTHENTICATED` | No signed-in session. |
| 403 | `FORBIDDEN` | Signed in but not `ADMIN`, or the CSRF token is missing or wrong. |
| 404 | `NOT_FOUND` | Unknown API route. Unknown room ID on PATCH (CRBS-29). Not used by POST. |
| 409 | `CONFLICT` | Not used by the admin room endpoints. Returned by `POST /api/bookings` on an overlap. |
| 500 | `INTERNAL_ERROR` | Unexpected failure; the message is generic. |

400 example (`fields` has one entry per invalid field):

```json
{
  "error": { "code": "BAD_REQUEST", "message": "Invalid room details." },
  "fields": {
    "name": "name is required and must be 1 to 100 characters.",
    "capacity": "capacity must be a whole number from 1 to 10000."
  }
}
```

401 example:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Sign in to view rooms." } }
```

403 example (not an admin):

```json
{ "error": { "code": "FORBIDDEN", "message": "Administrator access is required." } }
```

403 example (CSRF):

```json
{ "error": { "code": "FORBIDDEN", "message": "Missing or invalid CSRF token." } }
```

## PATCH /api/admin/rooms/:id

Coming in CRBS-29.
