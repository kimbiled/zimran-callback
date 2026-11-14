"use client";
// [A] Plan cards with checkout.

import Link from "next/link";
import { useState } from "react";
import { PLANS } from "@/lib/plans";
import { Reveal } from "./Reveal";

export function PricingCards() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(plan: string) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout is unavailable.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout is unavailable.");
      setBusy(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p, i) => {
          const featured = p.id === "sprint";
          return (
            <Reveal
              key={p.id}
              index={i}
              className={`card lift relative flex flex-col p-6 ${featured ? "ring-2 ring-acc-d" : ""} ${p.soon ? "opacity-80" : ""}`}
            >
              {featured && (
                <span className="chip absolute -top-3 left-6 whitespace-nowrap bg-acc-d text-bg shadow-sm">Best before an interview</span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{p.name}</h2>
                {p.soon && <span className="chip whitespace-nowrap bg-line text-mute">Coming soon</span>}
              </div>
              <div className="num mt-3 text-5xl">{p.price}</div>
              <div className="text-sm text-mute">{p.period}</div>
              <p className="mt-3 text-sm">{p.description}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-good" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {p.id === "free" ? (
                <Link href="/call/jessica-hr?role=sdr" className="btn btn-ghost mt-6">
                  Start a free call
                </Link>
              ) : (
                <button
                  className={`btn mt-6 ${featured ? "btn-accent btn-cta" : "btn-primary"}`}
                  disabled={!!busy || p.soon}
                  aria-busy={busy === p.id}
                  onClick={() => buy(p.id)}
                >
                  {busy === p.id && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
                  {p.soon ? "Coming soon" : busy === p.id ? "Opening secure checkout…" : `Get ${p.name}`}
                </button>
              )}
            </Reveal>
          );
        })}
      </div>
      {error && <p className="mt-4 text-sm text-bad" role="alert">{error}</p>}
    </>
  );
}
