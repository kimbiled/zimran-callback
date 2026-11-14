// [B] Buyer from a job posting.
import { z } from "zod";
import { personaFromJob } from "@/lib/ai/persona-gen";
import { toPublic } from "@/lib/personas";
import { bad, json, readJson } from "@/lib/server/validate";
import { reservePersonaGeneration } from "@/lib/ai/call-state";
import { sessionId } from "@/lib/server/session";

export const maxDuration = 30;

const Body = z.object({ text: z.string().min(40, "Paste the full job posting").max(12000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request");
  if (!await reservePersonaGeneration(await sessionId())) return bad("Three buyer generations per session per day. Pick a ready-made buyer.", 429);
  const { persona, generated } = await personaFromJob(parsed.data.text);
  // A generated profile is returned in full; the browser passes it to POST /api/calls.
  return json({ generated, public: toPublic(persona), persona: generated ? persona : null, personaId: generated ? null : persona.id });
}
