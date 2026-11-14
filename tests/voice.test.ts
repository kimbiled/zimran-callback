import { afterEach, describe, expect, it } from "vitest";
import { cleanTranscript, TurnAssembler } from "@/lib/voice/turns";
import { countQuestions } from "@/lib/metrics";
import { buyerInstructions } from "@/lib/voice/brief";
import { gptLiveVoice, voiceProvider } from "@/lib/voice/server";
import { PERSONAS, VOICES } from "@/lib/personas";

describe("TurnAssembler (GPT-Live transcript deltas → turns)", () => {
  const collect = () => {
    const out: [string, string][] = [];
    const a = new TurnAssembler((role, text) => out.push([role, text]));
    return { a, out };
  };

  it("keeps each speaker's text together and emits in start order", () => {
    const { a, out } = collect();
    a.push("buyer", "Hello, ", 0);
    a.push("buyer", "this is Jessica.", 1);
    a.flush("buyer");
    a.push("rep", "Hi Jessica, ", 10);
    a.push("rep", " it's Sam from Acme.", 11);
    a.flush("rep");
    expect(out).toEqual([
      ["buyer", "Hello, this is Jessica."],
      ["rep", "Hi Jessica, it's Sam from Acme."],
    ]);
  });

  it("a backchannel doesn't cut the rep's sentence, and waits until the rep finishes", () => {
    const { a, out } = collect();
    a.push("rep", "I work with urgent care chains on how they get new staff up to", 10);
    a.push("buyer", "Mm-hm.", 12);
    a.flush("buyer"); // buyer's short turn closes first…
    expect(out).toEqual([]); // …but waits for the earlier rep turn
    a.push("rep", " speed. How long does onboarding take", 13); // late rep transcript
    a.flush("rep");
    expect(out).toEqual([
      ["rep", "I work with urgent care chains on how they get new staff up to speed. How long does onboarding take"],
      ["buyer", "Mm-hm."],
    ]);
  });

  it("flush(role) only closes that speaker's turn", () => {
    const { a, out } = collect();
    a.push("rep", "One question");
    a.flush("buyer");
    expect(out).toEqual([]);
    a.flush("rep");
    expect(out).toEqual([["rep", "One question"]]);
  });

  it("cleans broken characters and leftover leading punctuation", () => {
    expect(cleanTranscript(". I know I'm calling out of the blue� Do you have 30 seconds")).toBe(
      "I know I'm calling out of the blue Do you have 30 seconds",
    );
  });

  it("counts questions without question marks", () => {
    expect(countQuestions("Hi Jessica, it's Alex from TrainUp. Do you have 30 seconds")).toBe(1);
    expect(countQuestions("And who does the training? How much time does it take each week")).toBe(2);
    expect(countQuestions("We help clinics cut ramp time. It works.")).toBe(0);
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
