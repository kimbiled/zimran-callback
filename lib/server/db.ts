// [A] Storage. With DATABASE_URL: Neon Postgres. Without it: in-process memory
// (local dev only; on Vercel memory is not shared between instances).

import { neon } from "@neondatabase/serverless";
import type { CallMode, CallRecord, Debrief, Persona, Plan, Turn } from "../types";

export type SessionRow = { id: string; plan: Plan; callsUsed: number };

interface Store {
  kind: "neon" | "memory";
  getOrCreateSession(id: string): Promise<SessionRow>;
  incrementCalls(id: string): Promise<void>;
  setPlan(id: string, plan: Plan): Promise<void>;
  createCall(c: { id: string; sessionId: string; persona: Persona; mode: CallMode; isSample?: boolean }): Promise<void>;
  getCall(id: string): Promise<CallRecord | null>;
  finishCall(id: string, turns: Turn[], debrief: Debrief): Promise<void>;
  listCalls(sessionId: string, limit?: number): Promise<CallRecord[]>;
}

const SCHEMA = [
  `create table if not exists sessions (
    id uuid primary key,
    created_at timestamptz not null default now(),
    plan text not null default 'free',
    calls_used int not null default 0,
    streak int not null default 0,
    last_warmup date
  )`,
  `create table if not exists calls (
    id uuid primary key,
    session_id uuid references sessions(id),
    persona_id text not null,
    persona jsonb not null,
    mode text not null default 'voice',
    status text not null default 'live',
    is_sample boolean not null default false,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    final_score int,
    total int,
    turns jsonb,
    debrief jsonb
  )`,
  `create index if not exists calls_session_idx on calls(session_id, started_at)`,
];

type Row = Record<string, unknown>;

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v ? String(v) : "";
}

function rowToCall(r: Row): CallRecord {
  return {
    id: String(r.id),
    sessionId: String(r.session_id ?? ""),
    personaId: String(r.persona_id),
    persona: r.persona as Persona,
    mode: (r.mode as CallMode) ?? "voice",
    status: (r.status as CallRecord["status"]) ?? "live",
    isSample: Boolean(r.is_sample),
    startedAt: iso(r.started_at),
    endedAt: r.ended_at ? iso(r.ended_at) : null,
    finalScore: r.final_score == null ? null : Number(r.final_score),
    total: r.total == null ? null : Number(r.total),
    turns: (r.turns as Turn[]) ?? [],
    debrief: (r.debrief as Debrief) ?? null,
  };
}

function neonStore(url: string): Store {
  const sql = neon(url);
  let ready: Promise<void> | null = null;
  const init = () => {
    ready ??= (async () => {
      for (const s of SCHEMA) await sql.query(s);
    })().catch((e) => {
      ready = null;
      throw e;
    });
    return ready;
  };

  return {
    kind: "neon",
    async getOrCreateSession(id) {
      await init();
      const rows = (await sql`insert into sessions (id) values (${id}::uuid)
        on conflict (id) do update set id = excluded.id
        returning id, plan, calls_used`) as Row[];
      const r = rows[0];
      return { id: String(r.id), plan: r.plan as Plan, callsUsed: Number(r.calls_used) };
    },
    async incrementCalls(id) {
      await init();
      await sql`update sessions set calls_used = calls_used + 1 where id = ${id}::uuid`;
    },
    async setPlan(id, plan) {
      await init();
      await sql`update sessions set plan = ${plan} where id = ${id}::uuid`;
    },
    async createCall(c) {
      await init();
      await sql`insert into calls (id, session_id, persona_id, persona, mode, is_sample)
        values (${c.id}::uuid, ${c.sessionId}::uuid, ${c.persona.id}, ${JSON.stringify(c.persona)}::jsonb, ${c.mode}, ${c.isSample ?? false})`;
    },
    async getCall(id) {
      await init();
      const rows = (await sql`select * from calls where id = ${id}::uuid`) as Row[];
      return rows[0] ? rowToCall(rows[0]) : null;
    },
    async finishCall(id, turns, debrief) {
      await init();
      await sql`update calls set status = 'done', ended_at = now(),
        turns = ${JSON.stringify(turns)}::jsonb, debrief = ${JSON.stringify(debrief)}::jsonb,
        final_score = ${debrief.finalScore}, total = ${debrief.total}
        where id = ${id}::uuid`;
    },
    async listCalls(sessionId, limit = 50) {
      await init();
      const rows = (await sql`select * from calls where session_id = ${sessionId}::uuid
        order by started_at asc limit ${limit}`) as Row[];
      return rows.map(rowToCall);
    },
  };
}

function memoryStore(): Store {
  const g = globalThis as unknown as { __cbMem?: { sessions: Map<string, SessionRow>; calls: Map<string, CallRecord> } };
  g.__cbMem ??= { sessions: new Map(), calls: new Map() };
  const m = g.__cbMem;
  return {
    kind: "memory",
    async getOrCreateSession(id) {
      if (!m.sessions.has(id)) m.sessions.set(id, { id, plan: "free", callsUsed: 0 });
      return { ...m.sessions.get(id)! };
    },
    async incrementCalls(id) {
      const s = m.sessions.get(id);
      if (s) s.callsUsed += 1;
    },
    async setPlan(id, plan) {
      const s = m.sessions.get(id);
      if (s) s.plan = plan;
    },
    async createCall(c) {
      m.calls.set(c.id, {
        id: c.id,
        sessionId: c.sessionId,
        personaId: c.persona.id,
        persona: c.persona,
        mode: c.mode,
        status: "live",
        isSample: c.isSample ?? false,
        startedAt: new Date().toISOString(),
        endedAt: null,
        finalScore: null,
        total: null,
        turns: [],
        debrief: null,
      });
    },
    async getCall(id) {
      return m.calls.get(id) ?? null;
    },
    async finishCall(id, turns, debrief) {
      const c = m.calls.get(id);
      if (!c) return;
      Object.assign(c, { status: "done", endedAt: new Date().toISOString(), turns, debrief, finalScore: debrief.finalScore, total: debrief.total });
    },
    async listCalls(sessionId, limit = 50) {
      return [...m.calls.values()].filter((c) => c.sessionId === sessionId).slice(-limit);
    },
  };
}

let store: Store | null = null;
export function db(): Store {
  store ??= process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : memoryStore();
  return store;
}
