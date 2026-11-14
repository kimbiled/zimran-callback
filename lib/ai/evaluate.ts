import pairs from "../../evals/calls/paired.json";
import type { Turn } from "../types";
import { getPersona } from "../personas";
import { judgeTurn } from "./judge";
import { quoteIsGrounded } from "./guards";
import { initialInterest } from "./interest";
import { aiDiagnostics, aiEnabled } from "./model";

export const EVAL_PAIR_IDS = pairs.map(pair => pair.id);

export async function evaluateCalls(pairId?: string, intervalMs = 0) {
  const selected = pairId ? pairs.filter(pair => pair.id === pairId) : pairs;
  if (!selected.length) throw new Error("Unknown eval pair");
  const rows = [];
  const failures: Record<string, number> = {};
  let moves = 0, groundedMoves = 0, aiTurns = 0, judgedTurns = 0;
  let transientRetries = 0;
  for (const pair of selected) {
    const persona = getPersona(pair.personaId);
    if (!persona || pair.buyer.length !== pair.strong.length || pair.buyer.length !== pair.weak.length) throw new Error("Invalid paired fixture");
    const results = { strong: 0, weak: 0 };
    for (const kind of ["strong", "weak"] as const) {
      const turns: Turn[] = [];
      const found = new Set<string>();
      let score = initialInterest(persona.difficulty);
      for (let i = 0; i < pair.buyer.length; i++) {
        turns.push({ role: "buyer", text: pair.buyer[i], start: i * 30, end: i * 30 + 5 });
        const rep: Turn = { role: "rep", text: pair[kind][i], start: i * 30 + 6, end: i * 30 + 20 };
        turns.push(rep);
        const started = Date.now();
        let verdict = await judgeTurn({ persona, turns, prevScore: score, alreadyFound: [...found] });
        if (intervalMs > 0 && verdict.source !== "ai" && aiDiagnostics().judge?.kind === "timeout") {
          await new Promise(resolve => setTimeout(resolve, 2000));
          transientRetries++;
          verdict = await judgeTurn({ persona, turns, prevScore: score, alreadyFound: [...found] });
        }
        score = verdict.score; verdict.painsUncovered.forEach(p => found.add(p));
        judgedTurns++; if (verdict.source === "ai") aiTurns++;
        else {
          const kind = aiEnabled() ? aiDiagnostics().judge?.kind ?? "unknown" : "disabled";
          failures[kind] = (failures[kind] ?? 0) + 1;
        }
        if (verdict.delta !== 0) { moves++; if (quoteIsGrounded(verdict.evidenceQuote, rep.text)) groundedMoves++; }
        if (intervalMs > 0) await new Promise(resolve => setTimeout(resolve, Math.max(0, intervalMs - (Date.now() - started))));
      }
      results[kind] = score;
    }
    rows.push({ pair: pair.id, ...results, ordered: results.strong > results.weak });
  }
  const orderedPairs = rows.filter(r => r.ordered).length;
  return {
    calls: rows.length * 2, pairs: rows.length, orderedPairs,
    pairAccuracy: Math.round(orderedPairs / rows.length * 100),
    meanStrong: Number((rows.reduce((s, r) => s + r.strong, 0) / rows.length).toFixed(1)),
    meanWeak: Number((rows.reduce((s, r) => s + r.weak, 0) / rows.length).toFixed(1)),
    groundedQuoteRate: moves ? Math.round(groundedMoves / moves * 100) : 0,
    moves, groundedMoves, judgedTurns, aiTurns, transientRetries,
    source: aiTurns === 0 ? "heuristic" : aiTurns === judgedTurns ? "ai" : "mixed",
    rows, failures,
  };
}
