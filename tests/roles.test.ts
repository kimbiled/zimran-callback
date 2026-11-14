import { describe, expect, it } from "vitest";
import { applyRole, callTypeLine, parseRole } from "@/lib/roles";
import { stripeMode } from "@/lib/plans";
import { buildBrief } from "@/lib/voice/brief";
import { personaCard } from "@/lib/ai/prompts";
import { PERSONAS } from "@/lib/personas";
import { heuristicCriteria, heuristicJudge } from "@/lib/ai/heuristics";

const jessica = PERSONAS[0];

describe("interview roles", () => {
  it("SDR keeps the cold call as is", () => {
    const p = applyRole(jessica, "sdr");
    expect(p.role).toBe("sdr");
    expect(p.openingLine).toBe(jessica.openingLine);
    expect(buildBrief(p)).toContain("cold-calling you");
  });

  it("AE turns it into a scheduled discovery call", () => {
    const p = applyRole(jessica, "ae");
    expect(p.openingLine).toContain("25 minutes");
    expect(p.successStep).toMatch(/demo|pilot/);
    expect(p.meetingTriggers[0]).toBe(jessica.meetingTriggers[0]);
    expect(buildBrief(p)).toContain("discovery call you agreed to");
    expect(buildBrief(p)).not.toContain("cold-calling you");
    // the hidden pains and objections stay the same
    expect(p.pains).toEqual(jessica.pains);
    expect(p.objections).toEqual(jessica.objections);
  });

  it("the judge sees the call type", () => {
    expect(personaCard(applyRole(jessica, "ae"))).toContain(callTypeLine("ae"));
    expect(personaCard(jessica)).toContain(callTypeLine("sdr"));
  });

  it("unknown roles fall back to SDR", () => {
    expect(parseRole("ae")).toBe("ae");
    expect(parseRole("cfo")).toBe("sdr");
    expect(parseRole(undefined)).toBe("sdr");
  });

  it("does not confuse an AE greeting or discovery duration with a proposed next step", () => {
    const persona = applyRole(jessica, "ae");
    const greeting = { role: "rep" as const, text: "Thanks for meeting today. How do you onboard new staff?", start: 1, end: 6 };
    expect(heuristicJudge(persona, [greeting], []).event).toBe("pain_uncovered");
    const agenda = { ...greeting, text: "Thanks for meeting today. What would you like to cover?" };
    expect(heuristicJudge(persona, [agenda], []).delta).toBeGreaterThanOrEqual(0);
    const duration = { ...greeting, text: "How many minutes do you spend onboarding each person?" };
    expect(heuristicJudge(persona, [duration], [persona.pains[0].id]).event).not.toBe("next_step");
    const criteria = heuristicCriteria(persona, [greeting]);
    expect(criteria.find(c => c.id === "next_step")!.score).toBe(0);
    expect(criteria.find(c => c.id === "opening")!.better).toContain("agenda");
    const proposal = { ...greeting, text: "Could we book a tailored demo on Thursday at 11?" };
    expect(heuristicJudge(persona, [proposal], [persona.pains[0].id]).event).toBe("next_step");
  });
});

describe("Stripe mode", () => {
  it("accepts only test keys", () => {
    expect(stripeMode(undefined)).toBe("demo");
    expect(stripeMode("")).toBe("demo");
    expect(stripeMode("sk_test_abc")).toBe("test");
    expect(stripeMode("rk_test_abc")).toBe("test");
    expect(stripeMode("sk_live_abc")).toBe("live-blocked");
  });
});
