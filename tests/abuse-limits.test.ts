import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sid: "" }));
vi.mock("@/lib/server/session", () => ({
  FREE_CALL_LIMIT: 3,
  sessionId: async () => fixture.sid,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
import { db } from "@/lib/server/db";
import { clientIp, memoryRateLimiter, rateLimit, RATE_LIMIT_MESSAGE, RATE_LIMIT_WINDOW_MS, type RateLimiter } from "@/lib/server/rate-limit";
import { POST as startCall } from "@/app/api/calls/route";
import { POST as voiceSession } from "@/app/api/voice/session/route";

let ipSeq = 0;
const freshIp = () => `203.0.113.${++ipSeq}`;
const post = (url: string, body: unknown, ip: string) => new Request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
  body: JSON.stringify(body),
});
const callRequest = (ip = freshIp()) => post("http://localhost/api/calls", { personaId: "jessica-hr", mode: "text" }, ip);

beforeEach(() => { fixture.sid = crypto.randomUUID(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("memory reserveCall", () => {
  it("is the memory store in tests", () => expect(db().kind).toBe("memory"));

  it("blocks the (limit+1)-th free reservation", async () => {
    const sid = crypto.randomUUID();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await db().reserveCall(sid, 3));
    expect(results.map(r => r.ok)).toEqual([true, true, true, false]);
    expect(results.map(r => r.callsUsed)).toEqual([1, 2, 3, 3]);
    expect(results.every(r => r.plan === "free")).toBe(true);
    expect((await db().getOrCreateSession(sid)).callsUsed).toBe(3);
  });

  it("counts but never blocks a paid plan", async () => {
    const sid = crypto.randomUUID();
    await db().getOrCreateSession(sid);
    await db().setPlan(sid, "sprint");
    const results = await Promise.all(Array.from({ length: 8 }, () => db().reserveCall(sid, 3)));
    expect(results.every(r => r.ok && r.plan === "sprint")).toBe(true);
    expect((await db().getOrCreateSession(sid)).callsUsed).toBe(8);
  });

  it("lets exactly `limit` of limit+3 parallel reservations through", async () => {
    const sid = crypto.randomUUID();
    const limit = 3;
    const results = await Promise.all(Array.from({ length: limit + 3 }, () => db().reserveCall(sid, limit)));
    expect(results.filter(r => r.ok)).toHaveLength(limit);
    expect((await db().getOrCreateSession(sid)).callsUsed).toBe(limit);
  });
});

describe("memory rate limiter", () => {
  it("allows N per window, then blocks, separates keys and resets after the window", async () => {
    let now = 1_000_000;
    const limiter = memoryRateLimiter(() => now);
    const hits = async (key: string, n: number) => { const out = []; for (let i = 0; i < n; i++) out.push(await limiter.hit(key, 3)); return out; };
    expect(await hits("calls:1.1.1.1", 4)).toEqual([true, true, true, false]);
    expect(await limiter.hit("calls:2.2.2.2", 3)).toBe(true);
    expect(await limiter.hit("voice-session:1.1.1.1", 3)).toBe(true);
    now += RATE_LIMIT_WINDOW_MS - 1;
    expect(await limiter.hit("calls:1.1.1.1", 3)).toBe(false);
    now += 1;
    expect(await hits("calls:1.1.1.1", 4)).toEqual([true, true, true, false]);
  });

  it("works with fake timers on the default clock", async () => {
    vi.useFakeTimers();
    const limiter = memoryRateLimiter();
    expect(await limiter.hit("k", 1)).toBe(true);
    expect(await limiter.hit("k", 1)).toBe(false);
    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);
    expect(await limiter.hit("k", 1)).toBe(true);
  });

  it("reads the client IP from x-forwarded-for, then x-real-ip", () => {
    const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
    expect(clientIp(req({ "x-forwarded-for": " 198.51.100.7 , 10.0.0.1", "x-real-ip": "1.2.3.4" }))).toBe("198.51.100.7");
    expect(clientIp(req({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("keys by route and IP, honours RATE_LIMIT_PER_HOUR and fails open", async () => {
    vi.stubEnv("RATE_LIMIT_PER_HOUR", "2");
    const limiter = memoryRateLimiter();
    const req = (ip: string) => post("http://localhost/", {}, ip);
    expect(await rateLimit(req("a"), "calls", limiter)).toBeNull();
    expect(await rateLimit(req("a"), "calls", limiter)).toBeNull();
    const blocked = await rateLimit(req("a"), "calls", limiter);
    expect(blocked?.status).toBe(429);
    expect(await blocked!.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(await rateLimit(req("b"), "calls", limiter)).toBeNull();
    expect(await rateLimit(req("a"), "voice-session", limiter)).toBeNull();

    const broken: RateLimiter = { hit: async () => { throw new Error("db down"); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await rateLimit(req("a"), "calls", broken)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("POST /api/calls with the memory store", () => {
  it("reserves at start, reports callsLeft and returns 402 after the free limit", async () => {
    const responses = [];
    for (let i = 0; i < 4; i++) responses.push(await startCall(callRequest()));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 402]);
    expect(await Promise.all(responses.slice(0, 3).map(async r => (await r.json()).callsLeft))).toEqual([2, 1, 0]);
    expect((await responses[3].json()).error).toBe("limit");
  });

  it("refuses parallel starts beyond the free limit", async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => startCall(callRequest())));
    expect(responses.filter(r => r.status === 200)).toHaveLength(3);
    expect(responses.filter(r => r.status === 402)).toHaveLength(3);
  });

  it("returns 429 per IP before reserving or creating a call", async () => {
    vi.stubEnv("RATE_LIMIT_PER_HOUR", "2");
    const ip = freshIp();
    await db().getOrCreateSession(fixture.sid);
    await db().setPlan(fixture.sid, "gym");
    expect((await startCall(callRequest(ip))).status).toBe(200);
    expect((await startCall(callRequest(ip))).status).toBe(200);
    const limited = await startCall(callRequest(ip));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect((await db().getOrCreateSession(fixture.sid)).callsUsed).toBe(2);
    expect((await db().listCalls(fixture.sid)).length).toBe(2);
    expect((await startCall(callRequest())).status).toBe(200);
  });
});

describe("POST /api/voice/session rate limit", () => {
  it("returns 429 before contacting OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("RATE_LIMIT_PER_HOUR", "1");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const ip = freshIp();
    const body = { callId: crypto.randomUUID(), sdp: "v=0\r\noffer" };
    expect((await voiceSession(post("http://localhost/api/voice/session", body, ip))).status).toBe(404);
    const limited = await voiceSession(post("http://localhost/api/voice/session", body, ip));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
