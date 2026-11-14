"use client";
// [A] Call screen: briefing → live call with the interest meter → debrief.
// Voice and judge logic live in lib/voice/useBuyerCall (owned by B).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Switch } from "antd";
import { Lightbulb } from "lucide-react";
import type { CallMode, CallStart, Persona, PersonaPublic, SalesRole } from "@/lib/types";
import { useBuyerCall } from "@/lib/voice/useBuyerCall";
import { CUSTOM_PERSONA_KEY, DIFFICULTY_LABEL, ROLE_LABEL } from "@/lib/labels";
import { applyRole } from "@/lib/roles";
import { Meter } from "./Meter";
import { TurnRow } from "./DebriefView";
import { PhoneIcon } from "./Header";
import { Sk } from "./Skeletons";
import { BuyerMood } from "./BuyerMood";
import { PainTiles } from "./PainTiles";
import { CoachHint, type HintState } from "./CoachHint";
import { LimitScreen } from "./LimitScreen";

const HINTS_PREF_KEY = "cb_coach_hints";
/** Points each coach hint costs on the final score. */
const HINT_PENALTY = 3;

export default function CallRoom({ persona, role }: { persona: PersonaPublic | null; role: SalesRole }) {
  return <Room initial={persona} role={role} />;
}

function Room({ initial, role }: { initial: PersonaPublic | null; role: SalesRole }) {
  const router = useRouter();
  const [persona, setPersona] = useState<PersonaPublic | null>(initial);
  const [custom, setCustom] = useState<Persona | null>(null);
  const [mode, setMode] = useState<CallMode>("voice");
  const [starting, setStarting] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [callsLeft, setCallsLeft] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const callIdRef = useRef<string | null>(null);

  const call = useBuyerCall({
    onDone: (d) => router.push(`/debrief/${d.callId}`),
  });

  // Coach whisper. Hint requests run beside the judge and the buyer; nothing in the call loop awaits them.
  const [hintsOn, setHintsOn] = useState(false);
  const [hint, setHint] = useState<HintState>({ status: "idle" });
  const [hintsUsed, setHintsUsed] = useState(0);
  const hintedRef = useRef(-1);
  const hintAbortRef = useRef<AbortController | null>(null);
  const hintLimitedRef = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(HINTS_PREF_KEY) === "1") setHintsOn(true);
    } catch {
      /* Storage may be blocked; hints just start off. */
    }
  }, []);

  function toggleHints(on: boolean) {
    setHintsOn(on);
    try {
      localStorage.setItem(HINTS_PREF_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!on) {
      hintAbortRef.current?.abort();
      setHint({ status: "idle" });
    }
  }

  // After each BUYER turn (text and voice alike), fetch one suggested next line.
  useEffect(() => {
    if (!hintsOn || call.phase !== "live" || hintLimitedRef.current) return;
    const turns = call.turns;
    const i = turns.length - 1;
    const callId = callIdRef.current;
    if (i < 0 || turns[i].role !== "buyer" || i <= hintedRef.current || !callId) return;
    hintedRef.current = i;
    hintAbortRef.current?.abort();
    const ctrl = new AbortController();
    hintAbortRef.current = ctrl;
    setHint({ status: "loading" });
    fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, turns: turns.map(({ role, text, start, end }) => ({ role, text, start, end })) }),
      signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(6_000)]),
    })
      .then(async (r) => {
        if (ctrl.signal.aborted) return;
        if (r.status === 429) {
          hintLimitedRef.current = true;
          setHint({ status: "limited" });
          return;
        }
        if (!r.ok) throw new Error(`hint ${r.status}`);
        const d = (await r.json()) as { hint?: string; source?: "ai" | "heuristic" };
        if (ctrl.signal.aborted || !d.hint) return;
        setHint({ status: "ready", hint: d.hint, source: d.source === "ai" ? "ai" : "heuristic", id: i });
        setHintsUsed((n) => n + 1);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setHint({ status: "idle" });
      });
  }, [hintsOn, call.phase, call.turns]);

  // Stop any pending hint once the call is no longer live.
  useEffect(() => {
    if (call.phase === "live" || call.phase === "connecting") return;
    hintAbortRef.current?.abort();
  }, [call.phase]);
  useEffect(() => () => hintAbortRef.current?.abort(), []);

  // The penalty itself is applied on the server: /api/hint counts every delivered hint and
  // /api/debrief takes HINT_PENALTY points per hint off the total. This local count only drives the badge.
  useEffect(() => {
    const id = callIdRef.current;
    if (!id || hintsUsed === 0) return;
    try {
      sessionStorage.setItem(`cb_hints_${id}`, String(hintsUsed));
    } catch {
      /* ignore */
    }
  }, [hintsUsed]);

  // A custom buyer (from a job posting) comes from sessionStorage.
  useEffect(() => {
    if (initial) return;
    try {
      const raw = sessionStorage.getItem(CUSTOM_PERSONA_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Persona;
        setCustom(p);
        const r = applyRole(p, role); // The server independently applies the role to the saved buyer.
        setPersona({ id: p.id, name: p.name, firstName: p.firstName, title: p.title, company: p.company, industry: p.industry, product: p.product, difficulty: p.difficulty, goal: r.successStep, generated: true });
      }
    } catch {
      /* ignore */
    }
  }, [initial, role]);

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => r.json())
      .then((d) => setCallsLeft(d.callsLeft ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [call.turns.length]);

  // Mic blocked: switch to text right away instead of leaving the rep at a dead end.
  const [micFallback, setMicFallback] = useState(false);
  useEffect(() => {
    if (mode !== "voice" || call.phase !== "error" || !call.error) return;
    if (!/permission|denied|notallowed|microphone|mic\b/i.test(call.error)) return;
    call.reset();
    setMode("text");
    setMicFallback(true);
  }, [call, mode]);

  // Warn before closing the tab mid-call.
  useEffect(() => {
    if (call.phase !== "live") return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [call.phase]);

  async function begin(m: CallMode) {
    if (!persona) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(custom ? { customPersona: custom, mode: m, role } : { personaId: persona.id, mode: m, role }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setLimit(data.message);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the call.");
      const cs = data as CallStart & { callsLeft: number | null };
      callIdRef.current = cs.callId;
      hintAbortRef.current?.abort();
      hintedRef.current = -1;
      hintLimitedRef.current = false;
      setHint({ status: "idle" });
      setHintsUsed(0);
      setCallsLeft(cs.callsLeft);
      await call.start(cs, m);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Couldn't start the call.");
    } finally {
      setStarting(false);
    }
  }

  if (!persona) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="display text-3xl">Buyer not found</h1>
        <p className="mt-3 text-mute">Paste a job posting again or pick one of the ready-made buyers.</p>
        <Link href="/#buyers" className="btn btn-primary mt-6">
          Choose a buyer
        </Link>
      </div>
    );
  }

  const firstName = persona.firstName;
  const live = call.phase === "live" || call.phase === "connecting" || call.phase === "finishing" || call.phase === "done";
  const max = 300;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (limit) return <LimitScreen message={limit} />;

  if (!live) {
    // Briefing (and errors)
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-5 pb-32 pt-8 sm:py-10 lg:grid-cols-[1.2fr_1fr] lg:pb-10">
        <div className="rise">
          <div className="text-sm font-semibold uppercase tracking-wider text-acc">Your call brief</div>
          <h1 className="display mt-2 text-4xl sm:text-5xl">
            {role === "ae" ? `Discovery call with ${persona.name}` : `Cold-call ${persona.name}`}
          </h1>
          <p className="mt-2 text-lg text-mute">
            {persona.title} at {persona.company}
          </p>
          <dl className="mt-6 space-y-4">
            <Row label="Interview" value={`${ROLE_LABEL[role].title}. ${ROLE_LABEL[role].note}`} />
            <Row label="Company" value={persona.industry} />
            <Row label="You're selling" value={cap(persona.product)} />
            <Row label="Your goal" value={persona.goal} />
            <Row label="Difficulty" value={DIFFICULTY_LABEL[persona.difficulty]} />
          </dl>
          <div className="card mt-6 p-5">
            <div className="font-semibold">How the meter works</div>
            <ul className="mt-2 space-y-1.5 text-sm text-mute">
              <li>Interest goes up when you ask open questions and uncover real pain.</li>
              <li>It drops when you pitch too early, ignore objections or talk too long.</li>
              <li>{firstName} has three hidden problems, a budget and objections. Find them.</li>
            </ul>
          </div>
        </div>

        <div className="rise">
          <div className="rounded-3xl bg-panel p-6 text-fg">
            <div className="text-sm text-mute-d">Choose how to call</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ModeButton active={mode === "voice"} onClick={() => setMode("voice")} title="Voice" note="Recommended, uses your mic" />
              <ModeButton active={mode === "text"} onClick={() => setMode("text")} title="Text" note="No mic? Type instead" />
            </div>
            <CoachToggle on={hintsOn} onChange={toggleHints} className="mt-3" />
            <button className="btn btn-accent btn-cta mt-5 w-full py-4 text-lg" disabled={starting} onClick={() => begin(mode)}>
              {starting ? <Spinner /> : <PhoneIcon size={18} />} {starting ? `Dialing ${firstName}…` : `Call ${firstName}`}
            </button>
            <div className="mt-3 text-center text-xs text-mute-d">
              {mode === "voice" ? "Your browser will ask for the microphone. We keep the transcript, not the audio. " : ""}
              Up to 5 minutes.{" "}
              {callsLeft === null ? <span className="skeleton inline-block h-3 w-24 translate-y-0.5 rounded" aria-hidden="true" /> : `Free calls left: ${callsLeft}.`}
            </div>
            {micFallback && (
              <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm" role="status">
                Mic blocked, so we switched you to text. Same buyer, same score.
              </div>
            )}
            {(call.error || startError) && (
              <div className="mt-4 rounded-xl bg-bad/20 p-3 text-sm text-bad-d">
                {startError ?? call.error}
                {mode === "voice" && (
                  <button
                    className="ml-2 font-semibold underline"
                    onClick={() => {
                      call.reset();
                      setMode("text");
                    }}
                  >
                    Switch to text
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-mute">
            Not ready? <Link href="/sample" className="font-semibold text-fg underline-offset-4 hover:underline">Watch a sample call and debrief</Link>
          </p>
        </div>

        {/* Mobile: the call action is always one tap away, above the fold. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-panel/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 text-fg backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <div className="flex shrink-0 rounded-full bg-white/10 p-1 text-xs font-semibold" role="group" aria-label="Call mode">
              {(["voice", "text"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`min-h-9 rounded-full px-3 capitalize transition ${mode === m ? "bg-white/5 text-fg" : "text-mute-d"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button className="btn btn-accent btn-cta min-h-11 flex-1 py-3" disabled={starting} onClick={() => begin(mode)}>
              {starting ? <Spinner /> : <PhoneIcon />} {starting ? "Dialing…" : `Call ${firstName}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Live call
  const v = call.verdict;
  return (
    <div className="min-h-[calc(100vh-57px)] bg-panel text-fg">
      {/* Phone only: the meter, last delta and timer stay pinned under the header while you talk or type. */}
      <div className="sticky top-[65px] z-30 border-b border-white/[0.06] bg-panel/95 px-4 py-2.5 backdrop-blur lg:hidden" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className={`num w-12 text-lg ${call.score > 0 ? "text-good" : call.score < 0 ? "text-bad" : "text-fg"}`}>
            {call.score > 0 ? `+${call.score}` : call.score}
          </span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
            <div
              className={`absolute inset-y-0 w-1/2 transition-transform duration-700 ease-out ${call.score >= 0 ? "left-1/2 origin-left" : "right-1/2 origin-right"}`}
              style={{
                transform: `scaleX(${Math.min(1, Math.abs(call.score) / 100)})`,
                background: call.score >= 0 ? "linear-gradient(90deg,#34d399,#a3f7cf)" : "linear-gradient(270deg,#f43f5e,#fda4af)",
              }}
            />
          </div>
          {typeof v?.delta === "number" && (
            <span key={call.turns.length} className={`pop num rounded-full px-2 py-0.5 text-xs ${v.delta >= 0 ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>
              {v.delta > 0 ? `+${v.delta}` : v.delta}
            </span>
          )}
          <PainTiles found={call.painsFound} compact />
          <span className="num text-xs text-mute-d">
            {mmss(call.elapsed)} / {mmss(max)}
          </span>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <BuyerMood firstName={firstName} name={persona.name} score={call.score} speaking={call.isSpeaking} />
            <div>
              <div className="display text-2xl">{persona.name}</div>
              <div className="text-sm text-mute-d">
                {persona.title} · {persona.company}
              </div>
              <div className="mt-1 text-sm">
                {call.phase === "connecting" && <span className="text-acc-d">Dialing…</span>}
                {call.phase === "live" && (
                  <span className={call.isSpeaking ? "text-acc-d" : "text-good-d"}>
                    {call.isSpeaking ? `${firstName} is talking…` : mode === "voice" ? "Your turn, go ahead" : "Your turn, type below"}
                  </span>
                )}
                {(call.phase === "finishing" || call.phase === "done") && <span className="text-acc-d">Call ended. Building your debrief…</span>}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono text-2xl tabular-nums">{mmss(call.elapsed)}</div>
              <div className="text-xs text-mute-d">of {mmss(max)}</div>
            </div>
          </div>

          <div className="rounded-3xl bg-panel-2 p-6">
            <Meter mood score={call.score} delta={v?.delta ?? null} reason={v?.reason ?? (role === "ae" ? "Thank them, confirm the time and set the agenda." : "Start with your name and the reason for your call.")} />
          </div>

          <div className="rounded-3xl bg-panel-2 p-5 text-sm text-mute-d">
            <div className="font-semibold text-fg">Goal: {persona.goal}</div>
            <div className="mt-1">You're selling {persona.product}.</div>
            <div className="mt-4">
              <PainTiles found={call.painsFound} />
            </div>
          </div>

          {call.phase === "finishing" || call.phase === "done" ? (
            <div className="rounded-3xl bg-panel-2 p-5" role="status" aria-live="polite">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-fg">Building your debrief…</span>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-acc-d border-t-transparent" aria-hidden="true" />
              </div>
              <ul className="mt-3 space-y-1 text-xs text-mute-d">
                <li>✓ Transcript saved</li>
                <li>… Judge is checking every quote</li>
                <li>… Writing better lines for you</li>
              </ul>
              <Sk dark className="mt-4 h-10 w-28" />
              <Sk dark className="mt-3 h-3 w-full" />
              <Sk dark className="mt-2 h-3 w-4/5" />
            </div>
          ) : (
            <button className="btn btn-danger w-full py-4 text-lg" disabled={call.phase !== "live"} onClick={() => call.end()}>
              End call and get debrief
            </button>
          )}
        </div>

        <div className="flex min-h-[420px] flex-col rounded-3xl bg-panel-2 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-mute-d">Live transcript</span>
            <span className="flex items-center gap-2">
              {hintsUsed > 0 && (
                <span key={hintsUsed} className="chip pop bg-vio/15 text-[#b9a8ff]" title={`Each hint costs ${HINT_PENALTY} points on your final score`}>
                  hints used: {hintsUsed} (−{HINT_PENALTY} each)
                </span>
              )}
              <CoachToggle on={hintsOn} onChange={toggleHints} compact />
            </span>
          </div>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
            {call.turns.length === 0 && (
              <div className="space-y-2" role="status" aria-live="polite">
                <p className="px-1 pb-1 text-sm text-mute-d">
                  {call.phase === "connecting" ? `Connecting to ${firstName}… allow the mic if asked.` : `Waiting for ${firstName} to pick up…`}
                </p>
                <Sk dark className="h-16 w-4/5 rounded-2xl" />
                <Sk dark className="ml-auto h-12 w-3/5 rounded-2xl" />
              </div>
            )}
            {call.turns.map((t, i) => (
              <div key={i} className={t.role === "rep" ? "in-right" : "in-left"}>
                <TurnRow t={t} name={firstName} dark />
              </div>
            ))}
          </div>
          {call.phase === "live" && hintsOn && <CoachHint state={hint} onDismiss={() => setHint({ status: "idle" })} />}
          {mode === "text" && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                call.sendText(draft);
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Say something to ${firstName}…`}
                className="flex-1 rounded-full border border-white/10 bg-panel px-4 py-3 text-fg outline-none placeholder:text-mute-d focus:border-acc-d"
                disabled={call.phase !== "live"}
                autoFocus
              />
              <button className="btn btn-accent" disabled={call.phase !== "live" || !draft.trim()}>
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 border-b border-line pb-3 sm:grid-cols-[130px_1fr]">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="text-sm font-medium sm:text-base">{value}</dd>
    </div>
  );
}

function ModeButton({ active, onClick, title, note }: { active: boolean; onClick: () => void; title: string; note: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${active ? "border-acc-d bg-white/5" : "border-white/10 hover:border-white/30"}`}
      aria-pressed={active}
    >
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-mute-d">{note}</div>
    </button>
  );
}

function CoachToggle({ on, onChange, compact = false, className = "" }: { on: boolean; onChange: (on: boolean) => void; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <label className={`flex cursor-pointer items-center gap-2 text-xs text-mute-d ${className}`}>
        <Lightbulb size={13} className={on ? "text-[#b9a8ff]" : ""} aria-hidden="true" />
        <span>Coach hints: {on ? "on" : "off"}</span>
        <Switch size="small" checked={on} onChange={onChange} aria-label="Coach hints" />
      </label>
    );
  }
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-4 ${className}`}>
      <div>
        <div className="flex items-center gap-1.5 font-semibold">
          <Lightbulb size={15} className={on ? "text-[#b9a8ff]" : "text-mute-d"} aria-hidden="true" />
          Coach hints: {on ? "on" : "off"}
        </div>
        <div className="mt-0.5 text-xs text-mute-d">A whispered next line after each buyer turn.</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="chip bg-white/10 text-mute-d">−{HINT_PENALTY} per hint</span>
        <Switch checked={on} onChange={onChange} aria-label="Coach hints" />
      </div>
    </div>
  );
}
