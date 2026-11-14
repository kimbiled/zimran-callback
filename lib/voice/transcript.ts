import type { Turn } from "../types";
import { estimateSeconds } from "../metrics";

/** Browser speech events give approximate timing; no audio is recorded. */
export class TranscriptClock {
  private windows: Partial<Record<Turn["role"], { start: number; end: number }>> = {};
  private active: Partial<Record<Turn["role"], number>> = {};
  private seen = new Set<string>();
  speech(role: Turn["role"], speaking: boolean, at: number) {
    if (speaking) this.active[role] ??= at;
    else if (this.active[role] !== undefined) {
      this.windows[role] = { start: this.windows[role]?.start ?? this.active[role]!, end: at };
      delete this.active[role];
    }
  }
  turn(role: Turn["role"], text: string, at: number, eventId?: number | string): Turn | null {
    if (!text.trim()) return null;
    if (eventId !== undefined) {
      const key = `${role}:${eventId}`;
      if (this.seen.has(key)) return null;
      this.seen.add(key);
    }
    const window = this.windows[role];
    const end = Math.min(300, this.active[role] === undefined && window ? window.end : at);
    const start = Math.min(end, this.active[role] ?? window?.start ?? Math.max(0, end - estimateSeconds(text)));
    delete this.windows[role]; delete this.active[role];
    return { role, text: text.trim(), start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 };
  }
}
