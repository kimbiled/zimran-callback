// [B] Judge model, separate from the buyer actor. Scores every rep turn.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { JudgeResponse, Persona, Turn } from "../types";
import { guardJudge, type RawJudge } from "./guards";
import { heuristicJudge } from "./heuristics";
import { aiEnabled, JUDGE_MODEL, withTimeout } from "./model";
import { JUDGE_INSTRUCTIONS, personaCard, transcript } from "./prompts";

const JudgeSchema = z.object({
  delta: z.number().int().min(-25).max(25),
  reason: z.string(),
  evidenceQuote: z.string(),
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
      const context = turns.slice(-10);
      const { output } = await withTimeout(
        generateText({
          model: JUDGE_MODEL,
          instructions: JUDGE_INSTRUCTIONS,
          temperature: 0,
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
    } catch (e) {
      console.error("judge AI failed, using heuristic", e);
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
  return { ...guarded, source };
}
