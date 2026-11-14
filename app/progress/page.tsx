"use client";
// [A] Progress: every finished call in this browser, score trend and per-skill averages.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CriterionId, Plan, ProgressItem } from "@/lib/types";
import { ScoreChart } from "@/components/ScoreChart";

type Data = { plan: Plan; callsUsed: number; callsLeft: number | null; items: ProgressItem[] };

const SKILLS: { id: CriterionId; title: string }[] = [
  { id: "opening", title: "Opening" },
  { id: "discovery", title: "Discovery" },
  { id: "objections", title: "Objections" },
  { id: "value", title: "Value" },
  { id: "next_step", title: "Next step" },
];

export default function ProgressPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <div className="mx-auto max-w-6xl px-5 py-16 text-mute">Couldn't load your progress. Refresh the page.</div>;
  if (!data) return <div className="mx-auto max-w-6xl px-5 py-16 text-mute">Loading…</div>;

  const items = data.items.filter((i) => typeof i.total === "number");
  const best = items.reduce((m, i) => Math.max(m, i.total ?? 0), 0);
  const avg = (id: CriterionId) => {
    const xs = items.map((i) => i.criteria[id]).filter((v): v is number => typeof v === "number");
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
  };
  // Reuse the chart: x = call number, y = total score.
  const points = items.map((i, k) => ({ t: k * 30, score: i.total ?? 0 }));

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-5xl">Your progress</h1>
          <p className="mt-2 text-mute">
            Plan: <strong className="text-ink">{data.plan === "free" ? "Free" : data.plan}</strong>
            {data.callsLeft !== null && ` · ${data.callsLeft} free call${data.callsLeft === 1 ? "" : "s"} left`}
          </p>
        </div>
        <Link href="/#buyers" className="btn btn-primary">
          New call
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <h2 className="display text-2xl">No calls yet</h2>
          <p className="mt-2 text-mute">Make your first call and your scores will show up here.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/#buyers" className="btn btn-primary">
              Make a call
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
              <thead className="bg-paper text-left text-xs uppercase tracking-wider text-mute">
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
