"use client";
// Emotional debrief: the buyer's mood over the call, the swings that moved it, and the rep's emotional signals.
// Everything here is computed in code (lib/emotion.ts) from the transcript and the judge's saved scores.

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Gauge, HeartHandshake, MessageCircleHeart, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Zap } from "lucide-react";
import type { EmotionalDebrief, MoodId, SignalId } from "@/lib/emotion";
import { MOOD_ORDER, MOODS } from "@/lib/emotion";
import { Reveal } from "./Reveal";

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.round(Math.max(0, sec)) % 60).padStart(2, "0")}`;
const signedNum = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const SIGNAL_ICON: Record<SignalId, typeof Gauge> = {
  confidence: ShieldCheck,
  empathy: HeartHandshake,
  warmth: MessageCircleHeart,
  composure: Gauge,
  energy: Zap,
};

function MoodChip({ mood, className = "" }: { mood: MoodId; className?: string }) {
  const { label, color } = MOODS[mood];
  return (
    <span className={`chip ${className}`} style={{ color, background: `${color}1f` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function barColor(score: number) {
  return score >= 70 ? "linear-gradient(90deg,#34d399,#4ade80)" : score >= 45 ? "linear-gradient(90deg,#ff7a3d,#ff8a5c)" : "linear-gradient(90deg,#f43f5e,#fb7185)";
}

export function EmotionPanel({
  data,
  buyerName,
  durationSec,
  onJump,
}: {
  data: EmotionalDebrief;
  buyerName: string;
  durationSec: number;
  onJump: (turnIndex: number) => void;
}) {
  const { arc, swings, signals, takeaways } = data;
  // Bars grow from zero when the card scrolls into view (instantly with reduced motion or without IntersectionObserver).
  const bars = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const el = bars.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setGrown(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const end = Math.max(durationSec, arc.at(-1)?.t ?? 0, 1);
  const swingAt = new Set(swings.map((s) => s.turnIndex));
  const first = arc[0];
  const last = arc.at(-1)!;
  const present = new Set(arc.map((p) => p.mood));

  return (
    <Reveal as="section" className="mt-5" aria-labelledby="emotion-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="emotion-title" className="display text-2xl">
          How the call felt
        </h2>
        <span className="text-xs text-mute">Computed from the transcript and the judge's interest scores. No extra AI.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* Buyer mood */}
        <div className="card spot p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{buyerName}'s mood</h3>
            <div className="flex items-center gap-2 text-xs text-mute">
              <MoodChip mood={first.mood} />
              <ArrowRight size={14} aria-hidden="true" />
              <MoodChip mood={last.mood} />
            </div>
          </div>

          {/* Timeline strip: one segment per judged turn, width = time the mood lasted */}
          <div className="mt-4 flex h-11 w-full gap-[3px] overflow-hidden rounded-2xl" role="list" aria-label={`${buyerName}'s mood over the call`}>
            {arc.map((p, k) => {
              const next = arc[k + 1]?.t ?? end;
              const grow = Math.max(0.5, next - p.t);
              const swing = p.turnIndex !== null && swingAt.has(p.turnIndex);
              const label = `${fmt(p.t)} · ${MOODS[p.mood].label} (${signedNum(p.score)})${p.delta !== null ? `, ${signedNum(p.delta)} after your line` : ""}`;
              const style = {
                flexGrow: grow,
                background: `linear-gradient(180deg, ${MOODS[p.mood].color}e6, ${MOODS[p.mood].color}99)`,
                ["--i" as string]: k,
              };
              return p.turnIndex !== null ? (
                <button
                  key={k}
                  type="button"
                  role="listitem"
                  title={label}
                  aria-label={label}
                  onClick={() => onJump(p.turnIndex!)}
                  className={`relative min-w-[4px] basis-0 transition hover:brightness-125 focus-visible:z-10 ${swing ? "ring-2 ring-inset ring-white/70" : ""}`}
                  style={style}
                >
                  {swing && (
                    <span className="absolute left-1/2 top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white">
                      {p.delta! > 0 ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
                    </span>
                  )}
                </button>
              ) : (
                <span key={k} role="listitem" title={label} aria-label={label} className="min-w-[4px] basis-0" style={style} />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-mute-d">
            <span>0:00</span>
            <span>{fmt(end)}</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Mood scale">
            {MOOD_ORDER.map((m) => (
              <span key={m} className={`transition ${present.has(m) ? "" : "opacity-35"}`} title={`Interest ${MOODS[m].range}`}>
                <MoodChip mood={m} className="!px-2 !py-0.5 !text-[11px]" />
              </span>
            ))}
          </div>

          <h4 className="mt-5 text-sm font-semibold uppercase tracking-wider text-mute">Biggest swings</h4>
          {swings.length === 0 ? (
            <p className="mt-2 text-sm text-mute">No line moved {buyerName} by 5 points or more. The mood held steady.</p>
          ) : (
            <ul className="stagger mt-2 space-y-2">
              {swings.map((s) => (
                <li key={s.turnIndex}>
                  <button
                    type="button"
                    onClick={() => onJump(s.turnIndex)}
                    className="group w-full rounded-xl bg-white/5 p-3 text-left text-sm leading-snug transition hover:bg-white/10"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`grid h-6 w-6 place-items-center rounded-full ${s.direction === "up" ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>
                        {s.direction === "up" ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                      </span>
                      <span className="font-mono text-mute">{fmt(s.t)}</span>
                      <MoodChip mood={s.from} />
                      <ArrowRight size={12} className="text-mute" aria-hidden="true" />
                      <MoodChip mood={s.to} />
                      <span className={`chip ml-auto ${s.delta > 0 ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>{signedNum(s.delta)}</span>
                    </div>
                    <div className="mt-2 italic">“{s.quote}”</div>
                    {s.reason && <div className="mt-1 text-xs text-mute">{s.reason}</div>}
                    {s.reaction && (
                      <div className="mt-1.5 text-xs text-mute-d">
                        {buyerName}: “{s.reaction}”
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rep signals */}
        <div ref={bars} className="card spot p-5">
          <h3 className="font-semibold">Your emotional signals</h3>
          <ul className="mt-4 space-y-4">
            {signals.map((s, k) => {
              const Icon = SIGNAL_ICON[s.id];
              return (
                <li key={s.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon size={15} className="text-mute" aria-hidden="true" />
                      {s.label}
                    </span>
                    <span className="display tabular-nums">{s.score === null ? <span className="text-sm text-mute">n/a</span> : s.score}</span>
                  </div>
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]"
                    role="meter"
                    aria-label={s.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={s.score ?? undefined}
                  >
                    {s.score !== null && (
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: grown ? `${Math.max(3, s.score)}%` : "0%",
                          background: barColor(s.score),
                          transition: `width 900ms var(--ease-out) ${120 + k * 80}ms`,
                        }}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-mute">{s.note}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Takeaways */}
      <div className="stagger mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {takeaways.map((t) => (
          <div key={t.id} className="card spot lift flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold leading-snug">{t.title}</h3>
              <span className={`chip shrink-0 ${t.tone === "keep" ? "bg-good/10 text-good" : "bg-acc-d/10 text-acc"}`}>
                {t.tone === "keep" ? <Sparkles size={12} aria-hidden="true" /> : null}
                {t.tone === "keep" ? "Keep" : "Fix"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-snug text-mute">{t.detail}</p>
            <div className="mt-3 rounded-xl bg-white/5 p-3 text-sm leading-snug">
              <span className="font-semibold text-acc">{t.tone === "keep" ? "Next time: " : "Say instead: "}</span>
              {t.better}
            </div>
            {t.turnIndex !== null && (
              <button type="button" onClick={() => onJump(t.turnIndex!)} className="mt-3 self-start text-xs font-semibold text-acc-d underline-offset-4 hover:underline">
                Show me in the replay
              </button>
            )}
          </div>
        ))}
      </div>
    </Reveal>
  );
}
