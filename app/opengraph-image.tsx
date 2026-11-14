import { ImageResponse } from "next/og";

export const alt = "Callback: practice the cold call before the interview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GRADIENT = "linear-gradient(160deg, #ff7a3d 0%, #ff2e6e 55%, #9b7bff 100%)";
// Logo geometry from components/Logo.tsx: six rounded bars, two voices of three.
const BARS = [
  { x: 0, y: 0, w: 56, h: 211 },
  { x: 72, y: 41, w: 54, h: 143 },
  { x: 141, y: 81, w: 53, h: 90 },
  { x: 255, y: 81, w: 53, h: 90 },
  { x: 324, y: 41, w: 53, h: 143 },
  { x: 393, y: 0, w: 56, h: 211 },
];

function LogoBars({ height }: { height: number }) {
  const k = height / 211;
  return (
    <div style={{ display: "flex", position: "relative", width: 449 * k, height }}>
      {BARS.map((b, i) => (
        <div
          key={i}
          style={{ position: "absolute", left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k, borderRadius: (b.w * k) / 2, background: GRADIENT }}
        />
      ))}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "radial-gradient(900px 500px at 85% -10%, rgba(124,92,255,0.35), transparent 60%), radial-gradient(700px 420px at -5% 110%, rgba(255,92,38,0.28), transparent 60%), #05050a",
          color: "#f4f4f8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <LogoBars height={54} />
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.045em" }}>Callback</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.045em", maxWidth: 980 }}>
            Practice the cold call before the interview
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#a4a4b8", maxWidth: 940, lineHeight: 1.3 }}>
            An AI buyer with hidden pains and real objections. A live interest meter. A debrief with better lines.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Voice call", "Live interest meter", "Debrief with quotes", "No sign-up"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", fontSize: 22, color: "#f4f4f8" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
