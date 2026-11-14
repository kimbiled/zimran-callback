import { describe, expect, it } from "vitest";
import {
  OBJECTIONS,
  THEME_ORDER,
  THEMES,
  classifyObjection,
  dailyObjection,
  drillScore,
  getObjection,
  hasHandwrittenLine,
  objectionId,
  objectionsFor,
} from "@/lib/objections";
import { PERSONAS } from "@/lib/personas";
import type { Persona } from "@/lib/types";

describe("objection library", () => {
  it("gathers every objection from every ready-made buyer", () => {
    expect(PERSONAS).toHaveLength(13);
    expect(OBJECTIONS).toHaveLength(PERSONAS.reduce((n, p) => n + p.objections.length, 0));
    expect(new Set(OBJECTIONS.map((o) => o.personaId)).size).toBe(13);
  });
  it("has a hand-written line and a known theme for each built-in objection", () => {
    for (const p of PERSONAS) for (const text of p.objections) expect(hasHandwrittenLine(text), text).toBe(true);
    for (const o of OBJECTIONS) {
      expect(THEME_ORDER).toContain(o.theme);
      expect(o.say.length).toBeGreaterThan(20);
      expect(o.say.length).toBeLessThan(220);
    }
    // Every theme in the filter has at least one objection.
    for (const t of THEME_ORDER) expect(OBJECTIONS.some((o) => o.theme === t), THEMES[t].label).toBe(true);
  });
  it("uses unique, URL-safe ids", () => {
    const ids = OBJECTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
      expect(encodeURIComponent(id)).toBe(id);
    }
  });
  it("keeps ids stable (links in the plan and the library depend on them)", () => {
    expect(objectionId("jessica-hr", "Just send me an email and I'll take a look.")).toBe("jessica-hr.just-send-me-an-email-and");
    expect(objectionId("nina-dental-cyber", "How do I know you're not the scam?")).toBe("nina-dental-cyber.how-do-i-know-youre-not");
    expect(objectionId("mike-sales", "We already have Salesforce.")).toBe("mike-sales.we-already-have-salesforce");
    expect(objectionId("walt-medicare", "How’d you get my number?")).toBe(objectionId("walt-medicare", "How'd you get my number?"));
    expect(getObjection("jessica-hr.just-send-me-an-email-and")?.firstName).toBe("Jessica");
    expect(getObjection("nope")).toBeUndefined();
    expect(getObjection(undefined)).toBeUndefined();
  });
  it("falls back to a pattern line for objections without a hand-written one", () => {
    const custom = { ...PERSONAS[0], id: "custom-x", objections: ["We don't have budget for this right now.", "Just email me the details."] } as Persona;
    const [a, b] = objectionsFor(custom);
    expect(a.theme).toBe("price");
    expect(b.theme).toBe("brush_off");
    expect(a.say).toContain("costing");
  });
  it("classifies common objection types", () => {
    expect(classifyObjection("Is this a scam?")).toBe("trust");
    expect(classifyObjection("Can you send me a brochure?")).toBe("brush_off");
    expect(classifyObjection("That's way too expensive.")).toBe("price");
    expect(classifyObjection("Call me next quarter.")).toBe("timing");
    expect(classifyObjection("We already use HubSpot.")).toBe("status_quo");
    expect(classifyObjection("We tried that and it failed.")).toBe("burned");
  });
});

describe("daily objection", () => {
  it("is the same all UTC day and changes at UTC midnight", () => {
    const a = dailyObjection(new Date("2026-11-14T00:00:01Z"));
    expect(dailyObjection(new Date("2026-11-14T23:59:59Z")).id).toBe(a.id);
    expect(dailyObjection(new Date("2026-11-15T00:00:00Z")).id).not.toBe(a.id);
  });
  it("cycles through every objection before repeating, hopping between buyers", () => {
    const n = OBJECTIONS.length;
    const ids: string[] = [];
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < n; d++) ids.push(dailyObjection(new Date(start + d * 86_400_000)).id);
    expect(new Set(ids).size).toBe(n);
    for (let d = 1; d < n; d++) expect(ids[d].split(".")[0], `day ${d}`).not.toBe(ids[d - 1].split(".")[0]);
  });
});

describe("drill score", () => {
  it("maps judge deltas to 0–100 and rewards acknowledging and asking", () => {
    const good = drillScore(8, "That's fair, I hear that a lot. Can I ask what you'd want the email to answer?");
    const flat = drillScore(0, "Okay I will send you an email with the information then.");
    const bad = drillScore(-10, "Our platform is the industry leading solution with great features for you.");
    expect(good).toBeGreaterThan(75);
    expect(flat).toBeGreaterThanOrEqual(40);
    expect(flat).toBeLessThan(good);
    expect(bad).toBeLessThan(40);
    for (const d of [-25, 0, 25]) {
      const s = drillScore(d, "That makes sense? Totally fair? Can I ask why?");
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
  it("caps throwaway answers", () => {
    expect(drillScore(25, "ok")).toBeLessThanOrEqual(15);
    expect(drillScore(0, "")).toBe(0);
  });
});
