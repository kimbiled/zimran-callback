// [A] Live interest meter, -100..+100.
import { MoodChip } from "./BuyerMood";

export function interestLabel(score: number): string {
  if (score >= 50) return "Hot";
  if (score >= 15) return "Warming up";
  if (score > -20) return "Neutral";
  if (score > -60) return "Cooling";
  return "Lost";
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function Meter({ score, delta, reason, compact = false, mood = false }: { score: number; delta?: number | null; reason?: string | null; compact?: boolean; /** show the buyer mood chip (live call) */ mood?: boolean }) {
  const half = Math.min(100, Math.abs(score)) / 2;
  const positive = score >= 0;
  return (
    <div className="w-full" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={score} aria-label="Buyer interest">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-mute-d">Buyer interest</span>
            {mood && <MoodChip score={score} className="px-2 py-0.5 text-[11px]" />}
          </div>
          <div className={`display ${compact ? "text-3xl" : "text-5xl"} tabular-nums`}>
            {signed(score)}
            <span className="ml-2 align-middle text-base font-semibold text-mute-d">{interestLabel(score)}</span>
          </div>
        </div>
        {typeof delta === "number" && (
          <span
            key={`${score}-${delta}`}
            className={`chip rise ${delta > 0 ? "bg-good-d/20 text-good-d" : delta < 0 ? "bg-bad-d/20 text-bad-d" : "bg-white/10 text-mute-d"}`}
          >
            {signed(delta)}
          </span>
        )}
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-panel-3">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
        <div
          className="absolute inset-y-0 transition-all duration-700 ease-out"
          style={{
            left: positive ? "50%" : `${50 - half}%`,
            width: `${half}%`,
            background: positive ? "linear-gradient(90deg,#34d399,#a3f7cf)" : "linear-gradient(90deg,#f43f5e,#fda4af)",
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-mute-d">
        <span>-100</span>
        <span>0</span>
        <span>+100</span>
      </div>
      {reason && !compact && (
        <p key={reason} className="rise mt-3 text-sm text-fg/90">
          {reason}
        </p>
      )}
    </div>
  );
}
