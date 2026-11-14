import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRecord, Persona, Turn } from "@/lib/types";

const fixture = vi.hoisted(() => ({ sid: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", call: null as CallRecord | null }));
vi.mock("@/lib/server/session", () => ({
  FREE_CALL_LIMIT: 3,
  sessionId: async () => fixture.sid,
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
vi.mock("@/lib/server/db", () => ({ db: () => ({ getCall: async (id: string) => (fixture.call?.id === id ? fixture.call : null) }) }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: vi.fn(async () => null) }));
vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), generateText: vi.fn() }));

import { generateText } from "ai";
import { rateLimit } from "@/lib/server/rate-limit";
import { POST as hintRoute } from "@/app/api/hint/route";
import { cleanHint, coachHint, heuristicHint, leaksPain, HINT_MAX_WORDS } from "@/lib/ai/hint";
import { getPersona } from "@/lib/personas";
import { applyRole } from "@/lib/roles";

const persona = getPersona("linda-cfo")!;
const t = (role: Turn["role"], text: string, start: number): Turn => ({ role, text, start, end: start + 2 });
const request = (body: unknown) => new Request("http://localhost/api/hint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("AI_DISABLED", "1");
  vi.mocked(generateText).mockReset();
  vi.mocked(rateLimit).mockReset().mockResolvedValue(null);
  fixture.call = { id: crypto.randomUUID(), sessionId: fixture.sid, personaId: persona.id, persona, mode: "text", status: "live", isSample: false, startedAt: new Date().toISOString(), endedAt: null, finalScore: null, total: null, turns: [], debrief: null };
});

describe("heuristic coach hints", () => {
  const ctx = (turns: Turn[], extra: Partial<{ painsFound: string[]; score: number; persona: Persona }> = {}) =>
    ({ persona, turns, painsFound: [], score: 0, ...extra });

  it("coaches the opening before the rep has spoken", () => {
    expect(heuristicHint(ctx([t("buyer", persona.openingLine, 0)]))).toMatch(/name/i);
    expect(heuristicHint(ctx([t("buyer", "Hi", 0)], { persona: applyRole(persona, "ae") }))).toMatch(/agenda/i);
  });
  it("answers an objection with acknowledge + question", () => {
    const turns = [t("buyer", "Hello?", 0), t("rep", "Hi Linda, it's Sam from Ledgerly.", 2), t("buyer", "I'm busy, just send me an email.", 5)];
    const hint = heuristicHint(ctx(turns));
    expect(hint).toMatch(/understand|fair|makes sense/i);
    expect(hint).toContain("?");
    const budget = heuristicHint(ctx([...turns.slice(0, 2), t("buyer", "We have no budget for this.", 5)]));
    expect(budget).toMatch(/cost/i);
  });
  it("suggests open discovery early and a next step once pain is found and interest is up", () => {
    const early = [t("buyer", "Linda speaking.", 0), t("rep", "Hi Linda, Sam here, got 30 seconds?", 2), t("buyer", "Sure, go ahead.", 5)];
    expect(heuristicHint(ctx(early))).toMatch(/^Open discovery: what/);
    const later = [...early, t("rep", "How many hours does close take?", 8), t("buyer", "A full week.", 11)];
    expect(heuristicHint(ctx(later, { painsFound: ["month_close"], score: 20 }))).toMatch(/meeting|demo/i);
    expect(heuristicHint(ctx(later.slice(0, 3).concat(t("rep", "What does close look like?", 8), t("buyer", "Long.", 11)), { painsFound: ["month_close"], score: 20 }))).toMatch(/hours or dollars/);
  });
  it("keeps every heuristic hint short and free of hidden pain text", () => {
    const samples = [
      [t("buyer", "Hi", 0)],
      [t("buyer", "Hi", 0), t("rep", "Hello", 1), t("buyer", "We already use a vendor and we're happy with it.", 3)],
      [t("buyer", "Hi", 0), t("rep", "Hello", 1), t("buyer", "ok", 3), t("rep", "So", 5), t("buyer", "ok", 7), t("rep", "Right", 9), t("buyer", "Yes?", 11)],
    ];
    for (const turns of samples) {
      const hint = heuristicHint(ctx(turns));
      expect(words(hint)).toBeLessThanOrEqual(HINT_MAX_WORDS);
      expect(leaksPain(hint, persona)).toBe(false);
    }
  });
});

describe("hint post-processing", () => {
  it("strips labels and quotes and caps the length", () => {
    expect(cleanHint('Hint: "What does month-end look like for your team?"')).toBe("What does month-end look like for your team?");
    const long = cleanHint(Array.from({ length: 40 }, (_, i) => `w${i}`).join(" "));
    expect(words(long)).toBe(HINT_MAX_WORDS);
    expect(long.endsWith("…")).toBe(true);
  });
  it("detects hidden pain text leaks", () => {
    expect(leaksPain(`Say: ${persona.pains[0].text}`, persona)).toBe(true);
    expect(leaksPain("Ask about reconciling statements with 300 suppliers by hand", persona)).toBe(true);
    expect(leaksPain("How does month-end close go for your team today?", persona)).toBe(false);
  });
});

describe("coachHint AI path", () => {
  const turns = [t("buyer", "Linda speaking.", 0), t("rep", "Hi Linda, Sam here.", 2), t("buyer", "What is this about?", 5)];
  const enableAi = () => { vi.stubEnv("AI_DISABLED", "0"); vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "test-no-network"); };

  it("falls back to the heuristic without calling a model when AI is disabled", async () => {
    const result = await coachHint({ persona, turns, painsFound: [], score: 0 });
    expect(result.source).toBe("heuristic");
    expect(result.hint.length).toBeGreaterThan(10);
    expect(generateText).not.toHaveBeenCalled();
  });
  it("uses the fast model's line when it is clean", async () => {
    enableAi();
    vi.mocked(generateText).mockResolvedValue({ text: '"How does month-end close work for your team today?"' } as Awaited<ReturnType<typeof generateText>>);
    const result = await coachHint({ persona, turns, painsFound: [], score: 0 });
    expect(result).toEqual({ hint: "How does month-end close work for your team today?", source: "ai" });
  });
  it("replaces a line that leaks hidden pain text, and survives model errors (e.g. 401)", async () => {
    enableAi();
    vi.mocked(generateText).mockResolvedValueOnce({ text: persona.pains[0].text } as Awaited<ReturnType<typeof generateText>>);
    expect((await coachHint({ persona, turns, painsFound: [], score: 0 })).source).toBe("heuristic");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(generateText).mockRejectedValueOnce(Object.assign(new Error("Incorrect API key"), { statusCode: 401 }));
    expect((await coachHint({ persona, turns, painsFound: [], score: 0 })).source).toBe("heuristic");
    expect(JSON.stringify(err.mock.calls)).not.toContain("test-no-network");
    err.mockRestore();
  });
});

describe("POST /api/hint", () => {
  const turns = [t("buyer", "Linda speaking.", 0), t("rep", "Hi Linda, Sam here, got 30 seconds?", 2), t("buyer", "I'm busy, what is it?", 5)];

  it("validates the body", async () => {
    expect((await hintRoute(request({ callId: "nope", turns }))).status).toBe(400);
    expect((await hintRoute(request({ callId: fixture.call!.id, turns: [{ role: "coach", text: "x", start: 0, end: 1 }] }))).status).toBe(400);
    expect((await hintRoute(request({ callId: fixture.call!.id, turns: [{ ...turns[0], start: 9, end: 1 }] }))).status).toBe(400);
    expect((await hintRoute(new Request("http://localhost/api/hint", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("returns 404 for a call from another session and for an unknown call", async () => {
    fixture.call!.sessionId = crypto.randomUUID();
    expect((await hintRoute(request({ callId: fixture.call!.id, turns }))).status).toBe(404);
    expect((await hintRoute(request({ callId: crypto.randomUUID(), turns }))).status).toBe(404);
  });
  it("refuses ended calls", async () => {
    fixture.call!.status = "done";
    expect((await hintRoute(request({ callId: fixture.call!.id, turns }))).status).toBe(409);
  });
  it("returns a heuristic hint when AI is disabled", async () => {
    const res = await hintRoute(request({ callId: fixture.call!.id, turns }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("heuristic");
    expect(words(body.hint)).toBeLessThanOrEqual(HINT_MAX_WORDS);
    expect(leaksPain(body.hint, persona)).toBe(false);
    expect(rateLimit).toHaveBeenCalledWith(expect.any(Request), "hint");
  });
  it("returns 429 when rate limited, before touching the call", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(Response.json({ error: "Too many calls" }, { status: 429 }));
    fixture.call!.sessionId = crypto.randomUUID();
    expect((await hintRoute(request({ callId: fixture.call!.id, turns }))).status).toBe(429);
  });
});
