// [B] Judge model, separate from the buyer actor. Scores every rep turn.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { JudgeResponse, Persona, Turn } from "../types";
import { guardJudge, type RawJudge } from "./guards";
import { heuristicJudge, matchedPains, repeatsAnsweredQuestion } from "./heuristics";
import { aiEnabled, JUDGE_MODEL, recordAiFailure, recordAiSuccess, resolveModel, withTimeout } from "./model";
import { JUDGE_INSTRUCTIONS, personaCard, transcript } from "./prompts";

const JudgeSchema = z.object({
  delta: z.number().int().min(-25).max(25),
  reason: z.string().min(1).max(120),
  evidenceQuote: z.string().max(4000),
  event: z.enum([
    "open_question",
    "pain_uncovered",
    "pain_quantified",
    "objection_handled",
    "next_step",
    "rapport",
    "pitch_too_early",
    "ignored_objection",
    "monologue",
    "closed_question",
    "neutral",
  ]),
  painsUncovered: z.array(z.string()),
});

export async function judgeTurn(args: {
  persona: Persona;
  turns: Turn[];
  prevScore: number;
  alreadyFound: string[];
}): Promise<JudgeResponse> {
  const { persona, turns, prevScore, alreadyFound } = args;
  const last = [...turns].reverse().find((t) => t.role === "rep");
  if (!last) {
    return { delta: 0, score: prevScore, reason: "No rep turn yet.", evidenceQuote: "", event: "neutral", painsUncovered: [], source: "heuristic" };
  }

  let raw: RawJudge | null = null;
  let source: JudgeResponse["source"] = "ai";
  if (aiEnabled()) {
    try {
      const context = turns.slice(-6);
      const { output } = await withTimeout(
        (signal) => generateText({
          model: resolveModel(JUDGE_MODEL),
          instructions: JUDGE_INSTRUCTIONS,
          temperature: 0,
          abortSignal: signal,
          maxRetries: 0,
          maxOutputTokens: 700,
          output: Output.object({ schema: JudgeSchema, name: "judge_verdict" }),
          prompt: [
            personaCard(persona),
            `Current buyer interest: ${prevScore} (scale -100 to 100).`,
            `Pains already uncovered: ${alreadyFound.length ? alreadyFound.join(", ") : "none"}.`,
            `Recent turns:\n${transcript(context)}`,
            `Score ONLY the rep's latest turn: "${last.text}"`,
          ].join("\n\n"),
        }),
        8000,
      );
      raw = output;
      recordAiSuccess("judge", JUDGE_MODEL);
    } catch (e) {
      recordAiFailure("judge", e, JUDGE_MODEL);
    }
  }
  if (!raw) {
    raw = heuristicJudge(persona, turns, alreadyFound);
    source = "heuristic";
  }

  const guarded = guardJudge(raw, {
    prevScore,
    repText: last.text,
    painIds: persona.pains.map((p) => p.id),
    alreadyFound,
  });
  if (repeatsAnsweredQuestion(turns) && guarded.event !== "monologue") {
    return { ...guarded, delta: 0, score: prevScore, event: "neutral", reason: "Repeating an answered question adds no new information.", painsUncovered: [], source };
  }
  // The judge runs before the buyer answers this turn, so a pain the buyer revealed in
  // reply to the previous question would never count live. Credit it now, verified in
  // code by the pain's keywords in the buyer's words (same rule as the offline rubric).
  const lastIndex = turns.lastIndexOf(last);
  const prevBuyer = turns.slice(0, lastIndex).reverse().find((t) => t.role === "buyer");
  const revealed = prevBuyer ? matchedPains(prevBuyer.text, persona) : [];
  const evidenced = new Set([...matchedPains(last.text, persona), ...revealed]);
  const painsUncovered = [...new Set([...guarded.painsUncovered.filter(id => evidenced.has(id)), ...revealed])].filter((id) => !alreadyFound.includes(id));
  return { ...guarded, painsUncovered, source };
}
