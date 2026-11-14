"use client";
// [B] GPT-Live voice and independent text buyer. Voice never waits for scoring.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CallMode, CallStart, Debrief, JudgeResponse, TimelinePoint, Turn, VoiceProvider } from "../types";
import { interestUpdate } from "./brief";
import { initialInterest } from "../ai/interest";
import { TranscriptClock } from "./transcript";
import { GptLiveCall } from "./gptLive";
import { trackEvent } from "../analytics";

export type CallPhase = "idle" | "connecting" | "live" | "finishing" | "done" | "error";
export function useBuyerCall(opts: { onDone: (debrief: Debrief) => void }) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [score, setScore] = useState(0);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([{ t: 0, score: 0 }]);
  const [verdict, setVerdict] = useState<JudgeResponse | null>(null);
  const [painsFound, setPainsFound] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<VoiceProvider>("gpt-live");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const callRef = useRef<CallStart | null>(null);
  const modeRef = useRef<CallMode>("voice");
  const t0 = useRef(0);
  const liveRef = useRef(false);
  const finishedRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const scoreRef = useRef(0);
  const timelineRef = useRef<TimelinePoint[]>([]);
  const painsRef = useRef(new Set<string>());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const runRef = useRef(0);
  const abortRef = useRef(new AbortController());
  const clockRef = useRef(new TranscriptClock());
  const gptRef = useRef<GptLiveCall | null>(null);
  const textQueueRef = useRef<Promise<void>>(Promise.resolve());
  const onDoneRef = useRef(opts.onDone);
  onDoneRef.current = opts.onDone;
  const now = () => Math.min(300, Math.max(0, (performance.now() - t0.current) / 1000));

  const judge = useCallback((index: number) => {
    const call = callRef.current;
    const run = runRef.current;
    const signal = abortRef.current.signal;
    const context = turnsRef.current.slice(0, index + 1);
    const repNumber = context.filter(t => t.role === "rep").length;
    if (!call) return;
    queueRef.current = queueRef.current.then(async () => {
      if (run !== runRef.current || signal.aborted) return;
      const response = await fetch("/api/judge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call.callId, turns: context, score: scoreRef.current }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      });
      if (!response.ok) throw new Error(`judge ${response.status}`);
      const v = await response.json() as JudgeResponse;
      if (run !== runRef.current || signal.aborted) return;
      scoreRef.current = v.score; v.painsUncovered.forEach(p => painsRef.current.add(p));
      let repIndex = 0;
      turnsRef.current = turnsRef.current.map(t => t.role === "rep" && ++repIndex === repNumber ? { ...t, delta: v.delta, score: v.score, reason: v.reason, judgeSource: v.source } : t);
      timelineRef.current = [...timelineRef.current, { t: context.at(-1)!.end, score: v.score }];
      setScore(v.score); setVerdict(v); setTurns(turnsRef.current); setTimeline(timelineRef.current); setPainsFound([...painsRef.current]);
      if (liveRef.current && modeRef.current === "voice") gptRef.current?.sendNote(interestUpdate(v.score));
    }).catch(() => {
      if (run === runRef.current && !signal.aborted) setError("Scoring is delayed. Your transcript will still be included in the debrief.");
    });
  }, []);

  const appendTurn = useCallback((turn: Turn) => {
    turnsRef.current = [...turnsRef.current, turn]; setTurns(turnsRef.current);
    if (turn.role === "rep") judge(turnsRef.current.length - 1);
  }, [judge]);

  const addTurn = useCallback((role: Turn["role"], text: string) => {
    const turn = clockRef.current.turn(role, text, now());
    if (!turn) return;
    turn.start = Math.max(turn.start, turnsRef.current.at(-1)?.start ?? 0); turn.end = Math.max(turn.start, turn.end);
    appendTurn(turn);
  }, [appendTurn]);

  const finish = useCallback(async () => {
    if (finishedRef.current || !liveRef.current) return;
    finishedRef.current = true; liveRef.current = false; setPhase("finishing");
    const call = callRef.current; const run = runRef.current;
    if (!call) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([queueRef.current, new Promise(r => { timer = setTimeout(r, 10_000); })]); clearTimeout(timer);
    if (run !== runRef.current) return;
    abortRef.current.abort();
    try {
      const response = await fetch("/api/debrief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: call.callId, turns: turnsRef.current }), signal: AbortSignal.timeout(40_000),
      });
      if (!response.ok) throw new Error(`debrief ${response.status}`);
      const d = await response.json() as Debrief;
      if (run !== runRef.current) return;
      setPhase("done");
      try { trackEvent("call_finished", { mode: modeRef.current, durationSec: Math.round(now()), source: d.source, outcome: d.outcome }); } catch { /* Analytics cannot break the call. */ }
      onDoneRef.current(d);
    } catch {
      if (run === runRef.current) { setError("Couldn't build the debrief. Please try again."); setPhase("error"); }
    }
  }, []);

  const start = useCallback(async (call: CallStart, mode: CallMode) => {
    const run = ++runRef.current;
    finishedRef.current = true; liveRef.current = false; gptRef.current?.teardown(); gptRef.current = null;
    abortRef.current.abort();
    abortRef.current = new AbortController(); clockRef.current = new TranscriptClock();
    callRef.current = call; modeRef.current = mode; finishedRef.current = false; liveRef.current = false; textQueueRef.current = Promise.resolve();
    turnsRef.current = []; scoreRef.current = initialInterest(call.persona.difficulty);
    timelineRef.current = [{ t: 0, score: scoreRef.current }]; painsRef.current = new Set(); queueRef.current = Promise.resolve();
    setTurns([]); setScore(scoreRef.current); setTimeline(timelineRef.current); setVerdict(null); setPainsFound([]); setElapsed(0); setError(null); setPhase("connecting"); setProvider(mode === "voice" ? "gpt-live" : "text"); setIsSpeaking(false);
    const connected = () => {
      if (run !== runRef.current || finishedRef.current || liveRef.current) return;
      t0.current = performance.now(); liveRef.current = true; setPhase("live");
      try {
        trackEvent("call_started", { mode, difficulty: call.persona.difficulty });
        const previous = Number(sessionStorage.getItem("cb_started_calls") ?? 0);
        sessionStorage.setItem("cb_started_calls", String(Number.isFinite(previous) ? previous + 1 : 1));
        if (previous === 1) trackEvent("second_call", { mode });
      } catch { /* Browser storage or Analytics may be unavailable. */ }
    };
    if (mode === "text") {
      connected(); addTurn("buyer", call.voice.openingLine); return;
    }
    const gpt = new GptLiveCall({
      onStarted: connected,
      onTurn: turn => { if (run === runRef.current && liveRef.current && !finishedRef.current) appendTurn(turn); },
      onSpeaking: speaking => { if (run === runRef.current) setIsSpeaking(speaking); },
      onClosed: (reason, usageConfirmed) => {
        if (run !== runRef.current || finishedRef.current) return;
        if (!usageConfirmed && reason !== "close_requested") setError("Voice disconnected. Your transcript is kept for the debrief.");
        void finish();
      },
    });
    gptRef.current = gpt;
    try {
      await gpt.start(call.callId, call.voice.maxSeconds);
    } catch (cause) {
      if (run === runRef.current && !finishedRef.current) {
        finishedRef.current = true; liveRef.current = false;
        setError(cause instanceof Error ? cause.message : "Voice is unavailable. Switch to text mode."); setPhase("error");
      }
    }
  }, [addTurn, appendTurn, finish]);

  const end = useCallback(() => {
    const gpt = gptRef.current;
    const run = runRef.current;
    if (!liveRef.current) { finishedRef.current = true; void gpt?.end(); setPhase("idle"); return; }
    setPhase("finishing");
    if (modeRef.current === "voice" && gpt) void gpt.end().then(() => { if (run === runRef.current) return finish(); });
    else void finish();
  }, [finish]);

  const sendText = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || clean.length > 4000 || !liveRef.current) return;
    const run = runRef.current;
    textQueueRef.current = textQueueRef.current.then(async () => {
      try {
        if (!liveRef.current || run !== runRef.current) return;
        addTurn("rep", clean);
        await queueRef.current;
        if (!liveRef.current || run !== runRef.current) return;
        const response = await fetch("/api/buyer", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: callRef.current!.callId, turns: turnsRef.current }), signal: AbortSignal.any([abortRef.current.signal, AbortSignal.timeout(12_000)]),
        });
        if (!response.ok) throw new Error("buyer failed");
        const reply = await response.json() as { text: string };
        if (liveRef.current && run === runRef.current) addTurn("buyer", reply.text);
      } catch {
        if (liveRef.current && run === runRef.current) setError("The buyer could not reply. End the call to keep your debrief.");
      }
    });
  }, [addTurn]);

  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => { const s = now(); setElapsed(s); if (s >= Math.min(300, callRef.current?.voice.maxSeconds ?? 300)) end(); }, 500);
    return () => clearInterval(id);
  }, [phase, end]);
  useEffect(() => () => {
    ++runRef.current; finishedRef.current = true; liveRef.current = false; abortRef.current.abort(); void gptRef.current?.end("page_left");
  }, []);
  return { phase, turns, score, timeline, verdict, painsFound, elapsed, error, provider, isSpeaking,
    start, end, sendText, reset: () => { setPhase("idle"); setError(null); } };
}
