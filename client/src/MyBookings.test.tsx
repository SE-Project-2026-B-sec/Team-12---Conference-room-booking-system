import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import MyBookings from "./MyBookings";
import { api, ApiError, type OwnedBooking } from "./api/client";

const onSignedOut = vi.fn();
const booking: OwnedBooking = { id: 12, roomId: 1, purpose: "Project planning", status: "CONFIRMED",
  startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString(),
  createdAt: new Date().toISOString(), room: { name: "Room A", location: "Floor 1", capacity: 8 } };
beforeAll(() => Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.open = true; } },
  close: { configurable: true, value() { this.open = false; } },
}));
beforeEach(() => {
  onSignedOut.mockReset();
  vi.spyOn(api, "myBookings").mockResolvedValue({ bookings: [booking] });
  vi.spyOn(api, "cancelBooking").mockResolvedValue({ bookingId: 12, status: "CANCELLED" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function ready() { render(<MyBookings onSignedOut={onSignedOut} />); await screen.findByRole("button", { name: "Cancel booking #12" }); }
async function confirm() { await ready(); fireEvent.click(screen.getByRole("button", { name: "Cancel booking #12" })); await screen.findByRole("dialog"); }

describe("TC10 / TC11 / TC12 My Bookings and cancellation UI", () => {
  it("shows owned booking details and IST timestamps", async () => {
    await ready(); expect(screen.getByText("Project planning")).toBeTruthy();
    expect(screen.getByText(/Floor 1/)).toBeTruthy(); expect(screen.getByText(/IST$/)).toBeTruthy();
  });
  it("handles an empty list", async () => {
    vi.mocked(api.myBookings).mockResolvedValue({ bookings: [] }); render(<MyBookings onSignedOut={onSignedOut} />);
    expect(await screen.findByText(/You have no bookings yet/)).toBeTruthy();
  });
  it("requires confirmation and Keep booking sends no write", async () => {
    await confirm(); expect(api.cancelBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep booking" }));
    expect(api.cancelBooking).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("Escape dismisses without cancelling", async () => {
    await confirm(); fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(api.cancelBooking).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("updates status only after the cancellation succeeds", async () => {
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Yes, cancel booking" }));
    await screen.findByText(/Booking #12 cancelled/); expect(api.cancelBooking).toHaveBeenCalledWith(12);
    expect(screen.getByText("Cancelled")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Cancel booking #12" })).toBeNull();
  });
  it("does not offer cancellation for started or cancelled bookings", async () => {
    vi.mocked(api.myBookings).mockResolvedValue({ bookings: [{ ...booking, status: "CANCELLED" }, { ...booking, id: 13, startAt: "2020-01-01T00:00:00Z" }] });
    render(<MyBookings onSignedOut={onSignedOut} />); await screen.findByText("Cancelled");
    expect(screen.getByText("Started / past")).toBeTruthy(); expect(screen.queryByRole("button", { name: /^Cancel booking/ })).toBeNull();
  });
  it("shows conflict without claiming success and refreshes the list", async () => {
    vi.mocked(api.cancelBooking).mockRejectedValue(new ApiError(409, "Started"));
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Yes, cancel booking" }));
    await screen.findByText(/has already started/); expect(api.myBookings).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Booking #12 cancelled/)).toBeNull();
  });
  it.each([403, 404, 500])("shows cancellation failure %s and preserves the booking", async (status) => {
    vi.mocked(api.cancelBooking).mockRejectedValue(new ApiError(status, "Request failed"));
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Yes, cancel booking" }));
    await screen.findByRole("alert"); expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(screen.queryByText(/Booking #12 cancelled/)).toBeNull();
  });
  it("returns to login when the list request expires", async () => {
    vi.mocked(api.myBookings).mockRejectedValue(new ApiError(401, "Expired"));
    render(<MyBookings onSignedOut={onSignedOut} />); await screen.findByText(/Loading your bookings/);
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledWith(expect.stringContaining("session expired")));
  });
  it("supports retry after a network failure", async () => {
    vi.mocked(api.myBookings).mockRejectedValueOnce(new TypeError("Network error"));
    render(<MyBookings onSignedOut={onSignedOut} />); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Refresh bookings" })); await screen.findByText("Project planning");
  });
  it("blocks duplicate confirmation while pending", async () => {
    let finish!: (value: { bookingId: number; status: "CANCELLED" }) => void;
    vi.mocked(api.cancelBooking).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await confirm(); fireEvent.click(screen.getByRole("button", { name: "Yes, cancel booking" }));
    const button = screen.getByRole("button", { name: "Cancelling…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button); expect(api.cancelBooking).toHaveBeenCalledOnce();
    finish({ bookingId: 12, status: "CANCELLED" }); await screen.findByText(/Booking #12 cancelled/);
  });
});
