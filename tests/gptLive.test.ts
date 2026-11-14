import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GptLiveCall } from "@/lib/voice/gptLive";

class Channel {
  readyState = "open";
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close = vi.fn(() => { this.readyState = "closed"; });
  emit(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }); }
}
class Peer {
  static all: Peer[] = [];
  static ice = "complete";
  localDescription = { sdp: "v=0\r\noffer" };
  iceGatheringState = Peer.ice;
  connectionState = "new";
  ontrack: ((event: { track: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new Channel();
  listeners = new Map<string, () => void>();
  constructor() { Peer.all.push(this); }
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: this.localDescription.sdp }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  close = vi.fn();
}
class Stream {
  constructor(private tracks: { stop: () => void }[] = []) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
}
class AudioElement {
  autoplay = false;
  srcObject: unknown = null;
  play = vi.fn(async () => {});
  pause = vi.fn();
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let track: { stop: () => void }, stream: Stream, getMedia: ReturnType<typeof vi.fn>, fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); Peer.all = []; Peer.ice = "complete";
  track = { stop: vi.fn() }; stream = new Stream([track]);
  getMedia = vi.fn().mockResolvedValue(stream);
  fetcher = vi.fn().mockResolvedValue(Response.json({ sdp: "v=0\r\nanswer" }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: getMedia } });
  vi.stubGlobal("RTCPeerConnection", Peer); vi.stubGlobal("MediaStream", Stream); vi.stubGlobal("Audio", AudioElement);
  vi.stubGlobal("window", {}); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function create() {
  const onTurn = vi.fn(), onSpeaking = vi.fn(), onClosed = vi.fn(), onStarted = vi.fn();
  return { call: new GptLiveCall({ onTurn, onSpeaking, onClosed, onStarted }), onTurn, onClosed, onStarted };
}
async function connected(maxSeconds = 300) {
  const fixture = create();
  const starting = fixture.call.start("call-id", maxSeconds);
  await settle();
  const peer = Peer.all[0]; peer.channel.emit({ type: "session.started", event_id: "start" });
  await starting;
  return { ...fixture, peer, channel: peer.channel };
}
describe("GPT-Live WebRTC lifecycle", () => {
  it("waits for session.started, uses server SDP and never sends a Realtime/session.start command", async () => {
    const f = await connected();
    expect(f.onStarted).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/voice/session");
    expect(f.peer.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "v=0\r\nanswer" });
    expect(f.channel.sent).toEqual([]);
    f.call.sendNote("Interest is 20");
    expect(f.channel.sent[0]).toMatchObject({ type: "session.thinking.append", delegation_id: null, content: "Interest is 20" });
    f.call.teardown();
  });
  it("deduplicates full-duplex captions, retaining source timestamps and late rep fragments", async () => {
    const f = await connected();
    f.channel.emit({ type: "session.input_transcript.delta", event_id: "r1", delta: "How does ", start_ms: 1000, end_ms: 1500 });
    f.channel.emit({ type: "session.output_transcript.delta", event_id: "b1", delta: "Mm-hm.", start_ms: 1200, end_ms: 1400 });
    await vi.advanceTimersByTimeAsync(1600); expect(f.onTurn).not.toHaveBeenCalled();
    f.channel.emit({ type: "session.input_transcript.delta", event_id: "r2", delta: "onboarding work?", start_ms: 1500, end_ms: 3000 });
    f.channel.emit({ type: "session.input_transcript.delta", event_id: "r2", delta: "onboarding work?", start_ms: 1500, end_ms: 3000 });
    await vi.advanceTimersByTimeAsync(2600);
    expect(f.onTurn.mock.calls.map(([turn]) => turn)).toEqual([
      { role: "rep", text: "How does onboarding work?", start: 1, end: 3 },
      { role: "buyer", text: "Mm-hm.", start: 1.2, end: 1.4 },
    ]);
    f.call.teardown();
  });
  it("waits for final provider captions and final usage before notifying closure", async () => {
    const f = await connected();
    f.channel.emit({ type: "session.input_transcript.delta", event_id: "r1", delta: "Thank you", start_ms: 1000, end_ms: 1500 });
    const closing = f.call.end();
    expect(f.channel.sent.at(-1)?.type).toBe("session.close"); expect(f.onClosed).not.toHaveBeenCalled();
    f.channel.emit({ type: "session.output_transcript.delta", event_id: "b1", delta: "Goodbye.", start_ms: 1500, end_ms: 2000 });
    f.channel.emit({ type: "session.closed", event_id: "done", usage: { seconds: 2 } });
    await closing;
    expect(f.onTurn.mock.calls.at(-1)?.[0].text).toBe("Goodbye.");
    expect(f.onClosed).toHaveBeenCalledExactlyOnceWith("close_requested", true);
    expect(track.stop).toHaveBeenCalled(); expect(f.peer.close).toHaveBeenCalledTimes(1);
    f.call.teardown(); expect(f.onClosed).toHaveBeenCalledTimes(1);
  });
  it("reports an unconfirmed close when the provider never acknowledges it", async () => {
    const f = await connected(); const closing = f.call.end();
    await vi.advanceTimersByTimeAsync(2000); await closing;
    expect(f.onClosed).toHaveBeenCalledExactlyOnceWith("close_requested", false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops a microphone granted after cancellation and makes no paid handshake", async () => {
    let grant: ((stream: Stream) => void) | undefined;
    getMedia.mockReturnValue(new Promise(resolve => { grant = resolve; }));
    const f = create(); const starting = f.call.start("call-id");
    const rejected = expect(starting).rejects.toThrow(/cancelled|timed out/);
    f.call.teardown(); await rejected;
    grant!(stream); await settle();
    expect(track.stop).toHaveBeenCalledTimes(1); expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels ICE setup, releasing listeners, tracks and pending startup", async () => {
    Peer.ice = "gathering";
    const f = create(); const starting = f.call.start("call-id"); await settle();
    expect(Peer.all[0].listeners.size).toBe(1);
    const rejected = expect(starting).rejects.toThrow(/cancelled|timed out/);
    f.call.teardown(); await rejected; await settle();
    expect(Peer.all[0].listeners.size).toBe(0); expect(track.stop).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a late HTTP response after cancellation without applying its SDP", async () => {
    let respond: ((response: Response) => void) | undefined;
    fetcher.mockReturnValue(new Promise(resolve => { respond = resolve; }));
    const f = create(); const starting = f.call.start("call-id"); await settle();
    const rejected = expect(starting).rejects.toThrow(/cancelled|timed out/);
    f.call.teardown(); await rejected;
    respond!(Response.json({ sdp: "v=0\r\nlate answer" })); await settle();
    expect(Peer.all[0].setRemoteDescription).not.toHaveBeenCalled();
  });
  it("bounds the entire startup, even when microphone permission stays pending", async () => {
    getMedia.mockReturnValue(new Promise(() => {}));
    const f = create(); const starting = f.call.start("call-id");
    const rejected = expect(starting).rejects.toThrow(/cancelled|timed out/);
    await vi.advanceTimersByTimeAsync(20000); await rejected;
    expect(Peer.all[0].close).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("reports a broker configuration error and releases the microphone", async () => {
    fetcher.mockResolvedValue(new Response("private server details", { status: 503 }));
    const f = create();
    await expect(f.call.start("call-id")).rejects.toThrow("GPT-Live is not configured. Switch to text mode.");
    expect(track.stop).toHaveBeenCalled(); expect(f.onClosed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("explains microphone denial without exposing internal browser details", async () => {
    getMedia.mockRejectedValue(new DOMException("device-private-details", "NotAllowedError"));
    const f = create();
    await expect(f.call.start("call-id")).rejects.toThrow("Microphone access is unavailable. Allow your microphone or switch to text mode.");
    expect(fetcher).not.toHaveBeenCalled(); expect(Peer.all[0].close).toHaveBeenCalled();
  });
  it("closes a five-minute call without relying on an undocumented provider duration field", async () => {
    const f = await connected();
    await vi.advanceTimersByTimeAsync(300000);
    expect(f.channel.sent.at(-1)?.type).toBe("session.close");
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.onClosed).toHaveBeenCalledExactlyOnceWith("time_limit", false);
  });
  it("lets the buyer hang up only after farewell playback grace and never on a quoted goodbye", async () => {
    const f = await connected();
    f.peer.ontrack?.({ track: {} });
    f.channel.emit({ type: "session.output_transcript.delta", event_id: "b1", delta: "Thanks for calling. Goodbye.", start_ms: 0, end_ms: 1000 });
    await vi.advanceTimersByTimeAsync(2500);
    expect(f.channel.sent.some(event => event.type === "session.close")).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.channel.sent.at(-1)?.type).toBe("session.close");
    f.channel.emit({ type: "session.closed", event_id: "closed", usage: { seconds: 4 } });
    expect(f.onClosed).toHaveBeenCalledExactlyOnceWith("buyer_hangup", true);
  });
  it("does not hang up on a negated farewell in the actual event loop", async () => {
    const f = await connected(); f.peer.ontrack?.({ track: {} });
    f.channel.emit({ type: "session.output_transcript.delta", event_id: "b1", delta: "Please don't say goodbye.", start_ms: 0, end_ms: 1000 });
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.channel.sent.some(event => event.type === "session.close")).toBe(false);
    f.call.teardown();
  });
});
