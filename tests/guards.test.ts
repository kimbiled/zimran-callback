import { describe, expect, it } from "vitest";
import { clamp, guardJudge, quoteIsGrounded } from "@/lib/ai/guards";

const ctx = (repText: string, prevScore = 0, alreadyFound: string[] = []) => ({
  prevScore,
  repText,
  painIds: ["onboarding", "turnover"],
  alreadyFound,
});

describe("quoteIsGrounded", () => {
  it("accepts exact and lightly reformatted quotes", () => {
    const rep = "How many weeks does it take, roughly, before a new hire is up to speed?";
    expect(quoteIsGrounded("before a new hire is up to speed", rep)).toBe(true);
    expect(quoteIsGrounded("How many weeks does it take roughly", rep)).toBe(true);
  });
  it("rejects invented quotes", () => {
    expect(quoteIsGrounded("we cut onboarding time in half", "Is now a good time?")).toBe(false);
    expect(quoteIsGrounded("", "anything")).toBe(false);
    expect(quoteIsGrounded("we save time with onboarding", "We have onboarding. Can you save us time with a report?")).toBe(false);
    expect(quoteIsGrounded("train", "We retrain staff.")).toBe(false);
  });
});

describe("guardJudge", () => {
  const base = { reason: "ok", event: "open_question" as const, painsUncovered: [] as string[] };

  it("clamps delta to ±25 and score to ±100", () => {
    const r = guardJudge({ ...base, delta: 80, evidenceQuote: "how do you onboard" }, ctx("So how do you onboard people?", 90));
    expect(r.score).toBe(100);
    expect(r.delta).toBe(10);
    const r2 = guardJudge({ ...base, delta: -80, evidenceQuote: "how do you onboard" }, ctx("So how do you onboard people?"));
    expect(r2.delta).toBe(-25);
  });

  it("zeroes the delta when the quote isn't in the rep's turn", () => {
    const r = guardJudge({ ...base, delta: 15, evidenceQuote: "tell me about your turnover problem" }, ctx("Is now a good time?", 10));
    expect(r.delta).toBe(0);
    expect(r.score).toBe(10);
    expect(r.event).toBe("neutral");
  });

  it("penalizes monologues in code", () => {
    const long = Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ");
    const r = guardJudge({ ...base, delta: 12, evidenceQuote: "word1 word2 word3 word4 word5" }, ctx(long));
    expect(r.delta).toBeLessThanOrEqual(-5);
    expect(r.event).toBe("monologue");
  });

  it("keeps only known, newly found pains", () => {
    const r = guardJudge(
      { ...base, delta: 10, evidenceQuote: "how long until they are up to speed", painsUncovered: ["onboarding", "turnover", "made_up"] },
      ctx("How long until they are up to speed?", 0, ["turnover"]),
    );
    expect(r.painsUncovered).toEqual(["onboarding"]);
  });
});

describe("clamp", () => {
  it("handles NaN", () => {
    expect(clamp(Number.NaN, -1, 1)).toBe(0);
  });
});
