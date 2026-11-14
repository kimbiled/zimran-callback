import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { FeedbackValues } from "./schema";

type FeedbackRecord = FeedbackValues & { callId: string; sessionId: string; updatedAt: string };
type FeedbackProof = {
  responses: number;
  anonymousSessions: number;
  averageUsefulness: number | null;
  wouldPayCount: number;
  wouldPayPercent: number | null;
  quotes: { text: string; at: string }[];
};
const shared = globalThis as unknown as { __cbFeedback?: Map<string, FeedbackRecord> };
const memory = shared.__cbFeedback ??= new Map<string, FeedbackRecord>();
let database: NeonQueryFunction<false, false> | undefined;
let ready: Promise<unknown> | undefined;

async function sqlStore() {
  if (!process.env.DATABASE_URL) return null;
  const sql = database ??= neon(process.env.DATABASE_URL);
  ready ??= sql`create table if not exists call_feedback (
    call_id uuid primary key references calls(id),
    session_id uuid not null references sessions(id),
    usefulness smallint not null check (usefulness between 1 and 5),
    would_pay boolean not null,
    quote text not null default '',
    quote_consent boolean not null default false,
    updated_at timestamptz not null default now(),
    check (quote_consent or quote = '')
  )`.catch(error => { ready = undefined; throw error; });
  await ready;
  return sql;
}

function values(row: Record<string, unknown>): FeedbackValues {
  return {
    usefulness: Number(row.usefulness), wouldPay: Boolean(row.would_pay),
    quote: Boolean(row.quote_consent) ? String(row.quote ?? "") : "", quoteConsent: Boolean(row.quote_consent),
  };
}

export async function getFeedback(callId: string, sid: string): Promise<FeedbackValues | null> {
  const sql = await sqlStore();
  if (sql) {
    const rows = await sql`select usefulness, would_pay, quote, quote_consent from call_feedback where call_id = ${callId}::uuid and session_id = ${sid}::uuid`;
    return rows[0] ? values(rows[0]) : null;
  }
  const record = memory.get(callId);
  if (!record || record.sessionId !== sid) return null;
  return { usefulness: record.usefulness, wouldPay: record.wouldPay, quote: record.quote, quoteConsent: record.quoteConsent };
}

export async function saveFeedback(callId: string, sid: string, input: FeedbackValues): Promise<FeedbackValues> {
  // Only retain text the author explicitly allows us to quote. Revocation erases it.
  const feedback: FeedbackValues = { ...input, quote: input.quoteConsent ? input.quote.trim() : "" };
  const sql = await sqlStore();
  if (sql) {
    const rows = await sql`insert into call_feedback (call_id, session_id, usefulness, would_pay, quote, quote_consent)
      values (${callId}::uuid, ${sid}::uuid, ${feedback.usefulness}, ${feedback.wouldPay}, ${feedback.quote}, ${feedback.quoteConsent})
      on conflict (call_id) do update set usefulness = excluded.usefulness, would_pay = excluded.would_pay,
        quote = excluded.quote, quote_consent = excluded.quote_consent, updated_at = now()
      where call_feedback.session_id = excluded.session_id
      returning usefulness, would_pay, quote, quote_consent`;
    if (!rows[0]) throw new Error("Feedback ownership changed");
    return values(rows[0]);
  }
  const old = memory.get(callId);
  if (old && old.sessionId !== sid) throw new Error("Feedback ownership changed");
  memory.set(callId, { ...feedback, callId, sessionId: sid, updatedAt: new Date().toISOString() });
  return structuredClone(feedback);
}

export async function feedbackProof(): Promise<FeedbackProof> {
  const sql = await sqlStore();
  if (sql) {
    const [totals, quotes] = await Promise.all([
      sql`select count(*)::int as responses, count(distinct session_id)::int as sessions,
        avg(usefulness) as usefulness, count(*) filter (where would_pay)::int as would_pay from call_feedback`,
      sql`select quote, updated_at from call_feedback where quote_consent and quote <> '' order by updated_at desc limit 20`,
    ]);
    const total = totals[0];
    const responses = Number(total.responses);
    const wouldPayCount = Number(total.would_pay);
    return {
      responses, anonymousSessions: Number(total.sessions),
      averageUsefulness: responses ? Number(Number(total.usefulness).toFixed(2)) : null,
      wouldPayCount, wouldPayPercent: responses ? Math.round(wouldPayCount / responses * 100) : null,
      quotes: quotes.map(row => ({ text: String(row.quote), at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at) })),
    };
  }
  const rows = [...memory.values()];
  const wouldPayCount = rows.filter(row => row.wouldPay).length;
  return {
    responses: rows.length, anonymousSessions: new Set(rows.map(row => row.sessionId)).size,
    averageUsefulness: rows.length ? Number((rows.reduce((sum, row) => sum + row.usefulness, 0) / rows.length).toFixed(2)) : null,
    wouldPayCount, wouldPayPercent: rows.length ? Math.round(wouldPayCount / rows.length * 100) : null,
    quotes: rows.filter(row => row.quoteConsent && row.quote).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20).map(row => ({ text: row.quote, at: row.updatedAt })),
  };
}
