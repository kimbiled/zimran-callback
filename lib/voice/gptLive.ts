"use client";
import type { Turn } from "../types";
import { buyerSaidGoodbye, TurnAssembler, type Speaker } from "./turns";

export type GptLiveHandlers = {
  onStarted?: () => void;
  onTurn: (turn: Turn) => void;
  onSpeaking: (speaking: boolean) => void;
  onClosed: (reason: string, usageConfirmed: boolean) => void;
};
type LiveEvent = { type?: unknown; event_id?: unknown; [key: string]: unknown };
const START_TIMEOUT_MS = 20_000;
const REP_GAP_MS = 2500;
const BUYER_GAP_MS = 1500;

export class GptLiveCall {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private meterStop: (() => void) | null = null;
  private readonly abort = new AbortController();
  private readonly turns: TurnAssembler;
  private readonly seen = new Set<string>();
  private gapTimers: Partial<Record<Speaker, ReturnType<typeof setTimeout>>> = {};
  private durationTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private farewellTimer?: ReturnType<typeof setTimeout>;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((error: Error) => void) | null = null;
  private closeWait: Promise<void> | null = null;
  private resolveClose: (() => void) | null = null;
  private closingReason: string | null = null;
  private setupStarted = false;
  private started = false;
  private closed = false;
  private speaking = false;
  private heardAudio = false;
  private audioTrackSeen = false;
  private lastAudio = 0;
  private startedAt = 0;
  private seq = 0;

  constructor(private readonly h: GptLiveHandlers) {
    this.turns = new TurnAssembler(turn => {
      h.onTurn(turn);
      if (turn.role === "buyer" && buyerSaidGoodbye(turn.text)) this.afterFarewell(turn);
    });
  }

  /** Resolves after session.started. The deadline includes microphone, ICE and HTTP setup. */
  async start(callId: string, maxSeconds = 300): Promise<void> {
    if (this.setupStarted || this.closed) throw new Error("This voice connection cannot be reused.");
    if (typeof RTCPeerConnection === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot start voice. Use a secure connection or switch to text mode.");
    }
    this.setupStarted = true;
    const ready = new Promise<void>((resolve, reject) => { this.resolveStart = resolve; this.rejectStart = reject; });
    void ready.catch(() => {});
    let rejectDeadline: ((error: Error) => void) | undefined;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    const onAbort = () => rejectDeadline?.(new Error("Voice connection was cancelled or timed out."));
    this.abort.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => this.abort.abort(), START_TIMEOUT_MS);
    try {
      const cap = Number.isFinite(maxSeconds) ? Math.max(1, Math.min(300, maxSeconds)) : 300;
      await Promise.race([this.setup(callId, ready, cap), deadline]);
    } catch (error) {
      this.teardown();
      if (error instanceof Error && ["NotAllowedError", "NotFoundError", "NotReadableError"].includes(error.name)) {
        throw new Error("Microphone access is unavailable. Allow your microphone or switch to text mode.");
      }
      throw error instanceof Error ? error : new Error("Couldn't connect to GPT-Live.");
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener("abort", onAbort);
    }
  }

  private async setup(callId: string, ready: Promise<void>, maxSeconds: number) {
    const pc = this.pc = new RTCPeerConnection();
    const audio = this.audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = event => {
      if (this.closed) return;
      this.audioTrackSeen = true;
      const stream = new MediaStream([event.track]);
      audio.srcObject = stream;
      void audio.play().catch(() => this.fail("audio_blocked"));
      this.meterStop?.();
      this.meterStop = watchSpeaking(stream, speaking => {
        this.speaking = speaking;
        this.lastAudio = performance.now();
        this.heardAudio ||= speaking;
        this.h.onSpeaking(speaking);
      });
    };
    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      clearTimeout(this.disconnectTimer);
      if (pc.connectionState === "failed") this.fail("connection_lost");
      else if (pc.connectionState === "disconnected") this.disconnectTimer = setTimeout(() => this.fail("connection_lost"), 3000);
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.closed || this.abort.signal.aborted) { stream.getTracks().forEach(track => track.stop()); throw new Error("Voice connection cancelled."); }
    this.mic = stream;
    stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));
    const dc = this.dc = pc.createDataChannel("oai-events");
    dc.onmessage = event => {
      if (this.closed) return;
      try { this.onEvent(JSON.parse(String(event.data)) as LiveEvent, maxSeconds); } catch { /* Ignore malformed provider frames. */ }
    };
    dc.onclose = () => this.fail("connection_lost");
    dc.onerror = () => this.fail("connection_lost");
    const offer = await pc.createOffer();
    this.ensureOpen();
    await pc.setLocalDescription(offer);
    this.ensureOpen();
    await iceComplete(pc, this.abort.signal);
    this.ensureOpen();
    const response = await fetch("/api/voice/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, sdp: pc.localDescription?.sdp }), signal: this.abort.signal,
    });
    this.ensureOpen();
    if (!response.ok) {
      const message = response.status === 503 ? "GPT-Live is not configured. Switch to text mode." : response.status === 409 ? "This call already attempted a voice connection. Start a new call." : "The voice service is unavailable. Switch to text mode.";
      throw new Error(message);
    }
    const answer = await response.json() as { sdp?: unknown };
    this.ensureOpen();
    if (typeof answer.sdp !== "string" || !answer.sdp.startsWith("v=0")) throw new Error("The voice service returned an invalid connection.");
    await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    this.ensureOpen();
    await ready;
  }

  sendNote(content: string) {
    if (this.started && !this.closingReason) this.send({ type: "session.thinking.append", delegation_id: null, content });
  }

  /** Final captions are collected until session.closed; only then does the hook build its debrief. */
  end(reason = "close_requested"): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.closeWait) return this.closeWait;
    this.closeWait = new Promise(resolve => { this.resolveClose = resolve; });
    this.closingReason = reason;
    this.mic?.getTracks().forEach(track => track.stop());
    this.audio?.pause();
    this.turns.flush();
    if (this.started && this.send({ type: "session.close" })) {
      this.closeTimer = setTimeout(() => this.finishClose(reason, false), 2000);
    } else this.finishClose(reason, false);
    return this.closeWait;
  }

  private onEvent(event: LiveEvent, maxSeconds: number) {
    if (typeof event.event_id === "string") {
      if (this.seen.has(event.event_id)) return;
      this.seen.add(event.event_id);
    }
    switch (event.type) {
      case "session.started":
        if (this.started || this.closingReason) return;
        this.started = true; this.startedAt = performance.now();
        this.durationTimer = setTimeout(() => void this.end("time_limit"), maxSeconds * 1000);
        this.h.onStarted?.();
        this.resolveStart?.(); this.resolveStart = null; this.rejectStart = null;
        break;
      case "session.input_transcript.delta":
      case "session.output_transcript.delta": {
        const role = event.type === "session.input_transcript.delta" ? "rep" : "buyer";
        if (typeof event.delta !== "string" || typeof event.start_ms !== "number" || typeof event.end_ms !== "number") return;
        if (!this.turns.push(role, event.delta, event.start_ms, event.end_ms)) return;
        clearTimeout(this.gapTimers[role]);
        this.gapTimers[role] = setTimeout(() => this.turns.flush(role), role === "rep" ? REP_GAP_MS : BUYER_GAP_MS);
        break;
      }
      case "session.delegation.created": {
        const delegation = event.delegation as { id?: unknown; target?: unknown } | undefined;
        if (typeof delegation?.id === "string" && delegation.target === "client") this.send({
          type: "session.thinking.append", delegation_id: delegation.id,
          content: "Nothing can be looked up or changed on this call. Answer only from your own buyer situation and stay in character.",
        });
        break;
      }
      case "session.closed": {
        const usage = event.usage as { seconds?: unknown } | undefined;
        this.finishClose(this.closingReason ?? "provider_closed", typeof usage?.seconds === "number" && Number.isFinite(usage.seconds));
        break;
      }
      case "error": this.fail("voice_error"); break;
    }
  }

  private afterFarewell(turn: Turn) {
    if (this.closed || this.closingReason) return;
    clearTimeout(this.farewellTimer);
    const received = performance.now();
    const earliest = this.startedAt + turn.end * 1000 + 750;
    const check = () => {
      if (this.closed || this.closingReason) return;
      const now = performance.now();
      // shortcut: measured silence plus caption time approximates play-out; use server audio buffering for a strict guarantee.
      const played = this.audioTrackSeen && (this.heardAudio ? !this.speaking && now - this.lastAudio >= 800 : now >= earliest + 1500);
      if (played && now >= earliest && now - received >= 1500) void this.end("buyer_hangup");
      else this.farewellTimer = setTimeout(check, 250);
    };
    this.farewellTimer = setTimeout(check, 250);
  }

  private send(event: Record<string, unknown>): boolean {
    if (this.dc?.readyState !== "open") return false;
    try { this.dc.send(JSON.stringify({ event_id: `cb_${++this.seq}`, ...event })); return true; } catch { return false; }
  }
  private ensureOpen() { if (this.closed || this.abort.signal.aborted) throw new Error("Voice connection cancelled."); }
  private fail(reason: string) {
    if (this.closed) return;
    if (!this.started) { this.rejectStart?.(new Error("Lost the connection to the voice service.")); this.teardown(); }
    else this.finishClose(this.closingReason ?? reason, false);
  }
  private finishClose(reason: string, usageConfirmed: boolean) {
    if (this.closed) return;
    this.turns.flush();
    const notify = this.started;
    this.closingReason ??= reason;
    this.teardown();
    if (notify) this.h.onClosed(reason, usageConfirmed);
  }
  teardown() {
    if (this.closed) return;
    // A cancelled/replaced page still sends a best-effort provider close before dropping transport.
    if (this.started && !this.closingReason) this.send({ type: "session.close" });
    this.closed = true;
    this.abort.abort(); this.rejectStart?.(new Error("Voice connection cancelled."));
    Object.values(this.gapTimers).forEach(timer => clearTimeout(timer)); this.gapTimers = {};
    for (const timer of [this.durationTimer, this.closeTimer, this.disconnectTimer, this.farewellTimer]) clearTimeout(timer);
    this.meterStop?.(); this.meterStop = null;
    this.mic?.getTracks().forEach(track => track.stop()); this.mic = null;
    this.h.onSpeaking(false);
    if (this.dc) { this.dc.onclose = null; this.dc.onerror = null; this.dc.onmessage = null; }
    if (this.pc) { this.pc.ontrack = null; this.pc.onconnectionstatechange = null; }
    try { this.dc?.close(); this.pc?.close(); } catch { /* Already disconnected. */ }
    this.dc = null; this.pc = null;
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    this.audio = null; this.resolveClose?.();
  }
}

function iceComplete(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", check); signal.removeEventListener("abort", abort); };
    const check = () => { if (pc.iceGatheringState === "complete") { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new Error("Voice connection cancelled.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Voice network setup timed out.")); }, 10_000);
    pc.addEventListener("icegatheringstatechange", check);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function watchSpeaking(stream: MediaStream, onChange: (speaking: boolean) => void): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const context = new Ctx();
  void context.resume().catch(() => {});
  const analyser = context.createAnalyser(); analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let speaking = false, lastLoud = -Infinity;
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    const rms = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length);
    const now = performance.now();
    if (rms > 0.02) lastLoud = now;
    const next = now - lastLoud < 400;
    if (next !== speaking) { speaking = next; onChange(next); }
  }, 100);
  return () => { clearInterval(timer); void context.close().catch(() => {}); };
}
