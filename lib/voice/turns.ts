// [B] GPT-Live sends transcripts as bare deltas with no "turn finished" event,
// so the app decides where one speaker's turn ends: when the other speaker starts,
// or when the caller of flush() says so (silence timers, end of call).

export type Speaker = "rep" | "buyer";

export class TurnAssembler {
  private speaker: Speaker | null = null;
  private buf = "";

  constructor(private readonly emit: (role: Speaker, text: string) => void) {}

  push(role: Speaker, delta: string) {
    if (!delta) return;
    if (this.speaker && this.speaker !== role) this.flush();
    this.speaker = role;
    this.buf += delta;
  }

  /** Emits the open turn (if any). With a role, only flushes when that speaker holds the turn. */
  flush(role?: Speaker) {
    if (!this.speaker || (role && role !== this.speaker)) return;
    const text = this.buf.replace(/\s+/g, " ").trim();
    const who = this.speaker;
    this.speaker = null;
    this.buf = "";
    if (text) this.emit(who, text);
  }

  get current(): Speaker | null {
    return this.speaker;
  }
}
