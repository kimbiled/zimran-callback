import type { Metadata } from "next";
import { PricingCards } from "@/components/PricingCards";
import { planInfo, stripeMode } from "@/lib/plans";

// Reads env at request time, so adding STRIPE_SECRET_KEY switches the banner without a rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pricing · Callback" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const paid = sp.paid ? planInfo(sp.paid) : undefined;
  const stripe = stripeMode() === "test";
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      {paid && (
        <div className="mb-6 rounded-2xl bg-good/10 p-4 text-good">
          <strong>{paid.name} is active.</strong> Your call limit is lifted for this browser.
          {sp.demo && <span className="text-mute"> Demo mode: no card was charged.</span>}
        </div>
      )}
      {sp.canceled && <div className="mb-6 rounded-2xl bg-line p-4 text-mute">Checkout was canceled. Nothing was charged.</div>}
      <h1 className="display text-5xl">Pay to land the offer. Stay to hit quota.</h1>
      <p className="mt-3 max-w-2xl text-lg text-mute">
        We sell to the rep, never to the company. The first calls are free. Before the interview, a one-time Sprint. After you're hired, Rep Gym keeps you sharp.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-acc-d bg-acc-d/5 p-4 text-sm">
        <span className="chip bg-acc-d/15 font-semibold text-acc">{stripe ? "Stripe test mode" : "Demo mode"}</span>
        {stripe ? (
          <span>
            No real money moves. Pay with test card <strong className="font-mono">4242 4242 4242 4242</strong>, any future expiry date, any CVC and any ZIP.
          </span>
        ) : (
          <span>No card needed: the plan turns on right away and nothing is charged.</span>
        )}
      </div>
      <div className="mt-8">
        <PricingCards />
      </div>
    </div>
  );
}
