"use client";
// [A] Plan cards with checkout.

import Link from "next/link";
import { useState } from "react";
import { PLANS } from "@/lib/plans";

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
        {PLANS.map((p) => (
          <div key={p.id} className={`card flex flex-col p-6 ${p.id === "sprint" ? "ring-2 ring-acc-d" : ""}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{p.name}</h2>
              {p.id === "sprint" && <span className="chip bg-acc-d/15 text-acc">Most popular</span>}
              {p.soon && <span className="chip bg-line text-mute">Coming soon</span>}
            </div>
            <div className="display mt-3 text-5xl">{p.price}</div>
            <div className="text-sm text-mute">{p.period}</div>
            <p className="mt-3 text-sm">{p.description}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-good">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {p.id === "free" ? (
              <Link href="/#buyers" className="btn btn-ghost mt-6">
                Start a free call
              </Link>
            ) : (
              <button className={`btn mt-6 ${p.id === "sprint" ? "btn-accent" : "btn-primary"}`} disabled={!!busy || p.soon} onClick={() => buy(p.id)}>
                {p.soon ? "Coming soon" : busy === p.id ? "Opening checkout…" : `Get ${p.name}`}
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
    </>
  );
}
