// [B] Final debrief: five criteria with quotes, top-3 fixes, metrics computed in code.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { Criterion, CriterionId, Debrief, Persona, TimelinePoint, Turn } from "../types";
import { callMetrics } from "../metrics";
import { clamp, normalize, quoteIsGrounded } from "./guards";
import { criterionAdvice, criterionTitle, heuristicCriteria, proposesNextStep } from "./heuristics";
import { acceptsTemperature, aiEnabled, DEBRIEF_FALLBACK_MODEL, DEBRIEF_MODEL, recordAiFailure, recordAiSuccess, resolveModel, withTimeout } from "./model";
import { DEBRIEF_INSTRUCTIONS, personaCard, transcript } from "./prompts";

/**
 * Output cap. A typical debrief is ~650 output tokens (measured on production, Nov 2026); the schema's
 * longest realistic answer (1200-char summary, five short quotes and lines, three fixes) is ~1300.
 * The cap only bounds a runaway answer: latency follows the tokens actually generated.
 */
export const DEBRIEF_MAX_OUTPUT_TOKENS = 1600;

export const CRITERIA_ORDER: CriterionId[] = ["opening", "discovery", "objections", "value", "next_step"];

export const DebriefSchema = z.object({
  summary: z.string().min(1).max(1200),
  outcome: z.enum(["meeting", "no_meeting"]),
  criteria: z.array(
    z.object({
      id: z.enum(["opening", "discovery", "objections", "value", "next_step"]),
      score: z.number().int().min(0).max(20),
      quote: z.string(),
      // No `at`: groundCriteria takes the timestamp from the rep turn that contains the quote.
      better: z.string(),
    }),
  ).length(5).refine(list => new Set(list.map(c => c.id)).size === 5, "Five unique criteria required"),
  topFixes: z.array(z.string().min(1).max(600)).length(3),
  painsFound: z.array(z.string()),
});

const AGREE = ["works for me", "that works", "11 works", "10 works", "2 works", "3 works", "let's do it", "let's do that", "sounds good", "send me the invite", "send the invite", "send an invite", "works for me", "that works", "i'm in", "deal", "book it", "put it on my calendar"];

export function heuristicOutcome(turns: Turn[], _finalScore: number): Debrief["outcome"] {
  let proposed = false, accepted = false;
  for (const turn of turns) {
    const text = normalize(turn.text).replace(/^no (?:problem|worries)(?: at all)?\s*/, "");
    if (turn.role === "rep") { proposed = proposesNextStep(turn.text); continue; }
    if (!proposed && !accepted) continue;
    const refused = (proposed && /^(?:no|nope|no thanks|no thank you)$/.test(text)) || /\b(?:cancel|never mind|nevermind|no longer|not interested)\b|\b(?:no|don't|do not|can't|cannot|won't|will not|not|doesn't|does not)\b.{0,60}\b(?:send|invite|agree|agreeing|meet|meeting|demo|pilot|work|available|make it|book|proceed)\b/.test(text);
    if (refused) accepted = false;
    else if (proposed && (AGREE.some(a => text.includes(normalize(a))) || /^(?:yes|yep|sure|absolutely)\b/.test(text))) accepted = true;
  }
  return accepted ? "meeting" : "no_meeting";
}

function safeCoaching(text: string, fallback: string): string {
  const line = text.replace(/[’‘]/g, "'");
  // shortcut: catches known invented integration/social-proof claims; broader factual accuracy still needs semantic review.
  const inventedClaim = /\bwe(?:'ve| have)?\s+(?:(?:already|successfully)\s+)?(?:helped|saved|reduced|increased|improved)\b/i.test(line)
    || /\b(?:our (?:tool|product|platform|solution|software)|it|we)\b[^.!?]{0,80}\b(?:integrates?|syncs?|connects?)\s+(?:with|to)\b/i.test(line);
  return inventedClaim ? fallback : text;
}

export function groundCriteria(list: Criterion[], turns: Turn[], persona?: Persona): Criterion[] {
  const rep = turns.filter((t) => t.role === "rep");
  return CRITERIA_ORDER.map((id) => {
    const c = list.find((x) => x.id === id);
    const base: Criterion = c ?? { id, title: criterionTitle(id), score: 0, quote: "", at: -1, better: criterionAdvice(id) };
    const match = base.quote ? rep.find((t) => quoteIsGrounded(base.quote, t.text)) : undefined;
    return {
      ...base,
      title: criterionTitle(id),
      score: match ? Math.round(clamp(base.score, 0, 20)) : 0,
      quote: match ? base.quote : "",
      at: match ? Math.round(match.start) : -1,
      better: safeCoaching(base.better, criterionAdvice(id, persona)),
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
      criteria: groundCriteria(heuristicCriteria(persona, turns), turns, persona),
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
  // Primary model first (GPT-6 Luna: fast); if it errors (unknown model, rejected parameter,
  // timeout), the same request goes to the fallback once before the offline rubric.
  const models = [...new Set([DEBRIEF_MODEL, DEBRIEF_FALLBACK_MODEL])];
  for (const [attempt, modelName] of models.entries()) {
    if (!aiEnabled() || ai) break;
    try {
      const { output } = await withTimeout(
        (signal) => generateText({
          model: resolveModel(modelName),
          instructions: DEBRIEF_INSTRUCTIONS,
          ...(acceptsTemperature(modelName) ? { temperature: 0.2 } : {}),
          abortSignal: signal,
          maxRetries: 0,
          maxOutputTokens: DEBRIEF_MAX_OUTPUT_TOKENS,
          output: Output.object({ schema: DebriefSchema, name: "call_debrief" }),
          prompt: [
            personaCard(persona),
            `Metrics (computed in code): duration ${metrics.durationSec}s, rep talked ${metrics.talkRatio}% of the time, ${metrics.questions} questions, ${metrics.fillersPer100} filler words per 100 words, longest monologue ${metrics.longestMonologueSec}s.`,
            `Final buyer interest: ${finalScore} out of 100.`,
            `Transcript with [m:ss] timestamps and interest changes:\n${transcript(turns, true)}`,
          ].join("\n\n"),
        }),
        attempt === 0 ? 15000 : 20000,
      );
      ai = output;
      recordAiSuccess("debrief", modelName);
    } catch (e) {
      recordAiFailure("debrief", e, modelName);
    }
  }

  if (ai) {
    const criteria = groundCriteria(
      ai.criteria.map((c) => ({ ...c, at: -1, title: criterionTitle(c.id) })),
      turns,
      persona,
    );
    const weakest = [...criteria].sort((a, b) => a.score - b.score).slice(0, 3);
    const buyerText = normalize(turns.filter(t => t.role === "buyer").map(t => t.text).join(" "));
    const confirmed = ai.painsFound.filter(id => persona.pains.some(p => p.id === id && p.keywords.some(keyword => buyerText.includes(normalize(keyword)))));
    const found = [...new Set([...painsHint, ...confirmed])].filter((id) => painIds.includes(id));
    return {
      callId,
      total: criteria.reduce((s, c) => s + c.score, 0),
      outcome: ai.outcome,
      summary: safeCoaching(ai.summary, `The call ended ${ai.outcome === "meeting" ? "with an agreed next step" : "without a meeting"}. Review the quoted criteria and suggested questions before your next call.`),
      metrics,
      criteria,
      topFixes: ai.topFixes.slice(0, 3).map((fix, i) => safeCoaching(fix, `${weakest[i].title}: ${weakest[i].better}`)),
      scoreTimeline: timeline,
      finalScore,
      painsFound: found,
      painsMissed: painIds.filter((id) => !found.includes(id)),
      source: "ai",
    };
  }

  const criteria = groundCriteria(heuristicCriteria(persona, turns), turns, persona);
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
