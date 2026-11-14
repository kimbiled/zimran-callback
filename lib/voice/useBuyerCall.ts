"use client";
// [B] Call with the AI buyer plus live scoring by the judge.
// Voice: GPT-Live (OpenAI, WebRTC) when the server enables it, otherwise ElevenLabs Agents.
// Text mode and any GPT-Live connection failure fall back to ElevenLabs.
// Use inside <ConversationProvider> from @elevenlabs/react.

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import type { CallMode, CallStart, Debrief, JudgeResponse, TimelinePoint, Turn, VoiceProvider } from "../types";
import { estimateSeconds } from "../metrics";
import { interestUpdate } from "./brief";
import { GptLiveCall } from "./gptLive";

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
  const [transport, setTransport] = useState<VoiceProvider>("elevenlabs");
  const [gptSpeaking, setGptSpeaking] = useState(false);

  const callRef = useRef<CallStart | null>(null);
  const modeRef = useRef<CallMode>("voice");
  const gptRef = useRef<GptLiveCall | null>(null);
  const cancelledRef = useRef(false);
  const t0 = useRef(0);
  const liveRef = useRef(false);
  const finishedRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const scoreRef = useRef(0);
  const timelineRef = useRef<TimelinePoint[]>([{ t: 0, score: 0 }]);
  const painsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onDoneRef = useRef(opts.onDone);
  onDoneRef.current = opts.onDone;

  const now = () => (t0.current ? (performance.now() - t0.current) / 1000 : 0);

  const onConnected = () => {
    t0.current = performance.now();
    liveRef.current = true;
    setPhase("live");
  };

  const conversation = useConversation({
    onConnect: onConnected,
    onDisconnect: () => {
      void finish();
    },
    onError: (message: string) => {
      console.error("voice error", message);
      if (!liveRef.current) {
        setError(`Couldn't reach ${callRef.current?.voice.dynamicVariables.name ?? "the buyer"}. ${message || "The voice service is unavailable."}`);
        setPhase("error");
      }
    },
    onMessage: ({ message, role }) => {
      if (!message?.trim()) return;
      if (role === "user") {
        // In text mode we add the rep turn ourselves when sending.
        if (modeRef.current === "text") return;
        addTurn("rep", message);
      } else {
        addTurn("buyer", message);
      }
    },
  });
  const convRef = useRef(conversation);
  convRef.current = conversation;

  /** Private note to whichever voice provider runs the call */
  const sendNote = (note: string) => {
    if (gptRef.current) gptRef.current.sendNote(note);
    else convRef.current.sendContextualUpdate(note);
  };

  const judge = useCallback((index: number) => {
    const call = callRef.current;
    if (!call) return;
    queueRef.current = queueRef.current
      .then(async () => {
        const res = await fetch("/api/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callId: call.callId,
            turns: turnsRef.current.slice(0, index + 1),
            score: scoreRef.current,
            painsFound: [...painsRef.current],
          }),
        });
        if (!res.ok) return;
        const v = (await res.json()) as JudgeResponse;
        scoreRef.current = v.score;
        v.painsUncovered.forEach((p) => painsRef.current.add(p));
        turnsRef.current = turnsRef.current.map((t, i) => (i === index ? { ...t, delta: v.delta, score: v.score, reason: v.reason } : t));
        const at = turnsRef.current[index]?.end ?? now();
        timelineRef.current = [...timelineRef.current, { t: Math.round(at * 10) / 10, score: v.score }];
        setScore(v.score);
        setVerdict(v);
        setTurns(turnsRef.current);
        setTimeline(timelineRef.current);
        setPainsFound([...painsRef.current]);
        if (liveRef.current) {
          try {
            sendNote(interestUpdate(v.score));
          } catch {
            /* the call may have ended */
          }
        }
      })
      .catch((e) => console.error("judge failed", e));
  }, []);

  const addTurn = useCallback(
    (role: Turn["role"], text: string) => {
      const t = now();
      const d = estimateSeconds(text);
      const prevEnd = turnsRef.current.at(-1)?.end ?? 0;
      // Durations are estimated from word count; turns are laid out back to back,
      // so talk ratio stays honest even when transcripts arrive late or in bursts.
      const start = role === "rep" ? Math.max(prevEnd, t - d) : Math.max(t, prevEnd);
      const turn: Turn = { role, text, start, end: start + d };
      turn.start = Math.round(turn.start * 10) / 10;
      turn.end = Math.round(turn.end * 10) / 10;
      turnsRef.current = [...turnsRef.current, turn];
      setTurns(turnsRef.current);
      if (role === "rep") judge(turnsRef.current.length - 1);
    },
    [judge],
  );

  const finish = useCallback(async () => {
    if (finishedRef.current || !liveRef.current) return;
    finishedRef.current = true;
    liveRef.current = false;
    setPhase("finishing");
    const call = callRef.current;
    if (!call) return;
    // Wait for the last judge verdicts (10 seconds max).
    await Promise.race([queueRef.current, new Promise((r) => setTimeout(r, 10000))]);
    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: call.callId,
          turns: turnsRef.current,
          timeline: timelineRef.current,
          painsFound: [...painsRef.current],
        }),
      });
      if (!res.ok) throw new Error(`debrief ${res.status}`);
      const d = (await res.json()) as Debrief;
      setPhase("done");
      onDoneRef.current(d);
    } catch (e) {
      console.error(e);
      setError("Couldn't build the debrief. Please refresh the page.");
      setPhase("error");
    }
  }, []);

  const start = useCallback(async (call: CallStart, mode: CallMode) => {
    callRef.current = call;
    modeRef.current = mode;
    gptRef.current?.teardown();
    gptRef.current = null;
    cancelledRef.current = false;
    finishedRef.current = false;
    liveRef.current = false;
    turnsRef.current = [];
    scoreRef.current = 0;
    timelineRef.current = [{ t: 0, score: 0 }];
    painsRef.current = new Set();
    queueRef.current = Promise.resolve();
    t0.current = 0;
    setTurns([]);
    setScore(0);
    setTimeline(timelineRef.current);
    setVerdict(null);
    setPainsFound([]);
    setElapsed(0);
    setError(null);
    setTransport("elevenlabs");
    setGptSpeaking(false);
    setPhase("connecting");

    if (mode === "voice") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setError("No microphone access. Allow the microphone in your browser or switch to text mode.");
        setPhase("error");
        return;
      }
    }

    const { voice } = call;

    if (mode === "voice" && voice.provider === "gpt-live") {
      const g = new GptLiveCall({
        onTurn: (role, text) => addTurn(role, text),
        onSpeaking: setGptSpeaking,
        onClosed: () => void finish(),
      });
      gptRef.current = g;
      try {
        await g.start(call.callId, voice.dynamicVariables.opening_line);
        setTransport("gpt-live");
        onConnected();
        return;
      } catch (e) {
        gptRef.current = null;
        if (cancelledRef.current) {
          setPhase("idle");
          return;
        }
        console.warn("GPT-Live failed, falling back to ElevenLabs", e);
      }
    }

    const common = {
      dynamicVariables: voice.dynamicVariables,
      overrides: { tts: { voiceId: voice.voiceId }, conversation: { textOnly: mode === "text" } },
      textOnly: mode === "text",
    };
    try {
      if (voice.signedUrl) {
        convRef.current.startSession({ ...common, signedUrl: voice.signedUrl, connectionType: "websocket" });
      } else if (voice.agentId) {
        convRef.current.startSession({ ...common, agentId: voice.agentId, connectionType: mode === "voice" ? "webrtc" : "websocket" });
      } else {
        throw new Error("Voice agent is not configured.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the call.");
      setPhase("error");
    }
  }, []);

  const end = useCallback(() => {
    if (!liveRef.current) cancelledRef.current = true;
    const g = gptRef.current;
    if (g) {
      // Flushes the open turn (so it gets judged) before the debrief starts.
      g.end();
    } else {
      try {
        convRef.current.endSession();
      } catch {
        /* already disconnected */
      }
    }
    void finish();
  }, [finish]);

  const sendText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || !liveRef.current) return;
      addTurn("rep", clean);
      convRef.current.sendUserMessage(clean);
    },
    [addTurn],
  );

  // Timer and hard cap on call length.
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const s = now();
      setElapsed(s);
      const max = callRef.current?.voice.maxSeconds ?? 300;
      if (s >= max) end();
    }, 500);
    return () => clearInterval(id);
  }, [phase, end]);

  // Leaving the page mid-call releases the mic and the OpenAI session.
  useEffect(() => () => gptRef.current?.teardown(), []);

  return {
    phase,
    turns,
    score,
    timeline,
    verdict,
    painsFound,
    elapsed,
    error,
    provider: transport,
    isSpeaking: transport === "gpt-live" ? gptSpeaking : conversation.isSpeaking,
    start,
    end,
    sendText,
    reset: () => {
      setPhase("idle");
      setError(null);
    },
  };
}
