// [B] Labeled rep turns for checking the judge. The label is the sign of the interest change.
// pos: delta > 3, neg: delta < -3, zero: |delta| <= 3, nonneg: delta >= 0.

import type { Turn } from "../types";

export type EvalCase = {
  id: string;
  personaId: string;
  context: Array<[Turn["role"], string]>;
  rep: string;
  expect: "pos" | "neg" | "zero" | "nonneg";
  alreadyFound?: string[];
};

const LONG =
  "So let me walk you through everything we do. We're a cloud observability platform with metrics, logs, traces, dashboards, alerting and more than three hundred integrations, " +
  "we work with big banks and retailers, we have machine learning for anomaly detection, automated runbooks, Slack and PagerDuty integrations, a mobile app, " +
  "role-based access, single sign-on, thirteen months of retention, flexible pricing, round-the-clock support, a dedicated account manager, a free pilot, team training, " +
  "security certifications, compliance with every standard you can think of, our own research team, an open API, a Terraform provider and a Kubernetes operator, and we just shipped a new version " +
  "with a redesigned interface that's twice as fast, plus full OpenTelemetry support, so you can connect any service in a couple of hours without rewriting code, all at a really great price " +
  "that's about thirty percent below the competition, and right now there's a special startup offer, so I'd really recommend trying it this week.";

export const EVAL_CASES: EvalCase[] = [
  { id: "open-rapport", personaId: "mike-sales", context: [["buyer", "Torres. Make it quick, I've got a pipeline review in five minutes."]], rep: "Hi Mike, this is Alex. I'm calling because we work with building supply distributors on rep productivity. Can I have thirty seconds?", expect: "pos" },
  { id: "pitch-discount", personaId: "mike-sales", context: [["buyer", "Torres, go ahead."]], rep: "Our product is the best conversation intelligence platform on the market, and we have a thirty percent discount this week only!", expect: "neg" },
  { id: "open-pain-q", personaId: "mike-sales", context: [["buyer", "Torres."], ["rep", "Hi Mike, this is Alex, calling about how your reps track their calls."], ["buyer", "Okay. What about it?"]], rep: "How do your reps log their calls and deals today, and how much of the real pipeline can you actually see?", expect: "pos" },
  { id: "objection-ack", personaId: "mike-sales", context: [["rep", "How do you track deals today?"], ["buyer", "We already have Salesforce."]], rep: "Makes sense, most teams do. Out of curiosity, what share of calls do your reps actually log in Salesforce?", expect: "pos" },
  { id: "objection-argue", personaId: "mike-sales", context: [["rep", "How do you track deals today?"], ["buyer", "We already have Salesforce."]], rep: "Salesforce is outdated, honestly. You really need to switch to us.", expect: "neg" },
  { id: "quantify", personaId: "jessica-hr", context: [["rep", "How does onboarding work for new staff right now?"], ["buyer", "Yeah, onboarding is a sore spot. New hires take forever to get going."]], rep: "Roughly how many weeks does it take before a new medical assistant is fully up to speed?", expect: "pos", alreadyFound: ["onboarding"] },
  { id: "filler-ok", personaId: "jessica-hr", context: [["buyer", "We're opening two new clinics, so it's a lot of hiring."]], rep: "Okay.", expect: "zero" },
  { id: "next-step-earned", personaId: "jessica-hr", context: [["rep", "How many weeks until a new hire is fully up to speed?"], ["buyer", "Three, four weeks. And my senior people spend five hours a week training them."]], rep: "Let me show you on your numbers how teams cut that to two weeks. Does Thursday at 11 work for thirty minutes?", expect: "pos", alreadyFound: ["onboarding"] },
  { id: "roi-fluff", personaId: "linda-cfo", context: [["rep", "We automate supplier reconciliation."], ["buyer", "What's the ROI? Give me numbers."]], rep: "Um, well, basically, our customers love it, the reviews are great, you know, it pays for itself.", expect: "neg" },
  { id: "budget-frozen", personaId: "linda-cfo", context: [["rep", "Is cutting manual work in accounting on your radar?"], ["buyer", "Our budget is frozen until next year."]], rep: "That's fair. Would it help to work out how many hours your team spends on reconciliation, so you have the numbers ready for next year's planning?", expect: "pos" },
  { id: "buzzwords", personaId: "ryan-cto", context: [["buyer", "Yeah, who's this?"]], rep: "Good afternoon! We are the leading provider of innovative, cutting-edge, full-stack cloud solutions for digital transformation.", expect: "neg" },
  { id: "grafana", personaId: "ryan-cto", context: [["rep", "What do you use to monitor the payment gateway?"], ["buyer", "We run Grafana and Prometheus. We're fine."]], rep: "Fair enough. The last time the gateway went down, did you find out from an alert or from a customer?", expect: "pos" },
  { id: "monologue", personaId: "ryan-cto", context: [["buyer", "Fine, what have you got?"]], rep: LONG, expect: "neg" },
  { id: "permission", personaId: "mike-sales", context: [["buyer", "Torres, go ahead."]], rep: "Is now a bad time?", expect: "nonneg" },
  { id: "early-meeting", personaId: "jessica-hr", context: [["buyer", "Hello, this is Jessica."]], rep: "Let's set up a meeting tomorrow so I can demo our platform.", expect: "neg" },
  { id: "volume-q", personaId: "linda-cfo", context: [["buyer", "Linda Hayes speaking."], ["rep", "Hi Linda, this is Priya, calling about month-end close."], ["buyer", "Go on."]], rep: "How many people on your team work on supplier reconciliation, and how many days a month does it take?", expect: "pos" },
];

export function matches(expect: EvalCase["expect"], delta: number): boolean {
  if (expect === "pos") return delta > 3;
  if (expect === "neg") return delta < -3;
  if (expect === "zero") return Math.abs(delta) <= 3;
  return delta >= 0;
}

export function caseTurns(c: EvalCase): Turn[] {
  const turns: Turn[] = [];
  let t = 0;
  for (const [role, text] of [...c.context, ["rep", c.rep] as [Turn["role"], string]]) {
    const d = Math.max(1, text.split(/\s+/).length / 2.5);
    turns.push({ role, text, start: t, end: t + d });
    t += d + 0.5;
  }
  return turns;
}
