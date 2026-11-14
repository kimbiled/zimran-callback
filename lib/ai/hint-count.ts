// Coach hints are counted on the server (each hint /api/hint actually returns), so the
// −3-per-hint penalty can't be skipped by the client. The debrief applies it once.
import { neon } from "@neondatabase/serverless";
import type { Debrief } from "../types";

export const HINT_PENALTY = 3;

const shared = globalThis as unknown as { __cbHintCounts?: Map<string, number> };
const memory = (shared.__cbHintCounts ??= new Map<string, number>());
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
async function init() {
  if (!sql) return;
  ready ??= sql`create table if not exists call_hints (
    call_id uuid primary key references calls(id),
    n int not null default 0
  )`.catch((error) => {
    ready = undefined;
    throw error;
  });
  await ready;
}

export async function recordHint(callId: string): Promise<number> {
  if (!sql) {
    const n = (memory.get(callId) ?? 0) + 1;
    memory.set(callId, n);
    return n;
  }
  await init();
  const rows = await sql`insert into call_hints (call_id, n) values (${callId}::uuid, 1)
    on conflict (call_id) do update set n = call_hints.n + 1 returning n`;
  return Number(rows[0]?.n ?? 0);
}

export async function hintCount(callId: string): Promise<number> {
  if (!sql) return memory.get(callId) ?? 0;
  await init();
  const rows = await sql`select n from call_hints where call_id = ${callId}::uuid`;
  return Number(rows[0]?.n ?? 0);
}

/** Pure: takes HINT_PENALTY points per hint off the 0–100 total (never below 0) and records it. */
export function applyHintPenalty(debrief: Debrief, hints: number): Debrief {
  const n = Math.max(0, Math.floor(hints || 0));
  if (n === 0) return debrief;
  const penalty = Math.min(debrief.total, n * HINT_PENALTY);
  return { ...debrief, total: debrief.total - penalty, hintsUsed: n, hintPenalty: penalty };
}
