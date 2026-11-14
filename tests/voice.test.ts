import { afterEach, describe, expect, it } from "vitest";
import { TurnAssembler } from "@/lib/voice/turns";
import { buyerInstructions } from "@/lib/voice/brief";
import { gptLiveVoice, voiceProvider } from "@/lib/voice/server";
import { PERSONAS, VOICES } from "@/lib/personas";

describe("TurnAssembler (GPT-Live transcript deltas → turns)", () => {
  const collect = () => {
    const out: [string, string][] = [];
    const a = new TurnAssembler((role, text) => out.push([role, text]));
    return { a, out };
  };

  it("closes a turn when the other speaker starts", () => {
    const { a, out } = collect();
    a.push("buyer", "Hello, ");
    a.push("buyer", "this is Jessica.");
    a.push("rep", "Hi Jessica, ");
    a.push("rep", " it's Sam from Acme.");
    expect(out).toEqual([["buyer", "Hello, this is Jessica."]]);
    a.flush();
    expect(out[1]).toEqual(["rep", "Hi Jessica, it's Sam from Acme."]);
  });

  it("flush(role) only closes that speaker's turn", () => {
    const { a, out } = collect();
    a.push("rep", "One question");
    a.flush("buyer");
    expect(out).toEqual([]);
    a.flush("rep");
    expect(out).toEqual([["rep", "One question"]]);
  });

  it("drops empty and whitespace-only turns", () => {
    const { a, out } = collect();
    a.push("rep", "  ");
    a.push("buyer", "");
    a.flush();
    expect(out).toEqual([]);
  });
});

describe("GPT-Live config", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("instructions carry the hidden brief and the opening line", () => {
    const p = PERSONAS[0];
    const text = buyerInstructions(p);
    expect(text).toContain(p.openingLine);
    expect(text).toContain(p.pains[0].text);
    expect(text).not.toContain("{{");
  });

  it("maps every buyer voice to a GPT-Live voice", () => {
    for (const id of Object.values(VOICES)) expect(gptLiveVoice({ voiceId: id, gender: "female" })).toMatch(/^[a-z]+$/);
    expect(gptLiveVoice({ voiceId: "unknown", gender: "male" })).toBe("meridian");
  });

  it("uses GPT-Live only for voice calls with a key", () => {
    delete process.env.OPENAI_API_KEY;
    expect(voiceProvider("voice")).toBe("elevenlabs");
    process.env.OPENAI_API_KEY = "sk-test";
    expect(voiceProvider("voice")).toBe("gpt-live");
    expect(voiceProvider("text")).toBe("elevenlabs");
    process.env.VOICE_PROVIDER = "elevenlabs";
    expect(voiceProvider("voice")).toBe("elevenlabs");
  });
});
