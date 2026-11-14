"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Sample = { callId: string; persona: { name: string }; recordedAt: string; total: number; url: string };
export function PublishedReplays() {
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/samples", { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as Sample[];
      if (!controller.signal.aborted) setSamples(data);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!samples.length) return null;
  return <section className="mx-auto max-w-6xl px-5 py-6" aria-labelledby="published-replays">
    <h2 id="published-replays" className="display text-2xl">Watch a recorded call — no microphone</h2>
    <div className="mt-4 flex flex-wrap gap-3">{samples.slice(0, 3).map(sample => <Link key={sample.callId} href={sample.url} className="btn btn-ghost">
      {sample.persona.name} · {sample.total}/100 · replay
    </Link>)}</div>
  </section>;
}
