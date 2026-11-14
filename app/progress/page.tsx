"use client";
// [A] Progress: every finished call in this browser, score trend and per-skill averages,
// plus the interview countdown, a 7-day plan built from the weakest skills, and the drill streak.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Flame, Phone, Target, Timer, Trophy, X } from "lucide-react";
import type { CriterionId, Plan, ProgressItem } from "@/lib/types";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { addDays, buildPlan, daysBetween, isYmd, localYmd, type PlanBuyer, type PlanDay } from "@/lib/plan7";
import { ScoreChart } from "@/components/ScoreChart";
import { ProgressSkeleton, Sk } from "@/components/Skeletons";
import { PhoneIcon } from "@/components/Header";
import { Reveal } from "@/components/Reveal";
import { DIFF_CHIP, DRILL_DAYS_KEY } from "@/components/DrillRoom";

type Streak = { streak: number; lastWarmup: string | null; doneToday: boolean };
type Item = ProgressItem & { personaId?: string };
type Data = { plan: Plan; callsUsed: number; callsLeft: number | null; items: Item[]; streak?: Streak | null; buyers?: PlanBuyer[] };

const SKILLS: { id: CriterionId; title: string }[] = [
  { id: "opening", title: "Opening" },
  { id: "discovery", title: "Discovery" },
  { id: "objections", title: "Objections" },
  { id: "value", title: "Value" },
  { id: "next_step", title: "Next step" },
];

const INTERVIEW_KEY = "cb_interview_date";

function readStorage<T>(key: string, parse: (raw: string) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : parse(raw);
  } catch {
    return fallback;
  }
}

export default function ProgressPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <div className="mx-auto max-w-6xl px-5 py-16 text-mute">Couldn&apos;t load your progress. Refresh the page.</div>;
  if (!data) return <ProgressSkeleton />;

  const items = data.items.filter((i) => typeof i.total === "number");
  const best = items.reduce((m, i) => Math.max(m, i.total ?? 0), 0);
  const avg = (id: CriterionId) => {
    const xs = items.map((i) => i.criteria[id]).filter((v): v is number => typeof v === "number");
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
  };
  // Reuse the chart: x = call number, y = total score.
  const points = items.map((i, k) => ({ t: k * 30, score: i.total ?? 0 }));
  const streak = data.streak?.streak ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-5xl">Your progress</h1>
          <p className="mt-2 text-mute">
            Plan: <strong className="text-fg">{data.plan === "free" ? "Free" : data.plan}</strong>
            {data.callsLeft !== null && ` · ${data.callsLeft} free call${data.callsLeft === 1 ? "" : "s"} left`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/drill" className="btn btn-ghost" aria-label={`Daily drill, ${streak}-day streak`}>
            <Flame size={16} className={streak > 0 ? "text-acc" : "text-mute-d"} fill={streak > 0 ? "currentColor" : "none"} aria-hidden="true" />
            <span className="num">{streak}</span> Daily drill
          </Link>
          <Link href="/#buyers" className="btn btn-primary">
            New call
          </Link>
        </div>
      </div>

      <InterviewPlan items={items} buyers={data.buyers ?? []} streak={data.streak ?? null} plan={data.plan} />

      {items.length === 0 ? (
        <div className="card rise mt-8 p-10 text-center">
          <h2 className="display text-2xl">No calls yet</h2>
          <p className="mt-2 text-mute">Your first call takes about 3 minutes. Your scores and skill trends show up here.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/call/jessica-hr?role=sdr" className="btn btn-accent btn-cta">
              <PhoneIcon /> Call Jessica · easy, ~3 min
            </Link>
            <Link href="/sample" className="btn btn-ghost">
              Sample debrief
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Tile label="Calls finished" value={String(items.length)} />
            <Tile label="Best score" value={`${best}/100`} />
            <Tile label="Last score" value={`${items.at(-1)?.total ?? 0}/100`} />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="card p-5">
              <h2 className="display text-xl">Score by call</h2>
              <p className="text-xs text-mute">Each point is one call, scored 0–100.</p>
              <div className="mt-3">
                <ScoreChart points={points} showFirst yMin={0} yMax={100} xTick={(t) => `#${t / 30 + 1}`} labels={(k) => `Call ${k + 1}: ${items[k]?.total ?? 0}/100`} />
              </div>
            </div>
            <div className="card p-5">
              <h2 className="display text-xl">Average by skill</h2>
              <ul className="mt-4 space-y-3">
                {SKILLS.map((s) => {
                  const v = avg(s.id);
                  return (
                    <li key={s.id}>
                      <div className="flex justify-between text-sm">
                        <span>{s.title}</span>
                        <span className="tabular-nums text-mute">{v}/20</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-acc-d" style={{ width: `${(v / 20) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <div className="card mt-5 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-mute">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Buyer</th>
                  <th className="p-3">Score</th>
                  <th className="p-3">Final interest</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, k) => (
                  <tr key={i.callId} className="border-t border-line">
                    <td className="p-3 text-mute">{k + 1}</td>
                    <td className="p-3">
                      {i.personaName} <span className="text-mute">· {i.company}</span>
                    </td>
                    <td className="p-3 font-semibold tabular-nums">{i.total}/100</td>
                    <td className="p-3 tabular-nums">{i.finalScore}</td>
                    <td className="p-3 text-right">
                      <Link href={`/debrief/${i.callId}`} className="font-semibold text-acc hover:underline">
                        Debrief
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-mute">{label}</div>
      <div className="display mt-1 text-3xl tabular-nums">{value}</div>
    </div>
  );
}

// ---------- Interview date + 7-day plan ----------

function countdownText(left: number | null, date: string | null, today: string): string {
  if (!date) return "Set your interview date and we'll plan every day until then.";
  if (daysBetween(today, date) < 0) return "That date has passed. Set your next interview.";
  if (left === 0) return "Interview today. One warm-up call, then go get it.";
  if (left === 1) return "Interview tomorrow";
  return `Interview in ${left} days`;
}

function dayLabel(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function InterviewPlan({ items, buyers, streak, plan }: { items: Item[]; buyers: PlanBuyer[]; streak: Streak | null; plan: Plan }) {
  // Dates live in this browser only; read after mount so server and client markup match.
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [interview, setInterview] = useState<string | null>(null);
  const [drillDays, setDrillDays] = useState<string[]>([]);

  useEffect(() => {
    setToday(localYmd());
    setInterview(readStorage(INTERVIEW_KEY, (raw) => (isYmd(raw) ? raw : null), null));
    setDrillDays(readStorage(DRILL_DAYS_KEY, (raw) => {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    }, []));
    setReady(true);
  }, []);

  const save = (v: string | null) => {
    setInterview(v);
    try {
      if (v) localStorage.setItem(INTERVIEW_KEY, v);
      else localStorage.removeItem(INTERVIEW_KEY);
    } catch {
      /* storage blocked: keep it for this visit */
    }
  };

  const result = useMemo(
    () => (ready && buyers.length ? buildPlan({ calls: items, buyers, today, interviewDate: interview }) : null),
    [ready, buyers, items, today, interview],
  );

  if (!ready) {
    return (
      <div className="card mt-8 p-6" aria-busy="true">
        <Sk className="h-6 w-56" />
        <Sk className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-6 flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Sk key={i} className="h-56 w-64 shrink-0 rounded-[20px]" />
          ))}
        </div>
      </div>
    );
  }

  const callDoneToday = items.some((i) => localYmd(new Date(i.startedAt)) === today);
  const drillDoneToday = drillDays.includes(today) || Boolean(streak?.doneToday);
  const showInterviewCard = result?.daysLeft != null && result.daysLeft <= result.days.length && interview !== null;

  return (
    <Reveal as="section" variant="up" className="card mt-8 p-5 sm:p-6" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-acc">
            <CalendarDays size={14} aria-hidden="true" /> Interview plan
          </div>
          <h2 id="plan-title" className="display mt-2 text-3xl">
            {countdownText(result?.daysLeft ?? null, interview, today)}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-mute">
            {result?.generic
              ? "No calls yet, so the plan starts easy with Jessica and ramps up. It adapts to your weakest skills after your first debrief."
              : `Built from your weakest skills: ${result?.weakest
                  .slice(0, 2)
                  .map((s) => SKILLS.find((k) => k.id === s)?.title.toLowerCase())
                  .join(" and ")}. Buyers get harder as the day gets closer.`}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">When is your interview?</span>
            <input
              type="date"
              value={interview ?? ""}
              min={today}
              max={addDays(today, 365)}
              onChange={(e) => save(isYmd(e.target.value) ? e.target.value : null)}
              className="h-11 rounded-xl border border-line bg-panel-2 px-3 text-fg [color-scheme:dark] focus:border-acc-d focus:outline-none"
            />
          </label>
          {interview && (
            <button type="button" onClick={() => save(null)} className="btn btn-ghost h-11 w-11 p-0" aria-label="Clear interview date">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <ol className="-mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-3 pt-3 sm:-mx-6 sm:px-6" aria-label="Daily plan">
        {result?.days.map((d) => (
          <DayCard
            key={d.date}
            day={d}
            label={dayLabel(d.date, today)}
            isToday={d.index === 0}
            callDone={d.index === 0 && callDoneToday}
            drillDone={d.index === 0 && drillDoneToday}
          />
        ))}
        {showInterviewCard && interview && (
          <li className="flex w-56 shrink-0 snap-start flex-col items-center justify-center rounded-[20px] border border-dashed border-acc-d/40 bg-acc-d/5 p-5 text-center">
            <Trophy size={28} className="text-acc" aria-hidden="true" />
            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-mute">{dayLabel(interview, today)}</div>
            <div className="display mt-1 text-xl">Interview day</div>
            <p className="mt-1 text-xs text-mute">Skip new buyers. Reread your best debrief and one drill.</p>
          </li>
        )}
      </ol>

      {plan === "free" && (
        <p className="mt-4 text-sm text-mute-d">
          The free plan covers your first calls. To run every day of this plan,{" "}
          <Link href="/pricing" className="font-semibold text-mute underline decoration-white/20 underline-offset-4 hover:text-fg">
            Interview Sprint
          </Link>{" "}
          gives you 7 days and 120 voice minutes for $49, one time.
        </p>
      )}
    </Reveal>
  );
}

function Check({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 size={16} className="pop shrink-0 text-good" aria-label="Done" />
  ) : (
    <Circle size={16} className="shrink-0 text-mute-d" aria-hidden="true" />
  );
}

function DayCard({ day, label, isToday, callDone, drillDone }: { day: PlanDay; label: string; isToday: boolean; callDone: boolean; drillDone: boolean }) {
  return (
    <li
      className={`card lift flex w-64 shrink-0 snap-start flex-col p-4 ${isToday ? "border-acc-d/60 shadow-[0_0_40px_-18px_rgb(255_92_38/0.8)]" : ""}`}
      aria-current={isToday ? "date" : undefined}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${isToday ? "text-acc" : "text-mute"}`}>{label}</span>
        <span className="num text-xs text-mute-d">Day {day.index + 1}</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-sm">
        <Target size={14} className="text-acc" aria-hidden="true" />
        <span className="font-semibold">{day.focus.title}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mute">{day.focus.tip}</p>
      <div className="mt-auto space-y-2 pt-4">
        <Link href={day.callHref} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-sm transition-colors hover:border-white/15 hover:bg-white/[0.06]">
          <Check done={callDone} />
          <Phone size={14} className="shrink-0 text-mute" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Call {day.buyer.firstName}</span>
          <span className={`chip px-2 py-0.5 text-[11px] ${DIFF_CHIP[day.buyer.difficulty]}`}>{DIFFICULTY_LABEL[day.buyer.difficulty]}</span>
        </Link>
        {day.drill && (
          <Link
            href={isToday ? "/drill" : day.drill.href}
            title={day.drill.text}
            className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-sm transition-colors hover:border-white/15 hover:bg-white/[0.06]"
          >
            <Check done={drillDone} />
            <Timer size={14} className="shrink-0 text-mute" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{isToday ? "Daily drill" : `Drill: “${day.drill.text}”`}</span>
          </Link>
        )}
      </div>
    </li>
  );
}
