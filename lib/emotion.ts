// Emotional debrief, computed in code from the transcript and the judge's saved interest scores.
// No extra model call: fast, deterministic and every number can be traced to words on the call.

import type { CallMode, Criterion, Turn } from "./types";
import { FILLERS, longestPauseBeforeAnswer, words, wordsPerMinute } from "./metrics";

// ---------- Buyer mood ----------

export type MoodId = "hostile" | "annoyed" | "guarded" | "neutral" | "curious" | "interested" | "warm";

export const MOOD_ORDER: MoodId[] = ["hostile", "annoyed", "guarded", "neutral", "curious", "interested", "warm"];

export const MOODS: Record<MoodId, { label: string; color: string; range: string }> = {
  hostile: { label: "Hostile", color: "#f43f5e", range: "below −50" },
  annoyed: { label: "Annoyed", color: "#fb7185", range: "−50 to −26" },
  guarded: { label: "Guarded", color: "#ff8a5c", range: "−25 to −6" },
  neutral: { label: "Neutral", color: "#a4a4b8", range: "−5 to +10" },
  curious: { label: "Curious", color: "#22d3ee", range: "+11 to +30" },
  interested: { label: "Interested", color: "#6ee7a3", range: "+31 to +50" },
  warm: { label: "Warm", color: "#4ade80", range: "above +50" },
};

/** Interest score (−100..100) → the buyer's mood. */
export function moodFor(score: number): MoodId {
  if (score < -50) return "hostile";
  if (score < -25) return "annoyed";
  if (score < -5) return "guarded";
  if (score <= 10) return "neutral";
  if (score <= 30) return "curious";
  if (score <= 50) return "interested";
  return "warm";
}

export type MoodPoint = {
  /** seconds from the start of the call */
  t: number;
  score: number;
  mood: MoodId;
  /** the rep turn that produced this point; null for the opening mood */
  turnIndex: number | null;
  delta: number | null;
};

export type MoodSwing = {
  turnIndex: number;
  t: number;
  delta: number;
  direction: "up" | "down";
  from: MoodId;
  to: MoodId;
  /** the rep line that caused it */
  quote: string;
  /** the judge's reason */
  reason: string;
  /** what the buyer said next, if anything */
  reaction: string | null;
};

// ---------- Rep signals ----------

export type SignalId = "confidence" | "empathy" | "warmth" | "composure" | "energy";

export type Signal = {
  id: SignalId;
  label: string;
  /** 0–100; null when there was nothing to measure (e.g. no objections for composure) */
  score: number | null;
  note: string;
};

export type ObjectionKind = "price" | "incumbent" | "brushoff" | "time" | "email" | "skeptic";
export type ObjectionResponse = "acknowledged" | "explored" | "neutral" | "dodged" | "argued" | "pitched";

export type ObjectionMoment = {
  buyerIndex: number;
  repIndex: number;
  kind: ObjectionKind;
  response: ObjectionResponse;
  buyerText: string;
  repText: string;
  delta: number | null;
};

export type Takeaway = {
  id: string;
  tone: "fix" | "keep";
  title: string;
  detail: string;
  /** a concrete line to say next time */
  better: string;
  turnIndex: number | null;
};

export type EmotionStats = {
  repWords: number;
  hedges: number;
  hedgesPer100: number;
  hedgePhrases: { phrase: string; count: number }[];
  apologies: number;
  acknowledgements: number;
  mirrors: number;
  nameUses: number;
  thanks: number;
  exclamations: number;
  upbeat: number;
  fillersPer100: number;
  wordsPerMinute: number | null;
  longestPauseSec: number | null;
};

export type EmotionalDebrief = {
  arc: MoodPoint[];
  swings: MoodSwing[];
  signals: Signal[];
  objections: ObjectionMoment[];
  takeaways: Takeaway[];
  stats: EmotionStats;
};

export const HEDGES = [
  "i think", "i guess", "maybe", "perhaps", "probably", "just", "kind of", "sort of", "to be honest",
  "i feel like", "hopefully", "a little bit", "i'm not sure", "i was wondering", "if that's okay", "does that make sense",
];
export const APOLOGIES = ["sorry", "apologize", "apologise", "apologies", "my bad"];
export const ACKNOWLEDGEMENTS = [
  "makes sense", "i hear you", "that's fair", "fair enough", "fair point", "fair question", "good point", "good question",
  "totally understand", "i understand", "understood", "i get it", "i get that", "understandable", "that sounds", "it sounds like",
  "of course", "no problem", "you're right", "i can imagine",
];
export const THANKS = ["thank you", "thanks", "appreciate"];
export const UPBEAT = [
  "great", "awesome", "love", "excited", "fantastic", "perfect", "amazing", "glad", "happy to", "absolutely", "definitely",
  "exactly", "brilliant", "excellent", "wonderful",
];

const OBJECTIONS: { kind: ObjectionKind; re: RegExp }[] = [
  { kind: "price", re: /\b(cost|costs|price|pricing|expensive|budget|too much|afford)\b/ },
  { kind: "incumbent", re: /\b(already (have|use|got|work with|using)|we use|we're using|happy with (our|what)|have a vendor|in-house)\b/ },
  { kind: "brushoff", re: /\b(not interested|we're good|we're fine|we're all set|no thanks|not a priority|not right now|no need|don't need)\b/ },
  { kind: "time", re: /\b(busy|no time|don't have time|(got|have|need) to (run|go)|gotta (run|go)|make it quick|in a meeting|call (me )?back|another call)\b/ },
  { kind: "email", re: /\bsend (me )?(an? |some )?(email|info|information|deck|brochure|something)\b/ },
  { kind: "skeptic", re: /\b(how did you get my number|who is this|why should i|heard (that|this) before|everyone says|sounds like a pitch|is this a sales call)\b/ },
];

const KIND_LABEL: Record<ObjectionKind, string> = {
  price: "price question",
  incumbent: "“we already have something”",
  brushoff: "brush-off",
  time: "time pressure",
  email: "“send me an email”",
  skeptic: "skepticism",
};

const DODGE = /\b(it depends|depends on|it varies|hard to say|i'm not sure|not sure|i'd have to check|i'll have to check|can't really say)\b/;
const ARGUE = /^(no|but|actually|well actually)\b|\b(you're wrong|that's not true|i disagree|that's not right|but our|but we)\b/;
const PITCH = /\b(our (platform|product|software|solution|tool|app)|we offer|we provide|we make|best (on|in) the market|discount|features?|industry[- ]leading|cutting[- ]edge)\b/;
const ACK_START = /^(fair|totally|of course|great question|good question|understood|got it|sure|absolutely|i hear|that's fair|makes sense)\b/;

const NUMBER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "fifteen", "twenty",
  "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "percent", "half",
]);
const STOP = new Set([
  "really", "actually", "because", "should", "would", "could", "there", "their", "about", "people", "something", "thanks",
  "before", "little", "probably", "anything", "everything", "minutes", "minute", "honestly", "already", "pretty", "right",
  "though", "through", "things", "always", "number", "question", "questions", "calling", "talking", "having", "making",
]);

// ---------- helpers ----------

const norm = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const signedNum = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function clip(text: string, max = 140): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** Whole-word, case-insensitive phrase counts. */
export function countPhrases(text: string, phrases: string[]): { phrase: string; count: number }[] {
  const t = norm(text);
  return phrases
    .map((phrase) => ({ phrase, count: t.match(new RegExp(`(?<![\\p{L}'])${escapeRe(phrase)}(?![\\p{L}'])`, "gu"))?.length ?? 0 }))
    .filter((p) => p.count > 0);
}

const total = (list: { count: number }[]) => list.reduce((n, p) => n + p.count, 0);

export function objectionKind(buyerText: string): ObjectionKind | null {
  const t = norm(buyerText);
  return OBJECTIONS.find((o) => o.re.test(t))?.kind ?? null;
}

/** How the rep answered pushback: acknowledged it, explored it with a question, or argued/pitched/dodged. */
export function classifyResponse(repText: string): ObjectionResponse {
  const t = norm(repText).trim();
  const lead = t.replace(/^(?:(?:um|uh|so|well|okay|ok|yeah|oh)[,\s]+)+/, "");
  const ack = countPhrases(t, ACKNOWLEDGEMENTS).length > 0 || countPhrases(t, THANKS).length > 0 || ACK_START.test(lead);
  const argue = ARGUE.test(lead);
  const pitch = PITCH.test(t);
  if (DODGE.test(t)) return "dodged";
  if (ack && !argue && !pitch) return "acknowledged";
  if (argue) return "argued";
  if (pitch) return "pitched";
  if (t.includes("?")) return "explored";
  return "neutral";
}

const RESPONSE_POINTS: Record<ObjectionResponse, number> = {
  acknowledged: 1,
  explored: 0.75,
  neutral: 0.5,
  dodged: 0.25,
  pitched: 0.1,
  argued: 0,
};

/** True when the rep echoes a number or a distinctive word from the buyer's previous line. */
export function mirrors(buyerText: string, repText: string): boolean {
  const buyer = new Set(words(buyerText).filter((w) => /\d/.test(w) || NUMBER_WORDS.has(w) || (w.length >= 6 && !STOP.has(w))));
  return words(repText).some((w) => buyer.has(w));
}

function sentences(text: string): string[] {
  return (text.match(/[^.?!]+[.?!]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

const APOLOGY_CLAUSE = /(?<![\p{L}'])(sorry|apologies)( to (bother|interrupt|call) you)?( out of the blue)?(?![\p{L}'])[,]?/giu;

/** Removes hedges and apologies from a sentence: "Sorry, I just think maybe we could help" → "We could help". */
export function stripHedges(sentence: string): string {
  const hedges = [...HEDGES].sort((a, b) => b.length - a.length);
  let s = ` ${sentence.replace(/[\u2018\u2019]/g, "'")} `.replace(APOLOGY_CLAUSE, " ");
  // Repeat until stable: removing "just" can expose "I think" in "I just think".
  for (let prev = ""; prev !== s; ) {
    prev = s;
    for (const h of hedges) s = s.replace(new RegExp(`(?<![\\p{L}'])${escapeRe(h)}(?![\\p{L}'])[,]?`, "giu"), " ");
    s = s.replace(/\s+/g, " ");
  }
  s = s
    .replace(/\s+([,.?!])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,\s]+/, "")
    .replace(/,$/, ".");
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const BETTER_BY_KIND: Record<ObjectionKind, (name: string) => string> = {
  price: (n) => `“Fair question, ${n}, and you deserve a straight number. For a team your size it’s usually around [price]. Is that in the range you’d expect for fixing this?”`,
  incumbent: (n) => `“Makes sense, ${n}, most teams I talk to do. Out of curiosity, what does it not do as well as you’d like?”`,
  brushoff: (n) => `“Totally fair, ${n}, I did call out of the blue. Can I ask one question, and you tell me if it’s worth another minute?”`,
  time: (n) => `“Of course, ${n}, I’ll be quick. Would Thursday at 11 work for 20 minutes instead?”`,
  email: () => `“Happy to. So I send something useful, what’s the one thing you’d want it to answer?”`,
  skeptic: (n) => `“Fair to ask, ${n}. I work with teams like yours on this one problem. Can I ask one question and you decide if it’s relevant?”`,
};

/** The criterion coaching line that belongs to this rep turn, if the debrief quoted it. */
export function betterLineFor(turn: Turn, criteria: Criterion[] = []): string | null {
  const text = norm(turn.text).replace(/\s+/g, " ");
  const hit = criteria.find((c) => c.quote && c.better && text.includes(norm(c.quote).replace(/\s+/g, " ").replace(/[.?!]+$/, "")));
  return hit ? hit.better.trim() : null;
}

// ---------- main ----------

export function emotionalDebrief(input: {
  turns: Turn[];
  firstName: string;
  mode?: CallMode;
  /** interest before the first rep turn (debrief.scoreTimeline[0].score) */
  initialScore?: number;
  criteria?: Criterion[];
}): EmotionalDebrief {
  const { turns, firstName, mode = "voice", criteria = [] } = input;
  const name = firstName.trim() || "the buyer";

  // (a) mood arc
  let score = input.initialScore ?? 0;
  const arc: MoodPoint[] = [{ t: 0, score, mood: moodFor(score), turnIndex: null, delta: null }];
  turns.forEach((t, i) => {
    if (t.role !== "rep" || typeof t.delta !== "number") return;
    score = typeof t.score === "number" ? t.score : Math.max(-100, Math.min(100, score + t.delta));
    arc.push({ t: t.end, score, mood: moodFor(score), turnIndex: i, delta: t.delta });
  });

  const swings = pickSwings(arc, turns);

  // (b) rep signals
  const repTurns = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === "rep");
  const repText = repTurns.map((x) => x.t.text).join(" \n ");
  const repWords = words(repText).length;
  const per100 = (n: number) => (repWords ? +((n / repWords) * 100).toFixed(1) : 0);

  const hedgePhrases = countPhrases(repText, HEDGES).sort((a, b) => b.count - a.count);
  const hedges = total(hedgePhrases);
  const apologies = total(countPhrases(repText, APOLOGIES));
  const ackPhrases = countPhrases(repText, ACKNOWLEDGEMENTS).sort((a, b) => b.count - a.count);
  const acknowledgements = total(ackPhrases);
  const thanks = total(countPhrases(repText, THANKS));
  const upbeat = total(countPhrases(repText, UPBEAT));
  const fillers = total(countPhrases(repText, FILLERS));
  const exclamations = (repText.match(/!/g) ?? []).length;
  const nameUses = firstName.trim() ? (norm(repText).match(new RegExp(`(?<![\\p{L}])${escapeRe(norm(firstName.trim()))}(?![\\p{L}])`, "gu"))?.length ?? 0) : 0;
  const greeting = repTurns.length > 0 && /\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(norm(repTurns[0].t.text));
  const wpm = wordsPerMinute(turns, mode);
  const pause = longestPauseBeforeAnswer(turns, mode);

  let mirrorCount = 0;
  const objections: ObjectionMoment[] = [];
  turns.forEach((t, i) => {
    if (t.role !== "buyer") return;
    const next = turns.slice(i + 1).findIndex((x) => x.role === "rep");
    if (next < 0) return;
    const repIndex = i + 1 + next;
    const rep = turns[repIndex];
    if (mirrors(t.text, rep.text)) mirrorCount++;
    const kind = objectionKind(t.text);
    if (!kind) return;
    objections.push({
      buyerIndex: i,
      repIndex,
      kind,
      response: classifyResponse(rep.text),
      buyerText: t.text,
      repText: rep.text,
      delta: typeof rep.delta === "number" ? rep.delta : null,
    });
  });

  const hedgesPer100 = per100(hedges);
  const fillersPer100 = per100(fillers);
  const has = repWords > 0;

  const confidence = has ? clamp(95 - 9 * hedgesPer100 - 8 * apologies - 2.5 * fillersPer100, 5) : null;
  const empathy = has ? clamp(30 + 14 * Math.min(acknowledgements, 3) + 12 * Math.min(mirrorCount, 3)) : null;
  const warmth = has
    ? clamp(30 + 18 * Math.min(nameUses, 2) + 14 * Math.min(thanks, 2) + (greeting ? 10 : 0) - (nameUses > 4 ? 10 : 0))
    : null;
  const composure = objections.length
    ? clamp(
        (100 *
          objections.reduce((sum, o) => {
            const base = RESPONSE_POINTS[o.response];
            const nudge = o.delta === null ? 0 : o.delta > 0 ? 0.15 : o.delta < 0 ? -0.1 : 0;
            return sum + Math.max(0, Math.min(1, base + nudge));
          }, 0)) /
          objections.length,
      )
    : null;
  const paceAdj = wpm === null ? 0 : wpm < 110 ? -15 : wpm < 130 ? -5 : wpm <= 190 ? 10 : 5;
  const energy = has ? clamp(45 + 8 * Math.min(exclamations, 3) + 7 * Math.min(upbeat, 4) + paceAdj) : null;

  const topHedges = hedgePhrases.slice(0, 2).map((p) => `“${p.phrase}”${p.count > 1 ? ` ×${p.count}` : ""}`).join(", ");
  const acked = objections.filter((o) => o.response === "acknowledged" || o.response === "explored").length;

  const signals: Signal[] = [
    {
      id: "confidence",
      label: "Confidence",
      score: confidence,
      note: !has
        ? "You didn't speak on this call."
        : hedges + apologies === 0
          ? `No hedges or apologies in ${plural(repWords, "word")}. You sounded sure.`
          : `${plural(hedges, "hedge")}${topHedges ? ` (${topHedges})` : ""}${apologies ? ` and ${plural(apologies, "apology", "apologies")}` : ""} in ${plural(repWords, "word")}.`,
    },
    {
      id: "empathy",
      label: "Empathy",
      score: empathy,
      note: !has
        ? "Nothing to measure."
        : `${acknowledgements ? `${plural(acknowledgements, "acknowledgement")} (${ackPhrases.slice(0, 2).map((p) => `“${p.phrase}”`).join(", ")})` : "No acknowledgements like “makes sense” or “that’s fair”"}, echoed ${name}'s words ${mirrorCount ? plural(mirrorCount, "time") : "never"}.`,
    },
    {
      id: "warmth",
      label: "Warmth",
      score: warmth,
      note: !has
        ? "Nothing to measure."
        : `Used ${name}'s name ${plural(nameUses, "time")}${nameUses > 4 ? " (too often sounds scripted)" : ""}, ${thanks ? `said thanks ${plural(thanks, "time")}` : "never said thanks"}${greeting ? ", opened with a greeting" : ""}.`,
    },
    {
      id: "composure",
      label: "Composure",
      score: composure,
      note: objections.length
        ? `Acknowledged or explored ${acked} of ${plural(objections.length, "objection")} instead of arguing or pitching.`
        : `${name} didn't push back on this call, so there was nothing to stay calm about.`,
    },
    {
      id: "energy",
      label: "Energy",
      score: energy,
      note: !has
        ? "Nothing to measure."
        : `${plural(upbeat, "upbeat word")}${exclamations ? `, ${plural(exclamations, "exclamation")}` : ""}${wpm !== null ? `, pace ${wpm} wpm` : ", pace not measured on text calls"}.`,
    },
  ];

  const stats: EmotionStats = {
    repWords,
    hedges,
    hedgesPer100,
    hedgePhrases,
    apologies,
    acknowledgements,
    mirrors: mirrorCount,
    nameUses,
    thanks,
    exclamations,
    upbeat,
    fillersPer100,
    wordsPerMinute: wpm,
    longestPauseSec: pause?.sec ?? null,
  };

  const takeaways = buildTakeaways({ turns, name, swings, objections, stats, criteria, energy, pause, repTurns });
  return { arc, swings, signals, objections, takeaways, stats };
}

/** The 2–3 biggest swings: the biggest rise, the biggest drop, then the next biggest by size. Chronological. */
function pickSwings(arc: MoodPoint[], turns: Turn[]): MoodSwing[] {
  const moves = arc
    .map((p, k) => ({ p, prev: arc[k - 1] }))
    .filter((x): x is { p: MoodPoint & { turnIndex: number; delta: number }; prev: MoodPoint } => !!x.prev && x.p.turnIndex !== null && x.p.delta !== null && Math.abs(x.p.delta) >= 5);
  const byMagnitude = [...moves].sort((a, b) => Math.abs(b.p.delta) - Math.abs(a.p.delta) || a.p.t - b.p.t);
  const up = byMagnitude.find((m) => m.p.delta > 0);
  const down = byMagnitude.find((m) => m.p.delta < 0);
  const chosen = [up, down].filter((m): m is (typeof moves)[number] => !!m);
  for (const m of byMagnitude) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(m)) chosen.push(m);
  }
  return chosen
    .sort((a, b) => a.p.t - b.p.t)
    .map(({ p, prev }) => {
      const turn = turns[p.turnIndex];
      const reply = turns.slice(p.turnIndex + 1).find((t) => t.role === "buyer");
      return {
        turnIndex: p.turnIndex,
        t: turn.start,
        delta: p.delta,
        direction: p.delta > 0 ? "up" : "down",
        from: prev.mood,
        to: p.mood,
        quote: turn.text,
        reason: turn.reason ?? "",
        reaction: reply?.text ?? null,
      };
    });
}

function buildTakeaways(ctx: {
  turns: Turn[];
  name: string;
  swings: MoodSwing[];
  objections: ObjectionMoment[];
  stats: EmotionStats;
  criteria: Criterion[];
  energy: number | null;
  pause: { sec: number; turnIndex: number } | null;
  repTurns: { t: Turn; i: number }[];
}): Takeaway[] {
  const { turns, name, swings, objections, stats, criteria, energy, pause, repTurns } = ctx;
  const out: (Takeaway & { priority: number })[] = [];
  const add = (t: Takeaway & { priority: number }) => {
    if (!out.some((o) => o.id === t.id)) out.push(t);
  };
  const covered = new Set<number>();

  // 1. Objection handled badly: the clearest emotional miss.
  const bad = objections.find((o) => o.response === "dodged" || o.response === "argued" || o.response === "pitched");
  if (bad) {
    covered.add(bad.repIndex);
    const verb = bad.response === "dodged" ? "dodged" : bad.response === "argued" ? "argued with" : "pitched through";
    add({
      id: "objection",
      priority: 90,
      tone: "fix",
      title: `You ${verb} ${name}'s ${KIND_LABEL[bad.kind]}`,
      detail: `${name}: “${clip(bad.buyerText, 90)}” You: “${clip(bad.repText, 90)}”${bad.delta !== null ? ` (${signedNum(bad.delta)})` : ""}. Acknowledge first, then answer or ask.`,
      better: betterLineFor(turns[bad.repIndex], criteria) ?? BETTER_BY_KIND[bad.kind](name),
      turnIndex: bad.repIndex,
    });
  }

  // 2. Biggest drop in mood.
  const drop = [...swings].filter((s) => s.direction === "down").sort((a, b) => a.delta - b.delta)[0];
  if (drop && drop.delta <= -6 && !covered.has(drop.turnIndex)) {
    covered.add(drop.turnIndex);
    const pitchy = PITCH.test(norm(drop.quote));
    add({
      id: "drop",
      priority: 80,
      tone: "fix",
      title: drop.from === drop.to ? `Where ${name} cooled off (${signedNum(drop.delta)})` : `Where ${name} went ${MOODS[drop.from].label} → ${MOODS[drop.to].label}`,
      detail: `“${clip(drop.quote, 110)}”${drop.reason ? ` ${drop.reason}` : ""}`,
      better:
        betterLineFor(turns[drop.turnIndex], criteria) ??
        (pitchy
          ? `Ask before you tell: “Before I go further, ${name}, how are you handling this today?”`
          : `Slow down and check in: “Sounds like I missed something, ${name}. What matters most to you here?”`),
      turnIndex: drop.turnIndex,
    });
  }

  // 3. Hedging.
  if (stats.hedges >= 3 || stats.hedgesPer100 >= 2.5) {
    const worst = repTurns
      .flatMap((x) => sentences(x.t.text).map((s) => ({ s, i: x.i, n: total(countPhrases(s, HEDGES)) })))
      .sort((a, b) => b.n - a.n)[0];
    const cleaned = worst && worst.n > 0 ? stripHedges(worst.s) : "";
    add({
      id: "hedges",
      priority: 70,
      tone: "fix",
      title: "Hedges made you sound unsure",
      detail: `${plural(stats.hedges, "hedge")} in ${plural(stats.repWords, "word")} (${stats.hedgesPer100} per 100): ${stats.hedgePhrases.slice(0, 3).map((p) => `“${p.phrase}”${p.count > 1 ? ` ×${p.count}` : ""}`).join(", ")}.`,
      better: cleaned && cleaned.split(" ").length >= 3 ? `Say it straight: “${clip(cleaned, 160)}”` : `Commit to the claim: “Teams like yours usually see this within a month.”`,
      turnIndex: worst && worst.n > 0 ? worst.i : null,
    });
  }

  // 4. Apologies.
  if (stats.apologies > 0) {
    const at = repTurns.find((x) => countPhrases(x.t.text, APOLOGIES).length > 0);
    add({
      id: "apology",
      priority: 65,
      tone: "fix",
      title: "Drop the apologies",
      detail: `You apologized ${plural(stats.apologies, "time")}${at ? `: “${clip(at.t.text, 90)}”` : ""}. Apologizing for calling tells the buyer the call isn't worth their time.`,
      better: `“Thanks for picking up, ${name}. I’ll be brief.”`,
      turnIndex: at?.i ?? null,
    });
  }

  // 5. Long silence after the buyer spoke (voice only).
  if (pause && pause.sec >= 4) {
    add({
      id: "pause",
      priority: 55,
      tone: "fix",
      title: `${pause.sec}s of silence before you answered`,
      detail: `A long gap after ${name} spoke reads as being caught off guard. Buy time out loud instead.`,
      better: `“Good question. Let me give you a straight answer.”`,
      turnIndex: pause.turnIndex,
    });
  }

  // 6. Empathy: no acknowledgements at all.
  if (stats.repWords > 0 && stats.acknowledgements === 0) {
    const q = repTurns.flatMap((x) => sentences(x.t.text)).find((s) => s.endsWith("?"));
    add({
      id: "empathy",
      priority: objections.length ? 60 : 40,
      tone: "fix",
      title: "Acknowledge before you answer",
      detail: `You never said “makes sense”, “that’s fair” or “I hear you”. A short acknowledgement lowers the buyer's guard before your next question.`,
      better: `“That makes sense, ${name}. ${q ? clip(q, 110) : "What’s behind that?"}”`,
      turnIndex: null,
    });
  }

  // 7. Warmth: never used the buyer's name.
  if (stats.repWords > 0 && stats.nameUses === 0) {
    const best = repTurns
      .filter((x) => typeof x.t.delta === "number")
      .sort((a, b) => (b.t.delta ?? 0) - (a.t.delta ?? 0))
      .flatMap((x) => sentences(x.t.text))
      .find((s) => s.endsWith("?"));
    add({
      id: "name",
      priority: 50,
      tone: "fix",
      title: `You never used ${name}'s name`,
      detail: "Using the buyer's name once or twice makes a cold call feel like a conversation, not a script.",
      better: `“${name}, quick question: ${best ? best[0].toLowerCase() + clip(best, 110).slice(1) : "what would make the next 20 minutes worth it for you?"}”`,
      turnIndex: null,
    });
  }

  // 8. Rushing.
  if (stats.wordsPerMinute !== null && stats.wordsPerMinute > 175) {
    const q = repTurns
      .filter((x) => typeof x.t.delta === "number")
      .sort((a, b) => (b.t.delta ?? 0) - (a.t.delta ?? 0))
      .flatMap((x) => sentences(x.t.text))
      .find((s) => s.endsWith("?"));
    add({
      id: "pace",
      priority: 45,
      tone: "fix",
      title: `You rushed at ${stats.wordsPerMinute} words per minute`,
      detail: `A calm 130–160 wpm sounds confident. Fast talk on a cold call sounds like a script ${name} wants to escape.`,
      better: `Ask one question, then stop and wait: “${q ? clip(q, 120) : "What would you fix first?"}”`,
      turnIndex: null,
    });
  }

  // 9. Low energy.
  if (energy !== null && energy < 45) {
    add({
      id: "energy",
      priority: 35,
      tone: "fix",
      title: "Lift your energy",
      detail: `Few upbeat words${stats.wordsPerMinute !== null ? ` and a ${stats.wordsPerMinute} wpm pace` : ""}. Buyers mirror the caller's energy.`,
      better: `“Hi ${name}! Glad I caught you. I’ll keep this to two minutes.”`,
      turnIndex: null,
    });
  }

  // 9. Keep: what warmed the buyer up most.
  const rise = [...swings].filter((s) => s.direction === "up").sort((a, b) => b.delta - a.delta)[0];
  if (rise) {
    add({
      id: "rise",
      priority: 30,
      tone: "keep",
      title: rise.from === rise.to ? `What won ${name} over (${signedNum(rise.delta)})` : `What moved ${name} ${MOODS[rise.from].label} → ${MOODS[rise.to].label}`,
      detail: rise.reason || "The judge's biggest positive moment on the call.",
      better: `Do it again: “${clip(rise.quote, 150)}”`,
      turnIndex: rise.turnIndex,
    });
  }

  // 10. Keep: an objection handled with composure.
  const good = objections.find((o) => o.response === "acknowledged");
  if (good) {
    add({
      id: "composed",
      priority: 25,
      tone: "keep",
      title: "You stayed composed under pushback",
      detail: `${name}: “${clip(good.buyerText, 80)}” You acknowledged it instead of arguing.`,
      better: `Keep the pattern, acknowledge then ask: “${clip(good.repText, 140)}”`,
      turnIndex: good.repIndex,
    });
  }

  // Generic coaching so there are always at least three takeaways.
  add({
    id: "mirror",
    priority: 10,
    tone: "fix",
    title: `Echo ${name}'s own words`,
    detail: "Repeating the buyer's numbers and phrases shows you listened, and makes the next question land.",
    better: `“You said [their number]. What does that cost the team each quarter?”`,
    turnIndex: null,
  });
  add({
    id: "label",
    priority: 5,
    tone: "fix",
    title: "Name the feeling",
    detail: "When the buyer sounds frustrated, saying it out loud builds trust faster than another pitch.",
    better: `“It sounds like that's been frustrating, ${name}. What has it cost you so far?”`,
    turnIndex: null,
  });
  add({
    id: "open",
    priority: 4,
    tone: "fix",
    title: "Open warmly",
    detail: "The first five seconds set the buyer's mood for the rest of the call.",
    better: `“Hi ${name}, thanks for picking up. I’ll be brief, can I ask one question?”`,
    turnIndex: null,
  });

  // Specific findings first; generic coaching only tops the list up to three.
  const ranked = out.sort((a, b) => b.priority - a.priority);
  const specific = ranked.filter((t) => t.priority >= 25);
  const list = specific.length >= 3 ? specific.slice(0, 5) : ranked.slice(0, 3);
  return list.map(({ priority: _p, ...t }) => t);
}
