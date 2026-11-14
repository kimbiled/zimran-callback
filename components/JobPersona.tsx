"use client";
// [A] "Paste a job posting" → a buyer from that company's market (generation is B's /api/persona-from-job).

import Link from "next/link";
import { useState } from "react";
import type { Persona, PersonaPublic, SalesRole } from "@/lib/types";
import { CUSTOM_PERSONA_KEY, DIFFICULTY_LABEL } from "@/lib/labels";

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
      {!result ? (
        <form onSubmit={submit} className="mt-3 flex flex-1 flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Sales Development Representative at a cybersecurity SaaS company. You'll prospect mid-market IT leaders…"
            className="min-h-[120px] flex-1 resize-none rounded-xl border border-line bg-paper p-3 text-sm outline-none focus:border-ink"
            maxLength={12000}
          />
          {error && <div className="text-sm text-bad">{error}</div>}
          <button className="btn btn-primary" disabled={loading || text.trim().length < 40}>
            {loading ? "Building your buyer…" : "Build my buyer"}
          </button>
        </form>
      ) : (
        <div className="rise mt-4 flex flex-1 flex-col">
          <div className="rounded-xl bg-paper p-4">
            <div className="font-semibold">{result.public.name}</div>
            <div className="text-sm text-mute">
              {result.public.title} at {result.public.company}
            </div>
            <div className="mt-2 text-sm">You sell: {result.public.product}</div>
            <div className="mt-1 text-xs text-mute">Difficulty: {DIFFICULTY_LABEL[result.public.difficulty]}</div>
            {!result.generated && <div className="mt-2 text-xs text-mute">AI is busy right now, so we picked the closest ready-made buyer.</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href={href} className="btn btn-accent flex-1">
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
