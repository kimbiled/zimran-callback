import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanTranscript, TurnAssembler, buyerSaidGoodbye } from "@/lib/voice/turns";
import { callDuration, createGptLiveSession, gptLiveEnabled, gptLiveVoice, voiceProvider } from "@/lib/voice/server";
import { PERSONAS } from "@/lib/personas";
import { buyerInstructions } from "@/lib/voice/brief";
import type { CallRecord, Turn } from "@/lib/types";

const fixture = vi.hoisted(() => {
  const databaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "";
  return { sid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", call: null as CallRecord | null, databaseUrl };
});
vi.mock("@/lib/server/session", () => ({ sessionId: async () => fixture.sid }));
vi.mock("@/lib/server/db", () => ({ db: () => ({ getCall: async () => fixture.call }) }));
import { POST } from "@/app/api/voice/session/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => { if (fixture.databaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.databaseUrl; });
describe("GPT-Live captions", () => {
  it("keeps each speaker's fragments together with source timing and original repeated words", () => {
    const turns: Turn[] = [];
    const a = new TurnAssembler(t => turns.push(t));
    a.push("rep", "How how ", 1000, 1500, "one");
    a.push("rep", "does onboarding work", 1500, 3000, "two");
    a.push("rep", "does onboarding work", 1500, 3000, "two");
    a.flush();
    expect(turns).toEqual([{ role: "rep", text: "How how does onboarding work", start: 1, end: 3 }]);
  });
  it("holds a buyer backchannel until the earlier rep turn finishes", () => {
    const turns: Turn[] = [];
    const a = new TurnAssembler(t => turns.push(t));
    a.push("rep", "How do new staff get up to", 1000, 2000);
    a.push("buyer", "Mm-hm.", 1500, 1700); a.flush("buyer");
    expect(turns).toEqual([]);
    a.push("rep", " speed?", 2000, 3000); a.flush("rep");
    expect(turns.map(t => [t.role, t.text])).toEqual([["rep", "How do new staff get up to speed?"], ["buyer", "Mm-hm."]]);
    expect(turns[1]).toMatchObject({ start: 1.5, end: 1.7 });
  });
  it("rejects invalid intervals and empty captions, and bounds the call", () => {
    const turns: Turn[] = [];
    const a = new TurnAssembler(t => turns.push(t));
    expect(a.push("rep", "bad", 3000, 2000)).toBe(false);
    expect(a.push("rep", "bad", NaN, 2000)).toBe(false);
    a.push("rep", " ", 0, 0); a.flush(); expect(turns).toEqual([]);
    a.push("buyer", "Bye", 299000, 301000); a.flush(); expect(turns[0].end).toBe(300);
    expect(cleanTranscript(". Hello� there")).toBe("Hello there");
  });
  it("preserves a long uninterrupted monologue while keeping each API turn bounded", () => {
    const turns: Turn[] = [];
    const assembler = new TurnAssembler(t => turns.push(t));
    const text = Array.from({ length: 900 }, (_, i) => `word${i}`).join(" ");
    assembler.push("rep", text, 0, 299000, "long"); assembler.flush();
    expect(turns.length).toBeGreaterThan(1);
    expect(turns.every(t => t.text.length <= 4000)).toBe(true);
    expect(turns.map(t => t.text).join(" ")).toBe(text);
    expect(turns.every(t => t.end <= 300 && t.start >= 0)).toBe(true);
  });
  it("detects only explicit, unquoted, non-negated terminal goodbyes", () => {
    expect(buyerSaidGoodbye("Thanks for calling. Goodbye.")).toBe(true);
    expect(buyerSaidGoodbye("Okay, bye for now.")).toBe(true);
    expect(buyerSaidGoodbye("Please don't say goodbye.")).toBe(false);
    expect(buyerSaidGoodbye('The word "goodbye" is not needed.')).toBe(false);
    expect(buyerSaidGoodbye("Say goodbye.")).toBe(false);
    expect(buyerSaidGoodbye("Goodbye for now, but can you explain the price?")).toBe(false);
  });
});

describe("GPT-Live server configuration", () => {
  it("clamps configurable duration to five minutes without invalid numbers", () => {
    expect([undefined, "NaN", "-1", "999", "0"].map(callDuration)).toEqual([300, 300, 300, 300, 300]);
    expect(callDuration("120")).toBe(120);
  });
  it("always selects GPT-Live for voice and uses an independent text path", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(gptLiveEnabled()).toBe(false);
    expect(voiceProvider("voice")).toBe("gpt-live");
    expect(voiceProvider("text")).toBe("text");
  });
  it("maps all existing buyer voices to documented GPT-Live voices", () => {
    for (const persona of PERSONAS) expect(["gleam", "delta", "meridian", "cinder", "vesper"]).toContain(gptLiveVoice(persona));
    expect(gptLiveVoice({ voiceId: "unknown", gender: "male" })).toBe("meridian");
    const prompt = buyerInstructions(PERSONAS[0]);
    expect(prompt).toContain(PERSONAS[0].openingLine);
    expect(prompt).toContain(PERSONAS[0].pains[0].text);
    expect(prompt).not.toContain("{{");
  });
  it("uses the Live endpoint with private startup context and only permitted data-channel events", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ session: { id: "sess_test" }, transport: { sdp: "v=0\r\nanswer" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await createGptLiveSession(PERSONAS[0], "v=0\r\noffer")).toEqual({ sdp: "v=0\r\nanswer", sessionId: "sess_test" });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/live/sessions");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.session.model).toBe("gpt-live-1");
    expect(body.session.store).toBe(false);
    expect(body.session.input[0].role).toBe("developer");
    expect(body.session.delegation.type).toBe("client");
    expect(body.session.client.data_channel.allowed_client_events).toEqual(["session.close", "session.thinking.append"]);
    expect(body.session).not.toHaveProperty("max_duration_seconds");
  });
  it("keeps provider bodies and keys out of rejected errors", async () => {
    vi.stubEnv("OPENAI_API_KEY", "never-echo-this-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider response never-echo-this-key", { status: 402 })));
    await expect(createGptLiveSession(PERSONAS[0], "v=0\r\noffer")).rejects.toThrow("GPT-Live provider (402)");
  });
});

const request = (id: string, sdp = "v=0\r\noffer") => new Request("http://localhost/api/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId: id, sdp }) });
beforeEach(() => {
  fixture.call = { id: crypto.randomUUID(), sessionId: fixture.sid, personaId: PERSONAS[0].id, persona: PERSONAS[0], mode: "voice", status: "live", isSample: false, startedAt: new Date().toISOString(), endedAt: null, finalScore: null, total: null, turns: [], debrief: null };
});
describe("voice session ownership and durable claim", () => {
  it("refuses missing config and cross-session calls before the paid request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request(fixture.call!.id))).status).toBe(503);
    vi.stubEnv("OPENAI_API_KEY", "test-key"); fixture.call!.sessionId = crypto.randomUUID();
    expect((await POST(request(fixture.call!.id))).status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
  });
  it("permits one handshake even with concurrent duplicate requests and exposes only SDP", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ session: { id: "sess_real" }, transport: { sdp: "v=0\r\nanswer" } })); vi.stubGlobal("fetch", fetcher);
    const responses = await Promise.all([POST(request(fixture.call!.id)), POST(request(fixture.call!.id))]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await responses.find(r => r.status === 200)!.json()).toEqual({ sdp: "v=0\r\nanswer" });
  });
  it("rejects expired calls, bad SDP and completed calls", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(fixture.call!.id, "not valid offer"))).status).toBe(400);
    fixture.call!.startedAt = new Date(Date.now() - 331000).toISOString();
    expect((await POST(request(fixture.call!.id))).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not repeat a paid creation attempt after an ambiguous provider failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "never-log-this-key");
    const fetcher = vi.fn().mockResolvedValue(new Response("private body", { status: 500 })); vi.stubGlobal("fetch", fetcher);
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(fixture.call!.id))).status).toBe(502);
    expect((await POST(request(fixture.call!.id))).status).toBe(409);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/private body|never-log-this-key/);
  });
});
