import { describe, expect, it } from "vitest";
import {
  classifyResponse,
  countPhrases,
  emotionalDebrief,
  HEDGES,
  mirrors,
  moodFor,
  MOOD_ORDER,
  objectionKind,
  stripHedges,
  type SignalId,
} from "@/lib/emotion";
import { sampleCall } from "@/lib/sample";
import type { Criterion, Turn } from "@/lib/types";

const buyer = (start: number, text: string): Turn => ({ role: "buyer", text, start, end: start + 3 });
const rep = (start: number, text: string, delta?: number, score?: number, reason?: string): Turn => ({
  role: "rep",
  text,
  start,
  end: start + 5,
  ...(delta !== undefined ? { delta, score, reason } : {}),
});
const signal = (d: ReturnType<typeof emotionalDebrief>, id: SignalId) => d.signals.find((s) => s.id === id)!;

describe("moodFor", () => {
  it("maps interest bands to the seven moods, inclusive at the documented edges", () => {
    expect(moodFor(-100)).toBe("hostile");
    expect(moodFor(-51)).toBe("hostile");
    expect(moodFor(-50)).toBe("annoyed");
    expect(moodFor(-26)).toBe("annoyed");
    expect(moodFor(-25)).toBe("guarded");
    expect(moodFor(-6)).toBe("guarded");
    expect(moodFor(-5)).toBe("neutral");
    expect(moodFor(10)).toBe("neutral");
    expect(moodFor(11)).toBe("curious");
    expect(moodFor(30)).toBe("curious");
    expect(moodFor(31)).toBe("interested");
    expect(moodFor(50)).toBe("interested");
    expect(moodFor(51)).toBe("warm");
    expect(moodFor(100)).toBe("warm");
  });
  it("is monotonic over the whole scale", () => {
    let last = 0;
    for (let s = -100; s <= 100; s++) {
      const rank = MOOD_ORDER.indexOf(moodFor(s));
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
  });
});

describe("phrase helpers", () => {
  it("counts whole-word phrases case-insensitively, including curly apostrophes", () => {
    const found = countPhrases("I THINK we could just help. I’m not sure, but justice matters. Maybe.", HEDGES);
    const map = Object.fromEntries(found.map((p) => [p.phrase, p.count]));
    expect(map).toEqual({ "i think": 1, just: 1, "i'm not sure": 1, maybe: 1 });
  });
  it("strips hedges into a direct sentence", () => {
    expect(stripHedges("I just think maybe we could help your team.")).toBe("We could help your team.");
    expect(stripHedges("To be honest, it's kind of a big deal.")).toBe("It's a big deal.");
  });
  it("detects objection kinds from buyer lines", () => {
    expect(objectionKind("What does it cost? Probably too much.")).toBe("price");
    expect(objectionKind("We already have Salesforce.")).toBe("incumbent");
    expect(objectionKind("Not interested, thanks.")).toBe("brushoff");
    expect(objectionKind("I've got to run to my meeting.")).toBe("time");
    expect(objectionKind("Just send me an email.")).toBe("email");
    expect(objectionKind("How did you get my number?")).toBe("skeptic");
    expect(objectionKind("We hit eighty-two percent last quarter.")).toBeNull();
  });
  it("classifies responses to pushback", () => {
    expect(classifyResponse("Makes sense, most teams do. What share of calls get logged?")).toBe("acknowledged");
    expect(classifyResponse("Um, well, it kind of depends on the plan, it varies.")).toBe("dodged");
    expect(classifyResponse("But our platform is much better than Salesforce.")).toBe("argued");
    expect(classifyResponse("We offer the best analytics on the market with a discount.")).toBe("pitched");
    expect(classifyResponse("Fair enough, but our product does more.")).toBe("argued");
    expect(classifyResponse("What would you need to see?")).toBe("explored");
    expect(classifyResponse("Okay.")).toBe("neutral");
  });
  it("spots mirroring of numbers and distinctive words", () => {
    expect(mirrors("We hit eighty-two percent last quarter.", "Eighty-two percent is real money.")).toBe(true);
    expect(mirrors("We already have Salesforce.", "What do reps log in Salesforce?")).toBe(true);
    expect(mirrors("We already have Salesforce.", "How do you onboard staff?")).toBe(false);
  });
});

describe("emotionalDebrief on the sample call", () => {
  const call = sampleCall();
  const d = emotionalDebrief({
    turns: call.turns,
    firstName: call.persona.firstName,
    mode: call.mode,
    initialScore: call.debrief!.scoreTimeline[0].score,
    criteria: call.debrief!.criteria,
  });

  it("builds the mood arc from the saved scores with timestamps and turn links", () => {
    const repScored = call.turns.filter((t) => t.role === "rep");
    expect(d.arc).toHaveLength(repScored.length + 1);
    expect(d.arc[0]).toMatchObject({ t: 0, score: 0, mood: "neutral", turnIndex: null });
    expect(d.arc[2]).toMatchObject({ t: 21, score: -7, mood: "guarded", turnIndex: 3, delta: -12 });
    expect(d.arc.at(-1)).toMatchObject({ score: 47, mood: "interested" });
    for (const p of d.arc.slice(1)) expect(call.turns[p.turnIndex!].role).toBe("rep");
  });

  it("picks 2–3 swings, chronological, including the biggest rise and the biggest drop with their cause", () => {
    expect(d.swings.length).toBeGreaterThanOrEqual(2);
    expect(d.swings.length).toBeLessThanOrEqual(3);
    expect(d.swings.map((s) => s.t)).toEqual([...d.swings.map((s) => s.t)].sort((a, b) => a - b));
    const drop = d.swings.find((s) => s.direction === "down")!;
    expect(drop).toMatchObject({ turnIndex: 3, delta: -12, from: "neutral", to: "guarded", reason: "Pitching before learning the buyer's problems." });
    expect(drop.reaction).toBe("We already have Salesforce. We're good.");
    const rise = d.swings.find((s) => s.delta === 18)!;
    expect(rise.quote).toContain("quarterly forecast");
    expect(rise.from).toBe("neutral");
    expect(rise.to).toBe("curious");
  });

  it("detects the objections and how they were handled", () => {
    const kinds = d.objections.map((o) => `${o.kind}:${o.response}`);
    expect(kinds).toContain("incumbent:acknowledged");
    expect(kinds).toContain("price:dodged");
    expect(kinds).toContain("time:acknowledged");
  });

  it("scores five signals in 0–100 with explanations", () => {
    expect(d.signals.map((s) => s.id)).toEqual(["confidence", "empathy", "warmth", "composure", "energy"]);
    for (const s of d.signals) {
      expect(s.score).not.toBeNull();
      expect(s.score!).toBeGreaterThanOrEqual(0);
      expect(s.score!).toBeLessThanOrEqual(100);
      expect(s.note.length).toBeGreaterThan(10);
    }
    expect(signal(d, "confidence").note).toContain("kind of");
    expect(signal(d, "composure").note).toMatch(/3 of 4 objections/);
  });

  it("produces 3–5 takeaways, each with a concrete better line, fixes first", () => {
    expect(d.takeaways.length).toBeGreaterThanOrEqual(3);
    expect(d.takeaways.length).toBeLessThanOrEqual(5);
    for (const t of d.takeaways) expect(t.better.length).toBeGreaterThan(15);
    expect(d.takeaways[0]).toMatchObject({ id: "objection", tone: "fix", turnIndex: 13 });
    expect(d.takeaways[0].title).toBe("You dodged Mike's price question");
    // Uses the debrief's own coaching line for that exact quote.
    expect(d.takeaways[0].better).toContain("$2,000 a month");
    const firstKeep = d.takeaways.findIndex((t) => t.tone === "keep");
    if (firstKeep >= 0) expect(d.takeaways.slice(firstKeep).every((t) => t.tone === "keep")).toBe(true);
  });
});

describe("emotionalDebrief signals", () => {
  it("penalizes hedges and apologies and suggests a de-hedged line", () => {
    const turns: Turn[] = [
      buyer(0, "Hello?"),
      rep(4, "Sorry to bother you, I just think maybe we could kind of help your team, to be honest.", -10, -10, "Apologetic and vague."),
      buyer(10, "Okay."),
      rep(14, "I guess I was wondering if that's okay to ask, sorry.", -5, -15, "Still hedging."),
    ];
    const d = emotionalDebrief({ turns, firstName: "Linda" });
    expect(d.stats.apologies).toBe(2);
    expect(d.stats.hedges).toBeGreaterThanOrEqual(6);
    expect(signal(d, "confidence").score!).toBeLessThan(40);
    const hedges = d.takeaways.find((t) => t.id === "hedges")!;
    expect(hedges.better).toMatch(/^Say it straight: “/);
    expect(hedges.better).not.toMatch(/\b(just|maybe|i think|kind of)\b/i);
    expect(d.takeaways.some((t) => t.id === "apology")).toBe(true);
  });

  it("rewards acknowledgements, mirroring, the buyer's name and thanks", () => {
    const cold: Turn[] = [buyer(0, "We spend forty hours a month on reports."), rep(4, "Our tool automates reports.", 0, 0)];
    const warm: Turn[] = [
      buyer(0, "We spend forty hours a month on reports."),
      rep(4, "Hi Linda, thanks for sharing that. That makes sense, forty hours is a lot. What does it cost you?", 8, 8),
    ];
    const a = emotionalDebrief({ turns: cold, firstName: "Linda" });
    const b = emotionalDebrief({ turns: warm, firstName: "Linda" });
    expect(b.stats).toMatchObject({ acknowledgements: 1, mirrors: 1, nameUses: 1, thanks: 1 });
    expect(signal(b, "empathy").score!).toBeGreaterThan(signal(a, "empathy").score!);
    expect(signal(b, "warmth").score!).toBeGreaterThan(signal(a, "warmth").score!);
    expect(a.takeaways.some((t) => t.id === "name")).toBe(true);
    expect(b.takeaways.some((t) => t.id === "name")).toBe(false);
  });

  it("flags overusing the buyer's name", () => {
    const turns: Turn[] = [buyer(0, "Hi."), rep(3, "Linda, Linda, great to talk, Linda. Linda, Linda, quick one.")];
    expect(signal(emotionalDebrief({ turns, firstName: "Linda" }), "warmth").note).toContain("too often");
  });

  it("composure is n/a without objections and low when the rep argues or pitches", () => {
    const calm = emotionalDebrief({ turns: [buyer(0, "Hello, this is Linda."), rep(3, "Hi Linda, how do you close the books today?")], firstName: "Linda" });
    expect(signal(calm, "composure").score).toBeNull();
    const heated = emotionalDebrief({
      turns: [
        buyer(0, "We already have a vendor for this."),
        rep(4, "But our platform is far better, you're wrong about them.", -15, -15, "Argued."),
        buyer(10, "Not interested."),
        rep(14, "We offer industry-leading features and a discount.", -10, -25, "Pitched."),
      ],
      firstName: "Linda",
    });
    expect(signal(heated, "composure").score!).toBeLessThan(15);
    expect(heated.takeaways[0]).toMatchObject({ id: "objection", tone: "fix", turnIndex: 1 });
    expect(heated.takeaways[0].better).toContain("Linda");
  });

  it("energy uses upbeat words and pace, and is pace-neutral on text calls", () => {
    const turns: Turn[] = [buyer(0, "Hello?"), rep(3, "Great to catch you! Absolutely love what your team is doing!", 3, 3)];
    const voice = emotionalDebrief({ turns, firstName: "Sam", mode: "voice" });
    const text = emotionalDebrief({ turns, firstName: "Sam", mode: "text" });
    expect(voice.stats.exclamations).toBe(2);
    expect(voice.stats.upbeat).toBeGreaterThanOrEqual(3);
    expect(text.stats.wordsPerMinute).toBeNull();
    expect(text.stats.longestPauseSec).toBeNull();
    expect(signal(text, "energy").note).toContain("not measured");
    expect(signal(voice, "energy").score!).toBeGreaterThan(60);
  });

  it("flags long silences before answering on voice calls only", () => {
    const turns: Turn[] = [buyer(0, "What does it cost?"), { role: "rep", text: "It is two thousand a month.", start: 9, end: 12, delta: 2, score: 2 }];
    const voice = emotionalDebrief({ turns, firstName: "Sam", mode: "voice" });
    expect(voice.stats.longestPauseSec).toBe(6);
    expect(voice.takeaways.find((t) => t.id === "pause")).toMatchObject({ turnIndex: 1 });
    expect(emotionalDebrief({ turns, firstName: "Sam", mode: "text" }).takeaways.some((t) => t.id === "pause")).toBe(false);
  });

  it("uses the debrief's coaching line when the swing quote matches a criterion", () => {
    const turns: Turn[] = [buyer(0, "Hello?"), rep(3, "We sell the best software on the market.", -14, -14, "Pitched too early.")];
    const criteria: Criterion[] = [{ id: "opening", title: "Opening", score: 4, quote: "We sell the best software on the market", at: 3, better: "“Hi Sam, can I ask one question first?”" }];
    const d = emotionalDebrief({ turns, firstName: "Sam", criteria });
    const drop = d.takeaways.find((t) => t.id === "drop")!;
    expect(drop.better).toBe("“Hi Sam, can I ask one question first?”");
  });
});

describe("emotionalDebrief edge cases", () => {
  it("handles an empty call with an opening mood, no swings and generic takeaways", () => {
    const d = emotionalDebrief({ turns: [], firstName: "Mike", initialScore: -40 });
    expect(d.arc).toEqual([{ t: 0, score: -40, mood: "annoyed", turnIndex: null, delta: null }]);
    expect(d.swings).toEqual([]);
    expect(d.signals.every((s) => s.score === null)).toBe(true);
    expect(d.takeaways).toHaveLength(3);
    for (const t of d.takeaways) expect(t.better).toBeTruthy();
  });

  it("ignores unscored rep turns in the arc and small deltas as swings", () => {
    const turns: Turn[] = [buyer(0, "Hi."), rep(3, "Hello there.", 2, 2), rep(9, "Unscored line."), buyer(15, "Okay."), rep(19, "Thanks.", -3, -1)];
    const d = emotionalDebrief({ turns, firstName: "Ana" });
    expect(d.arc.map((p) => p.turnIndex)).toEqual([null, 1, 4]);
    expect(d.swings).toEqual([]);
  });

  it("reconstructs scores from deltas when a turn has no saved score", () => {
    const turns: Turn[] = [buyer(0, "Hi."), { role: "rep", text: "Hello.", start: 2, end: 4, delta: 20 }];
    const d = emotionalDebrief({ turns, firstName: "Ana", initialScore: 40 });
    expect(d.arc[1]).toMatchObject({ score: 60, mood: "warm" });
  });

  it("is deterministic", () => {
    const call = sampleCall();
    const args = { turns: call.turns, firstName: "Mike", mode: call.mode, criteria: call.debrief!.criteria };
    expect(emotionalDebrief(args)).toEqual(emotionalDebrief(args));
  });
});
