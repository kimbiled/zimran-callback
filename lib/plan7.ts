// Interview sprint plan: up to 7 days (or until the interview), one buyer call, one focus
// skill and one 60-second drill per day. Pure and client-safe: the buyer roster comes in
// as data (from /api/progress), so no hidden buyer profiles reach the browser.

export type PlanSkill = "opening" | "discovery" | "objections" | "value" | "next_step";
export type PlanDifficulty = "easy" | "medium" | "hard";

export type PlanBuyer = {
  id: string;
  firstName: string;
  name: string;
  company: string;
  difficulty: PlanDifficulty;
  /** Market the buyer sits in; consecutive days avoid repeating it. */
  segment: string;
  objections: { id: string; text: string; theme: string }[];
};

export type PlanCall = {
  personaId?: string;
  total: number | null;
  startedAt: string;
  criteria: Partial<Record<PlanSkill, number>>;
};

export type PlanDay = {
  /** 0 = today */
  index: number;
  /** YYYY-MM-DD */
  date: string;
  buyer: { id: string; firstName: string; name: string; company: string; difficulty: PlanDifficulty };
  callHref: string;
  focus: { id: PlanSkill; title: string; tip: string };
  drill: { id: string; text: string; href: string } | null;
};

export type Plan7 = {
  days: PlanDay[];
  /** Skills from weakest to strongest (fixed order when there are no calls yet). */
  weakest: PlanSkill[];
  /** Days until the interview, null when no date is set (or it already passed). */
  daysLeft: number | null;
  generic: boolean;
};

export const SKILL_INFO: Record<PlanSkill, { title: string; tip: string; drillTheme: string }> = {
  opening: { title: "Opening", tip: "Name, reason for the call, one question. Earn the next 30 seconds.", drillTheme: "timing" },
  discovery: { title: "Discovery", tip: "Open questions until you hear a number: hours, dollars, people.", drillTheme: "status_quo" },
  objections: { title: "Objections", tip: "Acknowledge, ask what's behind it, then answer on substance.", drillTheme: "trust" },
  value: { title: "Value", tip: "Tie the product to the pain they named, in their numbers.", drillTheme: "price" },
  next_step: { title: "Next step", tip: "Propose a specific day, time and who joins. Don't ask 'are you free sometime?'", drillTheme: "brush_off" },
};

/** Tie-break order when averages are equal, and the order used before any calls. */
export const SKILL_ORDER: PlanSkill[] = ["discovery", "objections", "next_step", "value", "opening"];

const LEVELS: PlanDifficulty[] = ["easy", "medium", "hard"];
export const MAX_PLAN_DAYS = 7;
const FIRST_BUYER = "jessica-hr";
const DAY_MS = 86_400_000;

// ---------- date math (calendar dates as YYYY-MM-DD, no time zones involved) ----------

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** The user's local calendar date. */
export function localYmd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Plan length: until the interview (the day before it, at least today), capped at 7. */
export function planLength(today: string, interview: string | null | undefined): number {
  if (!isYmd(interview)) return MAX_PLAN_DAYS;
  const left = daysBetween(today, interview);
  if (left < 0) return MAX_PLAN_DAYS;
  return Math.min(MAX_PLAN_DAYS, Math.max(1, left));
}

// ---------- skills ----------

export function skillAverages(calls: PlanCall[]): Partial<Record<PlanSkill, number>> {
  const out: Partial<Record<PlanSkill, number>> = {};
  for (const id of SKILL_ORDER) {
    const xs = calls.map((c) => c.criteria[id]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (xs.length) out[id] = xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  return out;
}

/** Weakest first; skills never scored count as weakest; ties follow SKILL_ORDER. */
export function rankSkills(calls: PlanCall[]): PlanSkill[] {
  const avg = skillAverages(calls);
  return [...SKILL_ORDER].sort((a, b) => (avg[a] ?? -1) - (avg[b] ?? -1) || SKILL_ORDER.indexOf(a) - SKILL_ORDER.indexOf(b));
}

/** Weakest skill gets the most days: w1 w2 w1 w3 w2 w1 w4. */
const FOCUS_PATTERN = [0, 1, 0, 2, 1, 0, 3];

// ---------- difficulty ramp ----------

/** Where to start: recent average under 45 → easy, under 70 → medium, else hard. */
export function startLevel(calls: PlanCall[]): number {
  const recent = calls.filter((c) => typeof c.total === "number").slice(-3);
  if (!recent.length) return 0;
  const avg = recent.reduce((a, c) => a + (c.total ?? 0), 0) / recent.length;
  return avg < 45 ? 0 : avg < 70 ? 1 : 2;
}

/** Non-decreasing ramp from the start level to hard across n days. */
export function rampLevel(start: number, i: number, n: number): number {
  const steps = LEVELS.length - start; // number of levels still ahead, including the start
  return Math.min(LEVELS.length - 1, start + Math.floor((i * steps) / Math.max(1, n)));
}

// ---------- the plan ----------

export function buildPlan(input: {
  calls: PlanCall[];
  buyers: PlanBuyer[];
  today: string;
  interviewDate?: string | null;
}): Plan7 {
  const { calls, buyers, today } = input;
  const done = calls.filter((c) => typeof c.total === "number");
  const generic = done.length === 0;
  const n = planLength(today, input.interviewDate);
  const left = isYmd(input.interviewDate) ? daysBetween(today, input.interviewDate) : null;
  const weakest = rankSkills(done);
  const start = startLevel(done);
  const called = new Set(done.map((c) => c.personaId).filter(Boolean));
  const used = new Set<string>();
  const usedDrills = new Set<string>();
  const days: PlanDay[] = [];
  let prevSegment = "";

  for (let i = 0; i < n && buyers.length; i++) {
    const focusId = weakest[FOCUS_PATTERN[i % FOCUS_PATTERN.length]] ?? weakest[0];
    const level = LEVELS[rampLevel(start, i, n)];
    const buyer =
      (i === 0 && generic ? buyers.find((b) => b.id === FIRST_BUYER) : undefined) ??
      pickBuyer(buyers, level, { used, called, prevSegment, theme: SKILL_INFO[focusId].drillTheme });
    used.add(buyer.id);
    prevSegment = buyer.segment;

    const drill = pickDrill(buyer, buyers, SKILL_INFO[focusId].drillTheme, usedDrills);
    if (drill) usedDrills.add(drill.id);

    days.push({
      index: i,
      date: addDays(today, i),
      buyer: { id: buyer.id, firstName: buyer.firstName, name: buyer.name, company: buyer.company, difficulty: buyer.difficulty },
      callHref: `/call/${buyer.id}?role=sdr`,
      focus: { id: focusId, title: SKILL_INFO[focusId].title, tip: SKILL_INFO[focusId].tip },
      drill: drill ? { id: drill.id, text: drill.text, href: `/drill?o=${encodeURIComponent(drill.id)}` } : null,
    });
  }
  return { days, weakest, daysLeft: left !== null && left >= 0 ? left : null, generic };
}

function pickBuyer(
  buyers: PlanBuyer[],
  level: PlanDifficulty,
  ctx: { used: Set<string>; called: Set<string | undefined>; prevSegment: string; theme: string },
): PlanBuyer {
  const rank = (b: PlanBuyer) =>
    // Lower is better: right level first, then fresh buyers, then a new segment, then a matching objection.
    (b.difficulty === level ? 0 : 1000 + Math.abs(LEVELS.indexOf(b.difficulty) - LEVELS.indexOf(level)) * 100) +
    (ctx.used.has(b.id) ? 50 : 0) +
    (ctx.called.has(b.id) ? 20 : 0) +
    (b.segment === ctx.prevSegment ? 5 : 0) +
    (b.objections.some((o) => o.theme === ctx.theme) ? 0 : 2);
  return [...buyers].sort((a, b) => rank(a) - rank(b) || buyers.indexOf(a) - buyers.indexOf(b))[0];
}

function pickDrill(buyer: PlanBuyer, buyers: PlanBuyer[], theme: string, usedDrills: Set<string>) {
  const fresh = (o: { id: string }) => !usedDrills.has(o.id);
  return (
    buyer.objections.find((o) => o.theme === theme && fresh(o)) ??
    buyer.objections.find(fresh) ??
    buyers.flatMap((b) => b.objections).find((o) => o.theme === theme && fresh(o)) ??
    buyer.objections[0] ??
    null
  );
}
