// [B] One project key can power GPT-Live and the separate judge; Gateway is optional.
import { createOpenAI } from "@ai-sdk/openai";

export const JUDGE_MODEL = process.env.JUDGE_MODEL || "openai/gpt-4.1-mini";
// Debrief model: gpt-4.1-mini was the fastest (4.5 s median) with the most grounded quotes (14/15)
// in our benchmark (Nov 2026; gpt-6-luna was 8.6 s even at low effort). If it errors, the same
// request is retried once on the fallback.
export const DEBRIEF_MODEL = process.env.DEBRIEF_MODEL || "openai/gpt-4.1-mini";
export const DEBRIEF_FALLBACK_MODEL = process.env.DEBRIEF_FALLBACK_MODEL || "openai/gpt-4.1";

/** Newer reasoning-style models (gpt-5+, gpt-6, o-series) may reject `temperature`. */
export function acceptsTemperature(name: string): boolean {
  return !/(^|\/)(gpt-[5-9]|o\d)/.test(name);
}

export function aiConfiguration(): { enabled: boolean; provider: "openai" | "gateway" | null; reason?: string } {
  if (process.env.AI_DISABLED === "1") return { enabled: false, provider: null, reason: "disabled" };
  const requested = process.env.AI_PROVIDER || "auto";
  if (!["auto", "openai", "gateway"].includes(requested)) return { enabled: false, provider: null, reason: "invalid_provider" };
  if (requested !== "gateway" && process.env.OPENAI_API_KEY) return { enabled: true, provider: "openai" };
  // Vercel can supply OIDC through request context rather than a static env variable.
  if (requested !== "openai" && (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1")) {
    return { enabled: true, provider: "gateway" };
  }
  return { enabled: false, provider: null, reason: "not_configured" };
}

export function aiEnabled(): boolean { return aiConfiguration().enabled; }

export function resolveModel(name: string) {
  const config = aiConfiguration();
  if (!config.enabled) throw new Error("AI is not configured");
  if (config.provider === "openai") {
    if (name.includes("/") && !name.startsWith("openai/")) throw new Error("Direct OpenAI requires an OpenAI model");
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses(name.replace(/^openai\//, ""));
  }
  return name;
}

type Operation = "judge" | "debrief" | "persona" | "buyer";
type AiDiagnostic = { state: "ok" | "failed"; kind?: string; status?: number; at: string; provider: string | null; model: string };
const shared = globalThis as unknown as { __callbackAiDiagnostics?: Partial<Record<Operation, AiDiagnostic>> };
const diagnostics = shared.__callbackAiDiagnostics ??= {};
export function aiDiagnostics() { return structuredClone(diagnostics); }

export function recordAiSuccess(operation: Operation, model: string) {
  diagnostics[operation] = { state: "ok", at: new Date().toISOString(), provider: aiConfiguration().provider, model };
}

export function recordAiFailure(operation: Operation, error: unknown, model: string) {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof e.statusCode === "number" ? e.statusCode : undefined;
  const detail = `${String(e.name ?? "")} ${String(e.message ?? "")} ${String(e.responseBody ?? "")}`;
  const kind = /insufficient_quota|credit_balance_exhausted|payment_required/i.test(detail) || status === 402 ? "billing"
    : status === 401 || status === 403 ? "auth"
    : status === 429 ? "rate_limit"
    : /timeout|abort/i.test(detail) ? "timeout"
    : status === 404 ? "model"
    : /schema|json|objectgenerated|outputgenerated|no output/i.test(detail) ? "schema"
    : "upstream";
  const safe: AiDiagnostic = { state: "failed", kind, status, at: new Date().toISOString(), provider: aiConfiguration().provider, model };
  diagnostics[operation] = safe;
  // Preserve the searchable production log marker without prompts, bodies or credentials.
  console.error(`${operation} AI failed`, safe);
}

export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => {
      controller.abort();
      rej(new Error(`AI timeout ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), t]);
  } finally {
    clearTimeout(timer);
  }
}
