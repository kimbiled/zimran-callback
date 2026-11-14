import { z } from "zod";
import { buyerReply } from "@/lib/ai/buyer";
import { CallTurnsSchema, initialInterest, judgments, ownedCall, sameRepPrefix, textReplyOnce } from "@/lib/ai/call-state";
import { isUuid } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";

export const maxDuration = 15;
const Body = z.object({ callId: z.string(), turns: CallTurnsSchema });
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || !isUuid(parsed.data.callId)) return bad("Invalid request");
  const { callId, turns } = parsed.data;
  const call = await ownedCall(callId);
  if (!call) return bad("Call not found", 404);
  if (call.status !== "live" || Date.now() - Date.parse(call.startedAt) > 330_000) return bad("Call ended", 409);
  if (call.mode !== "text" || turns.at(-1)?.role !== "rep") return bad("Expected a text rep turn");
  const entries = await judgments(callId);
  if (!sameRepPrefix(entries, turns) || entries.length !== turns.filter(t => t.role === "rep").length) return bad("Judge the rep turn first", 409);
  const last = entries.at(-1)!;
  const pains = [...new Set(entries.flatMap(e => e.verdict.painsUncovered))];
  try {
    const reply = await textReplyOnce(callId, entries.length - 1, () => buyerReply(call.persona, turns, pains, last?.verdict.score ?? initialInterest(call.persona.difficulty)));
    return json(reply);
  } catch { return bad("Buyer reply is in progress; try again shortly", 409); }
}
