import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage, type OwnedBooking } from "./api/client";

const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default function MyBookings({ onSignedOut }: { onSignedOut: (message?: string) => void }) {
  const [bookings, setBookings] = useState<OwnedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<OwnedBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const feedback = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const keepBooking = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.myBookings(controller.signal).then(({ bookings }) => {
      if (!controller.signal.aborted) setBookings(bookings);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onSignedOut("Your session expired. Please sign in again.");
      else setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, onSignedOut]);

  useEffect(() => {
    const element = dialog.current;
    if (target && element && !element.open) {
      element.showModal();
      keepBooking.current?.focus();
    }
    if (!target && element?.open) { element.close(); opener.current?.focus(); }
  }, [target]);

  useEffect(() => { if (notice || error) feedback.current?.focus(); }, [notice, error]);
  useEffect(() => { if (busy && dialog.current?.open) dialog.current.focus(); }, [busy]);

  function refresh() { setLoading(true); setError(""); setRevision((n) => n + 1); }
  async function cancel() {
    if (!target || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.cancelBooking(target.id);
      setBookings((items) => items.map((item) => item.id === target.id ? { ...item, status: "CANCELLED" } : item));
      setNotice(`Booking #${target.id} cancelled. The room is available for that interval again.`);
      setTarget(null);
    } catch (error) {
      setTarget(null);
      if (error instanceof ApiError && error.status === 401) onSignedOut("Your session expired. Please sign in again.");
      else {
        setError(error instanceof ApiError && error.status === 409
          ? "This booking has already started and cannot be cancelled. Your bookings have been refreshed."
          : error instanceof ApiError && error.status === 403
            ? "Your security token or access could not be verified. Reload the page before trying again."
            : error instanceof ApiError && error.status === 404
              ? "This booking is no longer available. Refresh your bookings before trying again."
              : errorMessage(error));
        if (error instanceof ApiError && error.status === 409) {
          try { setBookings((await api.myBookings()).bookings); }
          catch (refreshError) {
            if (refreshError instanceof ApiError && refreshError.status === 401) onSignedOut("Your session expired. Please sign in again.");
            else setError("The booking could not be cancelled and the list could not be refreshed. Try Refresh bookings.");
          }
        }
      }
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="my-bookings-heading" className="secondary-screen">
    <div className="results-header"><div><span className="eyebrow">YOUR RESERVATIONS</span><h1 id="my-bookings-heading">My bookings</h1><p className="muted">All times in IST. Cancel confirmed bookings before their start time.</p></div>
      <button className="button secondary" onClick={refresh} disabled={loading || busy}>Refresh bookings</button></div>
    {notice && <p role="status" ref={feedback} tabIndex={-1} className="alert success">{notice}</p>}
    {error && <p role="alert" ref={feedback} tabIndex={-1} className="alert error">{error}</p>}
    {loading ? <p role="status">Loading your bookings…</p> : bookings.length === 0 && !error
      ? <p className="empty-state">You have no bookings yet. Use Find a room to make a reservation.</p>
      : <div className="booking-list">{bookings.map((booking) => {
        const started = new Date(booking.startAt).getTime() <= now;
        const canCancel = booking.status === "CONFIRMED" && !started;
        return <article className="booking-summary" key={booking.id} aria-labelledby={`booking-${booking.id}`}>
          <h2 id={`booking-${booking.id}`}>{booking.room.name} · Booking #{booking.id}</h2>
          <p>{booking.room.location} · Up to {booking.room.capacity} people</p>
          <p>{dateTime.format(new Date(booking.startAt))} – {dateTime.format(new Date(booking.endAt))} IST</p>
          <p className="booking-purpose">{booking.purpose}</p>
          <p><strong>{booking.status === "CANCELLED" ? "Cancelled" : started ? "Started / past" : "Confirmed"}</strong></p>
          {canCancel && <button className="button secondary" disabled={busy} onClick={(event) => {
            opener.current = event.currentTarget; setTarget(booking);
          }}>Cancel booking #{booking.id}</button>}
        </article>;
      })}</div>}
    <dialog ref={dialog} tabIndex={-1} className="confirmation-dialog" aria-labelledby="cancel-title" aria-describedby="cancel-description"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!buttons.length) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
      }}
      onCancel={(event) => { if (busy) event.preventDefault(); else setTarget(null); }}>
      <h2 id="cancel-title">Cancel this booking?</h2>
      <p id="cancel-description">{target?.room.name} · Booking #{target?.id}. This releases the room for other users.</p>
      <div className="booking-actions"><button ref={keepBooking} className="button secondary" disabled={busy} onClick={() => setTarget(null)}>Keep booking</button>
        <button className="button primary" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Yes, cancel booking"}</button></div>
    </dialog>
  </section>;
}
