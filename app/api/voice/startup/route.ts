import { z } from "zod";
import { db } from "@/lib/server/db";
import { FREE_CALL_LIMIT, sessionId } from "@/lib/server/session";
import { hasCreatedVoiceSession } from "@/lib/voice/store";
import { bad, json, readJson } from "@/lib/server/validate";

const Body = z.object({ callId: z.uuid(), state: z.enum(["connected", "failed"]) });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return bad("Invalid request");
  const { callId, state } = parsed.data;
  const sid = await sessionId();
  const store = db();
  const call = await store.getCall(callId);
  if (!call || call.sessionId !== sid || call.mode !== "voice") return bad("Call not found", 404);
  if (state === "connected" && !await hasCreatedVoiceSession(callId)) return bad("Voice session not created", 409);
  const settled = await store.settleVoiceStartup(callId, sid, state === "connected");
  if (!settled && !(state === "failed" && (await store.getCall(callId))?.status === "cancelled")) return bad("Call already started or ended", 409);
  const session = await store.getOrCreateSession(sid);
  return json({ callsLeft: session.plan === "free" ? Math.max(0, FREE_CALL_LIMIT - session.callsUsed) : null });
}
