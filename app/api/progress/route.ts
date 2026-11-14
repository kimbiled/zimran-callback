// [A] Call history for the current session.
import { db } from "@/lib/server/db";
import { FREE_CALL_LIMIT, sessionId } from "@/lib/server/session";
import { json } from "@/lib/server/validate";
import type { ProgressItem } from "@/lib/types";

export async function GET() {
  const sid = await sessionId();
  const store = db();
  const session = await store.getOrCreateSession(sid);
  const calls = await store.listCalls(sid);
  const items: ProgressItem[] = calls
    .filter((c) => c.status === "done" && c.debrief)
    .map((c) => ({
      callId: c.id,
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
  });
}
