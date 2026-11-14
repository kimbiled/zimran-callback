import type { Turn } from "../types";
export type Speaker = Turn["role"];
type Fragment = { text: string; start: number; end: number; order: number };
type Open = { fragments: Fragment[]; since: number };

export function cleanTranscript(raw: string): string {
  return raw.replace(/�/g, " ").replace(/\s+/g, " ").trim().replace(/^[.,;:!?…\-–—]+\s*/, "");
}

/** Independent caption buffers retain source timing during full-duplex speech. */
export class TurnAssembler {
  private open: Partial<Record<Speaker, Open>> = {};
  private held: Turn[] = [];
  private seen = new Set<string>();
  private order = 0;
  constructor(private readonly emit: (turn: Turn) => void) {}
  push(role: Speaker, delta: string, startMs: number, endMs: number = startMs, eventId?: string): boolean {
    if (!delta || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < startMs || startMs > 300_000) return false;
    if (eventId) { if (this.seen.has(eventId)) return false; this.seen.add(eventId); }
    if (delta.length > 3500) {
      let remaining = delta;
      while (remaining.length > 3500) {
        const space = remaining.lastIndexOf(" ", 3500);
        const cut = space > 0 ? space + 1 : 3500;
        this.push(role, remaining.slice(0, cut), startMs, endMs);
        remaining = remaining.slice(cut);
      }
      if (remaining) this.push(role, remaining, startMs, endMs);
      return true;
    }
    // Keep a long monologue inside the API's per-turn text limit without dropping words.
    if ((this.open[role]?.fragments.reduce((size, fragment) => size + fragment.text.length, 0) ?? 0) + delta.length > 3500) this.flush(role);
    const b = this.open[role] ??= { fragments: [], since: startMs / 1000 };
    b.since = Math.min(b.since, startMs / 1000);
    b.fragments.push({ text: delta, start: startMs / 1000, end: Math.min(300, endMs / 1000), order: this.order++ });
    return true;
  }
  isOpen(role: Speaker): boolean { return Boolean(this.open[role]); }
  flush(role?: Speaker) {
    for (const r of role ? [role] : ["rep", "buyer"] as const) {
      const b = this.open[r];
      if (!b) continue;
      delete this.open[r];
      b.fragments.sort((a, z) => a.start - z.start || a.order - z.order);
      const text = cleanTranscript(b.fragments.map(f => f.text).join(""));
      if (text) this.held.push({ role: r, text, start: b.since, end: Math.max(...b.fragments.map(f => f.end)) });
    }
    this.held.sort((a, b) => a.start - b.start);
    const earliestOpen = Math.min(...Object.values(this.open).map(b => b!.since), Infinity);
    while (this.held.length && this.held[0].start <= earliestOpen) this.emit(this.held.shift()!);
  }
}

/** Only an explicit terminal farewell counts; quoted/negated instructions never hang up. */
export function buyerSaidGoodbye(text: string): boolean {
  if (/["“”]/.test(text) || /\b(?:don't|do not|not|never|won't|shouldn't|say|word|phrase)\b[^.!?]*\b(?:goodbye|bye|hang up)\b/i.test(text)) return false;
  const last = text.toLowerCase().split(/[.!?]+/).map(s => s.trim()).filter(Boolean).at(-1) ?? "";
  return /^(?:(?:okay|ok|alright|thanks|thank you|thanks for calling)[,\s]+)*(?:goodbye|good bye|bye(?: for now)?|have a (?:good|nice) day|i (?:need|have) to (?:go|get back to work))$/.test(last);
}
