"use client";
// Daily 60-second objection drill: one buyer objection, a countdown ring, a typed answer,
// then the judge's verdict, a better line and the streak.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, CalendarCheck, Flame, Lightbulb, Phone, Quote, RotateCcw, Send, Sparkles, Timer } from "lucide-react";
import type { Difficulty } from "@/lib/types";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { localYmd } from "@/lib/plan7";
import { Reveal } from "./Reveal";
import { Sk } from "./Skeletons";

export type DrillObjection = {
  id: string;
  text: string;
  personaId: string;
  buyer: string;
  firstName: string;
  title: string;
  company: string;
  difficulty: Difficulty;
  themeLabel: string;
  pattern: string;
};

type Streak = { streak: number; doneToday: boolean };
type Result = {
  score: number;
  reason: string;
  evidenceQuote: string;
  source: "ai" | "heuristic";
  sayInstead: string;
  pattern: string;
  streak: number;
  doneToday: boolean;
};
type Phase = "ready" | "running" | "timeout" | "scoring" | "result";

const SECONDS = 60;
/** Local dates (YYYY-MM-DD) with a finished drill; the progress plan reads it for checkmarks. */
export const DRILL_DAYS_KEY = "cb_drill_days";

export const DIFF_CHIP: Record<Difficulty, string> = {
  easy: "bg-good/15 text-good",
  medium: "bg-acc-d/15 text-acc",
  hard: "bg-bad/15 text-bad",
};

function rememberDrillDay() {
  try {
    const raw = localStorage.getItem(DRILL_DAYS_KEY);
    const days: string[] = raw ? JSON.parse(raw) : [];
    const today = localYmd();
    const next = [...new Set([...(Array.isArray(days) ? days : []), today])].slice(-30);
    localStorage.setItem(DRILL_DAYS_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the server streak still counts */
  }
}

export function DrillRoom({ objection, daily, dateLabel }: { objection: DrillObjection; daily: boolean; dateLabel: string }) {
  const [streak, setStreak] = useState<Streak | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [answer, setAnswer] = useState("");
  const [left, setLeft] = useState(SECONDS);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const startedAt = useRef<number | null>(null);
  const answerRef = useRef("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    fetch("/api/warmup")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Streak | null) => setStreak(s ?? { streak: 0, doneToday: false }))
      .catch(() => setStreak({ streak: 0, doneToday: false }));
  }, []);

  const submit = useCallback(async () => {
    // Read the box too, in case text landed before hydration wired up onChange.
    const text = (answerRef.current || boxRef.current?.value || "").trim();
    if (!text || submitting.current) return;
    submitting.current = true;
    answerRef.current = text;
    setAnswer(text);
    setError(null);
    setPhase("scoring");
    const seconds = startedAt.current ? Math.min(SECONDS, Math.round((Date.now() - startedAt.current) / 1000)) : undefined;
    try {
      const r = await fetch("/api/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectionId: objection.id, personaId: objection.personaId, answer: text, seconds }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "Couldn't score that answer. Try again.");
      setResult(body as Result);
      setStreak({ streak: body.streak, doneToday: body.doneToday });
      rememberDrillDay();
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't score that answer. Try again.");
      setPhase("timeout");
    } finally {
      submitting.current = false;
    }
  }, [objection.id, objection.personaId]);

  const start = useCallback(() => {
    if (startedAt.current) return;
    startedAt.current = Date.now();
    setPhase("running");
    requestAnimationFrame(() => boxRef.current?.focus());
  }, []);

  // Countdown from a fixed start time, so a throttled background tab stays accurate.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const s = Math.max(0, SECONDS - Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
      setLeft(s);
      if (s === 0) {
        if (answerRef.current.trim()) void submit();
        else setPhase("timeout");
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [phase, submit]);

  const reset = () => {
    startedAt.current = null;
    answerRef.current = "";
    setAnswer("");
    setLeft(SECONDS);
    setResult(null);
    setError(null);
    setAgain(true);
    setPhase("ready");
  };

  const restingDone = daily && streak?.doneToday && phase === "ready" && !again;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Reveal variant="down">
            <span className="eyebrow">
              <span className="chip bg-acc-d/15 text-acc">
                <Timer size={13} aria-hidden="true" /> 60 sec
              </span>
              {daily ? `Daily drill · ${dateLabel}` : "Objection practice"}
            </span>
          </Reveal>
          <Reveal as="h1" variant="blur" index={1} className="display mt-4 text-4xl sm:text-5xl">
            {daily ? (
              <>
                Today&apos;s <span className="text-gradient">objection</span>
              </>
            ) : (
              <>
                Handle <span className="text-gradient">this one</span>
              </>
            )}
          </Reveal>
          <Reveal as="p" index={2} className="mt-2 max-w-xl text-mute">
            Read it, then type what you&apos;d say on the call. You have one minute. The same judge that scores live calls scores this.
          </Reveal>
        </div>
        <Reveal index={3}>
          <StreakBadge streak={streak} />
        </Reveal>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          <ObjectionCard objection={objection} />

          {restingDone ? (
            <DoneToday objection={objection} streak={streak?.streak ?? 0} onAgain={() => setAgain(true)} />
          ) : phase === "scoring" ? (
            <ResultSkeleton />
          ) : phase === "result" && result ? (
            <ResultCard result={result} answer={answer} objection={objection} onAgain={reset} />
          ) : (
            <Reveal variant="up" index={1} className="card p-5 sm:p-6">
              <label htmlFor="drill-answer" className="flex items-center justify-between gap-3 text-sm font-semibold">
                <span>Your answer</span>
                <span className="text-xs font-normal text-mute-d">{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : "Aim for 1–3 sentences"}</span>
              </label>
              <textarea
                id="drill-answer"
                ref={boxRef}
                value={answer}
                onChange={(e) => {
                  answerRef.current = e.target.value;
                  setAnswer(e.target.value);
                  if (phase === "ready") start();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                maxLength={2000}
                rows={5}
                placeholder={`${objection.firstName} just said that. What do you say back?`}
                className="mt-3 w-full resize-none rounded-2xl border border-line bg-panel-2/70 p-4 text-base leading-relaxed outline-none transition-colors focus:border-acc-d"
              />
              {phase === "timeout" && !error && (
                <p className="mt-2 text-sm text-acc" role="status">
                  Time&apos;s up. Type your answer anyway and submit. The streak still counts.
                </p>
              )}
              {error && (
                <p className="mt-2 text-sm text-bad" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {phase === "ready" ? (
                  <button type="button" onClick={start} className="btn btn-accent btn-cta">
                    <Timer size={16} aria-hidden="true" /> Start 60 seconds
                  </button>
                ) : (
                  <button type="button" onClick={() => void submit()} disabled={!answer.trim()} className="btn btn-accent btn-cta cta-quiet">
                    <Send size={16} aria-hidden="true" /> Submit answer
                  </button>
                )}
                <span className="text-xs text-mute-d">
                  <kbd className="rounded border border-line px-1.5 py-0.5 font-mono">⌘/Ctrl</kbd> +{" "}
                  <kbd className="rounded border border-line px-1.5 py-0.5 font-mono">Enter</kbd> to submit
                </span>
              </div>
            </Reveal>
          )}
        </div>

        <div className="space-y-5">
          <Reveal variant="scale" index={2} className="spot card flex flex-col items-center p-6 text-center">
            <CountdownRing left={phase === "result" || restingDone ? 0 : left} active={phase === "running"} done={phase === "result" || !!restingDone} />
            <p className="mt-3 text-sm text-mute" aria-live="polite">
              {phase === "ready" && !restingDone && "The clock starts when you start typing."}
              {phase === "running" && (left <= 10 ? "Wrap it up with a question." : "Acknowledge, ask, move it forward.")}
              {phase === "timeout" && "Time's up."}
              {phase === "scoring" && "Scoring your answer…"}
              {(phase === "result" || restingDone) && "Drill complete."}
            </p>
          </Reveal>
          <Reveal variant="scale" index={3} className="card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-mute-d">
              <Sparkles size={13} className="text-acc" aria-hidden="true" /> Pattern · {objection.themeLabel}
            </div>
            <p className="mt-2 text-sm leading-relaxed">{objection.pattern}</p>
            <Link href="/objections" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-acc hover:underline">
              <BookOpen size={14} aria-hidden="true" /> All {daily ? "objections" : "objections and lines"}
            </Link>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function ObjectionCard({ objection }: { objection: DrillObjection }) {
  return (
    <Reveal variant="flip" className="spot card relative overflow-hidden p-6 sm:p-8">
      <Quote size={64} className="pointer-events-none absolute -right-2 -top-2 text-white/[0.05]" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${DIFF_CHIP[objection.difficulty]}`}>{DIFFICULTY_LABEL[objection.difficulty]}</span>
        <span className="chip bg-white/[0.06] text-mute">{objection.themeLabel}</span>
      </div>
      <blockquote className="display mt-5 text-3xl leading-tight sm:text-4xl">&ldquo;{objection.text}&rdquo;</blockquote>
      <div className="mt-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-acc to-vio font-semibold text-bg" aria-hidden="true">
          {objection.firstName[0]}
        </span>
        <div className="text-sm">
          <div className="font-semibold">{objection.buyer}</div>
          <div className="text-mute">
            {objection.title} · {objection.company}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function CountdownRing({ left, active, done }: { left: number; active: boolean; done: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = done ? 1 : left / SECONDS;
  const urgent = active && left <= 10;
  const color = done ? "var(--color-good)" : urgent ? "var(--color-bad)" : "var(--color-acc-d)";
  return (
    <div className="relative h-36 w-36" role="timer" aria-label={done ? "Drill complete" : `${left} seconds left`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 250ms linear, stroke 300ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {done ? (
          <CalendarCheck size={34} className="pop text-good" aria-hidden="true" />
        ) : (
          <span className={`num text-4xl ${urgent ? "text-bad" : ""}`}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        )}
      </div>
    </div>
  );
}

export function StreakBadge({ streak }: { streak: Streak | null }) {
  if (!streak) return <Sk className="h-12 w-40 rounded-full" />;
  const n = streak.streak;
  return (
    <div className="flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.04] py-2 pl-2 pr-4 backdrop-blur" aria-label={`${n}-day streak`}>
      <span className={`grid h-9 w-9 place-items-center rounded-full ${n > 0 ? "bg-acc-d/20" : "bg-white/[0.06]"}`}>
        <Flame size={20} className={n > 0 ? "text-acc" : "text-mute-d"} fill={n > 0 ? "currentColor" : "none"} aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <div key={n} className="num pop text-xl">
          {n} day{n === 1 ? "" : "s"}
        </div>
        <div className="text-xs text-mute">{streak.doneToday ? "Done today" : n > 0 ? "Drill today to keep it" : "Start a streak"}</div>
      </div>
    </div>
  );
}

function scoreTone(score: number) {
  if (score >= 75) return { text: "text-good", label: "Strong answer" };
  if (score >= 50) return { text: "text-acc", label: "Solid start" };
  return { text: "text-bad", label: "Needs work" };
}

function ResultCard({ result, answer, objection, onAgain }: { result: Result; answer: string; objection: DrillObjection; onAgain: () => void }) {
  const tone = scoreTone(result.score);
  return (
    <div className="space-y-5">
      <Reveal variant="scale" className="card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-mute">Drill score</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`num pop text-6xl ${tone.text}`}>{result.score}</span>
              <span className="text-mute">/100</span>
            </div>
            <div className={`mt-1 text-sm font-semibold ${tone.text}`}>{tone.label}</div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-acc-d/10 px-4 py-3">
            <Flame size={22} className="pop text-acc" fill="currentColor" aria-hidden="true" />
            <div className="leading-tight">
              <div className="num text-xl">{result.streak}</div>
              <div className="text-xs text-mute">day streak</div>
            </div>
          </div>
        </div>
        <p className="mt-5 text-lg leading-relaxed">{result.reason}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {result.evidenceQuote && (
            <span className="chip max-w-full bg-white/[0.06] text-fg">
              <Quote size={12} className="shrink-0 text-acc" aria-hidden="true" />
              <span className="truncate">&ldquo;{result.evidenceQuote}&rdquo;</span>
            </span>
          )}
          <span className="chip bg-white/[0.04] text-mute-d">{result.source === "ai" ? "AI judge" : "Quick check (offline judge)"}</span>
        </div>
        <details className="mt-4 text-sm text-mute">
          <summary className="cursor-pointer select-none hover:text-fg">Your answer</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-panel-2/60 p-3 text-fg">{answer}</p>
        </details>
      </Reveal>

      <Reveal variant="up" index={1} className="card border-acc-d/30 p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-acc">
          <Lightbulb size={14} aria-hidden="true" /> {result.score >= 80 ? "Another strong way to say it" : "Say instead"}
        </div>
        <p className="mt-2 text-lg leading-relaxed">&ldquo;{result.sayInstead}&rdquo;</p>
        <p className="mt-2 text-sm text-mute">{result.pattern}</p>
      </Reveal>

      <Reveal index={2} className="flex flex-wrap gap-3">
        <Link href={`/call/${objection.personaId}?role=sdr`} className="btn btn-accent btn-cta">
          <Phone size={16} aria-hidden="true" /> Take a full call with {objection.firstName}
        </Link>
        <button type="button" onClick={onAgain} className="btn btn-ghost">
          <RotateCcw size={15} aria-hidden="true" /> Try again
        </button>
        <Link href="/objections" className="btn btn-ghost">
          More objections <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </Reveal>
    </div>
  );
}

function DoneToday({ objection, streak, onAgain }: { objection: DrillObjection; streak: number; onAgain: () => void }) {
  const [until, setUntil] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const mins = Math.max(0, Math.round((next - now.getTime()) / 60000));
      setUntil(`${Math.floor(mins / 60)}h ${mins % 60}m`);
    };
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Reveal variant="up" index={1} className="card p-6 text-center sm:p-8">
      <Flame size={40} className="pop mx-auto text-acc" fill="currentColor" aria-hidden="true" />
      <h2 className="display mt-3 text-3xl">Come back tomorrow</h2>
      <p className="mx-auto mt-2 max-w-md text-mute">
        You&apos;ve done today&apos;s drill. Your streak is <strong className="text-fg">{streak} day{streak === 1 ? "" : "s"}</strong>.
        {until ? ` A new objection drops in ${until}.` : " A new objection drops at midnight UTC."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={`/call/${objection.personaId}?role=sdr`} className="btn btn-accent btn-cta">
          <Phone size={16} aria-hidden="true" /> Take a full call with {objection.firstName}
        </Link>
        <button type="button" onClick={onAgain} className="btn btn-ghost">
          <RotateCcw size={15} aria-hidden="true" /> Practice it again
        </button>
        <Link href="/objections" className="btn btn-ghost">
          <BookOpen size={15} aria-hidden="true" /> Objection library
        </Link>
      </div>
    </Reveal>
  );
}

function ResultSkeleton() {
  return (
    <div className="card p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Scoring your answer…</span>
      <Sk className="h-4 w-24" />
      <Sk className="mt-3 h-14 w-32" />
      <Sk className="mt-5 h-5 w-full" />
      <Sk className="mt-2 h-5 w-4/5" />
      <Sk className="mt-4 h-6 w-56 rounded-full" />
    </div>
  );
}
