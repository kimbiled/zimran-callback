"use client";
// [A] Full debrief: score, criteria with quotes, top fixes, interest replay, hidden profile reveal.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";
import type { CallRank, CallRecord, Criterion, Debrief, Turn } from "@/lib/types";
import { ScoreChart } from "./ScoreChart";
import { signed } from "./Meter";
import { FeedbackForm } from "./FeedbackForm";
import { trackEvent } from "@/lib/analytics";
import { ROLE_LABEL } from "@/lib/labels";
import { callMetrics, HEALTHY_WPM, rankLine } from "@/lib/metrics";
import { betterLineFor, emotionalDebrief } from "@/lib/emotion";
import { EmotionPanel } from "./EmotionPanel";
import { RetrySheet, type RetryTarget } from "./RetrySheet";
import { ShareCall } from "./ShareCall";

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.round(Math.max(0, sec)) % 60).padStart(2, "0")}`;

/** The rep turn a criterion quote came from: exact text match first, then the turn starting at `at`. */
function turnForCriterion(turns: Turn[], c: Criterion): number | null {
  if (!c.quote) return null;
  const clean = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").replace(/[.?!]+$/, "").trim();
  const q = clean(c.quote);
  const byText = turns.findIndex((t) => t.role === "rep" && clean(t.text).includes(q));
  if (byText >= 0) return byText;
  const byTime = c.at >= 0 ? turns.findIndex((t) => t.role === "rep" && Math.abs(Math.round(t.start) - c.at) <= 1) : -1;
  return byTime >= 0 ? byTime : null;
}

export function DebriefView({
  call,
  debrief,
  rank = null,
  owner = false,
}: {
  call: CallRecord;
  debrief: Debrief;
  /** Where this total sits among real practice calls with the same buyer (server-computed). */
  rank?: CallRank | null;
  /** The viewer started this call (session cookie matches). */
  owner?: boolean;
}) {
  const { persona, turns } = call;
  const repIdx = turns.map((t, i) => (t.role === "rep" ? i : -1)).filter((i) => i >= 0);
  const [selected, setSelected] = useState<number | null>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (call.isSample || viewed.current === call.id) return;
    viewed.current = call.id;
    trackEvent("debrief_viewed", { mode: call.mode, source: debrief.source });
  }, [call.id, call.isSample, call.mode, debrief.source]);

  const focusTurn = (turnIndex: number) => {
    setSelected(turnIndex);
    refs.current[turnIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const focusAt = (sec: number) => {
    if (sec < 0) return;
    const i = turns.findIndex((t) => t.role === "rep" && Math.abs(Math.round(t.start) - sec) <= 1);
    if (i >= 0) focusTurn(i);
  };
  // Timeline point k (k>=1) belongs to the k-th scored rep turn.
  const scored = repIdx.filter((i) => typeof turns[i].delta === "number");
  const selectedPoint = selected !== null ? scored.indexOf(selected) + 1 || null : null;

  const m = debrief.metrics;
  // Pace and pauses are recomputed from the transcript with the call mode, so older debriefs get them too.
  const pace = useMemo(() => callMetrics(turns, call.mode), [turns, call.mode]);
  const emotion = useMemo(
    () => emotionalDebrief({ turns, firstName: persona.firstName, mode: call.mode, initialScore: debrief.scoreTimeline[0]?.score, criteria: debrief.criteria }),
    [turns, persona.firstName, call.mode, debrief.scoreTimeline, debrief.criteria],
  );
  const rankText = rank ? rankLine(rank, persona.firstName) : null;

  // Retry is stateless and allowed on the viewer's own call and on published samples.
  const canRetry = call.status === "done" && (owner || call.isSample);
  const [retry, setRetry] = useState<RetryTarget | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const openRetry = (turnIndex: number, hint?: string | null) => {
    setRetry({ turnIndex, hint: hint ?? betterLineFor(turns[turnIndex], debrief.criteria) });
    setRetryOpen(true);
  };
  const wpm = pace.wordsPerMinute ?? null;
  const pause = pace.longestPauseBeforeAnswerSec ?? null;
  const tone = debrief.total >= 70 ? "text-good" : debrief.total >= 45 ? "text-acc" : "text-bad";
  const againHref = `${persona.generated ? "/call/custom" : `/call/${persona.id}`}?role=${persona.role ?? "sdr"}`;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {call.isSample && !owner && (
        <div className="mb-5 rounded-2xl bg-panel px-5 py-3 text-sm text-fg">
          Sample debrief. <Link href="/#buyers" className="font-semibold text-acc-d underline-offset-4 hover:underline">Make your own call</Link>, it's free.
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-6 rise">
          <div className="text-sm font-medium text-mute">
            Debrief · {ROLE_LABEL[persona.role ?? "sdr"].title} · {persona.name}, {persona.title} at {persona.company}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className={`display text-7xl tabular-nums ${tone}`}>
              {debrief.total}
              <span className="text-2xl text-mute">/100</span>
            </div>
            <div className="pb-2">
              <span className={`chip ${debrief.outcome === "meeting" ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
                {debrief.outcome === "meeting" ? "Meeting booked" : "No meeting"}
              </span>
              <div className="mt-2 text-sm text-mute">Final buyer interest {signed(debrief.finalScore)}</div>
              {!!debrief.hintPenalty && (
                <div className="mt-1 text-xs text-[#b9a8ff]">
                  −{debrief.hintPenalty} for {debrief.hintsUsed} coach hint{debrief.hintsUsed === 1 ? "" : "s"}
                </div>
              )}
            </div>
          </div>
          {rankText && (
            <div className="pop mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1.5 text-sm" style={{ animationDelay: "200ms" }}>
              <Trophy size={15} className="text-acc" aria-hidden="true" />
              <span>{rankText}</span>
            </div>
          )}
          <p className="mt-4 text-[15px] leading-relaxed">{debrief.summary}</p>
          {debrief.source === "heuristic" && (
            <p className="mt-3 text-xs text-mute">Scored with the offline rubric because the AI judge was unavailable.</p>
          )}
          {debrief.source === "ai" && turns.some(t => t.judgeSource === "heuristic") && (
            <p className="mt-3 text-xs text-mute">Some interest updates used the offline rubric. The final coaching report was generated by AI.</p>
          )}
        </div>

        <div className="card p-6 rise">
          <h2 className="display text-xl">Fix these on your next call</h2>
          <ol className="mt-4 space-y-3">
            {debrief.topFixes.map((f, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-acc-d text-xs font-bold text-fg">{i + 1}</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={againHref} className="btn btn-accent btn-cta">
              {call.isSample ? `Call ${persona.firstName} yourself · free` : `Call ${persona.firstName} again, beat ${debrief.total}`}
            </Link>
            <Link href="/#buyers" className="btn btn-ghost">
              Another buyer
            </Link>
          </div>
        </div>
      </section>

      <section className="stagger mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Call length" value={fmt(m.durationSec)} />
        <Stat label="You talked" value={`${m.talkRatio}%`} hint="Aim for 40–60%" warn={m.talkRatio > 65} />
        <Stat label="Questions asked" value={String(m.questions)} warn={m.questions < 3} />
        <Stat label="Filler words" value={`${m.fillersPer100}`} hint="per 100 words" warn={m.fillersPer100 > 3} />
        <Stat label="Longest monologue" value={`${m.longestMonologueSec}s`} warn={m.longestMonologueSec > 45} />
        <Stat
          label="Speaking pace"
          value={wpm === null ? "n/a" : `${wpm}`}
          hint={wpm === null ? "Voice calls only" : `wpm · aim for ${HEALTHY_WPM.min}–${HEALTHY_WPM.max}`}
          warn={wpm !== null && (wpm < HEALTHY_WPM.min || wpm > HEALTHY_WPM.max)}
        />
        <Stat
          label="Longest pause"
          value={pause === null ? "n/a" : `${pause}s`}
          hint={pause === null ? "Voice calls only" : "before you answered"}
          warn={pause !== null && pause > 4}
        />
      </section>

      <section className="mt-5">
        <h2 className="display mb-3 text-2xl">Scorecard</h2>
        <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {debrief.criteria.map((c) => (
            <CriterionCard
              key={c.id}
              c={c}
              onJump={() => focusAt(c.at)}
              onRetry={(() => {
                const i = canRetry ? turnForCriterion(turns, c) : null;
                return i === null ? undefined : () => openRetry(i, c.better);
              })()}
            />
          ))}
        </div>
      </section>

      <EmotionPanel data={emotion} buyerName={persona.firstName} durationSec={m.durationSec} onJump={focusTurn} />

      <section className="stagger mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-xl">Interest, turn by turn</h2>
            <span className="text-xs text-mute">Click a point to jump to that moment</span>
          </div>
          <div className="mt-3">
            <ScoreChart
              points={debrief.scoreTimeline}
              selected={selectedPoint}
              onSelect={(k) => {
                const i = scored[k - 1];
                if (i !== undefined) focusTurn(i);
              }}
              labels={(k) => turns[scored[k - 1]]?.reason ?? ""}
            />
          </div>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-mute">What {persona.firstName} was hiding</h3>
          <ul className="mt-2 space-y-2">
            {persona.pains.map((p) => {
              const found = debrief.painsFound.includes(p.id);
              return (
                <li key={p.id} className="flex gap-3 text-sm leading-snug">
                  <span className={`chip h-fit shrink-0 ${found ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{found ? "Found" : "Missed"}</span>
                  <span>{p.text}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="display text-xl">Replay</h2>
          <ul className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {turns.map((t, i) => (
              <li
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
              >
                <TurnRow
                  t={t}
                  active={selected === i}
                  onClick={t.role === "rep" ? () => setSelected(i) : undefined}
                  name={persona.firstName}
                  onRetry={canRetry && t.role === "rep" && typeof t.delta === "number" && t.delta < 0 ? () => openRetry(i) : undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
      {owner && call.status === "done" && (
        <section className="mt-5">
          <ShareCall
            callId={call.id}
            published={call.isSample}
            total={debrief.total}
            buyer={`${persona.name}, ${persona.title}`}
            eligibleHint={
              call.mode !== "voice"
                ? "Only voice calls can be published as a replay."
                : debrief.source !== "ai"
                  ? "Only calls scored by the AI judge can be published as a replay."
                  : null
            }
          />
        </section>
      )}
      {!call.isSample && call.status === "done" && <FeedbackForm callId={call.id} />}
      {canRetry && (
        <RetrySheet open={retryOpen} onClose={() => setRetryOpen(false)} callId={call.id} turns={turns} target={retry} buyerName={persona.firstName} />
      )}
    </div>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-mute">{label}</div>
      <div className={`display mt-1 text-2xl tabular-nums ${warn ? "text-acc" : ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-mute">{hint}</div>}
    </div>
  );
}

function RetryButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-acc-d/30 bg-acc-d/10 px-2.5 py-1 text-xs font-semibold text-acc transition hover:border-acc-d/60 hover:bg-acc-d/20 ${className}`}
    >
      <RotateCcw size={12} aria-hidden="true" />
      Retry this line
    </button>
  );
}

function CriterionCard({ c, onJump, onRetry }: { c: Criterion; onJump: () => void; onRetry?: () => void }) {
  const pct = (c.score / 20) * 100;
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{c.title}</h3>
        <span className="display text-xl tabular-nums">
          {c.score}
          <span className="text-sm text-mute">/20</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? "#4ade80" : pct >= 45 ? "#ff8a5c" : "#fb7185" }} />
      </div>
      {c.quote ? (
        <button onClick={onJump} className="mt-4 rounded-xl bg-white/5 p-3 text-left text-sm leading-snug hover:bg-white/10">
          <span className="mr-2 font-mono text-xs text-mute">{c.at >= 0 ? fmt(c.at) : ""}</span>
          <span className="italic">"{c.quote}"</span>
        </button>
      ) : (
        <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-mute">You didn't do this on the call.</p>
      )}
      {c.better && (
        <div className="mt-3 text-sm leading-snug">
          <span className="font-semibold text-acc">Say instead: </span>
          {c.better}
        </div>
      )}
      {onRetry && (
        <div className="mt-auto pt-3">
          <RetryButton onClick={onRetry} />
        </div>
      )}
    </div>
  );
}

export function TurnRow({
  t,
  active,
  onClick,
  name,
  dark = false,
  onRetry,
}: {
  t: Turn;
  active?: boolean;
  onClick?: () => void;
  name: string;
  dark?: boolean;
  /** Shows "Retry this line" (debrief only). */
  onRetry?: () => void;
}) {
  const rep = t.role === "rep";
  const base = dark
    ? rep
      ? "bg-white/10 text-fg"
      : "bg-panel-3/60 text-fg/90"
    : rep
      ? "bg-white/5"
      : "bg-white/5 border border-line";
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-3 text-sm leading-snug transition ${base} ${active ? "ring-2 ring-acc-d" : ""} ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`mb-1 flex items-center justify-between text-xs ${dark ? "text-mute-d" : "text-mute"}`}>
        <span className="font-semibold">
          {rep ? "You" : name} · {fmt(t.start)}
        </span>
        {rep && typeof t.delta === "number" && (
          <span className={`chip ${t.delta > 0 ? "bg-good/15 text-good" : t.delta < 0 ? "bg-bad/15 text-bad" : dark ? "bg-white/10" : "bg-line"} ${dark && t.delta > 0 ? "!text-good-d" : ""} ${dark && t.delta < 0 ? "!text-bad-d" : ""}`}>
            {signed(t.delta)}
          </span>
        )}
      </div>
      <div>{t.text}</div>
      {rep && t.reason && <div className={`mt-1.5 text-xs ${dark ? "text-mute-d" : "text-mute"}`}>{t.reason}</div>}
      {rep && onRetry && <RetryButton onClick={onRetry} className="mt-2" />}
    </div>
  );
}
