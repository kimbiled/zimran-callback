import { expect, it, vi } from "vitest";
import { evaluateCalls } from "@/lib/ai/evaluate";
import { writeFileSync } from "node:fs";

it("orders twenty paired offline calls using the production judge and grounded evidence", async () => {
  vi.stubEnv("AI_DISABLED", "1");
  try {
    const result = await evaluateCalls();
    expect(result.calls).toBe(20); expect(result.pairs).toBe(10);
    expect(result.pairAccuracy).toBeGreaterThanOrEqual(80);
    expect(result.groundedQuoteRate).toBe(100);
    expect(result.source).toBe("heuristic");
    if (process.env.CALLBACK_EVAL_REPORT === "1") {
      writeFileSync(new URL("../evals/results-offline.json", import.meta.url), JSON.stringify(result, null, 2));
      console.table(result.rows);
      console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
      console.log("EVAL PASSED (offline rubric; not live model quality)");
    }
  } finally { vi.unstubAllEnvs(); }
});

it("can evaluate one named pair without silently evaluating a different fixture", async () => {
  vi.stubEnv("AI_DISABLED", "1");
  try {
    const result = await evaluateCalls("hr-onboarding");
    expect(result.calls).toBe(2);
    expect(result.judgedTurns).toBe(6);
    expect(result.rows.map(row => row.pair)).toEqual(["hr-onboarding"]);
    await expect(evaluateCalls("missing-pair")).rejects.toThrow("Unknown eval pair");
  } finally { vi.unstubAllEnvs(); }
});
