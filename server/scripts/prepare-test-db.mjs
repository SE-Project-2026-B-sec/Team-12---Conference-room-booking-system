// Applies the Prisma migrations to the integration-test database (DATABASE_URL_TEST).
// Refuses to run unless the database name ends with "_test".
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

let prismaCli;
try {
  prismaCli = fileURLToPath(import.meta.resolve("prisma/build/index.js"));
} catch (resolveError) {
  console.error("Could not locate local Prisma CLI:", resolveError);
  process.exit(1);
}

const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

if (result.error) {
  console.error("Failed to spawn Prisma CLI:", result.error);
  process.exit(1);
}
if (result.signal) {
  console.error(`Prisma CLI terminated by signal: ${result.signal}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`Prisma migrate deploy failed with exit code ${result.status}.`);
  process.exit(result.status ?? 1);
}
