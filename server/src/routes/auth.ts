import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { loginRateLimiter } from "../services/rate-limiter.js";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, ensureCsrfToken } from "../middleware/csrf.js";
import { SESSION_COOKIE_NAME } from "../lib/session.js";

export const authRouter = Router();

// Constant-time dummy hash (bcrypt cost 12) to mitigate user enumeration timing attacks
const DUMMY_BCRYPT_HASH = "$2b$12$e80yvEa7.k44y784i85jxea0b6mP2x8hZzFz8C89FkEa7B/65P2Ki";

authRouter.post("/auth/login", async (req, res, next) => {
  let acquired = false;
  let clientIp = "";
  let email = "";

  try {
    const body = req.body;
    if (
      typeof body !== "object" ||
      body === null ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "Email and password are required.",
        },
      });
      return;
    }

    email = body.email.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "Email and password cannot be empty.",
        },
      });
      return;
    }

    clientIp = (req.ip || req.socket.remoteAddress || "127.0.0.1").replace(/^.*:/, "");

    // Atomically reserve an attempt slot before asynchronous DB / bcrypt operations (Fix 3)
    if (!loginRateLimiter.tryAcquire(clientIp, email)) {
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many failed login attempts. Please try again after 15 minutes.",
        },
      });
      return;
    }
    acquired = true;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Constant-time comparison whether user exists or not
    const hashToCompare = user ? user.passwordHash : DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordValid) {
      loginRateLimiter.recordFailure(clientIp, email);
      acquired = false;
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid email or password.",
        },
      });
      return;
    }

    // Release slot and reset failed count on successful authentication
    loginRateLimiter.recordSuccess(clientIp, email);
    acquired = false;

    // Regenerate session ID to prevent session fixation attacks (CRBS-14 / CRBS-15)
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Store positive integer User.id and role in session per contract
    req.session.userId = user.id;
    req.session.role = user.role;
    const csrfToken = ensureCsrfToken(req.session);

    // Commit session state
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    res.setHeader(CSRF_HEADER_NAME, csrfToken);
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    // Return safe user profile only, never passwordHash
    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    if (acquired && clientIp && email) {
      loginRateLimiter.abortAcquire(clientIp, email);
    }
    next(error);
  }
});

authRouter.get("/auth/me", async (req, res, next) => {
  try {
    const session = req.session;
    const userId = session?.userId;
    if (
      typeof userId !== "number" ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required.",
        },
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie(SESSION_COOKIE_NAME);
      res.clearCookie(CSRF_COOKIE_NAME);
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "User account no longer exists.",
        },
      });
      return;
    }

    if (session.csrfToken) {
      res.setHeader(CSRF_HEADER_NAME, session.csrfToken);
    }

    // Explicitly return safe profile only, never passwordHash
    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/logout", (req, res, next) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie(SESSION_COOKIE_NAME);
        res.clearCookie(CSRF_COOKIE_NAME);
        res.status(200).json({
          status: "ok",
          message: "Logged out successfully",
        });
      });
    } else {
      res.clearCookie(SESSION_COOKIE_NAME);
      res.clearCookie(CSRF_COOKIE_NAME);
      res.status(200).json({
        status: "ok",
        message: "Logged out successfully",
      });
    }
  } catch (error) {
    next(error);
  }
});

authRouter.get("/auth/csrf", (req, res) => {
  if (!req.session) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Session is unavailable.",
      },
    });
    return;
  }

  const token = ensureCsrfToken(req.session);
  res.setHeader(CSRF_HEADER_NAME, token);
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(200).json({ csrfToken: token });
});
