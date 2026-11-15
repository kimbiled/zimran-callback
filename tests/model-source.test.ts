import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), generateText: vi.fn() }));
import { generateText } from "ai";
import { judgeTurn } from "@/lib/ai/judge";
import { getPersona } from "@/lib/personas";
import { aiDiagnostics } from "@/lib/ai/model";
import { POST as probe } from "@/app/api/ai/probe/route";
import { buildDebrief, CRITERIA_ORDER } from "@/lib/ai/debrief";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const input = { persona: getPersona("jessica-hr")!, turns: [{ role: "rep" as const, text: "How do you onboard new staff today?", start: 0, end: 4 }], prevScore: 0, alreadyFound: [] };
describe("production model source", () => {
  it("overrides a model reward for repeating an answered question", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    const text = "How do you onboard new staff today?";
    vi.mocked(generateText).mockResolvedValue({ output: { delta: 12, reason: "Open question", evidenceQuote: text, event: "open_question", painsUncovered: ["onboarding"] } } as unknown as Awaited<ReturnType<typeof generateText>>);
    const result = await judgeTurn({ persona: input.persona, turns: [input.turns[0], { role: "buyer", text: "We spend four weeks onboarding new staff.", start: 5, end: 9 }, { role: "rep", text, start: 10, end: 14 }], prevScore: 12, alreadyFound: [] });
    expect(result).toMatchObject({ source: "ai", delta: 0, score: 12, painsUncovered: [] });
  });
  it("does not invent a known pain when the rep only proposes a demo", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    const text = "Can we book a demo tomorrow at 10?";
    vi.mocked(generateText).mockResolvedValue({ output: { delta: -10, reason: "Asked too early", evidenceQuote: text, event: "next_step", painsUncovered: ["visibility"] } } as unknown as Awaited<ReturnType<typeof generateText>>);
    const persona = getPersona("mike-sales")!;
    const result = await judgeTurn({ persona, turns: [{ role: "buyer", text: persona.openingLine, start: 0, end: 1 }, { role: "rep", text, start: 2, end: 6 }], prevScore: -20, alreadyFound: [] });
    expect(result).toMatchObject({ source: "ai", delta: -10, painsUncovered: [] });
  });
  it("replaces invented integrations and customer-success claims without changing grounded scores", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    const rep = input.turns[0];
    const claims = ["Our tool actually integrates with Salesforce to make logging calls automatic.", "We've helped similar clinics reduce training time.", "We have helped similar teams save hours.", "It syncs with your CRM automatically.", "Our platform connects to Salesforce."];
    vi.mocked(generateText).mockResolvedValue({ output: {
      summary: "We've helped similar clinics improve onboarding.", outcome: "no_meeting", painsFound: [],
      criteria: CRITERIA_ORDER.map((id, i) => ({ id, score: 10, quote: rep.text, at: 0, better: claims[i] })),
      topFixes: claims.slice(0, 3),
    } } as unknown as Awaited<ReturnType<typeof generateText>>);
    const result = await buildDebrief({ callId: "coaching", persona: input.persona, turns: input.turns, timeline: [], painsHint: [] });
    const advice = [result.summary, ...result.criteria.map(c => c.better), ...result.topFixes].join(" ");
    expect(advice).not.toMatch(/integrates|syncs|connects|(?:we've|we have) helped/i);
    expect(result.criteria.every(c => c.score === 10 && c.quote === rep.text)).toBe(true);
    expect(result.total).toBe(50);
    expect(result.criteria[0].better).toContain("Jessica");
    expect(result.topFixes).toHaveLength(3);
  });
  it("recovers a buyer-confirmed pain in the debrief without accepting unrelated model pain IDs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    const persona = getPersona("linda-cfo")!;
    const rep = { role: "rep" as const, text: "Which part of the monthly close creates manual work?", start: 1, end: 5 };
    vi.mocked(generateText).mockResolvedValue({ output: {
      summary: "You uncovered the long close.", outcome: "no_meeting", painsFound: persona.pains.map(p => p.id).concat("invented"),
      criteria: CRITERIA_ORDER.map(id => ({ id, score: 10, quote: rep.text, at: 1, better: "How much time does that manual work take each month?" })),
      topFixes: ["Ask about cost.", "Find decision makers.", "Agree on a next step."],
    } } as unknown as Awaited<ReturnType<typeof generateText>>);
    const result = await buildDebrief({ callId: "test", persona, turns: [rep, { role: "buyer", text: "The monthly close takes ten days of manual work.", start: 6, end: 10 }], timeline: [], painsHint: [] });
    expect(result.painsFound).toEqual(["month_close"]);
    expect(result.painsMissed).not.toContain("month_close");
  });
  it("returns source ai through the real judge path when structured output succeeds", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    vi.mocked(generateText).mockResolvedValue({ output: { delta: 14, reason: "Relevant discovery question.", evidenceQuote: "How do you onboard new staff today?", event: "pain_uncovered", painsUncovered: ["onboarding"] } } as unknown as Awaited<ReturnType<typeof generateText>>);
    const result = await judgeTurn(input);
    expect(result).toMatchObject({ source: "ai", score: 14, delta: 14 });
    expect(aiDiagnostics().judge).toMatchObject({ state: "ok", provider: "openai" });
  });
  it("credits a pain the buyer revealed in reply to the previous question, even when the model omits it", async () => {
    // Production case: the judge runs before the buyer answers, so the model never sees the reveal for "this" turn.
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    const turns = [
      { role: "rep" as const, text: "How long does it take a new hire to get fully up to speed?", start: 0, end: 4 },
      { role: "buyer" as const, text: "Three to four weeks, and senior staff spend five to six hours a week training them.", start: 5, end: 9 },
      { role: "rep" as const, text: "Who else would be involved in a decision like this?", start: 10, end: 13 },
    ];
    vi.mocked(generateText).mockResolvedValue({ output: { delta: 12, reason: "Asked about the decision process.", evidenceQuote: "Who else would be involved", event: "open_question", painsUncovered: [] } } as unknown as Awaited<ReturnType<typeof generateText>>);
    const result = await judgeTurn({ ...input, turns });
    expect(result).toMatchObject({ source: "ai", delta: 12 });
    expect(result.painsUncovered).toEqual(["onboarding"]);
    // Already-found pains are not counted twice.
    expect((await judgeTurn({ ...input, turns, alreadyFound: ["onboarding"] })).painsUncovered).toEqual([]);
  });
  it("makes provider failure visible while preserving the labelled offline fallback", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-no-network"); vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai");
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(generateText).mockRejectedValue({ statusCode: 429, responseBody: '{"error":{"code":"insufficient_quota","message":"private secret"}}' });
    expect((await judgeTurn(input)).source).toBe("heuristic");
    expect(aiDiagnostics().judge).toMatchObject({ state: "failed", kind: "billing" });
    expect(JSON.stringify(logs.mock.calls)).not.toContain("private secret");
  });
  it("protects paid probe before generation and refuses to certify heuristic as model success", async () => {
    vi.stubEnv("EVAL_KEY", "test-eval-key"); vi.stubEnv("AI_DISABLED", "1");
    expect((await probe(new Request("http://localhost/api/ai/probe", { method: "POST" }))).status).toBe(404);
    const result = await probe(new Request("http://localhost/api/ai/probe", { method: "POST", headers: { Authorization: "Bearer test-eval-key" } }));
    expect(result.status).toBe(503); expect((await result.json()).ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });
});
