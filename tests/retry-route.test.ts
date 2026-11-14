import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord, RetryResponse, Turn } from "@/lib/types";

const fixture = vi.hoisted(() => ({ sid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", call: null as CallRecord | null, gets: 0, writes: 0 }));
vi.mock("@/lib/server/session", () => ({
  FREE_CALL_LIMIT: 3,
  sessionId: async () => fixture.sid,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
vi.mock("@/lib/server/db", () => ({
  db: () => ({
    getCall: async (id: string) => {
      fixture.gets++;
      return fixture.call && fixture.call.id === id ? structuredClone(fixture.call) : null;
    },
    finishCall: async () => { fixture.writes++; },
    reserveCall: async () => { fixture.writes++; return { ok: true, callsUsed: 1, plan: "free" }; },
  }),
}));
import { POST as retry } from "@/app/api/retry/route";
import { getPersona } from "@/lib/personas";
import { sampleCall } from "@/lib/sample";

const request = (body: unknown, ip = "10.0.0.1") =>
  new Request("http://localhost/api/retry", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

const turns: Turn[] = [
  { role: "buyer", text: "Hello, this is Jessica.", start: 0, end: 2 },
  { role: "rep", text: "We sell the best HR software, there's a discount right now.", start: 2.5, end: 7, delta: -10, score: -10, reason: "Pitched too early.", judgeSource: "ai" },
  { role: "buyer", text: "We're good, thanks.", start: 7.5, end: 9 },
  { role: "rep", text: "How do you onboard new staff today?", start: 9.5, end: 12, delta: 6, score: -4, reason: "Open question.", judgeSource: "ai" },
];

beforeEach(() => {
  vi.stubEnv("AI_DISABLED", "1");
  vi.stubEnv("RATE_LIMIT_PER_HOUR", "1000");
  fixture.gets = 0;
  fixture.writes = 0;
  fixture.call = {
    id: crypto.randomUUID(), sessionId: fixture.sid, personaId: "jessica-hr", persona: getPersona("jessica-hr")!, mode: "voice", status: "done",
    isSample: false, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), finalScore: -4, total: 40, turns, debrief: null,
  };
});

describe("POST /api/retry", () => {
  it("re-judges the owner's line in context and returns old and new deltas without saving anything", async () => {
    const before = structuredClone(fixture.call);
    const res = await retry(request({ callId: fixture.call!.id, turnIndex: 1, text: "Hi Jessica, quick question: how long does onboarding a new hire take today?" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RetryResponse;
    expect(body.original).toBe(-10);
    expect(body.source).toBe("heuristic");
    expect(typeof body.delta).toBe("number");
    expect(body.delta).toBeGreaterThan(body.original!);
    // previous interest for turn 1 is the call's opening interest (medium/easy persona), so score = prev + delta
    expect(typeof body.reason).toBe("string");
    expect(body.reason.length).toBeGreaterThan(0);
    expect(fixture.writes).toBe(0);
    expect(fixture.call).toEqual(before);
  });

  it("uses the interest before the retried line as the starting score", async () => {
    const res = await retry(request({ callId: fixture.call!.id, turnIndex: 3, text: "What happens to your team when a new hire takes four weeks to ramp?" }));
    const body = (await res.json()) as RetryResponse;
    expect(res.status).toBe(200);
    expect(body.score).toBe(Math.max(-100, Math.min(100, -10 + body.delta)));
    expect(body.original).toBe(6);
  });

  it("hides other sessions' private calls", async () => {
    fixture.call!.sessionId = crypto.randomUUID();
    const res = await retry(request({ callId: fixture.call!.id, turnIndex: 1, text: "A better line here." }));
    expect(res.status).toBe(404);
  });

  it("allows anyone to retry a published sample", async () => {
    fixture.call!.sessionId = crypto.randomUUID();
    fixture.call!.isSample = true;
    const res = await retry(request({ callId: fixture.call!.id, turnIndex: 1, text: "How do you onboard new staff today?" }));
    expect(res.status).toBe(200);
  });

  it("supports the built-in /sample call without touching the database", async () => {
    const sample = sampleCall();
    const idx = sample.turns.findIndex((t) => t.role === "rep" && (t.delta ?? 0) < 0);
    const res = await retry(request({ callId: "sample", turnIndex: idx, text: "Fair question. For 45 reps it's about $2,000 a month. How many reps would use it?" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RetryResponse;
    expect(body.original).toBe(sample.turns[idx].delta);
    expect(fixture.gets).toBe(0);
  });

  it("rejects buyer turns, out-of-range indexes and invalid bodies", async () => {
    const id = fixture.call!.id;
    expect((await retry(request({ callId: id, turnIndex: 0, text: "Some line" }))).status).toBe(400);
    expect((await retry(request({ callId: id, turnIndex: 42, text: "Some line" }))).status).toBe(400);
    expect((await retry(request({ callId: id, turnIndex: 1, text: " " }))).status).toBe(400);
    expect((await retry(request({ callId: "not-a-uuid", turnIndex: 1, text: "Some line" }))).status).toBe(400);
    expect((await retry(request({ callId: id, turnIndex: 1, text: "x".repeat(601) }))).status).toBe(400);
  });

  it("refuses unfinished calls", async () => {
    fixture.call!.status = "live";
    expect((await retry(request({ callId: fixture.call!.id, turnIndex: 1, text: "Better line here." }))).status).toBe(409);
  });

  it("rate-limits per IP", async () => {
    // The "retry" route may get a multiplier over the base hourly limit; probe until it refuses.
    vi.stubEnv("RATE_LIMIT_PER_HOUR", "1");
    const body = { callId: fixture.call!.id, turnIndex: 1, text: "How do you onboard today?" };
    const ip = "10.9.9.9";
    const statuses: number[] = [];
    for (let i = 0; i < 12 && !statuses.includes(429); i++) statuses.push((await retry(request(body, ip))).status);
    expect(statuses[0]).toBe(200);
    expect(statuses.at(-1)).toBe(429);
    expect((await retry(request(body, "10.9.9.10"))).status).toBe(200);
  });
});
