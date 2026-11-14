// [A] Config check: what is enabled on this deployment.
import { aiEnabled, DEBRIEF_MODEL, JUDGE_MODEL } from "@/lib/ai/model";
import { db } from "@/lib/server/db";
import { stripeMode } from "@/lib/plans";
import { agentId, GPT_LIVE_MODEL, gptLiveEnabled } from "@/lib/voice/server";
import { json } from "@/lib/server/validate";

export async function GET() {
  return json({
    ok: true,
    db: db().kind,
    ai: aiEnabled() ? { judge: JUDGE_MODEL, debrief: DEBRIEF_MODEL } : false,
    voice: {
      provider: gptLiveEnabled() ? "gpt-live" : "elevenlabs",
      gptLiveModel: gptLiveEnabled() ? GPT_LIVE_MODEL : null,
      agentId: agentId(),
      signedUrls: Boolean(process.env.ELEVENLABS_API_KEY),
    },
    payments: { test: "stripe-test", "live-blocked": "stripe-live-blocked", demo: "demo" }[stripeMode()],
  });
}
