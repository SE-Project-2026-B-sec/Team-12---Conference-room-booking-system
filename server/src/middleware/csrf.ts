import type { RequestHandler } from "express";
import crypto from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_COOKIE_NAME = "crbs.csrf";

/**
 * Validates CSRF token on authenticated state-changing requests (POST, PUT, PATCH, DELETE).
 * Unauthenticated requests (like initial login) and safe HTTP methods (GET, HEAD, OPTIONS) are exempt.
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Only authenticated requests require CSRF protection per SRS SR03 / Test Plan TC16
  const session = req.session;
  const userId = session?.userId;
  const isUserAuthenticated =
    typeof userId === "number" &&
    Number.isSafeInteger(userId) &&
    userId > 0;

  if (!isUserAuthenticated) {
    return next();
  }

  const expectedToken = session.csrfToken;
  if (!expectedToken || typeof expectedToken !== "string") {
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Missing CSRF session token.",
      },
    });
    return;
  }

  const clientToken =
    (req.headers["x-csrf-token"] as string | undefined) ||
    (req.headers["csrf-token"] as string | undefined) ||
    (typeof req.body === "object" && req.body !== null
      ? (req.body as { _csrf?: unknown })._csrf
      : undefined);

  if (!clientToken || typeof clientToken !== "string") {
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Missing or invalid CSRF token.",
      },
    });
    return;
  }

  const expectedBuf = Buffer.from(expectedToken);
  const clientBuf = Buffer.from(clientToken);

  if (
    expectedBuf.length !== clientBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, clientBuf)
  ) {
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Missing or invalid CSRF token.",
      },
    });
    return;
  }

  next();
};

export function ensureCsrfToken(session: { csrfToken?: string }): string {
  if (!session.csrfToken) {
    session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return session.csrfToken;
}
