// [B] Fallback judge and debrief without an LLM. Used when AI Gateway is unavailable
// so the demo never breaks. Cruder than the model, but deterministic.

import type { Criterion, CriterionId, Persona, Turn } from "../types";
import type { RawJudge } from "./guards";
import { normalize, MONOLOGUE_WORDS } from "./guards";
import { words } from "../metrics";

const OPEN_Q = [" how ", " what ", " why ", " walk me through", " tell me", " which ", " where ", " when ", " who ", " how many", " how much", " how long"];
const PITCH = [
  "our product",
  "our platform",
  "we offer",
  "we provide",
  "our solution",
  "we are the leading",
  "we're the leading",
  "industry leading",
  "best in class",
  "discount",
  "special offer",
  "features",
  "cutting edge",
  "innovative",
];
const NEXT_STEP = ["meeting", "demo", "calendar", "invite", "tuesday", "wednesday", "thursday", "friday", "monday", "tomorrow", "next week", "this week", "minutes", "pilot", "trial", "follow up call"];
const RAPPORT = ["my name is", "this is", "good time", "reason i'm calling", "reason i am calling", "calling because", "i'm calling", "quick question", "30 seconds", "two minutes", "a minute"];
const OBJECTION_ACK = ["understand", "makes sense", "fair", "totally", "that's reasonable", "can i ask", "curious", "if i understand", "out of curiosity", "got it"];

const has = (text: string, list: string[]) => list.some((w) => text.includes(w));

function matchedPains(text: string, persona: Persona): string[] {
  const t = normalize(text);
  return persona.pains.filter((p) => p.keywords.some((k) => t.includes(normalize(k)))).map((p) => p.id);
}

export function heuristicJudge(persona: Persona, turns: Turn[], alreadyFound: string[]): RawJudge {
  const last = [...turns].reverse().find((t) => t.role === "rep");
  if (!last) return { delta: 0, reason: "No rep turn yet.", evidenceQuote: "", event: "neutral", painsUncovered: [] };
  const text = ` ${normalize(last.text)} `;
  const sentences = last.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 3);
  const isQuestion = last.text.includes("?");
  const quote = ((isQuestion ? sentences.find((s) => s.includes("?")) : undefined) ?? sentences[0] ?? last.text).slice(0, 140);
  const isOpen = isQuestion && has(text, OPEN_Q);
  const idx = turns.lastIndexOf(last);
  const prevBuyer = turns.slice(0, idx).reverse().find((t) => t.role === "buyer");
  const buyerPains = prevBuyer ? matchedPains(prevBuyer.text, persona) : [];
  const buyerObjected = prevBuyer
    ? persona.objections.some((o) => normalize(prevBuyer.text).includes(normalize(o).split(" ").slice(0, 4).join(" ")))
    : false;
  const newPains = [...new Set([...matchedPains(last.text, persona), ...buyerPains])].filter((id) => !alreadyFound.includes(id));
  const anyPainFound = alreadyFound.length > 0 || newPains.length > 0;

  if (words(last.text).length >= MONOLOGUE_WORDS)
    return { delta: -8, reason: "That turn ran too long. The buyer is tuning out.", evidenceQuote: quote, event: "monologue", painsUncovered: [] };
  if (has(text, PITCH) && !anyPainFound)
    return { delta: -10, reason: "Pitching before learning the buyer's problems.", evidenceQuote: quote, event: "pitch_too_early", painsUncovered: [] };
  if (has(text, NEXT_STEP) && anyPainFound)
    return { delta: 10, reason: "Concrete next step after a real pain surfaced.", evidenceQuote: quote, event: "next_step", painsUncovered: newPains };
  if (has(text, NEXT_STEP) && !anyPainFound)
    return { delta: -5, reason: "Asking for a meeting before finding any pain.", evidenceQuote: quote, event: "pitch_too_early", painsUncovered: [] };
  if (buyerObjected && has(text, OBJECTION_ACK))
    return { delta: 8, reason: "Acknowledged the objection and asked a follow-up.", evidenceQuote: quote, event: "objection_handled", painsUncovered: newPains };
  if (isOpen && newPains.length > 0)
    return { delta: 14, reason: "Open question that hit a real pain.", evidenceQuote: quote, event: "pain_uncovered", painsUncovered: newPains };
  if (isOpen) return { delta: 7, reason: "Open question. The buyer starts talking.", evidenceQuote: quote, event: "open_question", painsUncovered: [] };
  if (isQuestion) return { delta: 2, reason: "Closed question, not much learned.", evidenceQuote: quote, event: "closed_question", painsUncovered: [] };
  if (has(text, RAPPORT)) return { delta: 4, reason: "Good start: name and reason for the call.", evidenceQuote: quote, event: "rapport", painsUncovered: [] };
  return { delta: 0, reason: "Neutral turn.", evidenceQuote: quote, event: "neutral", painsUncovered: [] };
}

const TITLES: Record<CriterionId, string> = {
  opening: "Opening",
  discovery: "Discovery",
  objections: "Objection handling",
  value: "Value",
  next_step: "Next step",
};

export function criterionTitle(id: CriterionId): string {
  return TITLES[id];
}

const BETTER: Record<CriterionId, string> = {
  opening: "\"Hi {name}, this is ... from .... I'm calling because .... Do you have 30 seconds for me to tell you why I called you specifically?\"",
  discovery: "\"Walk me through how ... works today. Roughly how many hours a week does that take?\"",
  objections: "\"That's fair, I hear that a lot. Can I ask what would make it worth looking at an alternative?\"",
  value: "\"You mentioned .... That's exactly what we fix: customers cut ... by about ...%.\"",
  next_step: "\"Let me show you this on your own numbers in 30 minutes. Does Thursday at 11 work?\"",
};

export function heuristicCriteria(persona: Persona, turns: Turn[]): Criterion[] {
  const rep = turns.filter((t) => t.role === "rep");
  const pick = (fn: (t: Turn) => boolean) => rep.find(fn);
  const first = rep[0];
  const pos = (t: Turn) => (t.delta ?? 0) > 0;
  const qs = rep.filter((t) => t.text.includes("?"));
  const discoveryTurn = [...qs].filter(pos).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
  const nextTurn = pick((t) => has(normalize(t.text), NEXT_STEP));
  const valueTurn = pick(
    (t) => persona.pains.some((p) => p.keywords.some((k) => normalize(t.text).includes(normalize(k)))) && !t.text.includes("?"),
  );
  const objTurn = pick((t) => has(` ${normalize(t.text)} `, OBJECTION_ACK));
  const buyerObjected = turns.some(
    (t) => t.role === "buyer" && persona.objections.some((o) => normalize(t.text).includes(normalize(o).split(" ").slice(0, 4).join(" "))),
  );
  const score = (base: number, t?: Turn) => Math.max(0, Math.min(20, Math.round(base + (t?.delta ?? 0) / 2)));

  const c = (id: CriterionId, s: number, t?: Turn): Criterion => ({
    id,
    title: TITLES[id],
    score: s,
    quote: t?.text.slice(0, 180) ?? "",
    at: t ? Math.round(t.start) : -1,
    better: BETTER[id].replace("{name}", persona.firstName),
  });

  return [
    c("opening", first ? score(has(` ${normalize(first.text)} `, RAPPORT) ? 12 : 7, first) : 0, first),
    c("discovery", Math.min(20, qs.length * 3 + (discoveryTurn ? 4 : 0)), discoveryTurn ?? qs[0]),
    c("objections", objTurn ? score(10, objTurn) : buyerObjected ? 4 : 10, objTurn),
    c("value", valueTurn ? score(10, valueTurn) : 4, valueTurn),
    c("next_step", nextTurn ? score(11, nextTurn) : 0, nextTurn),
  ];
}
