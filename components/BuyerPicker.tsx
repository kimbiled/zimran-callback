"use client";
// [A] Landing: pick the interview (SDR or AE), then the buyer. The role travels to the
// call page as ?role= and is remembered in this browser.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PersonaPublic, SalesRole } from "@/lib/types";
import { DIFFICULTY_LABEL, ROLE_KEY, ROLE_LABEL } from "@/lib/labels";
import { ROLES, parseRole } from "@/lib/roles";
import { JobPersona } from "./JobPersona";
import { PhoneIcon } from "./Header";

export function BuyerPicker({ buyers }: { buyers: Record<SalesRole, PersonaPublic[]> }) {
  const [role, setRole] = useState<SalesRole>("sdr");

  useEffect(() => {
    try {
      setRole(parseRole(localStorage.getItem(ROLE_KEY)));
    } catch {
      /* storage blocked: keep SDR */
    }
  }, []);

  const pick = (r: SalesRole) => {
    setRole(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="mt-6" role="radiogroup" aria-label="Interview you're preparing for">
        <div className="text-sm font-semibold text-mute">1. Which interview are you preparing for?</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
          {ROLES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={role === r}
              onClick={() => pick(r)}
              className={`card p-4 text-left transition ${role === r ? "ring-2 ring-acc-d" : "hover:shadow-md"}`}
            >
              <div className="font-semibold">{ROLE_LABEL[r].title}</div>
              <div className="mt-0.5 text-sm text-mute">{ROLE_LABEL[r].note}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 text-sm font-semibold text-mute">2. Pick a buyer</div>
      <div className="mt-2 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {buyers[role].map((p) => (
          <Link
            key={p.id}
            href={`/call/${p.id}?role=${role}`}
            className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span
                className={`chip ${p.difficulty === "easy" ? "bg-good/10 text-good" : p.difficulty === "medium" ? "bg-acc-d/15 text-acc" : "bg-bad/10 text-bad"}`}
              >
                {DIFFICULTY_LABEL[p.difficulty]}
              </span>
              <span className="text-xs text-mute">{p.industry.split(" · ")[0]}</span>
            </div>
            <div className="display mt-4 text-2xl">{p.name}</div>
            <div className="text-sm text-mute">
              {p.title} at {p.company}
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              <span className="text-mute">You sell </span>
              {p.product}.
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              <span className="text-mute">Goal: </span>
              {p.goal}.
            </p>
            <span className="btn btn-primary mt-5 w-full group-hover:bg-[#2a2e40]">
              <PhoneIcon /> Call {p.name.split(" ")[0]}
            </span>
          </Link>
        ))}
        <JobPersona role={role} />
      </div>
    </>
  );
}
