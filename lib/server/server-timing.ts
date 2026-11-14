// Server-Timing header for latency-sensitive routes (visible in DevTools and `npm run measure`).
// Durations only: never put ids, prompts or model output into a segment description.

export type TimingSegment = { name: string; ms: number; desc?: string };

const TOKEN = /^[A-Za-z0-9_-]+$/;

/** `db;dur=12.3, ai;dur=4012.5;desc="ai", total;dur=4030.1`; invalid names and durations are skipped. */
export function formatServerTiming(segments: TimingSegment[]): string {
  return segments
    .filter(s => TOKEN.test(s.name) && Number.isFinite(s.ms))
    .map(s => {
      const desc = s.desc && TOKEN.test(s.desc) ? `;desc="${s.desc}"` : "";
      return `${s.name};dur=${Math.max(0, Math.round(s.ms * 10) / 10)}${desc}`;
    })
    .join(", ");
}

/** Accumulates named durations within one request. `time` adds each await to its segment. */
export class ServerTimer {
  private readonly started = performance.now();
  private readonly totals = new Map<string, number>();
  private readonly descs = new Map<string, string>();

  add(name: string, ms: number, desc?: string) {
    this.totals.set(name, (this.totals.get(name) ?? 0) + ms);
    if (desc) this.descs.set(name, desc);
  }

  async time<T>(name: string, run: () => Promise<T>): Promise<T> {
    const t = performance.now();
    try { return await run(); } finally { this.add(name, performance.now() - t); }
  }

  get(name: string): number { return this.totals.get(name) ?? 0; }

  header(): string {
    const segments = [...this.totals].map(([name, ms]) => ({ name, ms, desc: this.descs.get(name) }));
    return formatServerTiming([...segments, { name: "total", ms: performance.now() - this.started }]);
  }

  /** Sets the header on a response and returns it; the JSON body is untouched. */
  apply(response: Response): Response {
    response.headers.set("Server-Timing", this.header());
    return response;
  }
}
