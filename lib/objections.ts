// Objection library: every objection from every ready-made buyer, with a theme and a
// hand-written "Try saying" line. Server-side (imports the hidden buyer profiles): pages pass
// the public `ObjectionItem` shape down to client components.

import { PERSONAS } from "./personas";
import type { Difficulty, Persona } from "./types";

export type ObjectionTheme = "price" | "timing" | "status_quo" | "brush_off" | "trust" | "burned" | "authority";

export type ObjectionItem = {
  /** Stable, URL-safe: `${personaId}.${slug of the first words}` */
  id: string;
  text: string;
  personaId: string;
  buyer: string;
  firstName: string;
  title: string;
  company: string;
  difficulty: Difficulty;
  theme: ObjectionTheme;
  /** A specific line the rep can say back */
  say: string;
};

export const THEMES: Record<ObjectionTheme, { label: string; pattern: string }> = {
  price: { label: "Price & budget", pattern: "Don't defend the price. Anchor on what the problem costs, then ask." },
  timing: { label: "Timing", pattern: "Respect the clock. Ask one sharp question and earn the next minute." },
  status_quo: { label: "Already covered", pattern: "Never trash the incumbent. Position as an add-on and find the gap." },
  brush_off: { label: "Send me info", pattern: "Agree, then ask one question so what you send is worth reading." },
  trust: { label: "Trust & proof", pattern: "Lower the risk: who you are, what you'll never ask for, then a question." },
  burned: { label: "Tried it before", pattern: "Validate it, then ask what broke last time." },
  authority: { label: "Not my call", pattern: "Welcome the decision-maker and propose a time that includes them." },
};

export const THEME_ORDER: ObjectionTheme[] = ["price", "timing", "status_quo", "brush_off", "trust", "burned", "authority"];

/** Hand-written per objection, keyed by the exact objection text. */
const LINES: Record<string, { theme: ObjectionTheme; say: string }> = {
  // Jessica · VP of People
  "Just send me an email and I'll take a look.": {
    theme: "brush_off",
    say: "Happy to. So I send something useful and not a brochure: how long does it take a new front-desk hire to get fully up to speed today?",
  },
  "We already keep everything in Google Docs.": {
    theme: "status_quo",
    say: "Makes sense, most clinics start there. When a new hire has a question at 7 a.m., how do they find the right doc, and who ends up answering it?",
  },
  "Honestly, bad timing. We're opening two new clinics.": {
    theme: "timing",
    say: "Congrats, that's actually why I called. With that many new hires coming, how many hours a week do your senior staff spend training right now?",
  },
  // Mike · VP of Sales
  "We already have Salesforce.": {
    theme: "status_quo",
    say: "Good, we don't replace it. We sit on top and log the calls your reps skip. How much do you trust what's in Salesforce when you build the forecast?",
  },
  "My reps won't use another tool, trust me.": {
    theme: "burned",
    say: "Fair, and they shouldn't have to. There's nothing to open: calls log themselves. What do reps skip today that hurts your pipeline review most?",
  },
  "What does it cost? Probably too much.": {
    theme: "price",
    say: "Straight answer: it's priced per rep, per month, and I'll give you the number. Whether it's too much depends on one thing: what's a point of quota attainment worth to you?",
  },
  // Linda · CFO
  "Our budget is frozen until next year.": {
    theme: "price",
    say: "Understood, I'm not asking for budget this year. If we could show payback inside two quarters, would 20 minutes to build that case for next quarter be worth it?",
  },
  "We tried automation before. Six months of implementation, and it failed.": {
    theme: "burned",
    say: "That's a real cost, and I'm sorry it went that way. What broke last time? We'd start with a two-week pilot on one supplier group, so you see it work first.",
  },
  "What's the ROI? Give me numbers.": {
    theme: "price",
    say: "Let's build it on yours, not ours. How many people touch supplier reconciliation at month-end, and for how many days?",
  },
  // Ryan · CTO
  "We run Grafana and Prometheus. We're fine.": {
    theme: "status_quo",
    say: "Solid stack. We plug into it rather than replace it. When something breaks at 2 a.m., how long does it take to find the root cause today?",
  },
  "I'm not adding another tool, my team is underwater.": {
    theme: "burned",
    say: "That's exactly why I'm calling: to take work off, not add it. What's eating the most on-call hours right now?",
  },
  "Send me the docs, I'll look myself.": {
    theme: "brush_off",
    say: "Will do. So I send the right page: which matters more right now, alert noise, time to root cause or SLA reporting?",
  },
  // Dana · health plan shopper
  "I already went on HealthCare.gov myself and it was all confusing.": {
    theme: "status_quo",
    say: "You're not alone, it's built for everyone and no one. What are you paying this year, and what about the plans you saw didn't fit?",
  },
  "Are you going to sell my number to ten other agents?": {
    theme: "trust",
    say: "No. I'm a licensed agent, I handle your case myself, and your number stays with me. Can I ask what changed with your coverage this year?",
  },
  "Can you just text me a link?": {
    theme: "brush_off",
    say: "Sure. A link won't tell you which plan keeps your doctors, though. Could we do 20 minutes this week, maybe in the evening with whoever helps you decide?",
  },
  // Carmen · nutrition program
  "I've tried every diet out there. Nothing sticks.": {
    theme: "burned",
    say: "That's honest, and it's not a willpower thing. What usually made it stop working: the food, the schedule, or doing it alone?",
  },
  "Is this one of those shots? My insurance won't pay for those.": {
    theme: "price",
    say: "It's not a shot program. It's a dietitian and a plan that fits your week, and we'll check what your insurance covers. What did your doctor tell you at your last checkup?",
  },
  "I really don't have time to cook fancy meals.": {
    theme: "timing",
    say: "Good, because nothing here is fancy. Most meals take 15 minutes. What does a normal weeknight dinner look like at your house?",
  },
  // Tony · personal training
  "I've been down this road twice, man. I always quit.": {
    theme: "burned",
    say: "Most people do, and it's usually not motivation. When you quit last time, what happened that week?",
  },
  "Trainers are for rich people, right? What's that cost?": {
    theme: "price",
    say: "Fair question, and I'll give you the number. It's less than most people expect. First, what are you hoping changes in the next three months?",
  },
  "I work rotating shifts, I can't commit to set times.": {
    theme: "timing",
    say: "That's who we built this for: sessions move with your schedule. What does your rotation look like next week?",
  },
  // Greg · group health for a small business
  "We looked at that in 2023. Way too expensive.": {
    theme: "price",
    say: "That's fair, and a lot has changed since. You can now set a fixed amount per employee. What would you be comfortable putting in per person each month?",
  },
  "Half my guys are on their wife's plan anyway.": {
    theme: "status_quo",
    say: "Makes sense. What about the other half, and the techs you're trying to hire? Have you lost anyone to a shop that offered benefits?",
  },
  "I'm on a roof in 20 minutes, just email me something.": {
    theme: "brush_off",
    say: "Will do, I'll keep it short. One question so it's useful: how many techs have you lost in the last year?",
  },
  "My insurance guy already handles my liability. I'll ask him.": {
    theme: "authority",
    say: "Good, keep him. Health benefits are usually a different specialty. Want me to put a one-page side-by-side together for him and whoever does your books?",
  },
  // Brandon · gym franchise owner
  "Corporate already gives us a CRM that sends emails.": {
    theme: "status_quo",
    say: "Keep it. We run on your check-in data, so it's not another CRM. How many of your January joiners are still coming in by May?",
  },
  "People quit in spring. That's just the gym business.": {
    theme: "status_quo",
    say: "It is the norm. But if you kept even a handful more a month, what's that worth in dues? Do you know your spring drop-off number?",
  },
  "My staff won't use another app, they barely use the one we have.": {
    theme: "burned",
    say: "Totally fair. For staff it's a daily list of five members to text, that's it. Who on your team handles follow-up today?",
  },
  // Priya · HR at a CPA firm
  "We already have an EAP.": {
    theme: "status_quo",
    say: "Most firms do. Out of curiosity, what's the usage rate, and how long does someone wait for a first appointment?",
  },
  "Our renewal isn't until July, call me in the spring.": {
    theme: "timing",
    say: "Happy to. The reason to talk now is busy season: if burnout spikes again in April, what would you want in place by then?",
  },
  "How is this different from the ten other mental-health apps?": {
    theme: "trust",
    say: "Honest answer: speed. A therapist within 72 hours, not a waitlist. How long does it take your people to see someone today?",
  },
  // Walt · Medicare
  "How'd you get my number? I'm on the Do Not Call list.": {
    theme: "trust",
    say: "Fair to ask. This is Alex, a licensed independent agent. If you want me to stop calling, I will right now. Has your plan sent you any letters about next year?",
  },
  "I'm not giving you my Medicare number, so don't ask.": {
    theme: "trust",
    say: "Good, and you shouldn't. I'll never ask for it, your Social or your bank info. Can I ask which doctors matter most to you?",
  },
  "My son handles all this.": {
    theme: "authority",
    say: "Great, he should be on the call. Would an evening work for a 20-minute review with both of you before December 7?",
  },
  "Every one of you says it's free.": {
    theme: "trust",
    say: "You're right to be skeptical. The insurance companies pay agents, so you never get a bill and you're never obligated. What made you look at your plan this year?",
  },
  // Marcus · self-insured benefits
  "Every vendor in America has called me about GLP-1s this year.": {
    theme: "trust",
    say: "I believe it, so I'll skip the pitch. What's your GLP-1 spend doing year over year, and what's the plan for 2027?",
  },
  "We already have a coaching app through our carrier. Nobody uses it.": {
    theme: "status_quo",
    say: "That's the gap we close: coaching tied to the prescription itself, so people show up. What does the carrier report as usage?",
  },
  "Show me a performance guarantee, not a case study.": {
    theme: "trust",
    say: "Agreed. We put our fees at risk against your pharmacy savings. Could we look at your claims data together so the guarantee is built on your numbers?",
  },
  "Budget's locked for 2027.": {
    theme: "price",
    say: "Understood, nothing new this year. If fees only came out of savings, would a mid-2027 start be worth a 30-minute claims review?",
  },
  // Dr. Nina · dental cybersecurity
  "My IT guy handles all that.": {
    theme: "status_quo",
    say: "Good, keep him. We back him up, we don't replace him. When was your backup last actually test-restored?",
  },
  "We're a dental office. Nobody's hacking us.": {
    theme: "status_quo",
    say: "I hope so. Small practices get hit because they're easy, not famous. If your systems were locked tomorrow, what would a day closed cost you?",
  },
  "I have a patient in the chair. You've got two minutes.": {
    theme: "timing",
    say: "I'll take one. If ransomware locked your charts tomorrow, how fast could you be seeing patients again?",
  },
  "How do I know you're not the scam?": {
    theme: "trust",
    say: "Good instinct. Don't give me anything. Look us up, call our main line back, and I'll never ask for a password. Can I ask one question about your backups?",
  },
};

/** Fallback when an objection has no hand-written line (e.g. a buyer built from a job posting). */
const PATTERN_SAY: Record<ObjectionTheme, string> = {
  price: "Fair question, and I'll give you a straight number. First, what is this problem costing you today?",
  timing: "Totally get it, I'll be quick. One question so I know whether it's worth a call back: how is this handled today?",
  status_quo: "Makes sense, keep it. We usually sit alongside it. What's the one thing it doesn't do well for you?",
  brush_off: "Happy to send it. So it isn't a generic brochure, what's the one question you'd want it to answer?",
  trust: "Good instinct. I won't ask for anything sensitive. Can I ask one question about how you handle this today?",
  burned: "That's fair. What made it stop working last time?",
  authority: "Makes sense. Who else weighs in, and would it help to find a time when they can join?",
};

const THEME_RULES: [ObjectionTheme, RegExp][] = [
  ["trust", /\bscam|trust|sell my|do not call|how'?d you get|guarantee|different from|every (one|vendor)|free\b/i],
  ["brush_off", /\bemail|send me|text me|link|docs|brochure|look myself\b/i],
  ["authority", /\b(son|wife|husband|boss|partner|ceo|cfo|board|procurement|my .* guy)\b.*\b(handles|decides|signs|ask)|handles all|not my call|not the right person/i],
  ["price", /\bcost|price|expensive|budget|roi|afford|pay\b/i],
  ["burned", /\btried|quit|stick|won'?t use|another (tool|app)|failed|before\b/i],
  ["timing", /\btime|timing|busy|minutes|later|next (year|quarter|month)|spring|renewal|call me\b/i],
  ["status_quo", /\balready|we have|we use|we run|fine\b|handles/i],
];

export function classifyObjection(text: string): ObjectionTheme {
  for (const [theme, re] of THEME_RULES) if (re.test(text)) return theme;
  return "status_quo";
}

export function objectionSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join("-");
}

export function objectionId(personaId: string, text: string): string {
  return `${personaId}.${objectionSlug(text)}`;
}

export function hasHandwrittenLine(text: string): boolean {
  return text in LINES;
}

export function objectionsFor(p: Persona): ObjectionItem[] {
  return p.objections.map((text) => {
    const line = LINES[text];
    const theme = line?.theme ?? classifyObjection(text);
    return {
      id: objectionId(p.id, text),
      text,
      personaId: p.id,
      buyer: p.name,
      firstName: p.firstName,
      title: p.title,
      company: p.company,
      difficulty: p.difficulty,
      theme,
      say: line?.say ?? PATTERN_SAY[theme],
    };
  });
}

export const OBJECTIONS: ObjectionItem[] = PERSONAS.flatMap(objectionsFor);

export function getObjection(id: string | null | undefined): ObjectionItem | undefined {
  if (!id) return undefined;
  return OBJECTIONS.find((o) => o.id === id);
}

/** Days since 1970-01-01 for a UTC YYYY-MM-DD date. */
function utcDayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Today's drill: deterministic by UTC date. Walks the whole list with a stride coprime to its
 * length, so consecutive days hop between buyers and nothing repeats until every objection has run.
 */
export function dailyObjection(now: Date = new Date(), list: ObjectionItem[] = OBJECTIONS): ObjectionItem {
  const n = list.length;
  const stride = [17, 19, 23, 29, 31, 37, 1].find((s) => gcd(s, n) === 1) ?? 1;
  const day = utcDayNumber(now.toISOString().slice(0, 10));
  const idx = (((day * stride) % n) + n) % n;
  return list[idx];
}

/**
 * Map a judge delta (-25…25) plus a few code-checked basics to a 0–100 drill score.
 * 50 is a neutral answer; acknowledging and asking a question is what moves it up.
 */
export function drillScore(delta: number, answer: string): number {
  const text = answer.trim();
  const words = text ? text.split(/\s+/).length : 0;
  if (words === 0) return 0;
  if (words < 3) return Math.min(15, Math.max(0, 50 + delta * 2));
  let s = 50 + delta * 2.4;
  if (/\?/.test(text)) s += 8;
  if (/\b(understand|makes sense|fair|totally|got it|hear you|good question|great question|that's reasonable|i get it|happy to)\b/i.test(text)) s += 6;
  if (words > 90) s -= 12;
  return Math.round(Math.min(100, Math.max(0, s)));
}
