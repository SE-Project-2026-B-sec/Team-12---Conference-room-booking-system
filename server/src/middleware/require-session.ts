import type { RequestHandler } from "express";

/** Session contract for CRBS-14: store the authenticated integer ID in session.userId. */
export const requireSession: RequestHandler = (req, res, next) => {
  const session = (req as typeof req & { session?: { userId?: unknown } }).session;
  if (!Number.isSafeInteger(session?.userId) || Number(session?.userId) <= 0) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Sign in to view rooms." },
    });
    return;
  }
  next();
};
