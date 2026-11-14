// [B] Server side of voice: which provider runs the call and the credentials it needs.
// ElevenLabs: public agent (agentId) or, with ELEVENLABS_API_KEY, a signed URL.
// GPT-Live (OpenAI): with OPENAI_API_KEY, voice calls go through POST /api/voice/session,
// which forwards the browser's WebRTC offer to OpenAI. The key never leaves the server.

import type { CallMode, Persona, VoiceProvider } from "../types";
import { VOICES } from "../personas";
import { buyerInstructions } from "./brief";

/** The "Callback AI Buyer" agent in ElevenLabs. Override with ELEVENLABS_AGENT_ID. */
export const DEFAULT_AGENT_ID = "agent_5501m7chgm92fe7rbwpaw8behtws";
export const MAX_CALL_SECONDS = Number(process.env.MAX_CALL_SECONDS ?? 300);
export const GPT_LIVE_MODEL = process.env.GPT_LIVE_MODEL || "gpt-live-1";
const OPENAI_LIVE_URL = "https://api.openai.com/v1/live/sessions";

export function agentId(): string {
  return process.env.ELEVENLABS_AGENT_ID || DEFAULT_AGENT_ID;
}

export function gptLiveEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.VOICE_PROVIDER !== "elevenlabs";
}

/** GPT-Live has no text-only mode, so text calls always stay on ElevenLabs. */
export function voiceProvider(mode: CallMode): VoiceProvider {
  return mode === "voice" && gptLiveEnabled() ? "gpt-live" : "elevenlabs";
}

/** Each ElevenLabs buyer voice → a GPT-Live voice of the same presentation (English, mostly North American). */
const GPT_LIVE_VOICES: Record<string, string> = {
  [VOICES.jessica]: "gleam",
  [VOICES.sarah]: "delta",
  [VOICES.roger]: "meridian",
  [VOICES.chris]: "cinder",
  [VOICES.eric]: "vesper",
};

export function gptLiveVoice(p: Pick<Persona, "voiceId" | "gender">): string {
  return GPT_LIVE_VOICES[p.voiceId] ?? (p.gender === "female" ? "gleam" : "meridian");
}

/** Forwards the browser's SDP offer to OpenAI and returns the SDP answer. */
export async function createGptLiveSession(persona: Persona, offerSdp: string): Promise<{ sdp: string; sessionId: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch(OPENAI_LIVE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        model: GPT_LIVE_MODEL,
        instructions: buyerInstructions(persona),
        audio: { output: { voice: gptLiveVoice(persona) } },
      },
      transport: { type: "webrtc", sdp: offerSdp },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI live session ${res.status}: ${detail.slice(0, 500)}`);
  }
  const data = (await res.json()) as { session?: { id?: string }; transport?: { sdp?: string } };
  if (!data.transport?.sdp) throw new Error("OpenAI live session: no SDP answer");
  return { sdp: data.transport.sdp, sessionId: data.session?.id ?? "" };
}

export async function voiceCredentials(_mode: CallMode): Promise<{ agentId: string | null; signedUrl: string | null }> {
  const key = process.env.ELEVENLABS_API_KEY;
  const id = agentId();
  if (!key) return { agentId: id, signedUrl: null };
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`, {
      headers: { "xi-api-key": key },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`signed url ${res.status}`);
    const data = (await res.json()) as { signed_url?: string };
    if (data.signed_url) return { agentId: null, signedUrl: data.signed_url };
  } catch (e) {
    console.error("ElevenLabs signed URL failed, falling back to public agent", e);
  }
  return { agentId: id, signedUrl: null };
}
