"use client";
// [A] "Paste a job posting" → a buyer from that company's market (generation is B's /api/persona-from-job).

import Link from "next/link";
import { useState } from "react";
import type { Persona, PersonaPublic, SalesRole } from "@/lib/types";
import { CUSTOM_PERSONA_KEY, DIFFICULTY_LABEL } from "@/lib/labels";
import { Sk } from "./Skeletons";

type Result = { generated: boolean; public: PersonaPublic; persona: Persona | null; personaId: string | null };

export function JobPersona({ role }: { role: SalesRole }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/persona-from-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const r = data as Result;
      if (r.generated && r.persona) sessionStorage.setItem(CUSTOM_PERSONA_KEY, JSON.stringify(r.persona));
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const href = result ? `${result.generated ? "/call/custom" : `/call/${result.personaId}`}?role=${role}` : "#";

  return (
    <div className="card flex h-full flex-col p-5">
      <div className="chip w-fit bg-acc-d/15 text-acc">From your job posting</div>
      <h3 className="display mt-3 text-xl">Practice on the buyer you'll actually call</h3>
      <p className="mt-1 text-sm text-mute">Paste the sales job you're applying for. We build a buyer from that company's market, with hidden pains and objections.</p>
      {loading ? (
        <div className="mt-4 flex flex-1 flex-col" role="status" aria-live="polite">
          <span className="sr-only">Building a buyer from this posting…</span>
          <div className="rounded-xl bg-white/5 p-4">
            <Sk className="h-4 w-36" />
            <Sk className="mt-2 h-3.5 w-48" />
            <Sk className="mt-3 h-3.5 w-full" />
            <Sk className="mt-2 h-3 w-24" />
          </div>
          <p className="mt-3 text-center text-xs text-mute" aria-hidden="true">
            Reading the posting… finding the buyer's pains…
          </p>
          <div className="mt-2 flex gap-2">
            <Sk className="h-12 flex-1 rounded-full" />
            <Sk className="h-12 w-20 rounded-full" />
          </div>
        </div>
      ) : !result ? (
        <form onSubmit={submit} className="mt-3 flex flex-1 flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Sales Development Representative at a cybersecurity SaaS company. You'll prospect mid-market IT leaders…"
            className="min-h-[120px] flex-1 resize-none rounded-xl border border-line bg-white/5 p-3 text-sm focus:border-acc-d"
            maxLength={12000}
            aria-describedby="job-hint"
          />
          {error && <div className="text-sm text-bad">{error}</div>}
          <div id="job-hint" className="text-xs text-mute">
            {text.trim().length < 40 ? `Paste at least 2 sentences (${text.trim().length}/40)` : "Looks good. We'll build the buyer in a few seconds."}
          </div>
          <button className="btn btn-primary" disabled={text.trim().length < 40}>
            Build my buyer
          </button>
        </form>
      ) : (
        <div className="rise mt-4 flex flex-1 flex-col">
          <div className="rounded-xl bg-white/5 p-4">
            <div className="font-semibold">{result.public.name}</div>
            <div className="text-sm text-mute">
              {result.public.title} at {result.public.company}
            </div>
            <div className="mt-2 text-sm">You sell: {result.public.product}</div>
            <div className="mt-1 text-xs text-mute">Difficulty: {DIFFICULTY_LABEL[result.public.difficulty]}</div>
            {!result.generated && <div className="mt-2 text-xs text-mute">AI is busy right now, so we picked the closest ready-made buyer.</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href={href} className="btn btn-accent btn-cta flex-1" style={{ ["--sheen-delay" as string]: "0.4s" }}>
              Call {result.public.name.split(" ")[0]}
            </Link>
            <button className="btn btn-ghost" onClick={() => setResult(null)}>
              Redo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
