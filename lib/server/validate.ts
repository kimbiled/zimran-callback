// [A] API input validation.

import { z } from "zod";

export const TurnSchema = z.object({
  role: z.enum(["rep", "buyer"]),
  text: z.string().max(4000),
  start: z.number().min(0).max(3600),
  end: z.number().min(0).max(3600),
  delta: z.number().optional(),
  score: z.number().optional(),
  reason: z.string().max(300).optional(),
});

export const TurnsSchema = z.array(TurnSchema).max(300);

export const TimelineSchema = z
  .array(z.object({ t: z.number().min(0).max(3600), score: z.number().min(-100).max(100) }))
  .max(400);

export const PainIdsSchema = z.array(z.string().max(40)).max(10);

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
