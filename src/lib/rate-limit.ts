/**
 * Rate limiting for /api/extract (spec §3, §11).
 *
 * - Upstash Redis (@upstash/ratelimit) when UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN are set.
 * - In-memory fallback otherwise (dev / no Upstash configured).
 * - Free tier: DAILY_SCAN_LIMIT scans per day per IP (default 5).
 *
 * The limiter never sees image data — it is keyed by IP only.
 */

export interface RateLimitResult {
  success: boolean;
  /** Configured daily limit for this IP. */
  limit: number;
  /** Scans remaining in the current window (0 when limited). */
  remaining: number;
  /** Unix epoch ms when the current window resets. */
  reset: number;
}

export function getDailyScanLimit(): number {
  const raw = Number.parseInt(process.env.DAILY_SCAN_LIMIT ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/** Start of the current UTC day, in ms — the in-memory window boundary. */
function startOfUtcDay(now: number): number {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

interface MemoryEntry {
  windowStart: number;
  count: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function checkMemory(ip: string, limit: number, now: number): RateLimitResult {
  const windowStart = startOfUtcDay(now);
  const entry = memoryStore.get(ip);
  if (!entry || entry.windowStart !== windowStart) {
    memoryStore.set(ip, { windowStart, count: 1 });
    return { success: true, limit, remaining: limit - 1, reset: windowStart + 24 * 60 * 60 * 1000 };
  }
  if (entry.count >= limit) {
    return { success: false, limit, remaining: 0, reset: windowStart + 24 * 60 * 60 * 1000 };
  }
  entry.count += 1;
  return { success: true, limit, remaining: limit - entry.count, reset: windowStart + 24 * 60 * 60 * 1000 };
}

/** Test-only hook: clears the in-memory store between tests. */
export function __resetRateLimitForTests(): void {
  memoryStore.clear();
}

let upstashLimiter: import("@upstash/ratelimit").Ratelimit | null = null;
let upstashTried = false;

async function getUpstashLimiter(): Promise<import("@upstash/ratelimit").Ratelimit | null> {
  if (upstashTried) return upstashLimiter;
  upstashTried = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    const { Ratelimit } = await import("@upstash/ratelimit");
    upstashLimiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(getDailyScanLimit(), "86400 s"),
      analytics: false,
      prefix: "routinesnap:extract",
    });
  } catch {
    // Misconfigured Upstash must never take the API down — fall back.
    upstashLimiter = null;
  }
  return upstashLimiter;
}

/**
 * Check (and consume) one scan for `ip`. Returns success=false when the
 * daily limit is hit. Upstash errors fall back to the in-memory limiter
 * rather than failing the request.
 */
export async function checkRateLimit(
  ip: string,
  opts?: { limit?: number; now?: number },
): Promise<RateLimitResult> {
  const limit = opts?.limit ?? getDailyScanLimit();
  const now = opts?.now ?? Date.now();
  const limiter = await getUpstashLimiter();
  if (limiter) {
    try {
      const { success, remaining, reset } = await limiter.limit(`ip:${ip}`);
      return { success, limit, remaining, reset };
    } catch {
      // Fall through to the in-memory limiter.
    }
  }
  return checkMemory(ip, limit, now);
}

/** Best-effort client IP from request headers (proxy-aware). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
