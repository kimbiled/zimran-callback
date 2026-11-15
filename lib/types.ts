// Shared contract between A (server + UI) and B (AI + voice).
// Change it together: every field here is the API between the two folders.

export type Role = "rep" | "buyer";

export type Turn = {
  role: Role;
  text: string;
  /** seconds from the start of the call */
  start: number;
  end: number;
  /** filled by the judge, rep turns only */
  delta?: number;
  score?: number;
  reason?: string;
  /** Persisted by the server with the verdict; separate from the debrief model source. */
  judgeSource?: "ai" | "heuristic";
};

export type Difficulty = "easy" | "medium" | "hard";

export type Pain = {
  id: string;
  text: string;
  /** how much the buyer cares, 1–5 */
  weight: number;
  /** words the fallback (heuristic) judge uses to spot the topic */
  keywords: string[];
};

export type Persona = {
  id: string;
  name: string;
  firstName: string;
  title: string;
  company: string;
  industry: string;
  /** what the rep is selling to this buyer */
  product: string;
  difficulty: Difficulty;
  gender: "female" | "male";
  voiceId: string;
  openingLine: string;
  /** character and context for the voice agent */
  background: string;
  pains: Pain[];
  budget: string;
  objections: string[];
  /** what has to happen for the buyer to agree to a meeting */
  meetingTriggers: string[];
  turnOffs: string[];
  /** the next step that counts as a win */
  successStep: string;
  generated?: boolean;
  /** Interview the rep is practicing for. Set on the server when a call starts (lib/roles.ts). */
  role?: SalesRole;
};

/** sdr: cold call to book a meeting · ae: scheduled discovery call to qualify and advance the deal */
export type SalesRole = "sdr" | "ae";

export type PersonaPublic = {
  id: string;
  name: string;
  /** How the buyer is addressed on buttons ("Call Nina", not "Call Dr.") */
  firstName: string;
  title: string;
  company: string;
  industry: string;
  product: string;
  difficulty: Difficulty;
  goal: string;
  generated?: boolean;
};

export type JudgeEvent =
  | "open_question"
  | "pain_uncovered"
  | "pain_quantified"
  | "objection_handled"
  | "next_step"
  | "rapport"
  | "pitch_too_early"
  | "ignored_objection"
  | "monologue"
  | "closed_question"
  | "neutral";

export type JudgeRequest = { callId: string; turns: Turn[]; score: number };

export type JudgeResponse = {
  delta: number;
  score: number;
  reason: string;
  evidenceQuote: string;
  event: JudgeEvent;
  painsUncovered: string[];
  source: "ai" | "heuristic";
};

export type Metrics = {
  durationSec: number;
  talkRatio: number;
  questions: number;
  fillersPer100: number;
  longestMonologueSec: number;
  repWords: number;
  /** Rep words per rep speaking minute; null for text calls (timestamps are estimated there). Optional: older saved debriefs lack it. */
  wordsPerMinute?: number | null;
  /** Longest gap between the end of a buyer turn and the start of the rep's answer; null for text calls. */
  longestPauseBeforeAnswerSec?: number | null;
};

export type CriterionId = "opening" | "discovery" | "objections" | "value" | "next_step";

export type Criterion = {
  id: CriterionId;
  title: string;
  /** 0–20 */
  score: number;
  /** exact quote from the rep */
  quote: string;
  /** second of the call the quote belongs to; -1 if none */
  at: number;
  /** a better line, ready to say */
  better: string;
};

export type TimelinePoint = { t: number; score: number };

export type Debrief = {
  callId: string;
  /** 0–100 = sum of the five criteria */
  total: number;
  outcome: "meeting" | "no_meeting";
  summary: string;
  metrics: Metrics;
  criteria: Criterion[];
  topFixes: string[];
  scoreTimeline: TimelinePoint[];
  finalScore: number;
  painsFound: string[];
  painsMissed: string[];
  source: "ai" | "heuristic";
  /** Coach hints shown during the call (counted on the server) */
  hintsUsed?: number;
  /** Points taken off `total` for those hints (3 each, never below 0) */
  hintPenalty?: number;
};

export type CallMode = "voice" | "text";

export type CallRecord = {
  id: string;
  sessionId: string;
  personaId: string;
  persona: Persona;
  mode: CallMode;
  status: "live" | "done" | "cancelled";
  isSample: boolean;
  startedAt: string;
  endedAt: string | null;
  finalScore: number | null;
  total: number | null;
  turns: Turn[];
  debrief: Debrief | null;
};

export type VoiceProvider = "gpt-live" | "text";

/** POST /api/calls response: everything the voice layer needs to start the call */
export type CallStart = {
  callId: string;
  persona: PersonaPublic;
  voice: {
    /** Voice uses the server-mediated GPT-Live handshake; text uses /api/buyer. */
    provider: VoiceProvider;
    voiceId: string;
    openingLine: string;
    maxSeconds: number;
  };
};

export type ProgressItem = {
  callId: string;
  personaName: string;
  company: string;
  difficulty: Difficulty;
  total: number | null;
  finalScore: number | null;
  startedAt: string;
  criteria: Partial<Record<CriterionId, number>>;
};

export type Plan = "free" | "sprint" | "offer" | "gym";

/** POST /api/retry: re-judge one rep line in its original context. Stateless. */
export type RetryRequest = { callId: string; turnIndex: number; text: string };

export type RetryResponse = {
  delta: number;
  /** Buyer interest after the retried line */
  score: number;
  reason: string;
  evidenceQuote: string;
  source: "ai" | "heuristic";
  /** The original line's saved delta (null when it was never scored) */
  original: number | null;
};

/** Where a finished call's total sits among real practice calls with the same buyer. */
export type CallRank = {
  /** calls with a strictly lower total */
  below: number;
  /** calls with a strictly higher total */
  above: number;
  /** finished, scored, non-sample calls with this buyer */
  n: number;
  /** whether `n` already counts the call being ranked */
  includesSelf?: boolean;
};
