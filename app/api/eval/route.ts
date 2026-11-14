// [B] Runs the judge on labeled turns -> accuracy for the Proof slide.
// Protected by a key: GET /api/eval?key=$EVAL_KEY
import { judgeTurn } from "@/lib/ai/judge";
import { heuristicJudge } from "@/lib/ai/heuristics";
import { guardJudge } from "@/lib/ai/guards";
import { caseTurns, EVAL_CASES, matches } from "@/lib/ai/eval-cases";
import { getPersona } from "@/lib/personas";
import { bad, json } from "@/lib/server/validate";

export const maxDuration = 120;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.EVAL_KEY || key !== process.env.EVAL_KEY) return bad("Not found", 404);

  const rows = await Promise.all(
    EVAL_CASES.map(async (c) => {
      const persona = getPersona(c.personaId)!;
      const turns = caseTurns(c);
      const found = c.alreadyFound ?? [];
      const t0 = Date.now();
      const ai = await judgeTurn({ persona, turns, prevScore: 0, alreadyFound: found });
      const ms = Date.now() - t0;
      const h = guardJudge(heuristicJudge(persona, turns, found), {
        prevScore: 0,
        repText: c.rep,
        painIds: persona.pains.map((p) => p.id),
        alreadyFound: found,
      });
      return {
        id: c.id,
        expect: c.expect,
        judge: { delta: ai.delta, ok: matches(c.expect, ai.delta), source: ai.source, reason: ai.reason, ms },
        heuristic: { delta: h.delta, ok: matches(c.expect, h.delta) },
      };
    }),
  );
  const acc = (k: "judge" | "heuristic") => Math.round((rows.filter((r) => r[k].ok).length / rows.length) * 100);
  const latencies = rows.map((r) => r.judge.ms).sort((a, b) => a - b);
  return json({
    cases: rows.length,
    judgeAccuracy: acc("judge"),
    heuristicAccuracy: acc("heuristic"),
    judgeSource: rows.every((r) => r.judge.source === "ai") ? "ai" : "mixed",
    medianLatencyMs: latencies[Math.floor(latencies.length / 2)],
    rows,
  });
}
