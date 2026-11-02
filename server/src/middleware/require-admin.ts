import type { RequestHandler } from "express";
import { requireSession } from "./require-session.js";

/**
 * Admin-only guard (SR01). The role is read from the server-side session only,
 * never from the request. 401 when signed out, 403 when signed in but not ADMIN.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  requireSession(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.session.role !== "ADMIN") {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Administrator access is required." },
      });
      return;
    }
    next();
  });
};
