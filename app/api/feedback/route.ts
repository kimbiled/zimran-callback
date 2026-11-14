import { z } from "zod";
import { db } from "@/lib/server/db";
import { sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { FeedbackSchema } from "@/lib/feedback/schema";
import { getFeedback, saveFeedback } from "@/lib/feedback/store";

async function eligibleCall(callId: string) {
  const call = await db().getCall(callId);
  const sid = await sessionId();
  if (!call || call.sessionId !== sid) return { response: bad("Call not found", 404) };
  if (call.status !== "done" || !call.debrief || call.isSample) return { response: bad("Feedback is only for your completed practice call", 409) };
  return { sid };
}

export async function GET(req: Request) {
  const callId = new URL(req.url).searchParams.get("callId");
  if (!z.uuid().safeParse(callId).success) return bad("Invalid call");
  try {
    const access = await eligibleCall(callId!);
    if (access.response) return access.response;
    return json({ feedback: await getFeedback(callId!, access.sid!) });
  } catch {
    return bad("Feedback is unavailable. Please try again.", 503);
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return bad("Invalid request origin", 403);
  const parsed = FeedbackSchema.safeParse(await readJson(req));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid feedback");
  try {
    const { callId, ...feedback } = parsed.data;
    const access = await eligibleCall(callId);
    if (access.response) return access.response;
    return json({ feedback: await saveFeedback(callId, access.sid!, feedback) });
  } catch {
    return bad("Feedback could not be saved. Please try again.", 503);
  }
}
