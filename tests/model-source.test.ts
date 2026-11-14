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
