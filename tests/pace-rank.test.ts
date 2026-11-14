import { describe, expect, it } from "vitest";
import { callMetrics, longestPauseBeforeAnswer, rankLine, wordsPerMinute } from "@/lib/metrics";
import { db } from "@/lib/server/db";
import { getPersona } from "@/lib/personas";
import type { Debrief, Turn } from "@/lib/types";

const turns: Turn[] = [
  { role: "buyer", text: "Hello, this is Jessica.", start: 0, end: 2 },
  { role: "rep", text: "Hi Jessica, um, this is Sam. How do you onboard new staff today?", start: 2.5, end: 8.5 },
  { role: "buyer", text: "It takes about four weeks.", start: 9, end: 11 },
  { role: "rep", text: "You know, that's basically a month. What does that cost you?", start: 14.2, end: 18.2 },
];

describe("speaking pace and pauses", () => {
  it("computes words per minute over rep speaking time", () => {
    // 24 rep words over 10 seconds of rep speech = 144 wpm
    expect(wordsPerMinute(turns)).toBe(144);
    expect(callMetrics(turns).wordsPerMinute).toBe(144);
  });

  it("measures the longest gap between a buyer turn and the rep's answer", () => {
    expect(longestPauseBeforeAnswer(turns)).toEqual({ sec: 3.2, turnIndex: 3 });
    expect(callMetrics(turns).longestPauseBeforeAnswerSec).toBe(3.2);
  });

  it("ignores rep-to-rep gaps, overlaps and the buyer answering the rep", () => {
    const t: Turn[] = [
      { role: "rep", text: "Hi.", start: 0, end: 1 },
      { role: "buyer", text: "Yes?", start: 9, end: 10 },
      { role: "rep", text: "Quick question.", start: 9.5, end: 11 },
      { role: "rep", text: "Another one.", start: 30, end: 31 },
    ];
    expect(longestPauseBeforeAnswer(t)).toEqual({ sec: 0, turnIndex: 2 });
  });

  it("returns null for text calls and calls without a buyer → rep exchange", () => {
    expect(wordsPerMinute(turns, "text")).toBeNull();
    expect(longestPauseBeforeAnswer(turns, "text")).toBeNull();
    expect(callMetrics(turns, "text")).toMatchObject({ wordsPerMinute: null, longestPauseBeforeAnswerSec: null, repWords: 24 });
    expect(longestPauseBeforeAnswer([{ role: "rep", text: "Hello", start: 0, end: 1 }])).toBeNull();
    expect(callMetrics([])).toMatchObject({ wordsPerMinute: null, longestPauseBeforeAnswerSec: null });
  });

  it("keeps the existing metrics unchanged", () => {
    const m = callMetrics(turns);
    expect(m).toMatchObject({ questions: 2, repWords: 24, fillersPer100: 12.5, longestMonologueSec: 6 });
  });
});

describe("rankLine", () => {
  it("uses a percentile once there are five or more calls", () => {
    // 41 calls including this one; 29 of the other 40 scored lower
    expect(rankLine({ below: 29, above: 11, n: 41, includesSelf: true }, "Mike")).toBe("Better than 73% of 40 practice calls with Mike");
  });
  it("uses a position for small samples, ties share the better place", () => {
    expect(rankLine({ below: 1, above: 1, n: 3, includesSelf: true }, "Mike")).toBe("#2 of 3 calls with Mike");
    expect(rankLine({ below: 0, above: 0, n: 2, includesSelf: true }, "Mike")).toBe("#1 of 2 calls with Mike");
  });
  it("adds the call itself when the count excludes it (published samples)", () => {
    expect(rankLine({ below: 2, above: 0, n: 2, includesSelf: false }, "Linda")).toBe("#1 of 3 calls with Linda");
  });
  it("says first call when there is nothing to compare with", () => {
    expect(rankLine({ below: 0, above: 0, n: 1, includesSelf: true }, "Linda")).toBe("Your first scored practice call with Linda");
  });
});

describe("db.rank (memory store)", () => {
  const debrief = (total: number) => ({ total, finalScore: 0 }) as Debrief;
  it("counts finished, scored, non-sample calls for the persona only", async () => {
    const store = db();
    const mike = getPersona("mike-sales")!;
    const other = getPersona("jessica-hr")!;
    const sid = crypto.randomUUID();
    const add = async (persona = mike, total: number | null, opts: { sample?: boolean } = {}) => {
      const id = crypto.randomUUID();
      await store.createCall({ id, sessionId: sid, persona, mode: "voice", isSample: opts.sample });
      if (total !== null) await store.finishCall(id, [], debrief(total));
      return id;
    };
    await add(mike, 40);
    await add(mike, 60);
    await add(mike, 60);
    await add(mike, 80);
    await add(mike, 99, { sample: true }); // published sample: excluded
    await add(mike, null); // still live: excluded
    await add(other, 10); // other buyer: excluded
    expect(await store.rank(mike.id, 60)).toEqual({ below: 1, above: 1, n: 4 });
    expect(await store.rank(mike.id, 100)).toEqual({ below: 4, above: 0, n: 4 });
    expect(await store.rank("nobody", 50)).toEqual({ below: 0, above: 0, n: 0 });
  });
});
