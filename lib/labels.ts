// Client-safe constants (no hidden buyer profiles here).

import type { Difficulty } from "./types";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const CUSTOM_PERSONA_KEY = "cb_custom_persona";
