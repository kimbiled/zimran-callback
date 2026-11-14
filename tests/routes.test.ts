import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord, Turn } from "@/lib/types";

const fixture = vi.hoisted(() => ({ sid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", call: null as CallRecord | null, finishes: 0, uses: 0 }));
vi.mock("@/lib/server/session", () => ({
  FREE_CALL_LIMIT: 3,
  sessionId: async () => fixture.sid,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
vi.mock("@/lib/server/db", () => ({ db: () => ({
  getCall: async () => fixture.call,
  getOrCreateSession: async (id: string) => ({ id, plan: "free", callsUsed: 0 }),
  reserveCall: async () => { fixture.uses++; return { ok: true, callsUsed: fixture.uses, plan: "free" }; },
  createCall: async (input: Pick<CallRecord, "id" | "sessionId" | "persona" | "mode">) => { Object.assign(fixture.call!, input); },
  finishCall: async (_id: string, turns: Turn[], debrief: CallRecord["debrief"]) => { fixture.finishes++; Object.assign(fixture.call!, { status: "done", turns, debrief }); },
}) }));
import { POST as judge } from "@/app/api/judge/route";
import { POST as debrief } from "@/app/api/debrief/route";
import { POST as buyer } from "@/app/api/buyer/route";
import { POST as startCall } from "@/app/api/calls/route";
import { textReplyOnce, reservePersonaGeneration } from "@/lib/ai/call-state";
import { getPersona } from "@/lib/personas";

const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const turns: Turn[] = [{ role: "buyer", text: "Hello", start: 0, end: 1 }, { role: "rep", text: "How do you onboard new staff today?", start: 1, end: 5 }];
beforeEach(() => {
  vi.stubEnv("AI_DISABLED", "1"); fixture.finishes = 0; fixture.uses = 0;
  fixture.call = { id: crypto.randomUUID(), sessionId: fixture.sid, personaId: "jessica-hr", persona: getPersona("jessica-hr")!, mode: "text", status: "live", isSample: false, startedAt: new Date().toISOString(), endedAt: null, finalScore: null, total: null, turns: [], debrief: null };
});
describe("authenticated B routes", () => {
  it("persists AE discovery context and defaults an unspecified role to SDR", async () => {
    const ae = await startCall(request({ personaId: "jessica-hr", mode: "text", role: "ae" }));
    expect(ae.status).toBe(200);
    const body = await ae.json();
    expect(fixture.call!.persona.role).toBe("ae");
    expect(body.voice.openingLine).toContain("25 minutes");
    expect(body.persona.goal).toContain("tailored demo");
    expect(body.callsLeft).toBe(2);
    expect((await startCall(request({ personaId: "jessica-hr", mode: "text" }))).status).toBe(200);
    expect(fixture.uses).toBe(2);
    expect(fixture.call!.persona.role).toBe("sdr");
    expect(fixture.call!.persona.openingLine).toBe(getPersona("jessica-hr")!.openingLine);
  });
  it("rejects another session before running judge or debrief", async () => {
    fixture.call!.sessionId = crypto.randomUUID();
    const body = { callId: fixture.call!.id, turns, score: 99 };
    expect((await judge(request(body))).status).toBe(404);
    expect((await debrief(request(body))).status).toBe(404);
    expect(fixture.finishes).toBe(0);
  });
  it("completes text → score → buyer → debrief and ignores forged score/pains", async () => {
    const callId = fixture.call!.id;
    const input = { callId, turns, score: 100, painsFound: ["turnover"] };
    const first = await judge(request(input)); expect(first.status).toBe(200);
    const verdict = await first.json(); expect(verdict.score).toBe(verdict.delta);
    expect(await (await judge(request({ ...input, score: -100 }))).json()).toEqual(verdict);
    const reply = await buyer(request(input)); expect(reply.status).toBe(200);
    expect((await reply.json()).text).toContain("weeks");
    const result = await debrief(request({ ...input, timeline: [{ t: 0, score: 100 }] }));
    expect(result.status).toBe(200);
    const report = await result.json();
    expect(report.finalScore).toBe(verdict.score);
    expect(report.criteria).toHaveLength(5);
    expect(fixture.call!.turns.filter(t => t.role === "rep").every(t => t.judgeSource === "heuristic")).toBe(true);
    expect(report.painsFound).not.toContain("turnover");
    expect((await debrief(request(input))).status).toBe(200);
    // Usage is reserved when the call starts (POST /api/calls); completion never counts it again.
    expect(fixture.finishes).toBe(1); expect(fixture.uses).toBe(0);
  });
  it("rejects rewritten history, reversed timestamps and buyer-only judging", async () => {
    const callId = fixture.call!.id;
    await judge(request({ callId, turns }));
    expect((await judge(request({ callId, turns: turns.map(t => t.role === "rep" ? { ...t, text: "New text" } : t) }))).status).toBe(409);
    expect((await judge(request({ callId, turns: [{ ...turns[1], start: 9, end: 1 }] }))).status).toBe(400);
    expect((await judge(request({ callId, turns: [turns[0]] }))).status).toBe(400);
  });
  it("finalizes concurrent requests once without counting usage again", async () => {
    const callId = fixture.call!.id;
    await judge(request({ callId, turns }));
    const results = await Promise.all([debrief(request({ callId, turns })), debrief(request({ callId, turns }))]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(fixture.finishes).toBe(1); expect(fixture.uses).toBe(0);
  });
  it("recovers missing judgments after a dropped browser request", async () => {
    const input = [...turns, { role: "buyer" as const, text: "It takes four weeks", start: 6, end: 8 }, { role: "rep" as const, text: "How many hours does training take?", start: 9, end: 12 }];
    const result = await judge(request({ callId: fixture.call!.id, turns: input }));
    expect(result.status).toBe(200);
    expect((await buyer(request({ callId: fixture.call!.id, turns: input }))).status).toBe(200);
  });
  it("caches concurrent text replies and limits paid buyer generation", async () => {
    const build = vi.fn(async () => ({ text: "Hello", source: "heuristic" as const }));
    await Promise.all([textReplyOnce(fixture.call!.id, 0, build), textReplyOnce(fixture.call!.id, 0, build)]);
    expect(build).toHaveBeenCalledTimes(1);
    const sid = crypto.randomUUID();
    expect(await Promise.all([1, 2, 3, 4].map(() => reservePersonaGeneration(sid)))).toEqual([true, true, true, false]);
  });
});
