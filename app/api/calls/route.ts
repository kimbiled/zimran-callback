// [A] Start a call: rate-limit the IP, reserve the call against the free limit, write to the DB,
// return what the voice layer needs. A call counts against the free limit when it starts (an atomic
// reservation), not when it gets a debrief, so parallel calls cannot all slip past the limit.
import { z } from "zod";
import { ALLOWED_VOICE_IDS, getPersona, toPublic, VOICES } from "@/lib/personas";
import { PersonaSchema } from "@/lib/ai/persona-gen";
import { applyRole } from "@/lib/roles";
import { MAX_CALL_SECONDS, voiceProvider } from "@/lib/voice/server";
import { db } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";
import { FREE_CALL_LIMIT, sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import type { CallStart, Persona } from "@/lib/types";

const Body = z.object({
  personaId: z.string().max(60).optional(),
  customPersona: PersonaSchema.extend({
    id: z.string().regex(/^custom-[a-z0-9-]{4,40}$/),
    voiceId: z.string().max(40),
    generated: z.boolean().optional(),
  }).optional(),
  mode: z.enum(["voice", "text"]).default("voice"),
  role: z.enum(["sdr", "ae"]).default("sdr"),
});

export async function POST(req: Request) {
  const limited = await rateLimit(req, "calls");
  if (limited) return limited;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad("Invalid request");
  const { personaId, customPersona, mode, role } = parsed.data;

  let persona: Persona | undefined;
  if (customPersona) {
    persona = {
      ...customPersona,
      voiceId: ALLOWED_VOICE_IDS.has(customPersona.voiceId) ? customPersona.voiceId : VOICES.sarah,
      generated: true,
    };
  } else if (personaId) {
    persona = getPersona(personaId);
  }
  if (!persona) return bad("Buyer not found", 404);
  persona = applyRole(persona, role);

  const sid = await sessionId();
  const store = db();
  const session = await store.reserveCall(sid, FREE_CALL_LIMIT);
  if (!session.ok) {
    return json(
      { error: "limit", message: `You've used your ${FREE_CALL_LIMIT} free calls. Pick a plan to keep practicing.` },
      402,
    );
  }

  const callId = crypto.randomUUID();
  await store.createCall({ id: callId, sessionId: sid, persona, mode });

  const body: CallStart = {
    callId,
    persona: toPublic(persona),
    voice: {
      provider: voiceProvider(mode),
      voiceId: persona.voiceId,
      openingLine: persona.openingLine,
      maxSeconds: MAX_CALL_SECONDS,
    },
  };
  return json({ ...body, callsLeft: session.plan === "free" ? Math.max(0, FREE_CALL_LIMIT - session.callsUsed) : null });
}
