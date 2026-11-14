// Daily 60-second objection drill: score one rep answer to one buyer objection and
// extend the streak. GET reads the streak; POST scores and records the drill.
import { z } from "zod";
import { judgeTurn } from "@/lib/ai/judge";
import { getPersona } from "@/lib/personas";
import { drillScore, getObjection, THEMES } from "@/lib/objections";
import { db, utcToday } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import type { Turn } from "@/lib/types";

export const maxDuration = 20;

const Body = z.object({
  objectionId: z.string().min(1).max(160),
  personaId: z.string().max(80).optional(),
  answer: z.string().trim().min(1, "Type an answer first.").max(2000),
  /** Seconds the rep took; display only. */
  seconds: z.number().min(0).max(600).optional(),
});

export async function GET() {
  const sid = await sessionId();
  return json(await db().getStreak(sid, utcToday()));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request");
  const { objectionId, personaId, answer } = parsed.data;
  const objection = getObjection(objectionId);
  if (!objection || (personaId && personaId !== objection.personaId)) return bad("Unknown objection");
  const persona = getPersona(objection.personaId);
  if (!persona) return bad("Unknown objection");

  const limited = await rateLimit(req, "warmup");
  if (limited) return limited;

  // Minimal two-turn call: the buyer objects, the rep answers. Same judge as a live call.
  const turns: Turn[] = [
    { role: "buyer", text: objection.text, start: 0, end: 3 },
    { role: "rep", text: answer, start: 3, end: 3 + Math.max(1, Math.round(parsed.data.seconds ?? 20)) },
  ];
  const verdict = await judgeTurn({ persona, turns, prevScore: 0, alreadyFound: [] });

  const sid = await sessionId();
  const streak = await db().recordWarmup(sid, utcToday());

  return json({
    score: drillScore(verdict.delta, answer),
    delta: verdict.delta,
    reason: verdict.reason,
    evidenceQuote: verdict.evidenceQuote,
    event: verdict.event,
    source: verdict.source,
    sayInstead: objection.say,
    pattern: THEMES[objection.theme].pattern,
    streak: streak.streak,
    doneToday: streak.doneToday,
  });
}
