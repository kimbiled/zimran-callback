// Per-IP sliding-window rate limit for routes that cost money (call start, GPT-Live handshake).
// With DATABASE_URL: shared through Neon across Vercel workers. Without it: process memory.
import { neon } from "@neondatabase/serverless";
import { bad } from "./validate";

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_MESSAGE = "Too many calls from this network. Try again in an hour.";

/** Allowed requests per hour per IP per route; RATE_LIMIT_PER_HOUR, default 30 (judges and testers often share one venue Wi-Fi IP). */
export function rateLimitPerHour(): number {
  const n = Number(process.env.RATE_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 30;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimiter {
  /** Records the hit and returns true when it is within the limit; refused hits are not recorded. */
  hit(key: string, limit: number): Promise<boolean>;
}

export function memoryRateLimiter(now: () => number = Date.now, hits = new Map<string, number[]>()): RateLimiter {
  return {
    async hit(key, limit) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter(at => at > t - RATE_LIMIT_WINDOW_MS);
      const allowed = recent.length < limit;
      if (allowed) recent.push(t);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
      return allowed;
    },
  };
}

function neonRateLimiter(url: string): RateLimiter {
  const sql = neon(url);
  let ready: Promise<unknown> | undefined;
  const init = () => {
    ready ??= (async () => {
      await sql`create table if not exists rate_hits (key text not null, at timestamptz not null default now())`;
      await sql`create index if not exists rate_hits_key_at_idx on rate_hits (key, at)`;
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  };
  return {
    async hit(key, limit) {
      await init();
      // One round trip: count the last hour and record this hit only if it is under the limit.
      // Exactly simultaneous requests can overshoot by a few; acceptable for an abuse guard.
      const rows = await sql`with recent as (
        select count(*)::int as n from rate_hits where key = ${key} and at > now() - interval '1 hour'
      ), recorded as (
        insert into rate_hits (key) select ${key} from recent where recent.n < ${limit} returning 1
      ) select n from recent`;
      if (Math.random() < 0.01) {
        void sql`delete from rate_hits where at < now() - interval '1 day'`.catch(error => {
          console.error("rate limit cleanup failed", error instanceof Error ? error.message : error);
        });
      }
      return Number(rows[0]?.n ?? 0) < limit;
    },
  };
}

const shared = globalThis as unknown as { __cbRateHits?: Map<string, number[]> };
let limiter: RateLimiter | null = null;
function defaultLimiter(): RateLimiter {
  limiter ??= process.env.DATABASE_URL
    ? neonRateLimiter(process.env.DATABASE_URL)
    : memoryRateLimiter(Date.now, shared.__cbRateHits ??= new Map());
  return limiter;
}

/**
 * Returns a 429 response when this IP exceeded the hourly limit for `route`, otherwise null.
 * Fails open: if the limiter store errors, the request is allowed and the error is logged.
 */
/** Cheap, frequent routes get a higher hourly allowance than call starts (which cost voice minutes). */
const ROUTE_MULTIPLIER: Record<string, number> = { hint: 4, retry: 2, warmup: 2 };

export function routeLimit(route: string): number {
  return rateLimitPerHour() * (ROUTE_MULTIPLIER[route] ?? 1);
}

export async function rateLimit(req: Request, route: string, store: RateLimiter = defaultLimiter()): Promise<Response | null> {
  try {
    if (await store.hit(`${route}:${clientIp(req)}`, routeLimit(route))) return null;
  } catch (error) {
    console.error("rate limit check failed; allowing request", { route, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
  return bad(RATE_LIMIT_MESSAGE, 429);
}
