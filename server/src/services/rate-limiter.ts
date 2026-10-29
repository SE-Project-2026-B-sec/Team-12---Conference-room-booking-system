/**
 * In-Memory Login Rate Limiter (CRBS-14 / CRBS-15 / TC16 / SR04)
 *
 * Requirements:
 * - At most 5 failed sign-in attempts per IP and email within 15 minutes.
 * - The 6th attempt (or requests exceeding the limit) returns 429 TOO_MANY_REQUESTS.
 * - Concurrency safe: reserves attempt slots atomically prior to asynchronous DB / bcrypt operations.
 * - Resets failed-attempt tracking on successful authentication.
 * - Bounded memory usage with unreferenced periodic cleanup to prevent event-loop blockage.
 *
 * ARCHITECTURAL NOTICE:
 * This in-memory limiter is process-local. It is sufficient for the single-container
 * architecture defined in docker-compose.yml. In a multi-instance or clustered deployment
 * (e.g. multiple Node replicas behind a load balancer), an external shared store
 * (such as Redis or a PostgreSQL table) would be required to enforce global rate limits.
 */

interface RateLimitRecord {
  timestamps: number[];
  inFlight: number;
  lastAccess: number;
}

export class LoginRateLimiter {
  private attempts = new Map<string, RateLimitRecord>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    maxAttempts = 5,
    windowMs = 15 * 60 * 1000,
    maxEntries = 10_000,
    cleanupIntervalMs = 5 * 60 * 1000,
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;

    // Use unreferenced interval so the timer never prevents the process or tests from exiting
    if (typeof setInterval !== "undefined") {
      this.cleanupTimer = setInterval(() => {
        this.pruneExpired(Date.now());
      }, cleanupIntervalMs);
      this.cleanupTimer.unref();
    }
  }

  private getKey(ip: string, email: string): string {
    return `${ip.trim()}:${email.toLowerCase().trim()}`;
  }

  private filterTimestamps(record: RateLimitRecord, now: number): number[] {
    return record.timestamps.filter((ts) => now - ts < this.windowMs);
  }

  /**
   * Atomically reserves an attempt slot before asynchronous DB / bcrypt operations.
   * If (active failures + in-flight requests) >= maxAttempts, returns false (rate-limited).
   * Otherwise, increments inFlight and returns true.
   */
  public tryAcquire(ip: string, email: string, now = Date.now()): boolean {
    const key = this.getKey(ip, email);
    let record = this.attempts.get(key);

    if (!record) {
      if (this.attempts.size >= this.maxEntries) {
        this.pruneExpired(now);
        if (this.attempts.size >= this.maxEntries) {
          const oldestKey = this.attempts.keys().next().value;
          if (oldestKey) this.attempts.delete(oldestKey);
        }
      }
      record = { timestamps: [], inFlight: 0, lastAccess: now };
      this.attempts.set(key, record);
    } else {
      record.timestamps = this.filterTimestamps(record, now);
      record.lastAccess = now;
    }

    const totalReserved = record.timestamps.length + record.inFlight;
    if (totalReserved >= this.maxAttempts) {
      return false;
    }

    record.inFlight += 1;
    return true;
  }

  /**
   * Records a failed authentication attempt.
   * Decrements inFlight and appends failure timestamp.
   */
  public recordFailure(ip: string, email: string, now = Date.now()): void {
    const key = this.getKey(ip, email);
    const record = this.attempts.get(key);
    if (!record) return;

    record.inFlight = Math.max(0, record.inFlight - 1);
    record.timestamps = this.filterTimestamps(record, now);
    record.timestamps.push(now);
    record.lastAccess = now;
  }

  /**
   * Resets failure tracking on successful authentication.
   * Decrements inFlight and clears past failure timestamps.
   */
  public recordSuccess(ip: string, email: string): void {
    const key = this.getKey(ip, email);
    const record = this.attempts.get(key);
    if (!record) return;

    record.inFlight = Math.max(0, record.inFlight - 1);
    if (record.inFlight === 0) {
      this.attempts.delete(key);
    } else {
      record.timestamps = [];
    }
  }

  /**
   * Releases an acquired slot without counting it as a failure (e.g. unhandled error).
   */
  public abortAcquire(ip: string, email: string): void {
    const key = this.getKey(ip, email);
    const record = this.attempts.get(key);
    if (!record) return;

    record.inFlight = Math.max(0, record.inFlight - 1);
    if (record.inFlight === 0 && record.timestamps.length === 0) {
      this.attempts.delete(key);
    }
  }

  /**
   * Read-only rate limit check.
   */
  public isRateLimited(ip: string, email: string, now = Date.now()): boolean {
    const key = this.getKey(ip, email);
    const record = this.attempts.get(key);
    if (!record) return false;
    const valid = this.filterTimestamps(record, now);
    return valid.length + record.inFlight >= this.maxAttempts;
  }

  /**
   * Cleans entries that have no in-flight requests and no valid failure timestamps.
   */
  public pruneExpired(now = Date.now()): void {
    for (const [key, record] of this.attempts.entries()) {
      record.timestamps = this.filterTimestamps(record, now);
      if (record.inFlight === 0 && record.timestamps.length === 0) {
        this.attempts.delete(key);
      }
    }
  }

  public reset(ip: string, email: string): void {
    const key = this.getKey(ip, email);
    this.attempts.delete(key);
  }

  public clear(): void {
    this.attempts.clear();
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

export const loginRateLimiter = new LoginRateLimiter();
