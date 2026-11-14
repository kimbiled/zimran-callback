import { describe, expect, it } from "vitest";
import { callMetrics, countQuestions, estimateSeconds } from "@/lib/metrics";
import type { Turn } from "@/lib/types";

const turns: Turn[] = [
  { role: "buyer", text: "Hello, this is Jessica.", start: 0, end: 2 },
  { role: "rep", text: "Hi Jessica, um, this is Sam. How do you onboard new staff today?", start: 2.5, end: 8.5 },
  { role: "buyer", text: "It takes about four weeks.", start: 9, end: 11 },
  { role: "rep", text: "You know, that's basically a month. What does that cost you?", start: 11.5, end: 15.5 },
];

describe("callMetrics", () => {
  it("recognizes discovery requests in punctuation-free speech", () => {
    expect(countQuestions("Walk me through your onboarding process")).toBe(1);
    expect(countQuestions("Tell me which part takes the most time")).toBe(1);
    expect(countQuestions("Our platform has many features")).toBe(0);
  });
  it("computes talk ratio, questions, fillers and monologue from turns", () => {
    const m = callMetrics(turns);
    expect(m.durationSec).toBe(16);
    expect(m.talkRatio).toBe(71); // 10s of 14s
    expect(m.questions).toBe(2);
    expect(m.repWords).toBe(24);
    expect(m.fillersPer100).toBe(12.5); // um, you know, basically = 3 of 24
    expect(m.longestMonologueSec).toBe(6);
  });

  it("handles an empty call", () => {
    const m = callMetrics([]);
    expect(m).toMatchObject({ durationSec: 0, talkRatio: 0, questions: 0, fillersPer100: 0, longestMonologueSec: 0 });
  });

  it("counts adjacent fillers and merges split rep speech without overlapping time", () => {
    const m = callMetrics([
      { role: "rep", text: "Um um uh", start: 0, end: 40 },
      { role: "rep", text: "You know basically?", start: 30, end: 65 },
      { role: "buyer", text: "Okay", start: 65, end: 100 },
    ]);
    expect(m).toMatchObject({ talkRatio: 65, longestMonologueSec: 65, fillersPer100: 83.3 });
  });

  it("estimates speech duration from words", () => {
    expect(estimateSeconds("one two three four five")).toBe(2);
    expect(estimateSeconds("")).toBe(1);
  });
});
