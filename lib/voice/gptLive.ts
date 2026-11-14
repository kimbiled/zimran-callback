"use client";
// [B] Browser side of a GPT-Live call (OpenAI). Mic audio goes to OpenAI over WebRTC and
// the buyer's voice plays straight from the remote track; our server only does the SDP
// handshake (/api/voice/session). Events arrive on the "oai-events" data channel.

import { TurnAssembler, type Speaker } from "./turns";

export type GptLiveHandlers = {
  onTurn: (role: Speaker, text: string) => void;
  onSpeaking: (speaking: boolean) => void;
  /** Session ended for any reason after it started (hang-up, expiry, network). */
  onClosed: (reason: string) => void;
};

type LiveEvent = { type: string; [k: string]: unknown };

const START_TIMEOUT_MS = 15000;
const ICE_TIMEOUT_MS = 10000;
/** Silence after the buyer's last transcript delta that closes their turn */
const BUYER_TURN_GAP_MS = 1500;
/** Silence after the rep's last delta that closes their turn even if the buyer stays quiet */
const REP_TURN_GAP_MS = 2500;
/**
 * The buyer answering closes the rep's turn only if the rep has also been quiet this long,
 * so a backchannel ("Hi.", "Mm-hm") or a late rep transcript doesn't cut a sentence in half.
 */
const REP_YIELD_MS = 1200;

export class GptLiveCall {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private meterStop: (() => void) | null = null;
  private turns: TurnAssembler;
  private gapTimers: Partial<Record<Speaker, ReturnType<typeof setTimeout>>> = {};
  private lastDelta: Record<Speaker, number> = { rep: 0, buyer: 0 };
  private started = false;
  private closed = false;
  private seq = 0;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((e: Error) => void) | null = null;

  constructor(private readonly h: GptLiveHandlers) {
    this.turns = new TurnAssembler((role, text) => h.onTurn(role, text));
  }

  /** Resolves once OpenAI confirms the session (session.started); rejects on any setup failure. */
  async start(callId: string, openingLine: string): Promise<void> {
    const pc = new RTCPeerConnection();
    this.pc = pc;

    const audio = new Audio();
    audio.autoplay = true;
    this.audio = audio;
    pc.ontrack = (e) => {
      const stream = new MediaStream([e.track]);
      audio.srcObject = stream;
      audio.play().catch((err) => console.warn("buyer audio autoplay blocked", err));
      this.meterStop = watchSpeaking(stream, (s) => this.h.onSpeaking(s));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.fail("connection_lost");
    };

    const ready = new Promise<void>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    ready.catch(() => {}); // handled below; avoids an unhandled rejection if setup throws first

    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (e) => {
        try {
          this.onEvent(JSON.parse(e.data) as LiveEvent, openingLine);
        } catch (err) {
          console.error("bad GPT-Live event", err);
        }
      };
      dc.onclose = () => this.fail("connection_lost");

      await pc.setLocalDescription(await pc.createOffer());
      await iceComplete(pc, ICE_TIMEOUT_MS);
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, sdp: pc.localDescription?.sdp }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `voice session ${res.status}`);
      }
      const { sdp } = (await res.json()) as { sdp: string };
      await pc.setRemoteDescription({ type: "answer", sdp });
      const timeout = setTimeout(() => this.rejectStart?.(new Error("The voice service didn't answer in time.")), START_TIMEOUT_MS);
      await ready.finally(() => clearTimeout(timeout));
    } catch (e) {
      this.teardown();
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  /** Private context for the buyer (e.g. current interest). Not spoken, doesn't interrupt. */
  sendNote(content: string) {
    this.send({ type: "session.thinking.append", delegation_id: null, content });
  }

  /** Graceful hang-up: flushes the open turn, asks OpenAI to close, tears down after session.closed or 2 s. */
  end() {
    if (this.closed) return;
    this.turns.flush();
    if (this.started && this.send({ type: "session.close" })) {
      setTimeout(() => this.finishClose("close_requested"), 2000);
    } else {
      this.finishClose("close_requested");
    }
  }

  private onEvent(ev: LiveEvent, openingLine: string) {
    switch (ev.type) {
      case "session.started":
        this.started = true;
        // The buyer answers the phone; commentary is spoken aloud by the model.
        this.send({ type: "session.commentary.append", delegation_id: null, content: openingLine });
        this.resolveStart?.();
        break;
      case "session.input_transcript.delta":
        this.onDelta("rep", String(ev.delta ?? ""), REP_TURN_GAP_MS);
        break;
      case "session.output_transcript.delta": {
        const t = this.onDelta("buyer", String(ev.delta ?? ""), BUYER_TURN_GAP_MS);
        if (this.turns.isOpen("rep") && t - this.lastDelta.rep >= REP_YIELD_MS) this.closeTurn("rep");
        break;
      }
      case "session.delegation.created": {
        // We run without a backend: tell the model there is nothing to look up, so it doesn't stall.
        const id = (ev.delegation as { id?: string } | undefined)?.id ?? null;
        this.send({
          type: "session.thinking.append",
          delegation_id: id,
          content: "Nothing can be looked up on this call. Answer from your own situation and stay in character.",
        });
        break;
      }
      case "session.closed":
        this.finishClose(String(ev.reason ?? "closed"));
        break;
      case "error": {
        const err = ev.error as { code?: string; message?: string } | undefined;
        console.error("GPT-Live error", err);
        if (!this.started) this.rejectStart?.(new Error(err?.message || "The voice service returned an error."));
        break;
      }
    }
  }

  /** Adds a delta to the speaker's open turn and restarts that speaker's silence timer. */
  private onDelta(role: Speaker, delta: string, gapMs: number): number {
    const t = performance.now();
    if (!delta) return t;
    this.turns.push(role, delta, t);
    this.lastDelta[role] = t;
    clearTimeout(this.gapTimers[role]);
    this.gapTimers[role] = setTimeout(() => this.closeTurn(role), gapMs);
    return t;
  }

  private closeTurn(role: Speaker) {
    clearTimeout(this.gapTimers[role]);
    delete this.gapTimers[role];
    this.turns.flush(role);
  }

  private send(ev: Record<string, unknown>): boolean {
    if (this.dc?.readyState !== "open") return false;
    this.dc.send(JSON.stringify({ event_id: `cb_${++this.seq}`, ...ev }));
    return true;
  }

  private fail(reason: string) {
    if (!this.started) {
      this.rejectStart?.(new Error("Lost the connection to the voice service."));
      return;
    }
    this.finishClose(reason);
  }

  private finishClose(reason: string) {
    if (this.closed) return;
    this.turns.flush();
    const wasStarted = this.started;
    this.teardown();
    if (wasStarted) this.h.onClosed(reason);
  }

  /** Releases mic, audio and the peer connection. Safe to call more than once. */
  teardown() {
    this.closed = true;
    if (!this.started) this.rejectStart?.(new Error("Call cancelled."));
    Object.values(this.gapTimers).forEach((id) => clearTimeout(id));
    this.gapTimers = {};
    this.meterStop?.();
    this.meterStop = null;
    this.h.onSpeaking(false);
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.dc) this.dc.onclose = null;
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      /* already closed */
    }
    if (this.audio) this.audio.srcObject = null;
    this.mic = null;
    this.dc = null;
    this.pc = null;
  }
}

function iceComplete(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    // Proceed with whatever candidates we have after the timeout.
    const t = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * GPT-Live has no "started/stopped speaking" events, and transcript text runs ahead of the
 * audio, so "is talking" comes from the loudness of the remote track itself.
 */
function watchSpeaking(stream: MediaStream, onChange: (speaking: boolean) => void): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let speaking = false;
  let lastLoud = 0;
  const id = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    const now = performance.now();
    if (rms > 0.02) lastLoud = now;
    const next = now - lastLoud < 400;
    if (next !== speaking) {
      speaking = next;
      onChange(next);
    }
  }, 100);
  return () => {
    clearInterval(id);
    void ctx.close().catch(() => {});
  };
}
