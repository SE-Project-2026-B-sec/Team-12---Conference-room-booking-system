import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";

const PgSession = connectPgSimple(session);

export const SESSION_COOKIE_NAME = "crbs.sid";
export const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
export const DEFAULT_DEV_SESSION_SECRET = "change_me_to_a_long_random_string";

export interface SessionOptionsConfig {
  sessionStore?: session.Store;
}

/**
 * Validates and resolves the session signing secret.
 * In production, requires an explicit, secure secret and rejects empty or placeholder values.
 * Never logs or exposes the secret.
 */
export function resolveSessionSecret(isProduction: boolean): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (isProduction) {
    if (!secret || secret === DEFAULT_DEV_SESSION_SECRET) {
      throw new Error(
        "Production configuration error: SESSION_SECRET must be configured with a secure random value.",
      );
    }
    return secret;
  }
  return secret || DEFAULT_DEV_SESSION_SECRET;
}

export function createSessionMiddleware(config?: SessionOptionsConfig) {
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  let store: session.Store;

  if (config?.sessionStore) {
    if (isProduction && config.sessionStore instanceof session.MemoryStore) {
      throw new Error("MemoryStore cannot be used as the production session store.");
    }
    store = config.sessionStore;
  } else if (isTest) {
    // Tests default to an isolated MemoryStore unless an explicit sessionStore was passed.
    // This prevents accidental connections to a developer's local PostgreSQL database.
    store = new session.MemoryStore();
  } else {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      if (isProduction) {
        throw new Error("DATABASE_URL must be configured in production.");
      }
      // Fallback for development if DB is not yet running
      store = new session.MemoryStore();
    } else {
      const pool = new pg.Pool({ connectionString });
      store = new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      });
    }
  }

  const secret = resolveSessionSecret(isProduction);

  return session({
    store,
    name: SESSION_COOKIE_NAME,
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}
