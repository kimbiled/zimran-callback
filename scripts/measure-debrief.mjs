// Measures post-call latency: judge per rep turn, POST /api/debrief and the debrief page.
// Usage: BASE_URL=http://localhost:3000 RUNS=5 npm run measure
// Spends model tokens (each run = 1 call, 3 judge + 3 buyer + 1 debrief generation) and counts
// against the per-IP call-start rate limit. Never prints cookies, keys or transcripts.
import assert from "node:assert/strict";

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const runs = Math.max(1, Math.min(20, Number(process.env.RUNS || process.argv[2] || 3)));
const target = new URL(base);
assert(target.protocol === "https:" || ["localhost", "127.0.0.1"].includes(target.hostname), "Remote targets require HTTPS");

const REP_LINES = [
  "Hi Mike, this is Alex from PipelinePro. I'm calling because sales leaders tell us forecasting eats their week. Do you have a minute?",
  "How does your team build the forecast today, and where does it break down?",
  "If those hours went back to selling, would it be worth a 20-minute look on Thursday at 11 with you and your RevOps lead?",
];

/** Parses `Server-Timing: db;dur=12.3, ai;dur=4000` into { db: 12.3, ai: 4000 }. */
export function parseServerTiming(header) {
  const out = {};
  for (const part of (header || "").split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    const dur = params.map(p => p.trim()).find(p => p.startsWith("dur="));
    if (dur) out[name.trim()] = Number(dur.slice(4));
  }
  return out;
}

function session() {
  let cookie = "";
  return async (path, body) => {
    const started = performance.now();
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    const ms = performance.now() - started;
    const set = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    if (set) cookie = set;
    if (!response.ok) throw new Error(`${path.split("?")[0]} HTTP ${response.status}${response.status === 429 ? " (rate limited)" : ""}`);
    let data = null;
    try { data = JSON.parse(text); } catch { /* HTML page */ }
    return { data, ms, timing: parseServerTiming(response.headers.get("server-timing")) };
  };
}

async function oneRun() {
  const call = session();
  const { data: start } = await call("/api/calls", { personaId: "mike-sales", mode: "text", role: "sdr" });
  const callId = start.callId;
  let t = 0;
  const turn = (role, text) => { const s = t; t += 6; return { role, text, start: s, end: s + 5 }; };
  const turns = [turn("buyer", start.voice?.openingLine || "Mike speaking.")];
  const judge = [];
  for (const line of REP_LINES) {
    turns.push(turn("rep", line));
    const j = await call("/api/judge", { callId, turns });
    judge.push({ ms: j.ms, server: j.timing, source: j.data?.source });
    const b = await call("/api/buyer", { callId, turns });
    const reply = b.data?.text ?? b.data?.reply ?? b.data?.turn?.text;
    if (reply) turns.push(turn("buyer", reply));
  }
  const d = await call("/api/debrief", { callId, turns });
  const p = await call(`/debrief/${callId}`);
  return { judge, debrief: { ms: d.ms, server: d.timing, source: d.data?.source }, page: { ms: p.ms } };
}

function pct(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
const row = (label, values) => {
  const v = values.filter(Number.isFinite);
  return `${label.padEnd(22)} n=${String(v.length).padEnd(3)} p50=${String(Math.round(pct(v, 50))).padStart(6)} ms  p95=${String(Math.round(pct(v, 95))).padStart(6)} ms`;
};

async function main() {
  console.log(`Measuring ${runs} text call(s) against ${base} (spends model tokens).`);
  const results = [];
  for (let i = 0; i < runs; i++) {
    try {
      const r = await oneRun();
      results.push(r);
      console.log(`run ${i + 1}: judge ${r.judge.map(j => Math.round(j.ms)).join("/")} ms, debrief ${Math.round(r.debrief.ms)} ms (${r.debrief.source}), page ${Math.round(r.page.ms)} ms`);
    } catch (error) {
      console.error(`run ${i + 1} failed: ${error instanceof Error ? error.message : error}`);
      if (/rate limited/.test(String(error))) break;
    }
  }
  if (!results.length) process.exit(1);
  const judges = results.flatMap(r => r.judge);
  const sources = results.map(r => r.debrief.source).reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {});
  console.log("\nLatency (client-observed, plus Server-Timing segments):");
  console.log(row("judge", judges.map(j => j.ms)));
  console.log(row("  judge server ai", judges.map(j => j.server.ai)));
  console.log(row("  judge server total", judges.map(j => j.server.total)));
  console.log(row("debrief", results.map(r => r.debrief.ms)));
  for (const key of [...new Set(results.flatMap(r => Object.keys(r.debrief.server)))]) {
    console.log(row(`  debrief server ${key}`, results.map(r => r.debrief.server[key])));
  }
  console.log(row("page GET /debrief/[id]", results.map(r => r.page.ms)));
  console.log(row("debrief + page", results.map(r => r.debrief.ms + r.page.ms)));
  console.log(`debrief source: ${JSON.stringify(sources)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
