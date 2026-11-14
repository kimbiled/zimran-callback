import { describe, expect, it } from "vitest";
import {
  addDays,
  buildPlan,
  daysBetween,
  isYmd,
  planLength,
  rampLevel,
  rankSkills,
  startLevel,
  type PlanBuyer,
  type PlanCall,
  type PlanSkill,
} from "@/lib/plan7";
import { OBJECTIONS } from "@/lib/objections";
import { PERSONAS } from "@/lib/personas";

const TODAY = "2026-11-14";
const LEVEL = { easy: 0, medium: 1, hard: 2 } as const;

const buyer = (id: string, difficulty: PlanBuyer["difficulty"], segment: string, themes: string[]): PlanBuyer => ({
  id,
  firstName: id[0].toUpperCase() + id.slice(1),
  name: id,
  company: `${id} Co`,
  difficulty,
  segment,
  objections: themes.map((theme, i) => ({ id: `${id}.o${i}`, text: `${id} objection ${i}`, theme })),
});

const ROSTER: PlanBuyer[] = [
  { ...buyer("jessica-hr", "easy", "software", ["brush_off", "status_quo", "timing"]) },
  buyer("dana", "easy", "insurance", ["status_quo", "trust", "brush_off"]),
  buyer("tony", "easy", "consumer", ["burned", "price", "timing"]),
  buyer("mike", "medium", "software", ["status_quo", "burned", "price"]),
  buyer("greg", "medium", "insurance", ["price", "status_quo", "brush_off", "authority"]),
  buyer("priya", "medium", "benefits", ["status_quo", "timing", "trust"]),
  buyer("linda", "hard", "software", ["price", "burned", "price"]),
  buyer("walt", "hard", "insurance", ["trust", "trust", "authority", "trust"]),
  buyer("nina", "hard", "small-business", ["status_quo", "status_quo", "timing", "trust"]),
];

const call = (criteria: Partial<Record<PlanSkill, number>>, total = 40, personaId?: string): PlanCall => ({
  personaId,
  total,
  startedAt: "2026-11-10T15:00:00Z",
  criteria,
});

describe("plan7 date math", () => {
  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2026-11-14", 1)).toBe("2026-11-15");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US DST ends Nov 1, 2026
    expect(addDays("2026-03-08", 6)).toBe("2026-03-14");
  });
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-11-14", "2026-11-19")).toBe(5);
    expect(daysBetween("2026-11-14", "2026-11-14")).toBe(0);
    expect(daysBetween("2026-11-14", "2026-11-10")).toBe(-4);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
  it("validates dates", () => {
    expect(isYmd("2026-11-14")).toBe(true);
    expect(isYmd("2026-13-40")).toBe(false);
    expect(isYmd("11/14/2026")).toBe(false);
    expect(isYmd(null)).toBe(false);
  });
  it("plans until the interview, capped at 7 days", () => {
    expect(planLength(TODAY, null)).toBe(7);
    expect(planLength(TODAY, "2026-11-19")).toBe(5);
    expect(planLength(TODAY, "2026-11-15")).toBe(1);
    expect(planLength(TODAY, TODAY)).toBe(1);
    expect(planLength(TODAY, "2026-12-30")).toBe(7);
    expect(planLength(TODAY, "2026-11-01")).toBe(7); // passed: fall back to a full week
    expect(planLength(TODAY, "garbage")).toBe(7);
  });
  it("reports days left only for a future or same-day interview", () => {
    expect(buildPlan({ calls: [], buyers: ROSTER, today: TODAY, interviewDate: "2026-11-19" }).daysLeft).toBe(5);
    expect(buildPlan({ calls: [], buyers: ROSTER, today: TODAY, interviewDate: TODAY }).daysLeft).toBe(0);
    expect(buildPlan({ calls: [], buyers: ROSTER, today: TODAY, interviewDate: "2026-11-01" }).daysLeft).toBeNull();
    expect(buildPlan({ calls: [], buyers: ROSTER, today: TODAY }).daysLeft).toBeNull();
  });
});

describe("plan7 ordering and difficulty ramp", () => {
  it("lists consecutive days starting today", () => {
    const plan = buildPlan({ calls: [], buyers: ROSTER, today: "2026-12-29" });
    expect(plan.days.map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.days.map((d) => d.date)).toEqual(["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04"]);
  });
  it("starts a brand-new user with Jessica and a generic plan that ramps easy → hard", () => {
    const plan = buildPlan({ calls: [], buyers: ROSTER, today: TODAY });
    expect(plan.generic).toBe(true);
    expect(plan.days[0].buyer.id).toBe("jessica-hr");
    expect(plan.days[0].callHref).toBe("/call/jessica-hr?role=sdr");
    const levels = plan.days.map((d) => LEVEL[d.buyer.difficulty]);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(levels[0]).toBe(0);
    expect(levels.at(-1)).toBe(2);
    expect(plan.days[0].focus.id).toBe("discovery");
  });
  it("never repeats a buyer within the week when the roster allows it", () => {
    const plan = buildPlan({ calls: [], buyers: ROSTER, today: TODAY });
    expect(new Set(plan.days.map((d) => d.buyer.id)).size).toBe(7);
  });
  it("avoids the same market two days in a row when an alternative exists", () => {
    const plan = buildPlan({ calls: [], buyers: ROSTER, today: TODAY });
    for (let i = 1; i < plan.days.length; i++) {
      const a = ROSTER.find((b) => b.id === plan.days[i - 1].buyer.id)!;
      const b = ROSTER.find((x) => x.id === plan.days[i].buyer.id)!;
      if (a.difficulty === b.difficulty) expect(a.segment).not.toBe(b.segment);
    }
  });
  it("starts higher for strong recent scores and still never ramps down", () => {
    expect(startLevel([])).toBe(0);
    expect(startLevel([call({}, 30), call({}, 40)])).toBe(0);
    expect(startLevel([call({}, 55), call({}, 60)])).toBe(1);
    expect(startLevel([call({}, 20), call({}, 80), call({}, 85), call({}, 90)])).toBe(2); // last 3 only
    const plan = buildPlan({ calls: [call({ discovery: 15 }, 60)], buyers: ROSTER, today: TODAY });
    expect(plan.days[0].buyer.difficulty).toBe("medium");
    expect(plan.days.at(-1)!.buyer.difficulty).toBe("hard");
  });
  it("compresses the ramp into a short runway", () => {
    expect([0, 1, 2].map((i) => rampLevel(0, i, 3))).toEqual([0, 1, 2]);
    expect(rampLevel(0, 0, 1)).toBe(0);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => rampLevel(0, i, 7))).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect([0, 1, 2, 3].map((i) => rampLevel(2, i, 4))).toEqual([2, 2, 2, 2]);
    const plan = buildPlan({ calls: [], buyers: ROSTER, today: TODAY, interviewDate: "2026-11-17" });
    expect(plan.days).toHaveLength(3);
    expect(plan.days.map((d) => d.buyer.difficulty)).toEqual(["easy", "medium", "hard"]);
  });
});

describe("plan7 weakest-skill focus", () => {
  const calls = [
    call({ opening: 16, discovery: 12, objections: 3, value: 10, next_step: 8 }, 49, "jessica-hr"),
    call({ opening: 18, discovery: 14, objections: 5, value: 9, next_step: 6 }, 52, "dana"),
  ];
  it("ranks skills weakest first from criteria averages", () => {
    expect(rankSkills(calls)).toEqual(["objections", "next_step", "value", "discovery", "opening"]);
  });
  it("treats never-scored skills as weakest and breaks ties in a fixed order", () => {
    expect(rankSkills([call({ opening: 10, discovery: 10, objections: 10, value: 10 })])[0]).toBe("next_step");
    expect(rankSkills([])).toEqual(["discovery", "objections", "next_step", "value", "opening"]);
  });
  it("opens on the weakest skill and gives it the most days", () => {
    const plan = buildPlan({ calls, buyers: ROSTER, today: TODAY });
    expect(plan.generic).toBe(false);
    expect(plan.days[0].focus.id).toBe("objections");
    const counts = new Map<string, number>();
    for (const d of plan.days) counts.set(d.focus.id, (counts.get(d.focus.id) ?? 0) + 1);
    expect(counts.get("objections")).toBe(3);
    expect(Math.max(...counts.values())).toBe(3);
    expect(counts.has("opening")).toBe(false); // the strongest skill gets no day in a 7-day plan
  });
  it("matches the drill to the focus skill and prefers buyers not called yet", () => {
    const plan = buildPlan({ calls, buyers: ROSTER, today: TODAY });
    expect(plan.days[0].buyer.id).not.toBe("jessica-hr");
    expect(plan.days[0].buyer.id).not.toBe("dana");
    const day0 = ROSTER.find((b) => b.id === plan.days[0].buyer.id)!;
    expect(day0.objections.find((o) => o.id === plan.days[0].drill!.id)?.theme).toBe("trust");
    for (const d of plan.days) expect(d.drill?.href).toBe(`/drill?o=${encodeURIComponent(d.drill!.id)}`);
    expect(new Set(plan.days.map((d) => d.drill!.id)).size).toBe(plan.days.length);
  });
  it("is pure: same input, same plan", () => {
    const a = buildPlan({ calls, buyers: ROSTER, today: TODAY, interviewDate: "2026-11-20" });
    const b = buildPlan({ calls, buyers: ROSTER, today: TODAY, interviewDate: "2026-11-20" });
    expect(a).toEqual(b);
  });
  it("works on the real buyer roster", () => {
    const roster: PlanBuyer[] = PERSONAS.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      name: p.name,
      company: p.company,
      difficulty: p.difficulty,
      segment: "any",
      objections: OBJECTIONS.filter((o) => o.personaId === p.id).map((o) => ({ id: o.id, text: o.text, theme: o.theme })),
    }));
    const plan = buildPlan({ calls: [], buyers: roster, today: TODAY });
    expect(plan.days[0].buyer.id).toBe("jessica-hr");
    expect(plan.days).toHaveLength(7);
    for (const d of plan.days) expect(OBJECTIONS.some((o) => o.id === d.drill?.id)).toBe(true);
  });
  it("returns no days without a roster instead of throwing", () => {
    expect(buildPlan({ calls: [], buyers: [], today: TODAY }).days).toEqual([]);
  });
});
