"use client";
// [A] Call screen: briefing → live call with the interest meter → debrief.
// Voice and judge logic live in lib/voice/useBuyerCall (owned by B).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CallMode, CallStart, Persona, PersonaPublic, SalesRole } from "@/lib/types";
import { useBuyerCall } from "@/lib/voice/useBuyerCall";
import { CUSTOM_PERSONA_KEY, DIFFICULTY_LABEL, ROLE_LABEL } from "@/lib/labels";
import { applyRole } from "@/lib/roles";
import { Meter } from "./Meter";
import { TurnRow } from "./DebriefView";
import { PhoneIcon } from "./Header";
import { Sk } from "./Skeletons";

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

  // A custom buyer (from a job posting) comes from sessionStorage.
  useEffect(() => {
    if (initial) return;
    try {
      const raw = sessionStorage.getItem(CUSTOM_PERSONA_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Persona;
        setCustom(p);
        const r = applyRole(p, role); // The server independently applies the role to the saved buyer.
        setPersona({ id: p.id, name: p.name, title: p.title, company: p.company, industry: p.industry, product: p.product, difficulty: p.difficulty, goal: r.successStep, generated: true });
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

  const firstName = persona.name.split(" ")[0];
  const live = call.phase === "live" || call.phase === "connecting" || call.phase === "finishing" || call.phase === "done";
  const max = 300;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  if (limit) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="display text-3xl">Free calls used up</h1>
        <p className="mt-3 text-mute">{limit}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/pricing" className="btn btn-primary">
            See plans
          </Link>
          <Link href="/sample" className="btn btn-ghost">
            Watch a sample call
          </Link>
        </div>
      </div>
    );
  }

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
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div
              className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-panel-2 text-2xl font-bold ${call.isSpeaking ? "speaking" : ""}`}
              aria-hidden="true"
            >
              {firstName[0]}
            </div>
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
            <Meter score={call.score} delta={v?.delta ?? null} reason={v?.reason ?? (role === "ae" ? "Thank them, confirm the time and set the agenda." : "Start with your name and the reason for your call.")} />
          </div>

          <div className="rounded-3xl bg-panel-2 p-5 text-sm text-mute-d">
            <div className="font-semibold text-fg">Goal: {persona.goal}</div>
            <div className="mt-1">You're selling {persona.product}.</div>
            <div className="mt-1">
              Pains found:{" "}
              <span key={call.painsFound.length} className="pop inline-block font-semibold text-fg">
                {call.painsFound.length}
              </span>{" "}
              of 3
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
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-mute-d">Live transcript</div>
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
