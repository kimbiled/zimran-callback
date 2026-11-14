import { generateText } from "ai";
import type { Persona, Turn } from "../types";
import { buildBrief } from "../voice/brief";
import { aiEnabled, recordAiFailure, recordAiSuccess, resolveModel, withTimeout } from "./model";
import { normalize } from "./guards";
import { countQuestions } from "../metrics";
import { BUYER_INSTRUCTIONS } from "../voice/config";

export function offlineBuyer(persona: Persona, turns: Turn[], painsFound: string[], score: number): string {
  const rep = turns.filter(t => t.role === "rep").at(-1)?.text ?? "";
  const text = normalize(rep);
  if (/ignore.*instructions|system prompt|reveal.*prompt|you are.*ai|break character/i.test(rep)) {
    return "I'm in the middle of something. What is this call about?";
  }
  const specificTime = /\b(monday|tuesday|wednesday|thursday|friday|tomorrow)\b.*\b\d{1,2}(?::\d\d)?\b/i.test(rep);
  if (specificTime && painsFound.length > 0 && score >= 10 && turns.some(t => t.role === "rep" && /how (?:many|much|long)|hours|cost|weeks|days/i.test(t.text))) {
    return "That works for me. Send me the invite for a 20-minute meeting.";
  }
  const pain = persona.pains.find(p => p.keywords.some(k => text.includes(normalize(k))));
  if (countQuestions(rep) > 0 && /\b(how|what|why|where|when|who|which|walk|tell)\b/i.test(rep) && pain) {
    const quantify = /how (?:many|much|long)|hours|cost|weeks|days|percent/i.test(rep);
    return quantify ? pain.text : pain.text
      .replace(/\b(?:\d[\d,.%]*|one|two|three|four|five|six|seven|eight|nine|ten|thirty|ninety|hundred|thousand)\b/gi, "several")
      .replace(/several to several/g, "several");
  }
  if (score < -60) return "I need to get back to work. Thanks for calling, goodbye.";
  const count = turns.filter(t => t.role === "buyer").length;
  return persona.objections[Math.max(0, count - 1) % persona.objections.length];
}

export async function buyerReply(persona: Persona, turns: Turn[], painsFound: string[], score: number) {
  if (aiEnabled()) {
    const model = process.env.BUYER_MODEL || "openai/gpt-4.1-mini";
    try {
      const { text } = await withTimeout(signal => generateText({
        model: resolveModel(model),
        instructions: `${BUYER_INSTRUCTIONS}\n\n${buildBrief(persona)}\nCurrent interest: ${score}.`,
        messages: turns.slice(-20).map(t => ({ role: t.role === "rep" ? "user" as const : "assistant" as const, content: t.text })),
        temperature: 0.3,
        maxOutputTokens: 200,
        maxRetries: 0,
        abortSignal: signal,
      }), 8000);
      if (text.trim()) { recordAiSuccess("buyer", model); return { text: text.trim().slice(0, 1000), source: "ai" as const }; }
    } catch (error) {
      recordAiFailure("buyer", error, model);
    }
  }
  return { text: offlineBuyer(persona, turns, painsFound, score), source: "heuristic" as const };
}
