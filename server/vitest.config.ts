import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The DB-backed test files share one *_test database and some assert on whole-table
    // listings (e.g. GET /api/rooms), so files must not run concurrently.
    fileParallelism: false,
  },
});
