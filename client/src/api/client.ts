export interface User { id: number; name: string; email: string; role: "USER" | "ADMIN" }
export interface Room { id: number; name: string; location: string; capacity: number; facilities: string[] }
export interface Search { date: string; startTime: string; endTime: string; capacity: string }
export interface Booking { bookingId: number; status: "CONFIRMED"; roomId: number; startAt: string; endAt: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) { super(message); }
}

let csrfToken = "";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET" && csrfToken) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: "same-origin" });
  const token = response.headers.get("x-csrf-token");
  if (token) csrfToken = token;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) csrfToken = "";
    throw new ApiError(response.status, body?.error?.message ?? "The request failed. Please try again.", body?.fields ?? {});
  }
  if (body === null) throw new ApiError(502, "The server returned an unexpected response.");
  return body as T;
}
export const api = {
  me: (signal?: AbortSignal) => request<User>("/auth/me", { signal }),
  login: (email: string, password: string) => request<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: async () => { await request("/auth/logout", { method: "POST" }); csrfToken = ""; },
  rooms: (signal?: AbortSignal) => request<Room[]>("/rooms", { signal }),
  availability: (search: Search) => {
    const params = new URLSearchParams({ date: search.date, startTime: search.startTime, endTime: search.endTime });
    if (search.capacity) params.set("capacity", search.capacity);
    return request<{ rooms: Room[] }>(`/rooms/availability?${params}`);
  },
  book: (roomId: number, search: Search, purpose: string) => request<Booking>("/bookings", {
    method: "POST", body: JSON.stringify({ roomId, date: search.date, startTime: search.startTime, endTime: search.endTime, purpose: purpose.trim() }),
  }),
};
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not reach the server. Check your connection and try again.";
}
