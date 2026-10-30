import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api, ApiError } from "./api/client";
import { istDate } from "./lib/booking-rules";

const user = { id: 1, name: "Demo User", email: "demo.user@example.test", role: "USER" as const };
const rooms = [{ id: 1, name: "Room A", location: "First Floor", capacity: 10, facilities: ["Projector"] }];
beforeEach(() => {
  vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "Sign in"));
  vi.spyOn(api, "login").mockResolvedValue(user);
  vi.spyOn(api, "logout").mockResolvedValue();
  vi.spyOn(api, "rooms").mockResolvedValue(rooms);
  vi.spyOn(api, "availability").mockResolvedValue({ rooms });
  vi.spyOn(api, "book").mockResolvedValue({ bookingId: 42, status: "CONFIRMED", roomId: 1, startAt: `${istDate(1)}T04:30:00Z`, endAt: `${istDate(1)}T05:30:00Z` });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function readyRooms() {
  vi.mocked(api.me).mockResolvedValue(user);
  render(<App />);
  await screen.findByRole("heading", { name: "Room A" });
}
async function selectRoom() {
  await readyRooms();
  fireEvent.click(screen.getByRole("button", { name: /Find rooms/ }));
  await screen.findByRole("heading", { name: /Available rooms/ });
  fireEvent.click(screen.getByRole("button", { name: /Choose room/ }));
}

describe("TC16 / login and session UI", () => {
  it("signs in and displays rooms using the returned profile", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /^Sign in/ });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    await screen.findByRole("heading", { name: "Room A" });
    expect(api.login).toHaveBeenCalledWith(user.email, "synthetic-password");
    expect(screen.getByText("Demo User")).toBeTruthy();
  });
  it("shows invalid-login feedback", async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, "Invalid email or password."));
    render(<App />);
    await screen.findByRole("button", { name: /^Sign in/ });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid email or password");
  });
  it("signs out and returns to login", async () => {
    await readyRooms();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: /^Sign in/ });
    expect(api.logout).toHaveBeenCalledOnce();
  });
  it("returns to login when a booking request reports session expiry", async () => {
    vi.mocked(api.book).mockRejectedValue(new ApiError(401, "Authentication required"));
    await selectRoom();
    fireEvent.change(screen.getByLabelText("Meeting purpose"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect((await screen.findByRole("alert")).textContent).toContain("session expired");
  });
});

describe("TC01 / TC02 room listing and search", () => {
  it("shows room fields and prevents booking before availability is checked", async () => {
    await readyRooms();
    expect(screen.getByText("First Floor")).toBeTruthy();
    expect(screen.getByText("Up to 10 people")).toBeTruthy();
    expect(screen.getByText("Projector")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Search a time to book" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("searches with optional capacity and shows a useful empty result", async () => {
    vi.mocked(api.availability).mockResolvedValue({ rooms: [] });
    await readyRooms();
    fireEvent.change(screen.getByLabelText(/Minimum capacity/), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /Find rooms/ }));
    await screen.findByText("No rooms available for this time");
    expect(api.availability).toHaveBeenCalledWith(expect.objectContaining({ capacity: "12" }));
  });
  it("invalidates availability and selection when search criteria change", async () => {
    await selectRoom();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "11:00" } });
    expect(screen.queryByRole("button", { name: "Confirm booking" })).toBeNull();
    expect((screen.getByRole("button", { name: "Search a time to book" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("offers retry after a room-list network failure", async () => {
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.rooms).mockRejectedValueOnce(new TypeError("network"));
    render(<App />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reload rooms" }));
    await screen.findByRole("heading", { name: "Room A" });
    expect(api.rooms).toHaveBeenCalledTimes(2);
  });
});

describe("TC04 / TC05 / TC06 / TC07 booking flow", () => {
  it("shows inline interval errors without sending an invalid search", async () => {
    await readyRooms();
    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Find rooms/ }));
    expect(screen.getByText(/30 to 240 minutes after/)).toBeTruthy();
    expect(api.availability).not.toHaveBeenCalled();
  });
  it("requires a nonblank meeting purpose before posting", async () => {
    await selectRoom();
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(screen.getByText(/Enter a meeting purpose/)).toBeTruthy();
    expect(api.book).not.toHaveBeenCalled();
  });
  it("shows actual confirmation only after the server returns success", async () => {
    await selectRoom();
    fireEvent.change(screen.getByLabelText("Meeting purpose"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await screen.findByText(/Booking confirmed · #42/);
    expect(api.book).toHaveBeenCalledWith(1, expect.objectContaining({ date: istDate(1) }), "Planning");
    expect(screen.queryByRole("button", { name: "Confirm booking" })).toBeNull();
  });
  it("handles a stale availability conflict and refreshes choices", async () => {
    vi.mocked(api.book).mockRejectedValue(new ApiError(409, "Conflict"));
    await selectRoom();
    vi.mocked(api.availability).mockResolvedValue({ rooms: [] });
    fireEvent.change(screen.getByLabelText("Meeting purpose"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await screen.findByText(/That room was just booked/);
    await screen.findByText("No rooms available for this time");
    expect(screen.queryByText(/Booking confirmed/)).toBeNull();
  });
  it("displays server-side field validation instead of success", async () => {
    vi.mocked(api.book).mockRejectedValue(new ApiError(400, "Invalid booking request.", { purpose: "Server rejected purpose" }));
    await selectRoom();
    fireEvent.change(screen.getByLabelText("Meeting purpose"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await screen.findByText("Server rejected purpose");
    expect(screen.queryByText(/Booking confirmed/)).toBeNull();
  });
  it("disables duplicate submits while confirmation is pending", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.book>>) => void;
    vi.mocked(api.book).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await selectRoom();
    fireEvent.change(screen.getByLabelText("Meeting purpose"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    const button = screen.getByRole("button", { name: "Confirming…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(api.book).toHaveBeenCalledOnce();
    resolve({ bookingId: 44, status: "CONFIRMED", roomId: 1, startAt: `${istDate(1)}T04:30:00Z`, endAt: `${istDate(1)}T05:30:00Z` });
    await waitFor(() => expect(screen.getByText(/Booking confirmed · #44/)).toBeTruthy());
  });
});
