"use client";
// [A] Landing: pick the interview (SDR or AE), filter by difficulty, then call a buyer.
// The role travels to the call page as ?role= and is remembered in this browser.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Segmented, Tooltip } from "antd";
import {
  Briefcase,
  Building2,
  Dumbbell,
  Flame,
  HeartPulse,
  Layers,
  PhoneCall,
  PhoneOutgoing,
  ShieldCheck,
  Handshake,
  Sprout,
  Gauge,
} from "lucide-react";
import type { Difficulty, PersonaPublic, SalesRole } from "@/lib/types";
import { DIFFICULTY_LABEL, ROLE_KEY, ROLE_LABEL } from "@/lib/labels";
import { parseRole } from "@/lib/roles";
import { JobPersona } from "./JobPersona";
import { Reveal } from "./Reveal";

type Filter = "all" | Difficulty;

const DIFF_STYLE: Record<Difficulty, { chip: string; tip: string }> = {
  easy: { chip: "bg-good/15 text-good", tip: "Friendly. Opens up to good open questions." },
  medium: { chip: "bg-acc-d/15 text-acc", tip: "Busy, has a current solution or a sharp objection." },
  hard: { chip: "bg-bad/15 text-bad", tip: "Skeptical, short answers, budget or trust issues." },
};

/** A quick visual cue for what the buyer's world is about. */
function themeIcon(p: PersonaPublic) {
  const s = `${p.industry} ${p.product}`.toLowerCase();
  if (/insur|medicare|health plan|premium|benefit/.test(s)) return ShieldCheck;
  if (/gym|fitness|personal[- ]training|trainer/.test(s)) return Dumbbell;
  if (/nutrition|weight|diet|glp/.test(s)) return Sprout;
  if (/mental|clinic|health|dental|medical/.test(s)) return HeartPulse;
  if (/sales|pipeline|crm/.test(s)) return Gauge;
  if (/cyber|security|observab|cloud/.test(s)) return Layers;
  return Building2;
}

export function BuyerPicker({ buyers }: { buyers: Record<SalesRole, PersonaPublic[]> }) {
  const [role, setRole] = useState<SalesRole>("sdr");
  const [filter, setFilter] = useState<Filter>("all");

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

  const all = buyers[role];
  const counts = useMemo(
    () => ({
      all: all.length,
      easy: all.filter((p) => p.difficulty === "easy").length,
      medium: all.filter((p) => p.difficulty === "medium").length,
      hard: all.filter((p) => p.difficulty === "hard").length,
    }),
    [all],
  );
  const list = filter === "all" ? all : all.filter((p) => p.difficulty === filter);

  return (
    <>
      <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 text-sm font-semibold text-mute">1. Your interview</div>
          <Segmented<SalesRole>
            size="large"
            value={role}
            onChange={pick}
            options={[
              {
                value: "sdr",
                label: (
                  <span className="flex items-center gap-2 px-1 py-0.5">
                    <PhoneOutgoing size={16} aria-hidden="true" /> {ROLE_LABEL.sdr.title}
                  </span>
                ),
              },
              {
                value: "ae",
                label: (
                  <span className="flex items-center gap-2 px-1 py-0.5">
                    <Handshake size={16} aria-hidden="true" /> {ROLE_LABEL.ae.title}
                  </span>
                ),
              },
            ]}
          />
          <p key={role} className="pop mt-2 text-sm text-mute-d">
            {ROLE_LABEL[role].note}
          </p>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-mute">2. Difficulty</div>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: <span className="flex items-center gap-1.5 px-1"><Briefcase size={14} aria-hidden="true" /> All · {counts.all}</span> },
              { value: "easy", label: `Easy · ${counts.easy}` },
              { value: "medium", label: `Medium · ${counts.medium}` },
              { value: "hard", label: <span className="flex items-center gap-1.5 px-1"><Flame size={14} aria-hidden="true" /> Hard · {counts.hard}</span> },
            ]}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((p, i) => {
          const first = p.name.split(" ")[0];
          const recommended = p.id === "jessica-hr";
          const Icon = themeIcon(p);
          return (
            // Re-keyed per role/filter, so switching replays the cards' entrance.
            <Reveal key={`${role}-${filter}-${p.id}`} index={i % 3} variant="flip" className="h-full">
              <Link
                href={`/call/${p.id}?role=${role}`}
                className={`tilt spot card group relative flex h-full flex-col p-5 ${recommended ? "ring-1 ring-acc-d/50" : ""}`}
              >
                {recommended && (
                  <span className="chip absolute -top-3 right-4 bg-gradient-to-r from-[#ff7a3d] to-[#ff2e6e] text-bg shadow-lg">Start here</span>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Tooltip title={DIFF_STYLE[p.difficulty].tip}>
                    <span className={`chip ${DIFF_STYLE[p.difficulty].chip}`}>{DIFFICULTY_LABEL[p.difficulty]}</span>
                  </Tooltip>
                  <span className="truncate text-xs text-mute-d">{p.industry.split(" · ")[0]}</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-white/10 to-white/[0.02] ring-1 ring-white/10 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                    <Icon size={20} className="text-acc" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="display truncate text-xl">{p.name}</h3>
                    <div className="truncate text-sm text-mute">{p.title}</div>
                  </div>
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-relaxed">
                  <span className="text-mute-d">You sell </span>
                  {p.product}.
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed">
                  <span className="text-mute-d">Goal: </span>
                  {p.goal}.
                </p>
                <div className="min-h-5 flex-1" aria-hidden="true" />
                <span className={`btn btn-cta cta-quiet w-full ${recommended ? "btn-accent" : "btn-primary"}`}>
                  <PhoneCall size={16} aria-hidden="true" /> Call {first}
                  <span className="text-xs font-medium opacity-60">· ~3 min</span>
                </span>
              </Link>
            </Reveal>
          );
        })}
        {/* Stable key: re-mounting would wipe a job posting the user already pasted. */}
        <Reveal key="job" index={list.length % 3} variant="flip" className="h-full">
          <JobPersona role={role} />
        </Reveal>
      </div>
    </>
  );
}
