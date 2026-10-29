import { roomsRouter } from "./routes/rooms.js";
import { existsSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { createSessionMiddleware, type SessionOptionsConfig } from "./lib/session.js";
import { csrfProtection } from "./middleware/csrf.js";

export interface AppOptions extends SessionOptionsConfig {
  trustProxy?: boolean | number | string;
}

export function createApp(options?: AppOptions) {
  const app = express();

  // Configure reverse proxy trust only when explicitly requested.
  // Prevents blind trust in spoofed X-Forwarded-* headers unless the deployment warrants it.
  if (options?.trustProxy !== undefined) {
    app.set("trust proxy", options.trustProxy);
  } else if (process.env.TRUST_PROXY) {
    const rawVal = process.env.TRUST_PROXY.trim();
    if (/^\d+$/.test(rawVal)) {
      app.set("trust proxy", parseInt(rawVal, 10));
    } else if (rawVal.toLowerCase() === "true") {
      app.set("trust proxy", 1); // standard 1-hop reverse proxy (e.g. NGINX)
    } else if (rawVal.toLowerCase() === "false") {
      app.set("trust proxy", false);
    } else {
      app.set("trust proxy", rawVal);
    }
  }

  app.use(express.json());

  // Mount session middleware before API routers
  app.use(createSessionMiddleware(options));

  // Mount CSRF protection for authenticated write operations
  app.use(csrfProtection);

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", roomsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
  });

  // Serve the built client when present (Docker image); SPA fallback for non-API paths.
  const publicDir = path.resolve("public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Malformed JSON body" } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  });

  return app;
}
