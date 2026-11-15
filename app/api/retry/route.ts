// "Retry this line": re-judge one rep line in its original moment of the call.
// Stateless: never modifies the saved call, its debrief or the session's usage.
import { z } from "zod";
import type { CallRecord, RetryResponse, Turn } from "@/lib/types";
import { db } from "@/lib/server/db";
import { sessionId } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { bad, json, readJson } from "@/lib/server/validate";
import { judgeTurn } from "@/lib/ai/judge";
import { initialInterest } from "@/lib/ai/interest";
import { SAMPLE_CALL_ID, sampleCall } from "@/lib/sample";
import { finalEvidence, judgments } from "@/lib/ai/call-state";

const Body = z.object({
  callId: z.union([z.uuid(), z.literal(SAMPLE_CALL_ID)]),
  turnIndex: z.number().int().min(0).max(299),
  text: z.string().trim().min(2).max(600),
});

/** The caller's own call, any published sample, or the built-in /sample call. Everything else is "not found". */
async function retryableCall(callId: string): Promise<CallRecord | null> {
  if (callId === SAMPLE_CALL_ID) return sampleCall();
  const call = await db().getCall(callId);
  if (!call) return null;
  if (call.isSample) return call;
  return call.sessionId === (await sessionId()) ? call : null;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad("Write your new line (2–600 characters) for one of your turns.");
  const limited = await rateLimit(req, "retry");
  if (limited) return limited;

  const { callId, turnIndex, text } = parsed.data;
  const call = await retryableCall(callId);
  if (!call) return bad("Call not found", 404);
  if (call.status !== "done") return bad("Finish the call before retrying its lines.", 409);
  const original = call.turns[turnIndex];
  if (!original || original.role !== "rep") return bad("Pick one of your own lines to retry.");

  // Interest right before the original line: the previous scored rep turn, else the call's opening interest.
  const previous = call.turns.slice(0, turnIndex).reverse().find((t) => t.role === "rep" && typeof t.score === "number");
  const prevScore = previous?.score ?? call.debrief?.scoreTimeline[0]?.score ?? initialInterest(call.persona.difficulty);
  const context: Turn[] = [
    ...call.turns.slice(0, turnIndex).map(({ role, text, start, end }) => ({ role, text, start, end })),
    { role: "rep", text, start: original.start, end: original.end },
  ];
  const prefix = context.slice(0, -1);
  const entries = callId === SAMPLE_CALL_ID ? [] : await judgments(callId);
  const alreadyFound = finalEvidence(call, prefix, entries).painsFound;
  const verdict = await judgeTurn({ persona: call.persona, turns: context, prevScore, alreadyFound });
  const body: RetryResponse = {
    delta: verdict.delta,
    score: verdict.score,
    reason: verdict.reason,
    evidenceQuote: verdict.evidenceQuote,
    source: verdict.source,
    original: typeof original.delta === "number" ? original.delta : null,
  };
  return json(body);
}
