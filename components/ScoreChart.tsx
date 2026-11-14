"use client";
// [A] Interest-over-time chart. Points are clickable to jump to the turn in the transcript.

import type { TimelinePoint } from "@/lib/types";

const W = 640;
const H = 200;
const PAD = { l: 34, r: 12, t: 12, b: 24 };

export function ScoreChart({
  points,
  selected,
  onSelect,
  labels,
  xTick,
  showFirst = false,
  yMin = -100,
  yMax = 100,
}: {
  points: TimelinePoint[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  labels?: (i: number) => string;
  xTick?: (t: number) => string;
  showFirst?: boolean;
  yMin?: number;
  yMax?: number;
}) {
  const maxT = Math.max(30, ...points.map((p) => p.t));
  const x = (t: number) => PAD.l + (t / maxT) * (W - PAD.l - PAD.r);
  const y = (s: number) => PAD.t + ((yMax - s) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const base = Math.min(yMax, Math.max(yMin, 0));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${path} L${x(points.at(-1)!.t).toFixed(1)},${y(base)} L${x(points[0].t).toFixed(1)},${y(base)} Z` : "";
  const ticks = [0, 1, 2, 3, 4].map((k) => yMin + ((yMax - yMin) * k) / 4);
  const tTicks = Array.from({ length: Math.floor(maxT / 30) + 1 }, (_, i) => i * 30);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Buyer interest over the call">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 && yMin < 0 ? "#6b6b85" : "#262634"} strokeDasharray={v === 0 && yMin < 0 ? "4 4" : undefined} />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#9090a8">
            {v > 0 && yMin < 0 ? `+${v}` : v}
          </text>
        </g>
      ))}
      {tTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="#9090a8">
          {xTick ? xTick(t) : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`}
        </text>
      ))}
      {area && <path d={area} fill="#ff5c26" opacity="0.14" />}
      <path d={path} fill="none" stroke="#ff7a3d" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) =>
        i === 0 && !showFirst ? null : (
          <g key={i} onClick={() => onSelect?.(i)} style={{ cursor: onSelect ? "pointer" : undefined }}>
            <circle cx={x(p.t)} cy={y(p.score)} r={12} fill="transparent" />
            <circle
              cx={x(p.t)}
              cy={y(p.score)}
              r={selected === i ? 6.5 : 4.5}
              fill={selected === i ? "#ff5c26" : "#0c0c14"}
              stroke={p.score >= (points[i - 1]?.score ?? p.score) ? "#4ade80" : "#fb7185"}
              strokeWidth="2.5"
            >
              {labels && <title>{labels(i)}</title>}
            </circle>
          </g>
        ),
      )}
    </svg>
  );
}
