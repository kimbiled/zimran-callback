import { timingSafeEqual } from "node:crypto";

export function validEvalAuthorization(request: Request): boolean {
  if (!process.env.EVAL_KEY) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${process.env.EVAL_KEY}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
