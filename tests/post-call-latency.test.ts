import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord, Turn } from "@/lib/types";
import { formatServerTiming, ServerTimer } from "@/lib/server/server-timing";
import { finishTimings, JUDGE_DRAIN_MS, timingSummary, waitAtMost } from "@/lib/voice/finish-timing";

const fixture = vi.hoisted(() => ({ sid: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", call: null as CallRecord | null }));
vi.mock("@/lib/server/session", () => ({
  FREE_CALL_LIMIT: 3,
  sessionId: async () => fixture.sid,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
vi.mock("@/lib/server/db", () => ({ db: () => ({
  getCall: async () => fixture.call,
  finishCall: async (_id: string, turns: Turn[], debrief: CallRecord["debrief"]) => { Object.assign(fixture.call!, { status: "done", turns, debrief }); },
}) }));
import { POST as judge } from "@/app/api/judge/route";
import { POST as debrief } from "@/app/api/debrief/route";
import { getPersona } from "@/lib/personas";

const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const segments = (header: string | null) => Object.fromEntries((header ?? "").split(", ").map(s => [s.split(";")[0], s]));

describe("Server-Timing formatting", () => {
  it("formats rounded durations with safe descriptions and skips invalid segments", () => {
    expect(formatServerTiming([
      { name: "db", ms: 12.345 },
      { name: "ai", ms: 4012.06, desc: "ai" },
      { name: "bad name", ms: 1 },
      { name: "nan", ms: Number.NaN },
      { name: "neg", ms: -3 },
      { name: "x", ms: 1, desc: "has space" },
    ])).toBe('db;dur=12.3, ai;dur=4012.1;desc="ai", neg;dur=0, x;dur=1');
  });
  it("accumulates repeated segments and always ends with total", async () => {
    const timer = new ServerTimer();
    timer.add("db", 5); timer.add("db", 7, "neon");
    await timer.time("ai", async () => "done");
    const header = timer.header();
    expect(header).toMatch(/^db;dur=12;desc="neon", ai;dur=[\d.]+, total;dur=[\d.]+$/);
    const res = timer.apply(Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("capped judge wait", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("caps the wait well below the old 10 s", () => { expect(JUDGE_DRAIN_MS).toBeLessThanOrEqual(3000); });
  it("returns true as soon as the queue drains, including a rejected queue", async () => {
    await expect(waitAtMost(Promise.resolve(), 1000)).resolves.toBe(true);
    await expect(waitAtMost(Promise.reject(new Error("judge 500")), 1000)).resolves.toBe(true);
  });
  it("gives up after the cap when a judge request hangs", async () => {
    vi.useFakeTimers();
    const pending = waitAtMost(new Promise(() => {}), JUDGE_DRAIN_MS);
    await vi.advanceTimersByTimeAsync(JUDGE_DRAIN_MS - 1);
    let done = false; void pending.then(() => { done = true; });
    await Promise.resolve(); expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(false);
  });
  it("splits the finish into judge wait, debrief and total", () => {
    const t = finishTimings({ endClick: 100, judgeDrained: 350.4, debriefResponse: 4350.6 });
    expect(t).toEqual({ waitJudgeMs: 250, debriefMs: 4000, totalMs: 4251 });
    expect(finishTimings({ endClick: 10, judgeDrained: 5, debriefResponse: 5 })).toEqual({ waitJudgeMs: 0, debriefMs: 0, totalMs: 0 });
    expect(timingSummary(t, "ai", false)).toContain("capped");
  });
});

describe("routes after a capped wait", () => {
  beforeEach(() => {
    vi.stubEnv("AI_DISABLED", "1");
    fixture.call = { id: crypto.randomUUID(), sessionId: fixture.sid, personaId: "jessica-hr", persona: getPersona("jessica-hr")!, mode: "text", status: "live", isSample: false, startedAt: new Date().toISOString(), endedAt: null, finalScore: null, total: null, turns: [], debrief: null };
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("adds Server-Timing to judge and debrief without changing the JSON body", async () => {
    const callId = fixture.call!.id;
    const turns: Turn[] = [{ role: "buyer", text: "Hello", start: 0, end: 1 }, { role: "rep", text: "How do you onboard new staff today?", start: 1, end: 5 }];
    const j = await judge(request({ callId, turns }));
    expect(Object.keys(segments(j.headers.get("server-timing")))).toEqual(["db", "ai", "total"]);
    expect(segments(j.headers.get("server-timing")).ai).toContain('desc="heuristic"');
    expect(Object.keys(await j.json())).toEqual(expect.arrayContaining(["delta", "score", "reason", "source"]));
    const d = await debrief(request({ callId, turns }));
    expect(d.status).toBe(200);
    expect(Object.keys(segments(d.headers.get("server-timing")))).toEqual(["db", "ai", "total"]);
    const body = await d.json();
    expect(body).toMatchObject({ callId, source: "heuristic" });
    expect(body).not.toHaveProperty("timing");
    // The saved debrief is served again with timing (db + total only).
    const again = await debrief(request({ callId, turns }));
    expect(Object.keys(segments(again.headers.get("server-timing")))).toEqual(["db", "total"]);
  });

  it("fills a turn the client stopped waiting for with the labelled rubric and keeps the timeline whole", async () => {
    const callId = fixture.call!.id;
    const turns: Turn[] = [
      { role: "buyer", text: "Hello", start: 0, end: 1 },
      { role: "rep", text: "How do you onboard new staff today?", start: 1, end: 5 },
      { role: "buyer", text: "New hires take four weeks and senior staff spend six hours a week training them.", start: 6, end: 10 },
      { role: "rep", text: "How much does that six hours a week cost your senior team?", start: 11, end: 15 },
    ];
    // Only the first rep turn was judged before "End call"; the second judge request was cut off.
    const first = await (await judge(request({ callId, turns: turns.slice(0, 2) }))).json();
    const res = await debrief(request({ callId, turns }));
    expect(res.status).toBe(200);
    const report = await res.json();
    const reps = fixture.call!.turns.filter(t => t.role === "rep");
    expect(reps).toHaveLength(2);
    expect(reps[0]).toMatchObject({ score: first.score, delta: first.delta });
    expect(reps[1].judgeSource).toBe("heuristic");
    expect(typeof reps[1].score).toBe("number");
    expect(report.scoreTimeline).toEqual([{ t: 0, score: expect.any(Number) }, { t: 5, score: first.score }, { t: 15, score: reps[1].score }]);
    expect(report.finalScore).toBe(reps[1].score);
  });
});
