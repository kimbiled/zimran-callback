// [A] Call history for the current session, plus the drill streak and the public buyer
// roster the 7-day interview plan (lib/plan7.ts) is built from in the browser.
import { PERSONAS } from "@/lib/personas";
import { objectionsFor } from "@/lib/objections";
import type { PlanBuyer } from "@/lib/plan7";
import { db, utcToday } from "@/lib/server/db";
import { FREE_CALL_LIMIT, sessionId } from "@/lib/server/session";
import { json } from "@/lib/server/validate";
import type { ProgressItem } from "@/lib/types";

/** Market each ready-made buyer sits in, so the plan can vary it day to day. */
const SEGMENT: Record<string, string> = {
  "jessica-hr": "software",
  "mike-sales": "software",
  "linda-cfo": "software",
  "ryan-cto": "software",
  "dana-health-plan": "insurance",
  "greg-group-health": "insurance",
  "walt-medicare": "insurance",
  "priya-mental-health": "benefits",
  "marcus-glp1-benefits": "benefits",
  "carmen-nutrition": "consumer",
  "tony-fitness": "consumer",
  "brandon-gym-owner": "small-business",
  "nina-dental-cyber": "small-business",
};

const BUYERS: PlanBuyer[] = PERSONAS.map((p) => ({
  id: p.id,
  firstName: p.firstName,
  name: p.name,
  company: p.company,
  difficulty: p.difficulty,
  segment: SEGMENT[p.id] ?? "other",
  objections: objectionsFor(p).map((o) => ({ id: o.id, text: o.text, theme: o.theme })),
}));

export async function GET() {
  const sid = await sessionId();
  const store = db();
  const [session, calls, streak] = await Promise.all([
    store.getOrCreateSession(sid),
    store.listCalls(sid),
    store.getStreak(sid, utcToday()).catch(() => null),
  ]);
  const items: (ProgressItem & { personaId: string })[] = calls
    .filter((c) => c.status === "done" && c.debrief)
    .map((c) => ({
      callId: c.id,
      personaId: c.personaId,
      personaName: c.persona.name,
      company: c.persona.company,
      difficulty: c.persona.difficulty,
      total: c.total,
      finalScore: c.finalScore,
      startedAt: c.startedAt,
      criteria: Object.fromEntries((c.debrief?.criteria ?? []).map((k) => [k.id, k.score])),
    }));
  return json({
    plan: session.plan,
    callsUsed: session.callsUsed,
    callsLeft: session.plan === "free" ? Math.max(0, FREE_CALL_LIMIT - session.callsUsed) : null,
    items,
    streak,
    buyers: BUYERS,
  });
}
