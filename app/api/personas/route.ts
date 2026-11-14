// [A] Buyer list (hidden profiles stripped).
import { PERSONAS, toPublic } from "@/lib/personas";
import { json } from "@/lib/server/validate";

export async function GET() {
  return json({ personas: PERSONAS.map(toPublic) });
}
