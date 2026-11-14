// Coach whisper: one short next line for the rep after each buyer turn.
// Fast model with a hard 3s cap; deterministic fallback when AI is off or slow.
// Never reveals hidden pain text: the model is told not to, and any answer that echoes it is replaced.
import { generateText } from "ai";
import type { Persona, Turn } from "../types";
import { JUDGE_MODEL, aiEnabled, resolveModel, withTimeout } from "./model";
import { personaCard, transcript } from "./prompts";
import { normalize } from "./guards";
import { proposesNextStep } from "./heuristics";

export type HintResult = { hint: string; source: "ai" | "heuristic" };
export type HintContext = { persona: Persona; turns: Turn[]; painsFound: string[]; score: number };

export const HINT_TIMEOUT_MS = 3000;
export const HINT_MAX_WORDS = 20;

export const HINT_INSTRUCTIONS = `You are a sales coach whispering to a rep during a live practice call. You are NOT part of the conversation.
Suggest ONE short line the rep could say next (max 20 words): a question that would uncover a hidden pain they have not found yet, or a way to handle the buyer's latest objection (acknowledge, then ask).
Rules:
- Output only the line itself, no quotes, no labels, no explanation.
- Never reveal or paraphrase the hidden pain descriptions, numbers or facts. Point toward the topic with an open question instead.
- If enough pain is uncovered and interest is positive, suggest a specific next step instead.
- Plain spoken English. No pitching features.`;

const OBJECTION = /\b(not interested|no time|busy|bad time|in a meeting|send (me )?(an )?(email|info)|email me|already (have|use|work)|we('re| are) (fine|good|set|covered)|happy with|no budget|budget|too expensive|cost(s)? too|can't afford|not a priority|call (me )?back|who (is this|are you)|how did you get)\b/i;

/** Deterministic hints: used when AI is off, slow, or its answer is unusable. */
export function heuristicHint(ctx: HintContext): string {
  const { persona, turns, painsFound, score } = ctx;
  const repTurns = turns.filter(t => t.role === "rep");
  const lastBuyer = [...turns].reverse().find(t => t.role === "buyer")?.text ?? "";
  const ae = persona.role === "ae";

  if (repTurns.length === 0) {
    return ae
      ? "Thank them for the time, confirm you have 25 minutes, and propose a quick agenda."
      : "Say your name, why you're calling in one line, then ask for 30 seconds.";
  }

  const objected = OBJECTION.test(lastBuyer) || persona.objections.some(o => {
    const head = normalize(o).split(" ").slice(0, 4).join(" ");
    return head.length > 6 && normalize(lastBuyer).includes(head);
  });
  if (objected) {
    if (/budget|expensive|cost|afford|price/i.test(lastBuyer)) {
      return "Fair. Before price: what is this problem costing you today, roughly, per month?";
    }
    if (/already|happy with|fine|good|set|covered/i.test(lastBuyer)) {
      return "Makes sense. What would you change about how it works today, if you could?";
    }
    if (/email|info|call (me )?back|time|busy|meeting/i.test(lastBuyer)) {
      return "Totally understand. One quick question so I send the right thing: how do you handle this today?";
    }
    return "That's fair. Can I ask what would have to be true for this to be worth a look?";
  }

  if (painsFound.length > 0 && score >= 10 && !repTurns.some(t => proposesNextStep(t.text))) {
    const quantified = repTurns.some(t => /how (many|much|long)|hours|cost|per (week|month)/i.test(t.text));
    if (!quantified) return "Put a number on it: how many hours or dollars does that cost you each month?";
    return ae
      ? "Propose a tailored demo with the other decision makers on a specific day and time."
      : "Ask for a 20-minute meeting on a specific day, like Tuesday at 10.";
  }

  if (repTurns.length <= 2) {
    return `Open discovery: what takes up more of your week than it should as ${article(persona.title)} ${persona.title}?`;
  }
  if (painsFound.length === 0) {
    return "Ask what happens when things go wrong: walk me through the last time that hurt?";
  }
  return "Dig one level deeper: what has that cost you so far, and who else feels it?";
}

function article(title: string) {
  return /^[aeiou]/i.test(title.trim()) ? "an" : "a";
}

/** Trim quotes and labels, cap at HINT_MAX_WORDS, end cleanly. */
export function cleanHint(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^(hint|suggestion|try|say|rep)\s*:\s*/i, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  const words = s.split(" ").filter(Boolean);
  if (words.length > HINT_MAX_WORDS) s = words.slice(0, HINT_MAX_WORDS).join(" ").replace(/[,;:]$/, "") + "…";
  return s.slice(0, 200);
}

/** True when the hint repeats a hidden pain: its full text or any 5-word run of it. */
export function leaksPain(hint: string, persona: Persona): boolean {
  const h = ` ${normalize(hint)} `;
  return persona.pains.some(p => {
    const words = normalize(p.text).split(" ").filter(Boolean);
    if (h.includes(` ${words.join(" ")} `)) return true;
    for (let i = 0; i + 5 <= words.length; i++) if (h.includes(` ${words.slice(i, i + 5).join(" ")} `)) return true;
    return /\d/.test(p.text) && (p.text.match(/\$?\d[\d,.]*%?/g) ?? []).some(n => n.length >= 3 && hint.includes(n));
  });
}

export async function coachHint(ctx: HintContext): Promise<HintResult> {
  if (aiEnabled()) {
    try {
      const { text } = await withTimeout(signal => generateText({
        model: resolveModel(JUDGE_MODEL),
        instructions: `${HINT_INSTRUCTIONS}\n\n${personaCard(ctx.persona)}`,
        prompt: [
          `Pains already uncovered (ids): ${ctx.painsFound.join(", ") || "none"}.`,
          `Current buyer interest: ${ctx.score} (-100..100).`,
          `Latest turns:\n${transcript(ctx.turns.slice(-6))}`,
          "Your one line for the rep:",
        ].join("\n"),
        temperature: 0.4,
        maxOutputTokens: 60,
        maxRetries: 0,
        abortSignal: signal,
      }), HINT_TIMEOUT_MS);
      const hint = cleanHint(text);
      if (hint.split(" ").length >= 3 && !leaksPain(hint, ctx.persona)) return { hint, source: "ai" };
    } catch (error) {
      // Diagnostics only: no prompt, transcript or key in the log.
      const e = error && typeof error === "object" ? error as { name?: unknown; statusCode?: unknown } : {};
      console.error("hint AI failed", { name: String(e.name ?? "Error"), status: typeof e.statusCode === "number" ? e.statusCode : undefined });
    }
  }
  return { hint: heuristicHint(ctx), source: "heuristic" };
}
