import express, { type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use("/api", healthRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
  });

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
