// [A] Anonymous cookie session, so the app works without sign-up.

import { cookies } from "next/headers";

const COOKIE = "cb_sid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | undefined | null): v is string {
  return Boolean(v && UUID_RE.test(v));
}

/** Route handlers only: reads or creates the session id */
export async function sessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (isUuid(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return id;
}

export const FREE_CALL_LIMIT = Number(process.env.FREE_CALL_LIMIT ?? 3);
