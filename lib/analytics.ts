"use client";
import { track } from "@vercel/analytics";

export function trackEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  // Only categorical/count data. Never pass transcripts, quotes, hidden profiles or IDs.
  if (typeof window !== "undefined") {
    try { track(name, properties); } catch { /* Blocked telemetry must never break the call or feedback. */ }
  }
}
