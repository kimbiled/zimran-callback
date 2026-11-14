import { describe, expect, it } from "vitest";
import { applyHintPenalty, HINT_PENALTY, hintCount, recordHint } from "@/lib/ai/hint-count";
import type { Debrief } from "@/lib/types";

const base = { callId: "c", total: 62, outcome: "meeting", summary: "", criteria: [], topFixes: [], scoreTimeline: [], finalScore: 30, painsFound: [], painsMissed: [], source: "ai" } as unknown as Debrief;

describe("coach hint penalty", () => {
  it("takes 3 points per hint off the total and records it", () => {
    const d = applyHintPenalty(base, 2);
    expect(d.total).toBe(62 - 2 * HINT_PENALTY);
    expect(d).toMatchObject({ hintsUsed: 2, hintPenalty: 6 });
    expect(base.total).toBe(62); // pure
  });

  it("does nothing without hints and never goes below 0", () => {
    expect(applyHintPenalty(base, 0)).toBe(base);
    expect(applyHintPenalty({ ...base, total: 4 }, 5)).toMatchObject({ total: 0, hintPenalty: 4, hintsUsed: 5 });
    expect(applyHintPenalty(base, -3)).toBe(base);
  });

  it("counts hints per call on the server (memory store)", async () => {
    const id = `call-${Math.random()}`;
    expect(await hintCount(id)).toBe(0);
    await recordHint(id);
    expect(await recordHint(id)).toBe(2);
    expect(await hintCount(id)).toBe(2);
    expect(await hintCount(`other-${id}`)).toBe(0);
  });
});
