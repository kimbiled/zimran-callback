// Manual paid evaluation; credentials never enter URLs or access logs.
import { EVAL_PAIR_IDS, evaluateCalls } from "@/lib/ai/evaluate";
import { aiEnabled } from "@/lib/ai/model";
import { validEvalAuthorization } from "@/lib/ai/eval-auth";
import { bad, json } from "@/lib/server/validate";

export const maxDuration = 300;
export async function GET(req: Request) {
  if (!validEvalAuthorization(req)) return bad("Not found", 404);
  if (!aiEnabled()) return bad("AI Gateway is not configured; use npm run eval -- --offline", 503);
  const pair = new URL(req.url).searchParams.get("pair");
  if (pair !== null && !EVAL_PAIR_IDS.includes(pair)) return bad("Unknown eval pair");
  // Six requests per batch stay within function duration; spacing reduces free-tier throttling.
  return json(await evaluateCalls(pair ?? undefined, pair ? 6000 : 0));
}
