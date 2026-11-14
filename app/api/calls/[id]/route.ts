// [A] Call by id (debrief page and replay).
import { db } from "@/lib/server/db";
import { isUuid } from "@/lib/server/session";
import { bad, json } from "@/lib/server/validate";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return bad("Invalid id", 400);
  const call = await db().getCall(id);
  if (!call) return bad("Call not found", 404);
  const { sessionId: _s, ...rest } = call;
  return json(rest);
}
