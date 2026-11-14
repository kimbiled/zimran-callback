// B owns judge evidence; client-supplied scores and pain hints are never authoritative.
import { neon } from "@neondatabase/serverless";
import type { CallRecord, Debrief, JudgeResponse, TimelinePoint, Turn } from "../types";
import { db } from "../server/db";
import { sessionId } from "../server/session";
import { TurnsSchema } from "../server/validate";
import { guardJudge } from "./guards";
import { heuristicJudge } from "./heuristics";
export { initialInterest } from "./interest";
import { initialInterest } from "./interest";

export const CallTurnsSchema = TurnsSchema.superRefine((turns, ctx) => {
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (!t.text.trim() || t.end < t.start || t.end > 300 || (i > 0 && t.start < turns[i - 1].start)) {
      ctx.addIssue({ code: "custom", message: "Invalid call timestamps or empty turn", path: [i] });
    }
  }
});

export async function ownedCall(id: string): Promise<CallRecord | null> {
  const call = await db().getCall(id);
  return call && call.sessionId === await sessionId() ? call : null;
}

type Entry = { repText: string; verdict: JudgeResponse };
const shared = globalThis as unknown as { __cbJudgeMemory?: Map<string, Entry[]> };
const memory = shared.__cbJudgeMemory ??= new Map<string, Entry[]>();
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
async function init() {
  if (sql) {
    ready ??= sql`create table if not exists call_judgments (
      call_id uuid not null references calls(id), rep_index int not null,
      rep_text text not null, verdict jsonb not null,
      primary key (call_id, rep_index)
    )`.catch(error => { ready = undefined; throw error; });
    await ready;
  }
}

export async function judgments(callId: string): Promise<Entry[]> {
  if (!sql) return structuredClone(memory.get(callId) ?? []);
  await init();
  const rows = await sql`select rep_text, verdict from call_judgments where call_id = ${callId}::uuid order by rep_index`;
  return rows.map(row => ({ repText: String(row.rep_text), verdict: row.verdict as JudgeResponse }));
}

export async function saveJudgment(callId: string, index: number, repText: string, verdict: JudgeResponse): Promise<JudgeResponse> {
  if (sql) {
    await init();
    await sql`insert into call_judgments (call_id, rep_index, rep_text, verdict)
      values (${callId}::uuid, ${index}, ${repText}, ${JSON.stringify(verdict)}::jsonb)
      on conflict (call_id, rep_index) do nothing`;
    return (await judgments(callId))[index].verdict;
  }
  const entries = memory.get(callId) ?? [];
  entries[index] ??= { repText, verdict };
  memory.set(callId, entries);
  return structuredClone(entries[index].verdict);
}

export function sameRepPrefix(entries: Entry[], turns: Turn[]): boolean {
  const rep = turns.filter(t => t.role === "rep");
  return entries.every((entry, i) => entry.repText === rep[i]?.text);
}

/** Rebuild final evidence from saved verdicts; finish any unsent turns with the labelled rubric. */
export function finalEvidence(call: CallRecord, turns: Turn[], entries: Entry[]) {
  const pains = new Set<string>();
  let score = initialInterest(call.persona.difficulty);
  let repIndex = 0;
  const timeline: TimelinePoint[] = [{ t: 0, score }];
  const clean = turns.map((t): Turn => ({ role: t.role, text: t.text, start: t.start, end: t.end }));
  for (let i = 0; i < clean.length; i++) {
    const turn = clean[i];
    if (turn.role !== "rep") continue;
    const saved = entries[repIndex++];
    const verdict = saved?.repText === turn.text ? saved.verdict : {
      ...guardJudge(heuristicJudge(call.persona, clean.slice(0, i + 1), [...pains]), {
        prevScore: score, repText: turn.text, painIds: call.persona.pains.map(p => p.id), alreadyFound: [...pains],
      }), source: "heuristic" as const,
    };
    score = verdict.score;
    verdict.painsUncovered.forEach(id => pains.add(id));
    Object.assign(turn, { delta: verdict.delta, score, reason: verdict.reason, judgeSource: verdict.source });
    timeline.push({ t: turn.end, score });
  }
  return { turns: clean, timeline, painsFound: [...pains] };
}

const finalizations = new Map<string, Promise<Debrief>>();
export function finishCallOnce(call: CallRecord, build: () => Promise<{ turns: Turn[]; debrief: Debrief }>): Promise<Debrief> {
  const pending = finalizations.get(call.id);
  if (pending) return pending;
  const task = (async () => {
    const current = await db().getCall(call.id);
    if (current?.status === "done" && current.debrief) return current.debrief;
    const { turns, debrief } = await build();
    // Usage is not counted here: POST /api/calls reserves the call against the free limit when it
    // starts (prevents parallel-call abuse), so completion must never count it a second time.
    if (sql) {
      // Atomic completion, including requests on different Vercel workers.
      const rows = await sql`update calls set status = 'done', ended_at = now(), turns = ${JSON.stringify(turns)}::jsonb,
          debrief = ${JSON.stringify(debrief)}::jsonb, final_score = ${debrief.finalScore}, total = ${debrief.total}
        where id = ${call.id}::uuid and status = 'live' returning debrief`;
      if (rows[0]) return rows[0].debrief as Debrief;
      const saved = (await db().getCall(call.id))?.debrief;
      if (!saved) throw new Error("Call completion failed");
      return saved;
    }
    await db().finishCall(call.id, turns, debrief);
    return debrief;
  })();
  finalizations.set(call.id, task);
  void task.finally(() => finalizations.delete(call.id)).catch(() => {});
  return task;
}

type TextReply = { text: string; source: "ai" | "heuristic" };
const costState = globalThis as unknown as {
  __cbTextReplies?: Map<string, Promise<TextReply>>;
  __cbJobQuotas?: Map<string, number>;
};
const replies = costState.__cbTextReplies ??= new Map<string, Promise<TextReply>>();
const quotas = costState.__cbJobQuotas ??= new Map<string, number>();
let costReady: Promise<unknown> | undefined;
async function initCostTables() {
  if (!sql) return;
  costReady ??= (async () => {
    await sql`create table if not exists text_buyer_replies (
      call_id uuid not null references calls(id), rep_index int not null,
      reply jsonb, created_at timestamptz not null default now(), primary key (call_id, rep_index)
    )`;
    await sql`create table if not exists ai_job_quotas (
      session_id uuid not null references sessions(id), day date not null default current_date,
      used int not null default 0, primary key (session_id, day)
    )`;
  })().catch(error => { costReady = undefined; throw error; });
  await costReady;
}

export function textReplyOnce(callId: string, repIndex: number, build: () => Promise<TextReply>): Promise<TextReply> {
  const key = `${callId}:${repIndex}`;
  const cached = replies.get(key);
  if (cached) return cached;
  const task = (async () => {
    if (!sql) return build();
    await initCostTables();
    const claimed = await sql`insert into text_buyer_replies (call_id, rep_index)
      values (${callId}::uuid, ${repIndex}) on conflict (call_id, rep_index) do update
      set created_at = now() where text_buyer_replies.reply is null
      and text_buyer_replies.created_at < now() - interval '30 seconds' returning rep_index`;
    if (!claimed.length) {
      const saved = await sql`select reply from text_buyer_replies where call_id = ${callId}::uuid and rep_index = ${repIndex}`;
      if (!saved[0]?.reply) throw new Error("Buyer reply is already in progress");
      return saved[0].reply as TextReply;
    }
    try {
      const result = await build();
      await sql`update text_buyer_replies set reply = ${JSON.stringify(result)}::jsonb where call_id = ${callId}::uuid and rep_index = ${repIndex}`;
      return result;
    } catch (error) {
      await sql`delete from text_buyer_replies where call_id = ${callId}::uuid and rep_index = ${repIndex} and reply is null`;
      throw error;
    }
  })();
  replies.set(key, task);
  void task.catch(() => replies.delete(key));
  return task;
}

export async function reservePersonaGeneration(sid: string): Promise<boolean> {
  await db().getOrCreateSession(sid);
  if (sql) {
    await initCostTables();
    const rows = await sql`insert into ai_job_quotas (session_id, used) values (${sid}::uuid, 1)
      on conflict (session_id, day) do update set used = ai_job_quotas.used + 1
      where ai_job_quotas.used < 3 returning used`;
    return rows.length > 0;
  }
  const key = `${sid}:${new Date().toISOString().slice(0, 10)}`;
  const used = quotas.get(key) ?? 0;
  if (used >= 3) return false;
  quotas.set(key, used + 1);
  return true;
}
