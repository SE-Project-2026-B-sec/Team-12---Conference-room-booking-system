import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminRooms, { validateRoom } from "./AdminRooms";
import App from "./App";
import { api, ApiError } from "./api/client";

const user = { id: 1, name: "Demo Admin", email: "admin@example.test", role: "ADMIN" as const };
const room = { id: 1, name: "Room A", location: "Floor 1", capacity: 8, facilities: ["Projector"] };
const onSignedOut = vi.fn(); const onRoomsChanged = vi.fn();
beforeEach(() => {
  onSignedOut.mockReset(); onRoomsChanged.mockReset();
  vi.spyOn(api, "rooms").mockResolvedValue([room]);
  vi.spyOn(api, "createRoom").mockResolvedValue({ ...room, id: 2, name: "Room B" });
  vi.spyOn(api, "updateRoom").mockResolvedValue({ ...room, capacity: 20 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function ready() { render(<AdminRooms user={user} onSignedOut={onSignedOut} onRoomsChanged={onRoomsChanged} />); await screen.findByRole("button", { name: "Edit Room A" }); }
function fill() {
  fireEvent.change(screen.getByLabelText("Room name (required)"), { target: { value: " Room B " } });
  fireEvent.change(screen.getByLabelText("Location (required)"), { target: { value: " Floor 2 " } });
  fireEvent.change(screen.getByLabelText("Capacity (required)"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Facilities (optional)"), { target: { value: " Whiteboard \n\n Projector " } });
}

describe("TC13 / TC14 admin room UI", () => {
  it("blocks a regular user before loading admin data", () => {
    render(<AdminRooms user={{ ...user, role: "USER" }} onSignedOut={onSignedOut} />);
    expect(screen.getByRole("alert").textContent).toContain("Administrator access"); expect(api.rooms).not.toHaveBeenCalled();
  });
  it("does not expose the admin navigation to ordinary users", async () => {
    vi.spyOn(api, "me").mockResolvedValue({ ...user, role: "USER" }); render(<App />);
    await screen.findByRole("heading", { name: "Room A" }); expect(screen.queryByRole("button", { name: "Manage rooms" })).toBeNull();
  });
  it("keeps shared sign-out errors visible on the admin screen", async () => {
    vi.spyOn(api, "me").mockResolvedValue(user);
    vi.spyOn(api, "logout").mockRejectedValue(new ApiError(403, "Security token expired"));
    render(<App />); await screen.findByRole("heading", { name: "Room A" });
    fireEvent.click(screen.getByRole("button", { name: "Manage rooms" }));
    await screen.findByRole("heading", { name: "Manage rooms" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Security token expired")).toBeTruthy();
  });
  it("creates with trimmed text, integer capacity and line-separated facilities", async () => {
    await ready(); fill(); fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    await screen.findByText(/Room B created successfully/);
    expect(api.createRoom).toHaveBeenCalledWith({ name: "Room B", location: "Floor 2", capacity: 12, facilities: ["Whiteboard", "Projector"] });
    expect(screen.getByRole("button", { name: "Edit Room B" })).toBeTruthy(); expect(onRoomsChanged).toHaveBeenCalledOnce();
  });
  it("focuses and shows required validation without sending a write", async () => {
    await ready(); fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    expect(screen.getByText(/Enter a room name/)).toBeTruthy(); expect(api.createRoom).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("Room name (required)"));
  });
  it("prefills edit, sends PATCH fields and supports clearing facilities", async () => {
    await ready(); fireEvent.click(screen.getByRole("button", { name: "Edit Room A" }));
    expect((screen.getByLabelText("Room name (required)") as HTMLInputElement).value).toBe("Room A");
    fireEvent.change(screen.getByLabelText("Capacity (required)"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Facilities (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save room changes" })); await screen.findByText(/Room A updated successfully/);
    expect(api.updateRoom).toHaveBeenCalledWith(1, { name: "Room A", location: "Floor 1", capacity: 20, facilities: [] });
  });
  it("cancels editing without a request", async () => {
    await ready(); fireEvent.click(screen.getByRole("button", { name: "Edit Room A" })); fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
    expect(screen.getByRole("heading", { name: "Create a room" })).toBeTruthy(); expect(api.updateRoom).not.toHaveBeenCalled();
  });
  it.each([400, 403, 404, 500])("preserves edits and displays server error %s", async (status) => {
    vi.mocked(api.updateRoom).mockRejectedValue(new ApiError(status, "Invalid room details", { capacity: "Server capacity error" }));
    await ready(); fireEvent.click(screen.getByRole("button", { name: "Edit Room A" }));
    fireEvent.click(screen.getByRole("button", { name: "Save room changes" })); await screen.findByRole("alert");
    expect((screen.getByLabelText("Room name (required)") as HTMLInputElement).value).toBe("Room A");
    if (status === 400) expect(screen.getByText("Server capacity error")).toBeTruthy();
    expect(screen.queryByText(/updated successfully/)).toBeNull();
  });
  it("returns to login on a 401 save", async () => {
    vi.mocked(api.createRoom).mockRejectedValue(new ApiError(401, "Expired")); await ready(); fill();
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalled());
  });
  it("shows an empty list and retries failed loading", async () => {
    vi.mocked(api.rooms).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce([]);
    render(<AdminRooms user={user} onSignedOut={onSignedOut} />); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reload room list" })); await screen.findByText(/No rooms yet/);
  });
  it("disables repeated writes until saving finishes", async () => {
    let finish!: (value: typeof room) => void;
    vi.mocked(api.createRoom).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await ready(); fill(); fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    const button = screen.getByRole("button", { name: "Saving room…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button); expect(api.createRoom).toHaveBeenCalledOnce();
    finish(room); await screen.findByText(/created successfully/);
  });
});

describe("TC13 admin validation boundaries", () => {
  const draft = { name: "Room", location: "Floor", capacity: "1", facilities: "" };
  it.each(["0", "-1", "1.5", "10001", "", "abc"])("rejects invalid capacity %s", (capacity) => {
    expect(validateRoom({ ...draft, capacity }).fields.capacity).toBeTruthy();
  });
  it("accepts capacity limits and rejects excessive field/facility lengths", () => {
    expect(validateRoom(draft).fields).toEqual({}); expect(validateRoom({ ...draft, capacity: "10000" }).fields).toEqual({});
    expect(validateRoom({ ...draft, name: "x".repeat(101) }).fields.name).toBeTruthy();
    expect(validateRoom({ ...draft, location: "x".repeat(201) }).fields.location).toBeTruthy();
    expect(validateRoom({ ...draft, facilities: Array(51).fill("Projector").join("\n") }).fields.facilities).toBeTruthy();
    expect(validateRoom({ ...draft, facilities: "x".repeat(101) }).fields.facilities).toBeTruthy();
  });
});
