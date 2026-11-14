import { describe, expect, it } from "vitest";
import { applyRole, callTypeLine, parseRole } from "@/lib/roles";
import { stripeMode } from "@/lib/plans";
import { buildBrief } from "@/lib/voice/brief";
import { personaCard } from "@/lib/ai/prompts";
import { PERSONAS } from "@/lib/personas";

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
