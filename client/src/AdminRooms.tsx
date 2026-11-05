import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage, type Room, type RoomInput, type User } from "./api/client";

type Draft = { name: string; location: string; capacity: string; facilities: string };
const empty: Draft = { name: "", location: "", capacity: "", facilities: "" };
export function validateRoom(draft: Draft): { fields: Record<string, string>; value: RoomInput } {
  const value = { name: draft.name.trim(), location: draft.location.trim(), capacity: Number(draft.capacity),
    facilities: draft.facilities.split(/\r?\n/).map((text) => text.trim()).filter(Boolean) };
  const fields: Record<string, string> = {};
  if (!value.name || value.name.length > 100) fields.name = "Enter a room name of 1–100 characters.";
  if (!value.location || value.location.length > 200) fields.location = "Enter a location of 1–200 characters.";
  if (draft.capacity.trim() === "" || !Number.isSafeInteger(value.capacity) || value.capacity < 1 || value.capacity > 10000)
    fields.capacity = "Capacity must be a whole number from 1 to 10000.";
  if (value.facilities.length > 50 || value.facilities.some((facility) => facility.length > 100))
    fields.facilities = "Use up to 50 facilities, each 1–100 characters, one per line.";
  return { fields, value };
}

export default function AdminRooms({ user, onSignedOut, onRoomsChanged }: { user: User; onSignedOut: (message?: string) => void; onRoomsChanged?: () => void }) {
  if (user.role !== "ADMIN") return <p role="alert">Administrator access is required to manage rooms.</p>;
  return <AdminRoomEditor onSignedOut={onSignedOut} onRoomsChanged={onRoomsChanged} />;
}

function AdminRoomEditor({ onSignedOut, onRoomsChanged }: { onSignedOut: (message?: string) => void; onRoomsChanged?: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const nameInput = useRef<HTMLInputElement>(null);
  function failure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) { onSignedOut("Your session expired. Please sign in again."); return; }
    if (error instanceof ApiError && error.status === 400) setFields(error.fields);
    setError(error instanceof ApiError && error.status === 403
      ? "Administrator access or the security token could not be verified. Reload this page and sign in as an administrator."
      : error instanceof ApiError && error.status === 404
        ? "This room no longer exists. Reload the room list before making further changes."
        : errorMessage(error));
  }
  useEffect(() => {
    const controller = new AbortController();
    api.rooms(controller.signal).then((rooms) => { if (!controller.signal.aborted) setRooms(rooms); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onSignedOut("Your session expired. Please sign in again.");
        else setError(errorMessage(error));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, onSignedOut]);
  function reset() { setEditing(null); setDraft(empty); setFields({}); setError(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const { fields, value } = validateRoom(draft); setFields(fields); setError(""); setNotice("");
    if (Object.keys(fields).length) {
      const key = Object.keys(fields)[0]; document.getElementById(`room-${key}`)?.focus(); return;
    }
    setBusy(true);
    try {
      const saved = editing === null ? await api.createRoom(value) : await api.updateRoom(editing, value);
      setRooms((items) => [...items.filter((room) => room.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id));
      setNotice(`${saved.name} ${editing === null ? "created" : "updated"} successfully. Existing bookings are unchanged.`);
      setEditing(null); setDraft(empty); setFields({}); onRoomsChanged?.();
    } catch (error) { failure(error); }
    finally { setBusy(false); }
  }
  function change(field: keyof Draft, value: string) { setDraft({ ...draft, [field]: value }); setFields({ ...fields, [field]: "" }); }
  return <section className="secondary-screen" aria-labelledby="admin-rooms-heading">
    <div className="results-header"><div><span className="eyebrow">ADMINISTRATION</span><h1 id="admin-rooms-heading">Manage rooms</h1>
      <p className="muted">Create rooms and edit their details. Existing bookings remain unchanged.</p></div>
      <button className="button secondary" disabled={busy || loading} onClick={() => { setLoading(true); setError(""); setRevision((n) => n + 1); }}>Reload room list</button></div>
    {notice && <p role="status" className="alert success">{notice}</p>}
    {error && <p role="alert" className="alert error">{error}</p>}
    <form className="admin-room-form" onSubmit={save} noValidate aria-labelledby="room-form-heading">
      <h2 id="room-form-heading">{editing === null ? "Create a room" : `Edit room #${editing}`}</h2>
      <p className="muted small">Name, location and capacity are required.</p>
      {([['name', 'Room name', 100], ['location', 'Location', 200], ['capacity', 'Capacity', undefined]] as const).map(([key, label, limit]) => <div className="field" key={key}>
        <label htmlFor={`room-${key}`}>{label} (required)</label><input id={`room-${key}`} ref={key === "name" ? nameInput : undefined}
          type={key === "capacity" ? "number" : "text"} min={key === "capacity" ? 1 : undefined} max={key === "capacity" ? 10000 : undefined}
          step={key === "capacity" ? 1 : undefined} maxLength={limit} required disabled={busy} value={draft[key]}
          onChange={(event) => change(key, event.target.value)} aria-invalid={!!fields[key]} aria-describedby={fields[key] ? `room-${key}-error` : undefined} />
        {fields[key] && <p id={`room-${key}-error`} className="field-error">{fields[key]}</p>}</div>)}
      <div className="field"><label htmlFor="room-facilities">Facilities (optional)</label><textarea id="room-facilities" rows={3} value={draft.facilities} disabled={busy}
        onChange={(event) => change("facilities", event.target.value)} aria-invalid={!!fields.facilities} aria-describedby="facilities-help facilities-error" />
        <p id="facilities-help" className="small muted">One facility per line. Up to 50 facilities, 100 characters each. Leave empty for no facilities.</p>
        <p id="facilities-error" className="field-error">{fields.facilities}</p></div>
      <div className="booking-actions"><button className="button secondary" type="button" disabled={busy} onClick={reset}>{editing === null ? "Clear form" : "Cancel editing"}</button>
        <button className="button primary" disabled={busy}>{busy ? "Saving room…" : editing === null ? "Create room" : "Save room changes"}</button></div>
    </form>
    <section aria-labelledby="admin-list-heading"><h2 id="admin-list-heading">Room list</h2>
      {loading ? <p role="status">Loading rooms…</p> : rooms.length === 0 && !error ? <p className="empty-state">No rooms yet. Create the first room above.</p>
        : <div className="booking-list">{rooms.map((room) => <article key={room.id} className="booking-summary" aria-labelledby={`admin-room-${room.id}`}>
          <h3 id={`admin-room-${room.id}`}>{room.name}</h3><p>{room.location} · Up to {room.capacity} people</p><p>{room.facilities.join(", ") || "No additional facilities"}</p>
          <button className="button secondary" disabled={busy} onClick={() => {
            setEditing(room.id); setDraft({ name: room.name, location: room.location, capacity: String(room.capacity), facilities: room.facilities.join("\n") });
            setFields({}); setError(""); setNotice(""); nameInput.current?.focus();
          }}>Edit {room.name}</button></article>)}</div>}
    </section>
  </section>;
}
