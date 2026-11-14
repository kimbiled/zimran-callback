// [A] A real-looking sample call for people without a mic (and for the demo).
// Precomputed, so it renders without AI or voice.

import type { CallRecord, Debrief, Turn } from "./types";
import { getPersona } from "./personas";
import { callMetrics } from "./metrics";

const T = (role: Turn["role"], start: number, end: number, text: string, delta?: number, score?: number, reason?: string): Turn => ({
  role,
  text,
  start,
  end,
  ...(delta !== undefined ? { delta, score, reason } : {}),
});

const turns: Turn[] = [
  T("buyer", 0, 3.5, "Torres. Make it quick, I've got a pipeline review in five minutes."),
  T("rep", 4, 10.5, "Hi Mike, this is Alia from Callsense. I'm calling because we work with building supply distributors on rep productivity. Can I have two minutes?", 5, 5, "Name and a clear reason for the call."),
  T("buyer", 11, 13, "Two minutes. Go."),
  T("rep", 13.5, 21, "We make conversation intelligence software that logs every rep call automatically, we have the best analytics on the market and there's a 20% discount right now.", -12, -7, "Pitching before learning the buyer's problems."),
  T("buyer", 21.5, 25, "We already have Salesforce. We're good."),
  T("rep", 25.5, 31, "Makes sense, most teams do. Out of curiosity, what share of calls do your reps actually log in Salesforce?", 10, 3, "Acknowledged the objection and asked a sharp follow-up."),
  T("buyer", 31.5, 38, "Honestly? Maybe forty percent. I have no idea what's really in the pipeline."),
  T("rep", 38.5, 44.5, "How does that show up in your number? How accurate is your quarterly forecast right now?", 18, 21, "Tied the blind spot to quota. The buyer gives numbers."),
  T("buyer", 45, 51, "We hit eighty-two percent last quarter. The forecast is off by twenty percent, every time."),
  T("rep", 51.5, 60, "Eighty-two percent with a twenty percent miss is real money. If you could hear every call and see where deals stall, what would you fix first?", 14, 35, "Locked in the numbers and asked about priorities."),
  T("buyer", 60.5, 67, "I'd figure out why new reps take six months to ramp. My top guys close, everybody else is a coin flip."),
  T("rep", 67.5, 75, "That's exactly what we surface: the lines your top reps use that work, so new reps ramp faster. Can I show you on your own calls?", 8, 43, "Connected the product to the ramp pain."),
  T("buyer", 75.5, 79, "What does it cost? Probably too much."),
  T("rep", 79.5, 84, "Um, well, it kind of depends on the plan, it varies.", -8, 35, "Dodged the price question. That costs trust."),
  T("buyer", 84.5, 88, "Alright. I've got to run to my meeting."),
  T("rep", 88.5, 96, "Of course. How about Thursday at 11 for 30 minutes, with your front-line sales manager? I'll break down five of your real calls.", 12, 47, "Specific next step with a time and the right people."),
  T("buyer", 96.5, 100, "Thursday at 11. Fine, let's do it. Send me the invite."),
];

export const SAMPLE_CALL_ID = "sample";

const debrief: Debrief = {
  callId: SAMPLE_CALL_ID,
  total: 69,
  outcome: "meeting",
  summary:
    "You recovered from an early pitch: asking how many calls actually get logged in Salesforce turned the conversation, and Mike gave you his quota and forecast numbers himself. You slipped on price, where a vague answer cost trust. You still closed a specific meeting with the right people.",
  metrics: callMetrics(turns),
  criteria: [
    {
      id: "opening",
      title: "Opening",
      score: 13,
      quote: "I'm calling because we work with building supply distributors on rep productivity.",
      at: 4,
      better:
        "\"Hi Mike, Alia from Callsense. Distributors like Summit usually lose a third of rep calls outside Salesforce. Can I ask one question, and you decide if it's worth two minutes?\"",
    },
    {
      id: "discovery",
      title: "Discovery",
      score: 16,
      quote: "How does that show up in your number? How accurate is your quarterly forecast right now?",
      at: 39,
      better: "\"What does that do to your number? Roughly how many deals slip each quarter?\" Then ask what one lost deal is worth.",
    },
    {
      id: "objections",
      title: "Objection handling",
      score: 11,
      quote: "Um, well, it kind of depends on the plan, it varies.",
      at: 80,
      better: "\"Fair question. For 45 reps it's about $2,000 a month, less than one deal. On the call we'll check the payback on your numbers.\"",
    },
    {
      id: "value",
      title: "Value",
      score: 12,
      quote: "That's exactly what we surface: the lines your top reps use that work, so new reps ramp faster.",
      at: 68,
      better:
        "\"You said 82% of quota and a 20% forecast miss. Teams like yours get call logging to 95% in a quarter, and the forecast tightens by a third.\"",
    },
    {
      id: "next_step",
      title: "Next step",
      score: 17,
      quote: "How about Thursday at 11 for 30 minutes, with your front-line sales manager?",
      at: 89,
      better: "Strong close. Add a confirmation: \"I'll send the invite now. What's your sales manager's email?\"",
    },
  ],
  topFixes: [
    "Don't pitch in your second sentence. Ask one open question about how their team works first.",
    "Answer price with a number and compare it to what the problem costs them. Never \"it depends\".",
    "Cut the \"um, well, kind of\" when handling objections. It sounds unsure.",
  ],
  scoreTimeline: [{ t: 0, score: 0 }, ...turns.filter((t) => t.role === "rep").map((t) => ({ t: t.end, score: t.score ?? 0 }))],
  finalScore: 47,
  painsFound: ["visibility", "forecast", "ramp"],
  painsMissed: [],
  source: "ai",
};

export function sampleCall(): CallRecord {
  const persona = getPersona("mike-sales")!;
  return {
    id: SAMPLE_CALL_ID,
    sessionId: "",
    personaId: persona.id,
    persona,
    mode: "voice",
    status: "done",
    isSample: true,
    startedAt: "2026-11-14T09:00:00.000Z",
    endedAt: "2026-11-14T09:01:40.000Z",
    finalScore: debrief.finalScore,
    total: debrief.total,
    turns,
    debrief,
  };
}
