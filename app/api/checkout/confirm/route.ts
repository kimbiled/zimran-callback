// [A] Return from Stripe Checkout: verify payment and turn on the plan.
import { db } from "@/lib/server/db";
import { isUuid } from "@/lib/server/session";
import type { Plan } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("session_id");
  const key = process.env.STRIPE_SECRET_KEY;
  if (!id || !key) return Response.redirect(new URL("/pricing", url.origin), 303);

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const s = (await res.json()) as { payment_status?: string; client_reference_id?: string; metadata?: { plan?: Plan } };
  const plan = s.metadata?.plan;
  if (res.ok && s.payment_status === "paid" && isUuid(s.client_reference_id) && plan) {
    await db().setPlan(s.client_reference_id, plan);
    return Response.redirect(new URL(`/pricing?paid=${plan}`, url.origin), 303);
  }
  return Response.redirect(new URL("/pricing?canceled=1", url.origin), 303);
}
