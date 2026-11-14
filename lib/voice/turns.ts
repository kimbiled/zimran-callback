// [B] GPT-Live sends transcripts as bare deltas with no "turn finished" event, and it is
// full-duplex: the buyer can say "Hi." or "Mm-hm" while the rep is still talking, and the
// rep's transcript can arrive after the buyer has started answering. So each speaker gets
// its own buffer, closed by the caller (silence timers, end of call), and closed turns are
// emitted in the order they started: a turn that began later waits for an earlier open one.

export type Speaker = "rep" | "buyer";

type Open = { text: string; since: number };

export function cleanTranscript(raw: string): string {
  return raw
    .replace(/�/g, " ") // broken multi-byte characters from split deltas
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:!?…\-–—]+\s*/, ""); // punctuation left over from the previous sentence
}

export class TurnAssembler {
  private open: Partial<Record<Speaker, Open>> = {};
  private held: { role: Speaker; text: string; since: number }[] = [];

  constructor(private readonly emit: (role: Speaker, text: string) => void) {}

  push(role: Speaker, delta: string, at: number = Date.now()) {
    if (!delta) return;
    const b = (this.open[role] ??= { text: "", since: at });
    b.text += delta;
  }

  isOpen(role: Speaker): boolean {
    return Boolean(this.open[role]);
  }

  /** Closes one speaker's turn, or both (end of call). */
  flush(role?: Speaker) {
    const roles: Speaker[] = role ? [role] : ["rep", "buyer"];
    for (const r of roles) {
      const b = this.open[r];
      if (!b) continue;
      delete this.open[r];
      const text = cleanTranscript(b.text);
      if (text) this.held.push({ role: r, text, since: b.since });
    }
    this.release();
  }

  private release() {
    this.held.sort((a, b) => a.since - b.since);
    const earliestOpen = Math.min(...Object.values(this.open).map((b) => b!.since), Infinity);
    while (this.held.length && this.held[0].since <= earliestOpen) {
      const t = this.held.shift()!;
      this.emit(t.role, t.text);
    }
  }
}
