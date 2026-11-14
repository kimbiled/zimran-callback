// [B] GPT-Live: the browser sends its WebRTC offer, the server adds the buyer's hidden
// prompt and the OpenAI key, and returns OpenAI's SDP answer. Audio then flows
// browser ⇄ OpenAI directly; this route is only the handshake.
import { z } from "zod";
import { db } from "@/lib/server/db";
import { sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { createGptLiveSession, gptLiveEnabled } from "@/lib/voice/server";

const Body = z.object({
  callId: z.uuid(),
  sdp: z.string().min(10).max(20000),
});

/** One OpenAI session per call (per server instance), so a call id can't be replayed for free minutes. */
const connected = new Set<string>();

export async function POST(req: Request) {
  if (!gptLiveEnabled()) return bad("GPT-Live is not configured", 503);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad("Invalid request");
  const { callId, sdp } = parsed.data;

  const sid = await sessionId();
  const call = await db().getCall(callId);
  if (!call || call.sessionId !== sid || call.mode !== "voice") return bad("Call not found", 404);
  if (call.status !== "live" || connected.has(callId)) return bad("This call already ended or connected", 409);
  connected.add(callId);

  try {
    const answer = await createGptLiveSession(call.persona, sdp);
    return json({ sdp: answer.sdp });
  } catch (e) {
    connected.delete(callId);
    console.error("GPT-Live session failed", e);
    return bad("The voice service is unavailable", 502);
  }
}
