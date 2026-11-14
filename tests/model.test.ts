import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn(() => ({ responses: (id: string) => ({ modelId: id }) })) }));
import { aiConfiguration, aiDiagnostics, aiEnabled, recordAiFailure, recordAiSuccess, resolveModel } from "@/lib/ai/model";

beforeEach(() => {
  for (const key of ["OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "VERCEL", "AI_PROVIDER", "AI_DISABLED"]) vi.stubEnv(key, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("judge provider and safe diagnostics", () => {
  it("uses the OpenAI API directly when the voice project key is present", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-a-secret");
    expect(aiConfiguration()).toMatchObject({ enabled: true, provider: "openai" });
    expect(resolveModel("openai/gpt-4.1-mini")).toMatchObject({ modelId: "gpt-4.1-mini" });
  });
  it("supports explicit Gateway and Vercel request-context OIDC", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("AI_PROVIDER", "gateway");
    expect(aiEnabled()).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(aiConfiguration()).toMatchObject({ enabled: true, provider: "gateway" });
    expect(resolveModel("openai/gpt-4.1-mini")).toBe("openai/gpt-4.1-mini");
  });
  it("does not mistake VERCEL=0 or missing credentials for working AI", () => {
    vi.stubEnv("VERCEL", "0"); expect(aiEnabled()).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("AI_DISABLED", "1"); expect(aiEnabled()).toBe(false);
  });
  it("classifies billing/auth/rate/timeout failures without returning provider bodies or key values", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cases = [
      [{ statusCode: 429, responseBody: '{"error":{"code":"credit_balance_exhausted","message":"secret-key"}}' }, "billing"],
      [{ statusCode: 401, message: "invalid secret-key" }, "auth"],
      [{ statusCode: 429, message: "slow down" }, "rate_limit"],
      [new Error("AI timeout 8000ms"), "timeout"],
    ] as const;
    for (const [error, expected] of cases) {
      recordAiFailure("judge", error, "openai/gpt-4.1-mini");
      expect(aiDiagnostics().judge?.kind).toBe(expected);
      expect(JSON.stringify(aiDiagnostics())).not.toContain("secret-key");
    }
    recordAiSuccess("judge", "openai/gpt-4.1-mini");
    expect(aiDiagnostics().judge?.state).toBe("ok");
  });
});
