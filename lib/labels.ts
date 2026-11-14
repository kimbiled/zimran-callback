// Client-safe constants (no hidden buyer profiles here).

import type { Difficulty, SalesRole } from "./types";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const CUSTOM_PERSONA_KEY = "cb_custom_persona";

export const ROLE_KEY = "cb_role";

export const ROLE_LABEL: Record<SalesRole, { short: string; title: string; note: string }> = {
  sdr: { short: "SDR", title: "SDR · cold call", note: "They don't expect you. Earn 30 seconds and book a meeting." },
  ae: { short: "AE", title: "AE · discovery call", note: "They agreed to meet. Qualify the deal and book the demo." },
};
