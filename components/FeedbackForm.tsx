"use client";

import { useEffect, useId, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { FeedbackValues } from "@/lib/feedback/schema";

export function FeedbackForm({ callId }: { callId: string }) {
  const id = useId();
  const [eligible, setEligible] = useState(false);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [wouldPay, setWouldPay] = useState<boolean | null>(null);
  const [quote, setQuote] = useState("");
  const [quoteConsent, setQuoteConsent] = useState(false);
  const [hasFeedback, setHasFeedback] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setEligible(false);
    void fetch(`/api/feedback?callId=${encodeURIComponent(callId)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const result = await response.json() as { feedback: FeedbackValues | null };
        if (controller.signal.aborted) return;
        const feedback = result.feedback;
        setUsefulness(feedback?.usefulness ?? null); setWouldPay(feedback?.wouldPay ?? null);
        setQuote(feedback?.quote ?? ""); setQuoteConsent(feedback?.quoteConsent ?? false);
        setHasFeedback(Boolean(feedback)); setStatus(feedback ? "saved" : "idle"); setEligible(true);
      }).catch(() => {});
    return () => controller.abort();
  }, [callId]);

  if (!eligible) return null;
  const saving = status === "saving";
  const changed = () => { setStatus("idle"); setError(""); };

  return (
    <section className="card mt-5 p-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="display text-2xl">Was this useful?</h2>
      <p className="mt-2 text-sm text-mute">Three quick questions help us improve Callback. Your rating is private; quoting you is optional.</p>
      <form className="mt-5 space-y-5" onSubmit={async event => {
        event.preventDefault();
        if (usefulness === null || wouldPay === null || saving) return;
        setStatus("saving"); setError("");
        try {
          const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callId, usefulness, wouldPay, quote, quoteConsent }), signal: AbortSignal.timeout(12_000) });
          const result = await response.json() as { feedback?: FeedbackValues; error?: string };
          if (!response.ok || !result.feedback) throw new Error(result.error || "Feedback could not be saved.");
          setQuote(result.feedback.quote); setQuoteConsent(result.feedback.quoteConsent); setHasFeedback(true); setStatus("saved");
          trackEvent("feedback_submitted", { usefulness, wouldPay, quoteConsent: result.feedback.quoteConsent });
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Feedback could not be saved. Please try again."); setStatus("error");
        }
      }}>
        <fieldset disabled={saving}>
          <legend className="text-sm font-semibold">1. How useful was this practice call?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(value => (
              <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm ${usefulness === value ? "border-acc bg-acc/10" : "border-line"}`}>
                <input type="radio" name={`${id}-usefulness`} value={value} checked={usefulness === value} required onChange={() => { setUsefulness(value); changed(); }} />
                {value}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-mute">1 = not useful, 5 = very useful</p>
        </fieldset>
        <fieldset disabled={saving}>
          <legend className="text-sm font-semibold">2. Would you pay $49 to practice before an interview?</legend>
          <div className="mt-2 flex gap-4 text-sm">
            {[true, false].map(value => (
              <label key={String(value)} className="flex cursor-pointer items-center gap-2">
                <input type="radio" name={`${id}-would-pay`} checked={wouldPay === value} required onChange={() => { setWouldPay(value); changed(); }} />
                {value ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-quote`} className="text-sm font-semibold">3. What would you tell another candidate? <span className="font-normal text-mute">Optional</span></label>
          <textarea id={`${id}-quote`} className="mt-2 min-h-24 w-full rounded-xl border border-line bg-paper p-3 text-sm outline-none focus:border-acc" value={quote} maxLength={500} required={quoteConsent} disabled={saving} onChange={event => { setQuote(event.target.value); changed(); }} aria-describedby={`${id}-quote-note`} />
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={quoteConsent} disabled={saving} onChange={event => { setQuoteConsent(event.target.checked); changed(); }} />
            <span>Callback may quote this comment publicly in its demo or pitch. This permission is optional.</span>
          </label>
          <p id={`${id}-quote-note`} className="mt-2 text-xs text-mute">Without permission, the comment is not stored. You can update these answers or withdraw permission here later.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" type="submit" disabled={saving || usefulness === null || wouldPay === null}>{saving ? "Saving…" : hasFeedback ? "Update feedback" : "Send feedback"}</button>
          <span className="text-sm text-good" role="status">{status === "saved" ? "Thank you — your feedback is saved." : ""}</span>
        </div>
        {status === "error" && <p className="text-sm text-bad" role="alert">{error}</p>}
      </form>
    </section>
  );
}
