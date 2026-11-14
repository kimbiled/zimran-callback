import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

if (!process.argv.includes("--live")) {
  const resultPath = new URL("../evals/results-offline.json", import.meta.url);
  rmSync(resultPath, { force: true });
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)), "run", "tests/eval.test.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
    env: { ...process.env, AI_DISABLED: "1", CALLBACK_EVAL_REPORT: "1" },
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  console.table(result.rows);
  console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
  console.log("EVAL PASSED (offline rubric; not live model quality)");
  process.exit(0);
}
if (!process.env.EVAL_KEY) { console.error("EVAL_KEY is required for --live"); process.exit(1); }
const url = new URL("/api/eval", process.env.BASE_URL || "http://localhost:3000");
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("Remote eval must use HTTPS");
}
console.log("Running live model evaluation (20 calls / 60 rep turns), in paced pairs through the production judge.");
const fixtures = JSON.parse(readFileSync(new URL("../evals/calls/paired.json", import.meta.url), "utf8"));
const batches = [];
const batchRetries = [];
for (const [index, fixture] of fixtures.entries()) {
  url.searchParams.set("pair", fixture.id);
  let batch;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.EVAL_KEY}` }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) { console.error(`Eval failed: HTTP ${response.status}`); process.exit(1); }
    batch = await response.json();
    if (batch.source === "ai" || !batch.failures?.rate_limit || attempt === 1) break;
    batchRetries.push({ pair: fixture.id, reason: "rate_limit" });
    console.warn(`Rate-limited pair ${fixture.id}; waiting 60 seconds before one retry.`);
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
  if (batch.source !== "ai") {
    writeFileSync(new URL("../evals/results-live.json", import.meta.url), JSON.stringify({ complete: false, failedPair: fixture.id, completedBatches: batches, ...batch }, null, 2) + "\n");
    console.error(`Live eval stopped: ${fixture.id} used ${batch.source}; failures=${JSON.stringify(batch.failures ?? {})}`);
    process.exit(1);
  }
  batches.push(batch);
  writeFileSync(new URL("../evals/results-live-progress.json", import.meta.url), JSON.stringify({ complete: false, batches, batchRetries }, null, 2) + "\n");
  console.log(`Evaluated ${index + 1}/${fixtures.length}: ${fixture.id}`);
}
const rows = batches.flatMap(batch => batch.rows);
const sum = key => batches.reduce((total, batch) => total + batch[key], 0);
const moves = sum("moves"), groundedMoves = sum("groundedMoves"), aiTurns = sum("aiTurns"), judgedTurns = sum("judgedTurns");
const orderedPairs = rows.filter(row => row.ordered).length;
const result = {
  calls: sum("calls"), pairs: rows.length, orderedPairs,
  pairAccuracy: Math.round(orderedPairs / rows.length * 100),
  meanStrong: Number((rows.reduce((total, row) => total + row.strong, 0) / rows.length).toFixed(1)),
  meanWeak: Number((rows.reduce((total, row) => total + row.weak, 0) / rows.length).toFixed(1)),
  groundedQuoteRate: moves ? Math.round(groundedMoves / moves * 100) : 0,
  moves, groundedMoves, judgedTurns, aiTurns, transientRetries: sum("transientRetries"), batchRetries, source: aiTurns === judgedTurns ? "ai" : "mixed", rows,
};
writeFileSync(new URL("../evals/results-live.json", import.meta.url), JSON.stringify({ ...result, checkedAt: new Date().toISOString(), environment: ["localhost", "127.0.0.1"].includes(url.hostname) ? "local" : "remote" }, null, 2) + "\n");
console.table(result.rows);
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
if (result.source !== "ai" || result.pairAccuracy < 80 || result.groundedQuoteRate < 100) {
  console.error("Live eval did not pass: require all AI verdicts, >=80% paired ordering and 100% grounded score moves.");
  process.exit(1);
}
console.log("EVAL PASSED (live model)");
