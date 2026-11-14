// [B] LLM access through Vercel AI Gateway.
// On Vercel no key is needed (OIDC). Locally, set AI_GATEWAY_API_KEY in .env.local.
// If AI is unavailable, the judge and debrief fall back to heuristics, so the app never breaks.

export const JUDGE_MODEL = process.env.JUDGE_MODEL || "openai/gpt-4.1-mini";
export const DEBRIEF_MODEL = process.env.DEBRIEF_MODEL || "openai/gpt-4.1";

export function aiEnabled(): boolean {
  if (process.env.AI_DISABLED === "1") return false;
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`AI timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    clearTimeout(timer);
  }
}
