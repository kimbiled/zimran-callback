// [A] Plans: same as the "What we sell" slide in the deck.

import type { Plan } from "./types";

export type PlanInfo = {
  id: Plan;
  name: string;
  price: string;
  cents: number;
  period: string;
  recurring: boolean;
  description: string;
  features: string[];
  soon?: boolean;
};

export const PLANS: PlanInfo[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cents: 0,
    period: "no sign-up",
    recurring: false,
    description: "Try a real call before you pay anything.",
    features: ["3 calls, up to 5 minutes each", "4 ready-made buyers", "Live interest meter and full debrief"],
  },
  {
    id: "sprint",
    name: "Interview Sprint",
    price: "$49",
    cents: 4900,
    period: "one-time · 7 days",
    recurring: false,
    description: "Get ready for every round of your sales interview loop.",
    features: ["120 voice minutes", "Buyers built from your job posting", "Debrief for every call and a progress chart"],
  },
  {
    id: "offer",
    name: "Offer Call",
    price: "$29",
    cents: 2900,
    period: "add-on after the offer",
    recurring: false,
    description: "Practice the salary talk with an AI recruiter.",
    features: ["AI recruiter with a real budget and ceiling", "Debrief on your arguments and concessions", "3 attempts"],
    soon: true,
  },
  {
    id: "gym",
    name: "Rep Gym",
    price: "$39",
    cents: 3900,
    period: "per month",
    recurring: true,
    description: "Daily reps after you're hired, so you hit quota.",
    features: ["150 voice minutes a month", "New buyers every week", "Skill-by-skill progress chart"],
  },
];

export function planInfo(id: string): PlanInfo | undefined {
  return PLANS.find((p) => p.id === id);
}
