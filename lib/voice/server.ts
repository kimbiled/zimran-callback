// Server-only GPT-Live setup. Permanent credentials and the buyer profile never enter the browser.
import type { CallMode, Persona, VoiceProvider } from "../types";
import { VOICES } from "../personas";
import { buyerInstructions } from "./brief";

export const GPT_LIVE_MODEL = process.env.GPT_LIVE_MODEL || "gpt-live-1";
export const MAX_CALL_SECONDS = callDuration(process.env.MAX_CALL_SECONDS);
export function callDuration(value: string | undefined): number {
  const seconds = Number(value ?? 300);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.min(300, Math.floor(seconds))) : 300;
}
export function gptLiveEnabled(): boolean { return Boolean(process.env.OPENAI_API_KEY?.trim()); }
export function voiceProvider(mode: CallMode): VoiceProvider { return mode === "voice" ? "gpt-live" : "text"; }

const voices: Record<string, string> = {
  [VOICES.jessica]: "gleam", [VOICES.sarah]: "delta", [VOICES.roger]: "meridian",
  [VOICES.chris]: "cinder", [VOICES.eric]: "vesper",
};
const liveVoices = new Set(["gleam", "delta", "meridian", "cinder", "vesper", "marin"]);
export function gptLiveVoice(p: Pick<Persona, "voiceId" | "gender">): string {
  return voices[p.voiceId] ?? (liveVoices.has(p.voiceId) ? p.voiceId : p.gender === "female" ? "gleam" : "meridian");
}
export class LiveSessionError extends Error {
  constructor(readonly status: number | null, readonly code: "configuration" | "provider" | "response" | "timeout") {
    super(`GPT-Live ${code}${status === null ? "" : ` (${status})`}`);
  }
}
export async function createGptLiveSession(persona: Persona, offerSdp: string, signal?: AbortSignal): Promise<{ sdp: string; sessionId: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new LiveSessionError(null, "configuration");
  const timeout = AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        session: {
          model: GPT_LIVE_MODEL, instructions: buyerInstructions(persona), store: false,
          delegation: { type: "client", acknowledgement_delay_ms: 800 },
          audio: { output: { voice: gptLiveVoice(persona) } },
          input: [{ type: "message", role: "developer", content: [{ type: "input_text", text: "Greet the caller now with your opening line, then listen." }] }],
          client: { data_channel: {
            allowed_client_events: ["session.close", "session.thinking.append"],
            allowed_server_events: ["session.started", "session.closed", "session.input_transcript.delta", "session.output_transcript.delta", "session.delegation.created", "error"].map(type => ({ type })),
          } },
        },
        transport: { type: "webrtc", sdp: offerSdp },
      }),
    });
  } catch { throw new LiveSessionError(null, "timeout"); }
  if (!response.ok) throw new LiveSessionError(response.status, "provider");
  const data = await response.json().catch(() => null) as { session?: { id?: unknown }; transport?: { sdp?: unknown } } | null;
  if (typeof data?.transport?.sdp !== "string" || !data.transport.sdp.startsWith("v=0") || typeof data.session?.id !== "string" || !data.session.id) {
    throw new LiveSessionError(response.status, "response");
  }
  return { sdp: data.transport.sdp, sessionId: data.session.id };
}
