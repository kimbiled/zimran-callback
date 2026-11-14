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
};

export type CallMode = "voice" | "text";

export type CallRecord = {
  id: string;
  sessionId: string;
  personaId: string;
  persona: Persona;
  mode: CallMode;
  status: "live" | "done";
  isSample: boolean;
  startedAt: string;
  endedAt: string | null;
  finalScore: number | null;
  total: number | null;
  turns: Turn[];
  debrief: Debrief | null;
};

export type VoiceProvider = "elevenlabs" | "gpt-live";

/** POST /api/calls response: everything the voice layer needs to start the call */
export type CallStart = {
  callId: string;
  persona: PersonaPublic;
  voice: {
    /** gpt-live: browser connects via POST /api/voice/session; ElevenLabs credentials stay as a fallback */
    provider: VoiceProvider;
    agentId: string | null;
    signedUrl: string | null;
    voiceId: string;
    dynamicVariables: { name: string; opening_line: string; brief: string };
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
