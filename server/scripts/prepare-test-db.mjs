// Applies the Prisma migrations to the integration-test database (DATABASE_URL_TEST).
// Refuses to run unless the database name ends with "_test".
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // .env is optional; the variable may already be in the environment.
}

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error("DATABASE_URL_TEST is not set. See .env.example.");
  process.exit(1);
}
const dbName = new URL(url).pathname.replace(/^\//, "");
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(result.status ?? 1);
