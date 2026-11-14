"use client";
// Fair paywall: before asking for money, show what the free calls taught them
// (score trend, best call, weakest skill with one tip), then the plan.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, PlayCircle, Target, TrendingUp, Trophy } from "lucide-react";
import { PLANS } from "@/lib/plans";
import { Sk } from "./Skeletons";

const SPRINT = PLANS.find((p) => p.id === "sprint");

// Local mirror of the /api/progress item shape (lib/types is owned elsewhere).
type CriterionKey = "opening" | "discovery" | "objections" | "value" | "next_step";
export type ProgressCall = {
  callId: string;
  total: number | null;
  startedAt: string;
  criteria: Partial<Record<CriterionKey, number>>;
};

export const CRITERIA: Record<CriterionKey, { title: string; tip: string }> = {
  opening: { title: "Opening", tip: "Name, one-line reason for the call, then ask for 30 seconds. No pitch yet." },
  discovery: { title: "Discovery", tip: "Ask open how/what questions and follow each answer with \"what does that cost you?\"" },
  objections: { title: "Objections", tip: "Acknowledge first (\"fair\"), then answer with a question, not a feature." },
  value: { title: "Value", tip: "Tie your product to the exact pain they named, in their words and numbers." },
  next_step: { title: "Next step", tip: "Ask for a specific day and time. \"Tuesday at 10?\" beats \"sometime next week\"." },
};

export type ProgressSummary = {
  calls: number;
  first: number | null;
  last: number | null;
  best: number | null;
  weakest: { id: CriterionKey; title: string; avg: number; tip: string } | null;
};

export function summarizeProgress(items: ProgressCall[]): ProgressSummary {
  const scored = items
    .filter((i): i is ProgressCall & { total: number } => typeof i.total === "number")
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const sums = new Map<CriterionKey, { sum: number; n: number }>();
  for (const item of items) {
    for (const [id, score] of Object.entries(item.criteria) as [CriterionKey, number | undefined][]) {
      if (!(id in CRITERIA) || typeof score !== "number") continue;
      const s = sums.get(id) ?? { sum: 0, n: 0 };
      sums.set(id, { sum: s.sum + score, n: s.n + 1 });
    }
  }
  let weakest: ProgressSummary["weakest"] = null;
  for (const [id, { sum, n }] of sums) {
    const avg = Math.round((sum / n) * 10) / 10;
    if (!weakest || avg < weakest.avg) weakest = { id, avg, title: CRITERIA[id].title, tip: CRITERIA[id].tip };
  }
  return {
    calls: scored.length,
    first: scored[0]?.total ?? null,
    last: scored.at(-1)?.total ?? null,
    best: scored.length ? Math.max(...scored.map((s) => s.total)) : null,
    weakest,
  };
}

export function trendLine(s: ProgressSummary): string {
  if (!s.calls || s.first === null || s.last === null) return "No finished calls yet";
  if (s.calls === 1) return `${s.first} on your first call`;
  return `${s.first} → ${s.last} in ${s.calls} calls`;
}

export function LimitScreen({ message }: { message: string | null }) {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/progress", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items?: ProgressCall[] }) => setSummary(summarizeProgress(Array.isArray(d.items) ? d.items : [])))
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, []);

  const up = summary && summary.first !== null && summary.last !== null && summary.calls > 1 ? summary.last - summary.first : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <div className="rise text-center">
        <div className="text-sm font-semibold uppercase tracking-wider text-acc">Free calls used up</div>
        <h1 className="display mt-2 text-4xl sm:text-5xl">Here's what your calls showed</h1>
        <p className="mx-auto mt-3 max-w-xl text-mute">{message ?? "You've used your free calls."} Your progress is saved either way.</p>
      </div>

      {!summary && !failed && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3" role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading your progress…</span>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card p-5">
              <Sk className="h-4 w-24" />
              <Sk className="mt-3 h-8 w-32" />
              <Sk className="mt-3 h-3 w-full" />
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="stagger mt-8 grid gap-3 sm:grid-cols-3">
          <Stat icon={<TrendingUp size={16} aria-hidden="true" />} label="Score trend">
            <div className="num text-2xl">{trendLine(summary)}</div>
            {up !== null && (
              <div className={`mt-1 text-xs ${up > 0 ? "text-good" : up < 0 ? "text-bad" : "text-mute"}`}>
                {up > 0 ? `+${up} points. That's real progress.` : up < 0 ? "A tougher call. It happens." : "Steady. Time to push past it."}
              </div>
            )}
          </Stat>
          <Stat icon={<Trophy size={16} aria-hidden="true" />} label="Best score">
            <div className="num text-2xl">{summary.best ?? "–"}<span className="text-base text-mute"> / 100</span></div>
          </Stat>
          <Stat icon={<Target size={16} aria-hidden="true" />} label="Work on next">
            {summary.weakest ? (
              <>
                <div className="font-semibold">
                  {summary.weakest.title} <span className="num text-sm text-mute">avg {summary.weakest.avg}/20</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-mute">{summary.weakest.tip}</p>
              </>
            ) : (
              <p className="text-sm text-mute">Finish a call to get your first skill breakdown.</p>
            )}
          </Stat>
        </div>
      )}

      {failed && <p className="mt-8 text-center text-sm text-mute">Couldn't load your progress right now. Your calls are still saved.</p>}

      <div className="card spot rise mt-6 p-6 text-center sm:p-8">
        <div className="font-semibold">Keep the streak going</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-mute">{SPRINT?.description ?? "Get ready for every round of your sales interview loop."} {SPRINT?.period ? `(${SPRINT.period})` : ""}</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/pricing" className="btn btn-accent btn-cta px-7 py-3.5">
            {SPRINT?.name ?? "Interview Sprint"} · {SPRINT?.price ?? "$49"} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/sample" className="btn btn-ghost px-6 py-3.5">
            <PlayCircle size={16} aria-hidden="true" /> Watch a sample call
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-mute">
        <span className="text-acc">{icon}</span>
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
