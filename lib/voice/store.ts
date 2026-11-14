// Durable one-attempt-per-call guard, shared across Vercel workers through Neon.
import { neon } from "@neondatabase/serverless";

type VoiceRow = { status: "connecting" | "created" | "failed"; providerSessionId?: string };
const shared = globalThis as unknown as { __cbVoiceSessions?: Map<string, VoiceRow> };
const memory = shared.__cbVoiceSessions ??= new Map<string, VoiceRow>();
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
let ready: Promise<unknown> | undefined;
async function init() {
  if (!sql) return;
  ready ??= sql`create table if not exists voice_sessions (
    call_id uuid primary key references calls(id), status text not null,
    provider_session_id text, created_at timestamptz not null default now()
  )`.catch(error => { ready = undefined; throw error; });
  await ready;
}
export async function claimVoiceSession(callId: string): Promise<boolean> {
  if (!sql) {
    if (memory.has(callId)) return false;
    memory.set(callId, { status: "connecting" });
    return true;
  }
  await init();
  const rows = await sql`insert into voice_sessions (call_id, status) values (${callId}::uuid, 'connecting')
    on conflict (call_id) do nothing returning call_id`;
  return rows.length > 0;
}
export async function recordVoiceSession(callId: string, providerSessionId: string | null): Promise<void> {
  const status = providerSessionId ? "created" : "failed";
  if (!sql) { memory.set(callId, { status, providerSessionId: providerSessionId ?? undefined }); return; }
  await init();
  await sql`update voice_sessions set status = ${status}, provider_session_id = ${providerSessionId} where call_id = ${callId}::uuid`;
}
export async function hasCreatedVoiceSession(callId: string): Promise<boolean> {
  if (!sql) { const row = memory.get(callId); return row?.status === "created" && Boolean(row.providerSessionId); }
  await init();
  const rows = await sql`select call_id from voice_sessions where call_id = ${callId}::uuid and status = 'created' and provider_session_id is not null`;
  return rows.length > 0;
}
