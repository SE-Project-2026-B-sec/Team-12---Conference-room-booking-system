// Imported FIRST by integration tests. Points the app's Prisma client at the
// *_test database and refuses to run against anything else.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // .env is optional; the variable may already be in the environment.
}

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error("DATABASE_URL_TEST is not set; integration tests need it (see .env.example and README).");
}
const dbName = new URL(url).pathname.replace(/^\//, "");
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to run integration tests: database "${dbName}" does not end with "_test".`);
}
process.env.DATABASE_URL = url;
