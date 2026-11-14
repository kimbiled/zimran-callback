// [A] Payments. With STRIPE_SECRET_KEY: Stripe Checkout (test mode).
// Without a key: demo mode, the plan turns on right away and no money moves.
import { z } from "zod";
import { planInfo, stripeMode } from "@/lib/plans";
import { db } from "@/lib/server/db";
import { sessionId } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";

const Body = z.object({ plan: z.enum(["sprint", "offer", "gym"]) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return bad("Invalid plan");
  const plan = planInfo(parsed.data.plan)!;
  if (plan.soon) return bad("This plan is coming soon", 409);
  const sid = await sessionId();
  await db().getOrCreateSession(sid);
  const origin = new URL(req.url).origin;
  const key = process.env.STRIPE_SECRET_KEY;
  if (stripeMode(key) === "live-blocked") return bad("Checkout runs in Stripe test mode only. Set a sk_test_ key.", 503);

  if (!key) {
    await db().setPlan(sid, plan.id);
    return json({ url: `/pricing?paid=${plan.id}&demo=1`, demo: true });
  }

  const form = new URLSearchParams({
    mode: plan.recurring ? "subscription" : "payment",
    success_url: `${origin}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?canceled=1`,
    client_reference_id: sid,
    "metadata[plan]": plan.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(plan.cents),
    "line_items[0][price_data][product_data][name]": `Callback — ${plan.name}`,
  });
  if (plan.recurring) form.set("line_items[0][price_data][recurring][interval]", "month");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) return bad(data.error?.message ?? "Stripe is unavailable", 502);
  return json({ url: data.url, demo: false });
}
