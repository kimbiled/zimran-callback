import { describe, expect, it } from "vitest";
import { MOODS, faceFor, moodFor } from "@/lib/mood";
import { painLabel } from "@/components/PainTiles";
import { initialsOf } from "@/components/BuyerMood";
import { summarizeProgress, trendLine, type ProgressCall } from "@/components/LimitScreen";
import { PERSONAS } from "@/lib/personas";

describe("buyer mood mapping", () => {
  it("maps the interest score to seven ordered moods", () => {
    expect(moodFor(-100).label).toBe("Hostile");
    expect(moodFor(-61).label).toBe("Hostile");
    expect(moodFor(-60).label).toBe("Annoyed");
    expect(moodFor(-31).label).toBe("Annoyed");
    expect(moodFor(-30).label).toBe("Guarded");
    expect(moodFor(-11).label).toBe("Guarded");
    expect(moodFor(-10).label).toBe("Neutral");
    expect(moodFor(0).label).toBe("Neutral");
    expect(moodFor(9).label).toBe("Neutral");
    expect(moodFor(10).label).toBe("Curious");
    expect(moodFor(30).label).toBe("Interested");
    expect(moodFor(59).label).toBe("Interested");
    expect(moodFor(60).label).toBe("Warm");
    expect(moodFor(100).label).toBe("Warm");
  });
  it("clamps out-of-range and non-finite scores and returns colors", () => {
    expect(moodFor(-500).label).toBe("Hostile");
    expect(moodFor(500).label).toBe("Warm");
    expect(moodFor(Number.NaN).label).toBe("Neutral");
    for (const m of MOODS) {
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(m.ring).toMatch(/^rgb\(/);
    }
    expect(new Set(MOODS.map(m => m.color)).size).toBe(MOODS.length);
  });
  it("interpolates the face: smile and raised brows when warm, frown and angry brows when cold", () => {
    expect(faceFor(0)).toEqual({ mouthCurve: 0, browInner: 0, browLift: 0, eyeOpen: 1 });
    const warm = faceFor(100), cold = faceFor(-100), mild = faceFor(40);
    expect(warm.mouthCurve).toBeGreaterThan(0);
    expect(cold.mouthCurve).toBeLessThan(0);
    expect(cold.browInner).toBeGreaterThan(0);
    expect(warm.browInner).toBeLessThan(0);
    expect(mild.mouthCurve).toBeGreaterThan(0);
    expect(mild.mouthCurve).toBeLessThan(warm.mouthCurve);
    expect(cold.eyeOpen).toBeLessThan(1);
    expect(faceFor(1000)).toEqual(warm);
  });
});

describe("pain tile labels", () => {
  it("uses curated labels for known pain ids", () => {
    expect(painLabel("month_close")).toBe("Month-end close");
    expect(painLabel("onboarding")).toBe("Slow onboarding");
    expect(painLabel("glp1_spend")).toBe("GLP-1 spend");
  });
  it("derives a readable label for unknown ids", () => {
    expect(painLabel("supplier_late_fees")).toBe("Supplier late fees");
    expect(painLabel("cash-flow")).toBe("Cash flow");
    expect(painLabel("  ")).toBe("Pain");
  });
  it("has a short curated label for every built-in pain, never its hidden details", () => {
    for (const p of PERSONAS) for (const pain of p.pains) {
      const label = painLabel(pain.id);
      expect(label.length).toBeGreaterThan(2);
      expect(label.split(" ").length).toBeLessThanOrEqual(4);
      expect(label).not.toMatch(/\d{2,}|\$/);
      expect(pain.text).not.toContain(label);
    }
  });
  it("builds avatar initials from first and last name", () => {
    expect(initialsOf("Linda", "Linda Park")).toBe("LP");
    expect(initialsOf("Nina", "Dr. Nina Castillo")).toBe("NC");
    expect(initialsOf("Cher", "Cher")).toBe("C");
  });
});

describe("paywall progress summary", () => {
  const item = (total: number | null, day: number, criteria: ProgressCall["criteria"] = {}): ProgressCall =>
    ({ callId: String(day), total, startedAt: `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`, criteria });
  it("shows the trend in call order, best score and weakest criterion", () => {
    const s = summarizeProgress([
      item(61, 3, { opening: 15, discovery: 12, objections: 8, value: 14, next_step: 12 }),
      item(38, 1, { opening: 10, discovery: 6, objections: 4, value: 10, next_step: 8 }),
      item(70, 2, { opening: 16, discovery: 14, objections: 6, value: 18, next_step: 16 }),
    ]);
    expect(trendLine(s)).toBe("38 → 61 in 3 calls");
    expect(s.best).toBe(70);
    expect(s.weakest?.id).toBe("objections");
    expect(s.weakest?.avg).toBe(6);
    expect(s.weakest?.tip).toMatch(/acknowledge/i);
  });
  it("handles no finished calls and a single call", () => {
    expect(trendLine(summarizeProgress([]))).toBe("No finished calls yet");
    expect(summarizeProgress([]).weakest).toBeNull();
    expect(trendLine(summarizeProgress([item(42, 1), item(null, 2)]))).toBe("42 on your first call");
  });
});
