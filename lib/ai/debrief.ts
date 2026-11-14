// [B] Final debrief: five criteria with quotes, top-3 fixes, metrics computed in code.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { Criterion, CriterionId, Debrief, Persona, TimelinePoint, Turn } from "../types";
import { callMetrics } from "../metrics";
import { clamp, normalize, quoteIsGrounded } from "./guards";
import { criterionTitle, heuristicCriteria } from "./heuristics";
import { aiEnabled, DEBRIEF_MODEL, withTimeout } from "./model";
import { DEBRIEF_INSTRUCTIONS, personaCard, transcript } from "./prompts";

export const CRITERIA_ORDER: CriterionId[] = ["opening", "discovery", "objections", "value", "next_step"];

const DebriefSchema = z.object({
  summary: z.string(),
  outcome: z.enum(["meeting", "no_meeting"]),
  criteria: z.array(
    z.object({
      id: z.enum(["opening", "discovery", "objections", "value", "next_step"]),
      score: z.number().int().min(0).max(20),
      quote: z.string(),
      at: z.number(),
      better: z.string(),
    }),
  ),
  topFixes: z.array(z.string()),
  painsFound: z.array(z.string()),
});

const AGREE = ["works for me", "that works", "11 works", "10 works", "2 works", "3 works", "let's do it", "let's do that", "sounds good", "send me the invite", "send the invite", "send an invite", "works for me", "that works", "i'm in", "deal", "book it", "put it on my calendar"];

export function heuristicOutcome(turns: Turn[], finalScore: number): Debrief["outcome"] {
  const lastBuyer = turns
    .filter((t) => t.role === "buyer")
    .slice(-2)
    .map((t) => normalize(t.text))
    .join(" ");
  return finalScore >= 10 && AGREE.some((a) => lastBuyer.includes(normalize(a))) ? "meeting" : "no_meeting";
}

function groundCriteria(list: Criterion[], turns: Turn[]): Criterion[] {
  const rep = turns.filter((t) => t.role === "rep");
  return CRITERIA_ORDER.map((id) => {
    const c = list.find((x) => x.id === id);
    const base: Criterion = c ?? { id, title: criterionTitle(id), score: 0, quote: "", at: -1, better: "" };
    const match = base.quote ? rep.find((t) => quoteIsGrounded(base.quote, t.text)) : undefined;
    return {
      ...base,
      title: criterionTitle(id),
      score: Math.round(clamp(base.score, 0, 20)),
      quote: match ? base.quote : "",
      at: match ? Math.round(match.start) : -1,
    };
  });
}

export async function buildDebrief(args: {
  callId: string;
  persona: Persona;
  turns: Turn[];
  timeline: TimelinePoint[];
  painsHint: string[];
}): Promise<Debrief> {
  const { callId, persona, turns, timeline, painsHint } = args;
  const metrics = callMetrics(turns);
  const finalScore = timeline.length ? timeline[timeline.length - 1].score : 0;
  const painIds = persona.pains.map((p) => p.id);
  const repTurns = turns.filter((t) => t.role === "rep");

  if (repTurns.length === 0) {
    return {
      callId,
      total: 0,
      outcome: "no_meeting",
      summary: "The call ended before you said anything. Try again and open with your name and the reason for your call.",
      metrics,
      criteria: groundCriteria([], turns),
      topFixes: [
        "Say your name and the reason for the call in your first sentence.",
        "Ask one open question about how the buyer works today.",
        "Close with a specific meeting time.",
      ],
      scoreTimeline: timeline,
      finalScore,
      painsFound: [],
      painsMissed: painIds,
      source: "heuristic",
    };
  }

  let ai: z.infer<typeof DebriefSchema> | null = null;
  if (aiEnabled()) {
    try {
      const { output } = await withTimeout(
        generateText({
          model: DEBRIEF_MODEL,
          instructions: DEBRIEF_INSTRUCTIONS,
          temperature: 0.2,
          output: Output.object({ schema: DebriefSchema, name: "call_debrief" }),
          prompt: [
            personaCard(persona),
            `Metrics (computed in code): duration ${metrics.durationSec}s, rep talked ${metrics.talkRatio}% of the time, ${metrics.questions} questions, ${metrics.fillersPer100} filler words per 100 words, longest monologue ${metrics.longestMonologueSec}s.`,
            `Final buyer interest: ${finalScore} out of 100.`,
            `Transcript with [m:ss] timestamps and interest changes:\n${transcript(turns, true)}`,
          ].join("\n\n"),
        }),
        25000,
      );
      ai = output;
    } catch (e) {
      console.error("debrief AI failed, using heuristic", e);
    }
  }

  if (ai) {
    const criteria = groundCriteria(
      ai.criteria.map((c) => ({ ...c, title: criterionTitle(c.id) })),
      turns,
    );
    const found = [...new Set([...ai.painsFound, ...painsHint])].filter((id) => painIds.includes(id));
    return {
      callId,
      total: criteria.reduce((s, c) => s + c.score, 0),
      outcome: ai.outcome,
      summary: ai.summary,
      metrics,
      criteria,
      topFixes: ai.topFixes.slice(0, 3),
      scoreTimeline: timeline,
      finalScore,
      painsFound: found,
      painsMissed: painIds.filter((id) => !found.includes(id)),
      source: "ai",
    };
  }

  const criteria = groundCriteria(heuristicCriteria(persona, turns), turns);
  const found = painsHint.filter((id) => painIds.includes(id));
  const weakest = [...criteria].sort((a, b) => a.score - b.score).slice(0, 3);
  const outcome = heuristicOutcome(turns, finalScore);
  return {
    callId,
    total: criteria.reduce((s, c) => s + c.score, 0),
    outcome,
    summary:
      `${outcome === "meeting" ? "The buyer agreed to a next step." : "The call ended without a meeting."} ` +
      `You asked ${metrics.questions} question${metrics.questions === 1 ? "" : "s"}, uncovered ${found.length} of ${painIds.length} pains and talked ${metrics.talkRatio}% of the time.`,
    metrics,
    criteria,
    topFixes: weakest.map((c) => `${c.title}: ${c.better}`),
    scoreTimeline: timeline,
    finalScore,
    painsFound: found,
    painsMissed: painIds.filter((id) => !found.includes(id)),
    source: "heuristic",
  };
}
