import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: "USER" | "ADMIN";
    csrfToken: string;
  }
}
