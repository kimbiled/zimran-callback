// [A+B] The interview the rep is practicing for. The same buyer plays a different call:
// SDR = cold call, the goal is a meeting; AE = a discovery call the buyer agreed to,
// the goal is to qualify (pain, budget, who decides) and book the next step.
// Applied on the server when a call starts, so the buyer, the judge and the debrief all see it.
// No hidden buyer data here, so the client may import it too.

import type { Persona, SalesRole } from "./types";

export const ROLES: SalesRole[] = ["sdr", "ae"];

export function parseRole(v: unknown): SalesRole {
  return v === "ae" ? "ae" : "sdr";
}

export function applyRole(p: Persona, role: SalesRole): Persona {
  if (role === "sdr") return { ...p, role };
  return {
    ...p,
    role,
    openingLine: `${p.firstName} here. I've got about 25 minutes. What did you want to cover?`,
    background: `${p.background} This is not a cold call: last week you agreed to a 30-minute discovery call with an account executive from this company. You know roughly what they sell. You are open but skeptical, and you still don't volunteer your problems.`,
    meetingTriggers: [
      p.meetingTriggers[0],
      "The caller learned your budget and who else is involved in the decision.",
      "The caller proposed a concrete next step (a tailored demo or a pilot) with the other decision makers, at a specific time.",
    ].filter(Boolean),
    successStep: "Book a tailored demo or a pilot with the other decision makers for a specific date",
  };
}

/** One line for the judge and the debrief: what kind of call this is and what a good opening means. */
export function callTypeLine(role: SalesRole | undefined): string {
  return role === "ae"
    ? "Call type: a scheduled discovery call (AE interview). The buyer agreed to this meeting, so asking permission to talk is not needed. A good opening thanks them, confirms the time and sets an agenda. Discovery should cover pains, budget and the decision process."
    : "Call type: a cold call (SDR interview). The buyer did not expect this call. A good opening gives a name, a reason for the call and asks for a moment.";
}
