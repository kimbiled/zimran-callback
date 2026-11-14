import { describe, expect, it } from "vitest";
import { callMetrics, estimateSeconds } from "@/lib/metrics";
import type { Turn } from "@/lib/types";

const turns: Turn[] = [
  { role: "buyer", text: "Hello, this is Jessica.", start: 0, end: 2 },
  { role: "rep", text: "Hi Jessica, um, this is Sam. How do you onboard new staff today?", start: 2.5, end: 8.5 },
  { role: "buyer", text: "It takes about four weeks.", start: 9, end: 11 },
  { role: "rep", text: "You know, that's basically a month. What does that cost you?", start: 11.5, end: 15.5 },
];

describe("callMetrics", () => {
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

  it("estimates speech duration from words", () => {
    expect(estimateSeconds("one two three four five")).toBe(2);
    expect(estimateSeconds("")).toBe(1);
  });
});
