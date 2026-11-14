// A single protected model request for diagnosing production billing/auth/schema failures.
import { validEvalAuthorization } from "@/lib/ai/eval-auth";
import { aiConfiguration, aiDiagnostics } from "@/lib/ai/model";
import { judgeTurn } from "@/lib/ai/judge";
import { getPersona } from "@/lib/personas";
import { bad, json } from "@/lib/server/validate";

export const maxDuration = 15;
export async function POST(request: Request) {
  if (!validEvalAuthorization(request)) return bad("Not found", 404);
  const config = aiConfiguration();
  if (!config.enabled) return json({ ok: false, source: "heuristic", config }, 503);
  const verdict = await judgeTurn({
    persona: getPersona("jessica-hr")!, prevScore: 0, alreadyFound: [],
    turns: [{ role: "rep", text: "How do you onboard new staff today?", start: 0, end: 4 }],
  });
  return json({ ok: verdict.source === "ai", source: verdict.source, config, diagnostic: aiDiagnostics().judge }, verdict.source === "ai" ? 200 : 503);
}
