
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const testData = JSON.parse(open("./data.json"));
const PASSWORD = __ENV.K6_TEST_PASSWORD;
const BASE_URL = __ENV.BASE_URL || testData.baseUrl;

const bookingDuration = new Trend("booking_duration", true);
const bookingFailures = new Rate("booking_failures");
const bookingAttempts = new Counter("booking_attempts");

export const options = {
  scenarios: {
    booking_load: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1m",
      duration: "1m59s",
      preAllocatedVUs: 5,
      maxVUs: 5,
    },
  },
  thresholds: {
    booking_duration: ["p(95)<3000"],
    booking_failures: ["rate<0.05"],
    dropped_iterations: ["count==0"],
    
  },
};

export default function () {
  const account = testData.users[__VU - 1];
  const room = testData.rooms[__VU - 1];

  if (!PASSWORD) {
    throw new Error("K6_TEST_PASSWORD is missing.");
  }

  // Login on every iteration to establish a fresh session.
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: account.email,
      password: PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { name: "login" },
    }
  );

  if (!check(login, {
    "login successful": (r) => r.status === 200,
  })) {
    console.error(`VU ${__VU}: Login failed: ${login.status} ${login.body}`);
    bookingFailures.add(1);
    return;
  }

  const csrfHeader = Object.entries(login.headers).find(
    ([key]) => key.toLowerCase() === "x-csrf-token"
  );

  const csrfToken = csrfHeader ? csrfHeader[1] : "";

  if (!csrfToken) {
    console.error(`VU ${__VU}: CSRF token missing.`);
    bookingFailures.add(1);
    return;
  }

  const slot = __ITER;
  const dayOffset = 20 + Math.floor(slot / 18);
  const timeSlot = slot % 18;

  const date = new Date(
    Date.now() + 330 * 60 * 1000 + dayOffset * 86400000
  ).toISOString().slice(0, 10);

  const startMinutes = 9 * 60 + timeSlot * 30;
  const endMinutes = startMinutes + 30;

  const formatTime = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  const response = http.post(
    `${BASE_URL}/api/bookings`,
    JSON.stringify({
      roomId: room.id,
      date,
      startTime: formatTime(startMinutes),
      endTime: formatTime(endMinutes),
      purpose: `CRBS-39 load test VU${__VU} slot${slot}`,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      tags: { name: "create_booking" },
    }
  );

  console.log(`VU ${__VU}: booking status ${response.status}`);

  if (response.status !== 201) {
    console.log(`Booking error: ${response.body}`);
  }

  bookingAttempts.add(1);
  bookingDuration.add(response.timings.duration);
  bookingFailures.add(response.status !== 201);

  check(response, {
    "booking created successfully": (r) => r.status === 201,
  });
}
