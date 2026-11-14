// Runs the judge on the labeled set through a deployed app and prints numbers for the Proof slide.
// Usage: BASE_URL=https://your-app.vercel.app EVAL_KEY=... npm run eval

const base = process.env.BASE_URL || "http://localhost:3000";
const key = process.env.EVAL_KEY;
if (!key) {
  console.error("Set EVAL_KEY (same value as on the server).");
  process.exit(1);
}

const res = await fetch(`${base}/api/eval?key=${encodeURIComponent(key)}`);
if (!res.ok) {
  console.error(`Eval failed: HTTP ${res.status}`);
  process.exit(1);
}
const r = await res.json();
console.table(r.rows.map((x) => ({ case: x.id, expect: x.expect, judge: x.judge.delta, ok: x.judge.ok, heuristic: x.heuristic.delta })));
console.log(`\nJudge agreement with labels: ${r.judgeAccuracy}% on ${r.cases} turns (source: ${r.judgeSource})`);
console.log(`Offline rubric agreement:   ${r.heuristicAccuracy}%`);
console.log(`Median judge latency:       ${r.medianLatencyMs} ms`);
