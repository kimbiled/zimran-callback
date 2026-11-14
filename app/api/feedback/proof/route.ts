import { timingSafeEqual } from "node:crypto";
import { feedbackProof } from "@/lib/feedback/store";
import { bad, json } from "@/lib/server/validate";

export async function GET(req: Request) {
  const configured = process.env.EVAL_KEY;
  const expected = Buffer.from(`Bearer ${configured ?? ""}`);
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  if (!configured || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return bad("Not found", 404);
  try {
    return json(await feedbackProof());
  } catch {
    return bad("Feedback report is unavailable", 503);
  }
}
