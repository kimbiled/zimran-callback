import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord, Debrief, Turn } from "@/lib/types";

const state = vi.hoisted(() => ({
  sid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
}));
vi.mock("@/lib/server/session", () => ({
  sessionId: async () => state.sid,
  isUuid: (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));

import { db } from "@/lib/server/db";
import { getPersona } from "@/lib/personas";
import { sampleCall } from "@/lib/sample";
import { isReplayCandidate, loadPublishedReplay, replayAt, toReplay } from "@/lib/replay/data";
import { POST as publish, GET as samples } from "@/app/api/samples/route";
import { GET as replay } from "@/app/api/replay/[id]/route";

const request = (body: unknown) => new Request("http://localhost/api/samples", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function recordedCall(): Promise<CallRecord> {
  const id = crypto.randomUUID();
  const persona = getPersona("mike-sales")!;
  const turns: Turn[] = [
    { role: "buyer", text: "Mike speaking.", start: 0, end: 1 },
    { role: "rep", text: "How do your reps track the pipeline today?", start: 1, end: 3, delta: 15, score: -5, reason: "Open question about the pipeline.", judgeSource: "ai" },
    { role: "buyer", text: "Calls are missing from our CRM.", start: 3, end: 4 },
    { role: "rep", text: "Does Thursday at 11 work for twenty minutes?", start: 4, end: 6, delta: 10, score: 5, reason: "Specific next step.", judgeSource: "ai" },
    { role: "buyer", text: "Yes, send me the invite.", start: 6, end: 7 },
  ];
  const report: Debrief = {
    callId: id, total: 70, outcome: "meeting", summary: "A focused call ended with a meeting.",
    metrics: { durationSec: 7, talkRatio: 57, questions: 2, fillersPer100: 0, longestMonologueSec: 2, repWords: 18 },
    criteria: ["opening", "discovery", "objections", "value", "next_step"].map(id => ({ id: id as Debrief["criteria"][number]["id"], title: id, score: 14, quote: turns[1].text, at: 1, better: "Ask a concrete follow-up question." })),
    topFixes: ["Introduce yourself.", "Quantify the issue.", "Confirm the next step."],
    scoreTimeline: [{ t: 0, score: -20 }, { t: 3, score: -5 }, { t: 6, score: 5 }],
    finalScore: 5, painsFound: ["visibility"], painsMissed: ["forecast", "ramp"], source: "ai",
  };
  const store = db();
  await store.getOrCreateSession(state.sid);
  await store.createCall({ id, sessionId: state.sid, persona, mode: "voice" });
  await store.finishCall(id, turns, report);
  return (await store.getCall(id))!;
}

beforeEach(() => { vi.stubEnv("DATABASE_URL", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("actual-call publication and replay", () => {
  it("requires an AI source for every saved verdict rather than only the final debrief", async () => {
    const call = await recordedCall();
    expect(isReplayCandidate({ ...call, turns: call.turns.map(t => ({ ...t, judgeSource: undefined })) })).toBe(false);
    call.turns[1].judgeSource = "heuristic";
    expect(isReplayCandidate(call)).toBe(false);
  });
  it("refuses the hardcoded sample, unfinished/text calls and heuristic debriefs", async () => {
    const real = await recordedCall();
    expect(isReplayCandidate(sampleCall())).toBe(false);
    expect(isReplayCandidate({ ...real, status: "live" })).toBe(false);
    expect(isReplayCandidate({ ...real, mode: "text" })).toBe(false);
    expect(isReplayCandidate({ ...real, debrief: { ...real.debrief!, source: "heuristic" } })).toBe(false);
    expect(isReplayCandidate({ ...real, turns: real.turns.map(t => ({ ...t, delta: undefined, score: undefined })) })).toBe(false);
  });

  it("requires explicit publication consent and the call's owner", async () => {
    const call = await recordedCall();
    expect((await publish(request({ callId: call.id }))).status).toBe(400);
    const oldSid = state.sid;
    state.sid = crypto.randomUUID();
    try { expect((await publish(request({ callId: call.id, consent: true }))).status).toBe(404); }
    finally { state.sid = oldSid; }
    expect((await db().getCall(call.id))?.isSample).toBe(false);
  });

  it("requires complete recorded score events instead of inventing replay judgments", async () => {
    const call = await recordedCall();
    call.turns[1].reason = "";
    expect((await publish(request({ callId: call.id, consent: true }))).status).toBe(409);
  });

  it("publishes idempotently and exposes only public buyer data and recorded evidence", async () => {
    const call = await recordedCall();
    expect(await loadPublishedReplay(call.id)).toBeNull();
    const response = await publish(request({ callId: call.id, consent: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ callId: call.id, url: `/replay/${call.id}` });
    expect((await publish(request({ callId: call.id, consent: true }))).status).toBe(200);
    const get = await replay(new Request(`http://localhost/api/replay/${call.id}`), { params: Promise.resolve({ id: call.id }) });
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.recordedAt).toBe(call.startedAt);
    expect(data.turns).toEqual(call.turns);
    expect(data.scoreTimeline).toEqual(call.debrief!.scoreTimeline);
    expect(data).not.toHaveProperty("sessionId");
    expect(data.persona).not.toHaveProperty("pains");
    expect(data.persona).not.toHaveProperty("budget");
    expect(data.persona).not.toHaveProperty("voiceId");
    const list = await (await samples()).json();
    expect(list.some((item: { callId: string }) => item.callId === call.id)).toBe(true);
  });

  it("returns 404 for unpublished/private/synthetic identifiers", async () => {
    const call = await recordedCall();
    const get = (id: string) => replay(new Request(`http://localhost/api/replay/${id}`), { params: Promise.resolve({ id }) });
    expect((await get(call.id)).status).toBe(404);
    expect((await get("sample")).status).toBe(404);
    expect((await get(crypto.randomUUID())).status).toBe(404);
  });

  it("rejects inconsistent stored timeline arithmetic instead of repairing it in the replay", async () => {
    const call = await recordedCall();
    call.debrief!.scoreTimeline[1].score = 99;
    expect(isReplayCandidate(call)).toBe(false);
    expect((await publish(request({ callId: call.id, consent: true }))).status).toBe(409);
  });

  it("replays the original initial interest, verdict timing and final buyer turn", async () => {
    const data = toReplay(await recordedCall());
    expect(replayAt(data, 0)).toMatchObject({ score: -20, delta: null, turns: [{ role: "buyer" }] });
    const repSpeaking = replayAt(data, 2);
    expect(repSpeaking.score).toBe(-20);
    expect(repSpeaking.turns[1]).not.toHaveProperty("score");
    expect(replayAt(data, 3)).toMatchObject({ score: -5, delta: 15, reason: "Open question about the pipeline." });
    const complete = replayAt(data, data.durationSec);
    expect(complete.score).toBe(5);
    expect(complete.turns.at(-1)?.text).toBe("Yes, send me the invite.");
    expect(complete.turns).toHaveLength(5);
  });
});
