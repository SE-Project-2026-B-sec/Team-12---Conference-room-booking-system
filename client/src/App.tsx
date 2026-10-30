import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage, type Booking, type Room, type Search, type User } from "./api/client";
import { istDate, timeOptions, validatePurpose, validateSearch } from "./lib/booking-rules";

function Logo() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">C<span /></span><span>Conference Room<span className="brand-caption">BOOKING SYSTEM</span></span></div>;
}
function RoomIcon({ index = 0 }: { index?: number }) {
  return <svg viewBox="0 0 120 80" aria-hidden="true" className={`room-illustration room-style-${index % 3}`}>
    <path d="M25 14h70v46H25z" className="room-wall" /><path d="M25 60 9 71h102L95 60" fill="currentColor" opacity=".12" />
    <path d="M35 22h28v20H35z" fill="white" opacity=".8" /><path d="M69 22h16v30H69z" fill="currentColor" opacity=".16" />
    <path d="M38 48h43l7 9H31z" fill="currentColor" opacity=".65" /><path d="M38 57v7m43-7v7" stroke="currentColor" strokeWidth="3" />
    <path d="M30 43v8m61-8v8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}
function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="field-error">{message}</p> : null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const signedOut = useCallback((message = "") => { setUser(null); setSessionError(message); }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.me(controller.signal).then((profile) => { if (!controller.signal.aborted) setUser(profile); }).catch((error: unknown) => {
      if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) setSessionError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);
  if (checking) return <main className="loading-page"><Logo /><p role="status">Checking your session…</p></main>;
  if (!user) return <Login initialError={sessionError} onLogin={(profile) => { setSessionError(""); setUser(profile); }} />;
  return <Rooms user={user} onSignedOut={signedOut} />;
}

function Login({ onLogin, initialError }: { onLogin: (user: User) => void; initialError: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(""); setBusy(true);
    try { onLogin(await api.login(email.trim(), password)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <main className="login-layout">
    <section className="login-story"><Logo /><div className="story-copy"><span className="eyebrow">LESS COORDINATION. MORE COLLABORATION.</span><h1>A space for<br />your next idea.</h1><p>Find the right room, choose your time, and bring your team together.</p><div className="hero-room"><RoomIcon /></div><div className="story-facts"><span>One shared schedule</span><span>No overlapping bookings</span></div></div><p className="story-foot">Conference Room Booking System · Team 12</p></section>
    <section className="login-panel"><div className="login-box"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to book a room</h2><p className="muted">Use the account provided by your organization.</p><form onSubmit={submit}>
      <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} placeholder="you@organization.edu" />
      <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
      {error && <p role="alert" className="alert error">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<span aria-hidden="true">→</span></button>
    </form><p className="login-note">Your reservations are linked to your account.<br />Need access? Contact your organization’s administrator.</p></div></section>
  </main>;
}

function Rooms({ user, onSignedOut }: { user: User; onSignedOut: (message?: string) => void }) {
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [available, setAvailable] = useState<Room[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState<Search>({ date: istDate(1), startTime: "10:00", endTime: "11:00", capacity: "" });
  const [applied, setApplied] = useState<Search | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchBusy, setSearchBusy] = useState(false);
  const [selected, setSelected] = useState<Room | null>(null);
  const [purpose, setPurpose] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [success, setSuccess] = useState<{ booking: Booking; room: Room } | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const busy = searchBusy || bookingBusy || logoutBusy;
  const rooms = available ?? allRooms;
  useEffect(() => {
    const controller = new AbortController();
    api.rooms(controller.signal).then((rooms) => { if (!controller.signal.aborted) setAllRooms(rooms); }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onSignedOut("Your session expired. Please sign in again.");
      else setLoadError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, onSignedOut]);
  function change(field: keyof Search, value: string) {
    setSearch({ ...search, [field]: value }); setErrors({}); setApplied(null); setAvailable(null); setSelected(null); setBookingError("");
  }
  function handleError(error: unknown, setMessage: (message: string) => void) {
    if (error instanceof ApiError && error.status === 401) onSignedOut("Your session expired. Please sign in again.");
    else setMessage(errorMessage(error));
  }
  async function findRooms(event: FormEvent) {
    event.preventDefault();
    const errors = validateSearch(search); setErrors(errors); setLoadError(""); setBookingError(""); setSuccess(null); setSelected(null);
    if (Object.keys(errors).length || busy) return;
    setSearchBusy(true);
    try { const response = await api.availability(search); setAvailable(response.rooms); setApplied({ ...search }); }
    catch (error) { setApplied(null); setAvailable(null); handleError(error, setLoadError); }
    finally { setSearchBusy(false); }
  }
  async function book(event: FormEvent) {
    event.preventDefault(); if (!selected || !applied || busy) return;
    const purposeError = validatePurpose(purpose); const intervalErrors = validateSearch(applied);
    setErrors({ ...intervalErrors, ...(purposeError ? { purpose: purposeError } : {}) });
    if (purposeError || Object.keys(intervalErrors).length) return;
    setBookingBusy(true); setBookingError(""); setSuccess(null);
    try {
      const booking = await api.book(selected.id, applied, purpose);
      setSuccess({ booking, room: selected }); setPurpose(""); setSelected(null);
      setAvailable((rooms) => rooms?.filter((room) => room.id !== selected.id) ?? null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setBookingError("That room was just booked for this time. Choose another room or search a different time."); setSelected(null);
        try { setAvailable((await api.availability(applied)).rooms); }
        catch (refreshError) { setApplied(null); setAvailable(null); handleError(refreshError, setLoadError); }
      } else if (error instanceof ApiError && error.status === 400) { setErrors(error.fields); setBookingError(error.message); }
      else if (error instanceof ApiError && error.status === 403) { setBookingError("Reload this page to renew your security token, then try again."); }
      else handleError(error, setBookingError);
    } finally { setBookingBusy(false); }
  }
  async function logout() {
    setLogoutBusy(true); setLogoutError("");
    try { await api.logout(); onSignedOut(); }
    catch (error) { handleError(error, setLogoutError); }
    finally { setLogoutBusy(false); }
  }
  return <div className="workspace">
    <aside className="sidebar"><Logo /><div className="nav-caption">WORKSPACE</div><div className="nav-current"><span aria-hidden="true">▦</span> Find a room</div><div className="sidebar-note"><span className="note-dot" />A little planning.<br />A better meeting.<p>Reserve a shared space for your next discussion.</p></div><div className="sidebar-footer">TEAM 12 · SE PROJECT</div></aside>
    <div className="workspace-body"><header className="topbar"><span className="breadcrumb">Workspace <span>/</span> <strong>Rooms</strong></span><div className="user-area"><span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><span className="user-name">{user.name}</span><button className="text-button" onClick={logout} disabled={busy}>{logoutBusy ? "Signing out…" : "Sign out"}</button></div></header>
      <main className="main-content"><div className="page-heading"><div><span className="eyebrow">MAKE ROOM FOR GOOD WORK</span><h1>Find your meeting space</h1><p className="muted">A quick catch-up or a big discussion. There’s a room for it.</p></div><span className="timezone-badge">◷ All times in IST</span></div>
      {logoutError && <p role="alert" className="alert error">{logoutError}</p>}
      {success && <div role="status" className="alert success"><strong>Booking confirmed · #{success.booking.bookingId}</strong><span>{success.room.name} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(success.booking.startAt))} – {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(success.booking.endAt))} IST</span></div>}
      <form className="search-panel" onSubmit={findRooms} noValidate><div className="panel-heading"><h2>When do you need a room?</h2><span>09:00–18:00 · 30-minute slots</span></div><fieldset className="search-grid" disabled={busy || loading}><legend className="sr-only">Search availability</legend>
        <div className="field"><label htmlFor="date">Date</label><input id="date" type="date" min={istDate()} max={istDate(30)} value={search.date} onChange={(e) => change("date", e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? "date-error" : undefined} /><FieldError id="date-error" message={errors.date} /></div>
        <div className="field"><label htmlFor="startTime">From</label><select id="startTime" value={search.startTime} onChange={(e) => change("startTime", e.target.value)} aria-invalid={!!errors.startTime} aria-describedby={errors.startTime ? "start-error" : undefined}>{timeOptions.slice(0, -1).map((time) => <option key={time}>{time}</option>)}</select><FieldError id="start-error" message={errors.startTime} /></div>
        <div className="field"><label htmlFor="endTime">Until</label><select id="endTime" value={search.endTime} onChange={(e) => change("endTime", e.target.value)} aria-invalid={!!errors.endTime} aria-describedby={errors.endTime ? "end-error" : undefined}>{timeOptions.slice(1).map((time) => <option key={time}>{time}</option>)}</select><FieldError id="end-error" message={errors.endTime} /></div>
        <div className="field"><label htmlFor="capacity">Minimum capacity <span>(optional)</span></label><input id="capacity" type="number" min="1" step="1" placeholder="Any size" value={search.capacity} onChange={(e) => change("capacity", e.target.value)} aria-invalid={!!errors.capacity} aria-describedby={errors.capacity ? "capacity-error" : undefined} /><FieldError id="capacity-error" message={errors.capacity} /></div>
        <button className="button primary search-button" disabled={busy || loading}>{searchBusy ? "Searching…" : "Find rooms"}<span aria-hidden="true">→</span></button>
      </fieldset></form>
      {loadError && <div role="alert" className="alert error">{loadError} <button className="text-button" disabled={busy} onClick={() => { setLoading(true); setLoadError(""); setReload((n) => n + 1); }}>Reload rooms</button></div>}
      {bookingError && <p role="alert" className="alert error">{bookingError}</p>}
      <section aria-labelledby="rooms-heading"><div className="results-header"><div><h2 id="rooms-heading">{applied ? "Available rooms" : "Explore the rooms"}<span className="count-badge">{rooms.length}</span></h2><p className="muted small">{applied ? `${applied.date} · ${applied.startTime}–${applied.endTime} IST` : "Search a time above to check availability and reserve a room."}</p></div><span className="results-note">BOOKING DURATION: 30 MIN–4 HRS</span></div>
        {loading ? <p role="status" className="empty-state">Loading rooms…</p> : rooms.length === 0 && !loadError ? <div className="empty-state"><h3>{applied ? "No rooms available for this time" : "No rooms have been added yet"}</h3><p>{applied ? "Try another time or a smaller minimum capacity." : "Your administrator can add rooms for your organization."}</p></div> : <div className="room-grid">{rooms.map((room, index) => <article key={room.id} className={`room-card ${selected?.id === room.id ? "is-selected" : ""}`}><div className={`room-art tone-${index % 3}`}><RoomIcon index={index} />{applied && <span className="available-badge"><i />Available</span>}</div><div className="room-info"><span className="room-location">{room.location}</span><h3>{room.name}</h3><p className="capacity">Up to {room.capacity} people</p><ul className="facilities" aria-label={`${room.name} facilities`}>{room.facilities.length ? room.facilities.map((facility) => <li key={facility}>{facility}</li>) : <li>No additional facilities</li>}</ul><button className={`button ${selected?.id === room.id ? "primary" : "secondary"} full`} disabled={!applied || busy} onClick={() => { setSelected(room); setPurpose(""); setErrors({}); setBookingError(""); setSuccess(null); }} aria-pressed={selected?.id === room.id}>{selected?.id === room.id ? "Selected" : applied ? "Choose room" : "Search a time to book"}{applied && <span aria-hidden="true">→</span>}</button></div></article>)}</div>}
      </section>
      {selected && applied && <section className="booking-panel" aria-labelledby="booking-title"><div><span className="eyebrow">YOUR RESERVATION</span><h2 id="booking-title">Book {selected.name}</h2><p className="muted">{applied.date} · {applied.startTime}–{applied.endTime} IST · {selected.location}</p><p className="small muted">Your room is reserved only after confirmation.</p></div><form onSubmit={book} noValidate><label htmlFor="purpose">Meeting purpose</label><textarea id="purpose" value={purpose} disabled={busy} maxLength={200} rows={2} onChange={(e) => { setPurpose(e.target.value); setErrors({ ...errors, purpose: "" }); }} placeholder="e.g. Project planning with the team" aria-invalid={!!errors.purpose} aria-describedby={errors.purpose ? "purpose-help purpose-error" : "purpose-help"} /><p id="purpose-help" className="small muted">1–200 characters · {purpose.trim().length}/200</p><FieldError id="purpose-error" message={errors.purpose} /><div className="booking-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel selection</button><button className="button primary" disabled={busy}>{bookingBusy ? "Confirming…" : "Confirm booking"}</button></div></form></section>}
      <footer className="content-footer"><span>Shared spaces. Simple bookings.</span><span>Conference Room Booking System · Team 12</span></footer>
      </main></div>
  </div>;
}
