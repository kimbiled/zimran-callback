"use client";
// Hidden pains as tiles: locked "???" until the judge confirms one, then a 3D flip to its label.
// Only pain ids reach the client (never the hidden text), so the label is derived from the id.

import { Check, Lock } from "lucide-react";

const KNOWN: Record<string, string> = {
  onboarding: "Slow onboarding",
  turnover: "Early turnover",
  knowledge: "Scattered know-how",
  visibility: "Pipeline visibility",
  forecast: "Forecast misses",
  ramp: "Slow rep ramp",
  month_close: "Month-end close",
  errors: "Costly errors",
  cost_cut: "Cost-cut mandate",
  incidents: "Outages",
  observability: "Scattered monitoring",
  sla: "SLA requirement",
  premium_jump: "Premium jump",
  deductible: "High deductible",
  network: "Out-of-network doctor",
  prediabetes: "Prediabetes risk",
  yo_yo: "Yo-yo dieting",
  meals: "Takeout habit",
  health: "Health warning",
  quit_twice: "Quit twice",
  no_plan: "No gym plan",
  tech_turnover: "Losing techs",
  hiring: "Hiring losses",
  cost_fear: "Plan cost fear",
  spring_churn: "New-member churn",
  no_followup: "No follow-up",
  pt_revenue: "Low PT sales",
  burnout_turnover: "Burnout turnover",
  eap_unused: "Unused EAP",
  leaves: "Stress leave",
  doctor_network: "Losing doctors",
  drug_costs: "Drug costs",
  prior_auth: "Prior auth denials",
  glp1_spend: "GLP-1 spend",
  discontinuation: "GLP-1 drop-off",
  coverage_cut: "Coverage cut",
  backups: "Weak backups",
  cyber_insurance: "Cyber insurance",
  phishing_hipaa: "Phishing risk",
};

/** Human label for a pain id: a curated label when known, otherwise "month_close" → "Month close". */
export function painLabel(id: string): string {
  const key = id.trim().toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  const words = key.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Pain";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const PAIN_SLOTS = 3;

export function PainTiles({ found, total = PAIN_SLOTS, compact = false }: { found: string[]; total?: number; compact?: boolean }) {
  const slots = Math.max(total, found.length);
  const label = `Pains found: ${found.length} of ${slots}`;

  if (compact) {
    return (
      <span className="flex items-center gap-1" role="img" aria-label={label}>
        {Array.from({ length: slots }, (_, i) => {
          const on = i < found.length;
          return (
            <span
              key={`${i}-${on}`}
              className={`block h-2 w-2 rounded-full transition-colors duration-500 ${on ? "pop bg-good-fill shadow-[0_0_8px_#34d399]" : "bg-white/15"}`}
            />
          );
        })}
      </span>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-mute-d">
        <span>Hidden pains</span>
        <span className="num text-fg" aria-hidden="true">
          {found.length}/{slots}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2" aria-label={label}>
        {Array.from({ length: slots }, (_, i) => (
          <Tile key={i} id={found[i]} />
        ))}
      </ul>
    </div>
  );
}

function Tile({ id }: { id?: string }) {
  const open = Boolean(id);
  const face = "absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-center [backface-visibility:hidden]";
  return (
    <li className="relative h-[72px] [perspective:600px]" aria-label={open ? `Found: ${painLabel(id!)}` : "Not found yet"}>
      <div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={{ transform: open ? "rotateY(180deg)" : "rotateY(0deg)", transition: "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className={`${face} border-white/10 bg-white/[0.03] text-mute-d`} aria-hidden={open}>
          <Lock size={16} strokeWidth={2.2} aria-hidden="true" />
          <span className="num text-sm tracking-[0.2em]">???</span>
        </div>
        <div
          className={`${face} border-good-fill/40 bg-good-fill/10 text-fg shadow-[0_0_24px_-8px_#34d399]`}
          style={{ transform: "rotateY(180deg)" }}
          aria-hidden={!open}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-good-fill text-panel">
            <Check size={13} strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="line-clamp-2 text-xs font-semibold leading-tight">{open ? painLabel(id!) : ""}</span>
        </div>
      </div>
    </li>
  );
}
