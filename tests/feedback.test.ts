import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord } from "@/lib/types";

const fixture = vi.hoisted(() => ({
  sid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  call: null as CallRecord | null,
}));
vi.mock("@/lib/server/session", () => ({ sessionId: async () => fixture.sid }));
vi.mock("@/lib/server/db", () => ({ db: () => ({ getCall: async (id: string) => fixture.call?.id === id ? fixture.call : null }) }));

import { GET, POST } from "@/app/api/feedback/route";
import { GET as proof } from "@/app/api/feedback/proof/route";
import { getPersona } from "@/lib/personas";
import { FeedbackSchema } from "@/lib/feedback/schema";

const request = (body: unknown, origin?: string) => new Request("http://localhost/api/feedback", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});
const answers = () => ({ callId: fixture.call!.id, usefulness: 4, wouldPay: true, quote: "The objections felt useful.", quoteConsent: true });
const ownerGet = () => new Request(`http://localhost/api/feedback?callId=${fixture.call!.id}`);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("EVAL_KEY", "proof-test-secret");
  (globalThis as unknown as { __cbFeedback?: Map<string, unknown> }).__cbFeedback?.clear();
  fixture.call = {
    id: crypto.randomUUID(), sessionId: fixture.sid, personaId: "jessica-hr", persona: getPersona("jessica-hr")!,
    mode: "text", status: "done", isSample: false, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    finalScore: 25, total: 65, turns: [], debrief: { callId: "fixture", total: 65, outcome: "no_meeting", summary: "Practice call", metrics: { durationSec: 10, talkRatio: 50, questions: 1, fillersPer100: 0, longestMonologueSec: 5, repWords: 10 }, criteria: [], topFixes: [], scoreTimeline: [], finalScore: 25, painsFound: [], painsMissed: [], source: "heuristic" },
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("post-call feedback", () => {
  it("validates rating, willingness to pay, consent and quote bounds", () => {
    expect(FeedbackSchema.safeParse(answers()).success).toBe(true);
    for (const invalid of [
      { usefulness: 0 }, { usefulness: 6 }, { usefulness: 2.5 }, { wouldPay: "yes" },
      { quoteConsent: true, quote: "  " }, { quote: "x".repeat(501) }, { callId: "not-an-id" },
    ]) expect(FeedbackSchema.safeParse({ ...answers(), ...invalid }).success).toBe(false);
  });

  it("lets the owner submit the two private answers without giving quote permission", async () => {
    const response = await POST(request({ ...answers(), quoteConsent: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feedback: { usefulness: 4, wouldPay: true, quote: "", quoteConsent: false } });
    const saved = await GET(ownerGet());
    expect(saved.status).toBe(200);
    expect((await saved.json()).feedback.quote).toBe("");
  });

  it("hides the form for another session and refuses cross-session writes", async () => {
    fixture.call!.sessionId = crypto.randomUUID();
    expect((await GET(ownerGet())).status).toBe(404);
    expect((await POST(request(answers()))).status).toBe(404);
  });

  it("rejects live, unfinished and sample calls and malformed inputs", async () => {
    fixture.call!.status = "live";
    expect((await POST(request(answers()))).status).toBe(409);
    fixture.call!.status = "done"; fixture.call!.isSample = true;
    expect((await GET(ownerGet())).status).toBe(409);
    expect((await POST(request(answers()))).status).toBe(409);
    fixture.call!.isSample = false; fixture.call!.debrief = null;
    expect((await POST(request(answers()))).status).toBe(409);
    expect((await POST(request({ ...answers(), usefulness: 8 }))).status).toBe(400);
  });

  it("updates one row per call and only exports consented quotes behind bearer auth", async () => {
    expect((await POST(request(answers()))).status).toBe(200);
    expect((await POST(request({ ...answers(), usefulness: 5, wouldPay: false }))).status).toBe(200);
    const exportRequest = () => new Request("http://localhost/api/feedback/proof", { headers: { Authorization: "Bearer proof-test-secret" } });
    const result = await proof(exportRequest()); expect(result.status).toBe(200);
    const report = await result.json();
    expect(report).toMatchObject({ responses: 1, anonymousSessions: 1, averageUsefulness: 5, wouldPayCount: 0, wouldPayPercent: 0 });
    expect(report.quotes).toHaveLength(1);
    expect(report.quotes[0].text).toBe(answers().quote);
    expect(JSON.stringify(report)).not.toContain(fixture.call!.id);
    expect(JSON.stringify(report)).not.toContain(fixture.sid);
    await POST(request({ ...answers(), quoteConsent: false }));
    expect((await (await proof(exportRequest())).json()).quotes).toEqual([]);
    expect((await proof(new Request("http://localhost/api/feedback/proof?key=proof-test-secret"))).status).toBe(404);
  });

  it("refuses a cross-origin submission even when cookies would be sent", async () => {
    expect((await POST(request(answers(), "https://unrelated.example"))).status).toBe(403);
    expect((await POST(request(answers(), "http://localhost"))).status).toBe(200);
  });
});
