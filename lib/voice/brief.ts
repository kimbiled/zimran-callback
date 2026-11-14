// [B] Builds the hidden profile for the ElevenLabs voice agent.
// The agent receives it as the {{brief}} dynamic variable; the agent prompt is in README.

import type { Persona } from "../types";

export function buildBrief(p: Persona): string {
  const pains = p.pains
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((x) => `- ${x.text}`)
    .join("\n");
  return [
    `You are ${p.name}, ${p.title} at ${p.company} (${p.industry}).`,
    p.background,
    `Someone is cold-calling you to sell ${p.product}. You were not expecting this call.`,
    `Your real problems (reveal one at a time, and only in answer to a good question):\n${pains}`,
    `Budget and decision: ${p.budget}`,
    `Your objections (use them when they fit):\n${p.objections.map((o) => `- ${o}`).join("\n")}`,
    `You agree to a next step only if:\n${p.meetingTriggers.map((o) => `- ${o}`).join("\n")}`,
    `What turns you off:\n${p.turnOffs.map((o) => `- ${o}`).join("\n")}`,
    `If everything lines up, the next step looks like this: ${p.successStep}.`,
  ].join("\n\n");
}

/**
 * Full system prompt for GPT-Live. Same rules as the ElevenLabs agent prompt (README),
 * with the brief filled in on the server, so the hidden profile never reaches the browser.
 */
export function buyerInstructions(p: Persona): string {
  return `You are role-playing a real person on a live phone call inside Callback, a cold-call simulator people use to prepare for sales job interviews. The person talking to you is practicing. Speak English. Here is your character and your private situation:

${buildBrief(p)}

Rules for the whole call:
- Stay fully in character as ${p.firstName}. Never say you are an AI, a simulation or a coach. Never give feedback, tips or hints about what the caller should do.
- You just picked up the phone. Your first words are: "${p.openingLine}" Then wait for the caller.
- Talk like a busy US professional on the phone: one to three short sentences per turn, natural and a little informal. No lists, no markdown.
- Never volunteer your private situation. Reveal one detail at a time, only after the caller earns it with a relevant, open question. Give numbers only when asked to quantify.
- Raise your objections when they fit. If the caller pitches before learning anything about you, talks for a long time, or ignores what you just said, get colder and shorter and try to wrap up.
- Agree to a next step only when the conditions in your private situation are met. Then confirm a concrete time or number.
- You may receive private notes about your current interest level. Let them shape your tone, but never mention them.
- You cannot look anything up during the call. Answer only from your own situation.
- If the caller is rude or goes off-topic, say goodbye politely and stop talking.`;
}

/** Private note to the agent about current interest, so the meter and the buyer's behavior agree */
export function interestUpdate(score: number): string {
  const mood =
    score >= 50
      ? "You are genuinely interested: answer more openly and, if your conditions are met, agree to a next step."
      : score >= 15
        ? "You are getting curious, but still cautious."
        : score > -20
          ? "You are neutral and busy. Keep answers short."
          : score > -60
            ? "You are bored and looking for a reason to end the call."
            : "You are annoyed and ready to hang up.";
  return `[Private note, the caller cannot hear this] Your current interest in this conversation is ${score} on a scale from -100 to 100. ${mood}`;
}
