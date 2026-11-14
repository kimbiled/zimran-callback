import { z } from "zod";
import { db } from "@/lib/server/db";
import { sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { isReplayCandidate, listPublishedReplays } from "@/lib/replay/data";

const Body = z.object({ callId: z.uuid(), consent: z.literal(true) });

export async function GET() {
  return json(await listPublishedReplays());
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad("Confirm publication of this call's transcript before sharing it.");
  const sid = await sessionId();
  const store = db();
  const call = await store.getCall(parsed.data.callId);
  if (!call || call.sessionId !== sid) return bad("Call not found", 404);
  if (!isReplayCandidate(call)) return bad("Only a completed voice call with an AI debrief and saved judge events can be published.", 409);
  if (!await store.publishSample(call.id, sid)) return bad("The call could not be published.", 409);
  return json({ callId: call.id, url: `/replay/${call.id}` });
}
