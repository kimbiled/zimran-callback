import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ requests: 0 }));
vi.mock("@/lib/ai/model", () => ({ aiEnabled: () => true, aiDiagnostics: () => ({ judge: { kind: "timeout" } }) }));
vi.mock("@/lib/ai/judge", () => ({ judgeTurn: async (args: { turns: { text: string }[]; prevScore: number }) => {
  const failed = ++state.requests === 1;
  return { source: failed ? "heuristic" : "ai", delta: failed ? 25 : 1, score: args.prevScore + (failed ? 25 : 1), evidenceQuote: args.turns.at(-1)!.text, painsUncovered: [] };
} }));
import { evaluateCalls } from "@/lib/ai/evaluate";

afterEach(() => vi.useRealTimers());
it("retries a transient live timeout without applying or counting its fallback score", async () => {
  vi.useFakeTimers();
  state.requests = 0;
  const pending = evaluateCalls("hr-onboarding", 1);
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(state.requests).toBe(7);
  expect(result).toMatchObject({ judgedTurns: 6, aiTurns: 6, source: "ai", transientRetries: 1 });
  expect(result.rows[0]).toMatchObject({ strong: 3, weak: 3 });
});
