// [B] GPT-Live: the browser sends its WebRTC offer, the server adds the buyer's hidden
// prompt and the OpenAI key, and returns OpenAI's SDP answer. Audio then flows
// browser ⇄ OpenAI directly; this route is only the handshake.
import { z } from "zod";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { createGptLiveSession, gptLiveEnabled, LiveSessionError } from "@/lib/voice/server";
import { claimVoiceSession, recordVoiceSession } from "@/lib/voice/store";

export const maxDuration = 25;

const Body = z.object({
  callId: z.uuid(),
  sdp: z.string().min(10).max(20000).startsWith("v=0"),
});

export async function POST(req: Request) {
  if (!gptLiveEnabled()) return bad("GPT-Live is not configured", 503);
  const limited = await rateLimit(req, "voice-session");
  if (limited) return limited;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad("Invalid request");
  const { callId, sdp } = parsed.data;

  const sid = await sessionId();
  const call = await db().getCall(callId);
  if (!call || call.sessionId !== sid || call.mode !== "voice") return bad("Call not found", 404);
  if (call.status !== "live" || Date.now() - Date.parse(call.startedAt) > 330_000) return bad("This call already ended", 409);
  if (!await claimVoiceSession(callId)) return bad("This call already connected or attempted. Start a new call.", 409);

  try {
    const answer = await createGptLiveSession(call.persona, sdp, req.signal);
    await recordVoiceSession(callId, answer.sessionId);
    return json({ sdp: answer.sdp });
  } catch (e) {
    await recordVoiceSession(callId, null);
    console.error("GPT-Live session failed", e instanceof LiveSessionError ? { status: e.status, code: e.code } : { code: "setup" });
    return bad("The voice service is unavailable", 502);
  }
}
