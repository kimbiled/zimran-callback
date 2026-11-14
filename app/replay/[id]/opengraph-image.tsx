import { ImageResponse } from "next/og";
import { loadPublishedReplay } from "@/lib/replay/data";

export const alt = "A practice cold call replay on Callback";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GRADIENT = "linear-gradient(160deg, #ff7a3d 0%, #ff2e6e 55%, #9b7bff 100%)";
const BARS = [
  { x: 0, y: 0, w: 56, h: 211 },
  { x: 72, y: 41, w: 54, h: 143 },
  { x: 141, y: 81, w: 53, h: 90 },
  { x: 255, y: 81, w: 53, h: 90 },
  { x: 324, y: 41, w: 53, h: 143 },
  { x: 393, y: 0, w: 56, h: 211 },
];
const DIFFICULTY = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;
const BG =
  "radial-gradient(900px 520px at 90% -10%, rgba(124,92,255,0.32), transparent 60%), radial-gradient(700px 420px at -5% 115%, rgba(255,92,38,0.25), transparent 60%), #05050a";

function LogoBars({ height }: { height: number }) {
  const k = height / 211;
  return (
    <div style={{ display: "flex", position: "relative", width: 449 * k, height }}>
      {BARS.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k, borderRadius: (b.w * k) / 2, background: GRADIENT }} />
      ))}
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <LogoBars height={36} />
      <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.045em" }}>Callback</div>
    </div>
  );
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

/** Interest (−100..100) over time as polyline points inside a w×h box. */
function sparkline(points: { t: number; score: number }[], w: number, h: number): string {
  if (points.length === 0) return "";
  const maxT = Math.max(1, ...points.map((p) => p.t));
  return points.map((p) => `${((p.t / maxT) * w).toFixed(1)},${(((100 - Math.max(-100, Math.min(100, p.score))) / 200) * h).toFixed(1)}`).join(" ");
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await loadPublishedReplay(id).catch(() => null);

  if (!replay) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: BG, color: "#f4f4f8" }}>
          <Wordmark />
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.05 }}>A practice cold call replay</div>
          <div style={{ fontSize: 28, color: "#a4a4b8" }}>Practice the cold call before the interview</div>
        </div>
      ),
      size,
    );
  }

  const { persona, total, outcome, scoreTimeline } = replay;
  const best = replay.turns
    .filter((t) => t.role === "rep" && typeof t.delta === "number")
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];
  const tone = total >= 70 ? "#4ade80" : total >= 45 ? "#ff8a5c" : "#fb7185";
  const W = 396;
  const H = 160;
  const line = sparkline(scoreTimeline, W, H);
  const last = scoreTimeline.at(-1);
  const lastX = last ? (last.t / Math.max(1, ...scoreTimeline.map((p) => p.t))) * W : 0;
  const lastY = last ? ((100 - last.score) / 200) * H : H / 2;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "60px 72px", background: BG, color: "#f4f4f8" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark />
          <div style={{ display: "flex", fontSize: 22, color: "#a4a4b8" }}>Practice call replay</div>
        </div>

        <div style={{ display: "flex", marginTop: 44, gap: 56, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ fontSize: 168, fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 0.9, color: tone }}>{String(total)}</div>
              <div style={{ fontSize: 48, fontWeight: 700, color: "#a4a4b8", marginLeft: 10, marginBottom: 10 }}>/100</div>
            </div>
            <div style={{ display: "flex", marginTop: 22, gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  padding: "8px 18px",
                  borderRadius: 999,
                  fontSize: 24,
                  fontWeight: 700,
                  color: outcome === "meeting" ? "#4ade80" : "#fb7185",
                  background: outcome === "meeting" ? "rgba(74,222,128,0.12)" : "rgba(251,113,133,0.12)",
                }}
              >
                {outcome === "meeting" ? "Meeting booked" : "No meeting"}
              </div>
              <div style={{ display: "flex", padding: "8px 18px", borderRadius: 999, fontSize: 24, color: "#f4f4f8", background: "rgba(255,255,255,0.07)" }}>
                {`${DIFFICULTY[persona.difficulty]} buyer`}
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 26, fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em" }}>{clip(`vs ${persona.name}, ${persona.title}`, 42)}</div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 24, color: "#a4a4b8" }}>{clip(persona.company, 48)}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 20, color: "#a4a4b8", textTransform: "uppercase", letterSpacing: 2 }}>Buyer interest</div>
            <div style={{ display: "flex", marginTop: 14, padding: 18, borderRadius: 24, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
              <svg width={W} height={H} viewBox={`-6 -6 ${W + 12} ${H + 12}`}>
                <defs>
                  <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff7a3d" />
                    <stop offset="55%" stopColor="#ff2e6e" />
                    <stop offset="100%" stopColor="#9b7bff" />
                  </linearGradient>
                </defs>
                <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeDasharray="6 8" />
                <polyline points={line} fill="none" stroke="url(#spark)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={lastX} cy={lastY} r="9" fill="#f4f4f8" />
              </svg>
            </div>
            {best && (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
                <div style={{ display: "flex", fontSize: 20, color: "#a4a4b8", textTransform: "uppercase", letterSpacing: 2 }}>
                  {`Best line · ${(best.delta ?? 0) > 0 ? "+" : ""}${best.delta}`}
                </div>
                <div style={{ display: "flex", marginTop: 10, fontSize: 27, lineHeight: 1.3, fontStyle: "italic", color: "#f4f4f8" }}>{`“${clip(best.text, 120)}”`}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
