"use client";
// "Retry this line": rewrite one of your lines and the judge re-scores it in the same moment of the call.

import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { ArrowRight, CornerDownLeft, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import type { RetryResponse, Turn } from "@/lib/types";
import { signed } from "./Meter";
import { Sk } from "./Skeletons";
import { trackEvent } from "@/lib/analytics";

export type RetryTarget = { turnIndex: number; hint?: string | null };

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.round(Math.max(0, sec)) % 60).padStart(2, "0")}`;

/** Strip the wrapping quotes coaching lines often carry, so "Use it" drops a clean sentence into the box. */
const unwrap = (line: string) => {
  const m = line.trim().match(/^["“](.+?)["”]/);
  return (m ? m[1] : line).trim();
};

function deltaChip(delta: number | null) {
  if (delta === null) return "bg-white/10 text-mute";
  return delta > 0 ? "bg-good/15 text-good" : delta < 0 ? "bg-bad/15 text-bad" : "bg-white/10 text-fg";
}

export function RetrySheet({
  open,
  onClose,
  callId,
  turns,
  target,
  buyerName,
}: {
  open: boolean;
  onClose: () => void;
  callId: string;
  turns: Turn[];
  target: RetryTarget | null;
  buyerName: string;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RetryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  const index = target?.turnIndex ?? -1;
  const original = index >= 0 ? turns[index] : undefined;
  const buyerLine = index >= 0 ? turns.slice(0, index).reverse().find((t) => t.role === "buyer") : undefined;

  // Fresh state for every line opened.
  useEffect(() => {
    if (!open) return;
    setText("");
    setResult(null);
    setError(null);
    setPending(false);
    setAttempts(0);
  }, [open, index]);
  useEffect(() => () => abort.current?.abort(), []);

  async function submit() {
    const line = text.trim();
    if (!original || line.length < 2 || pending) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, turnIndex: index, text: line }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "The judge couldn't score this line. Try again.");
      setResult(body as RetryResponse);
      setAttempts((n) => n + 1);
      trackEvent("line_retried", { improved: (body as RetryResponse).delta > (original.delta ?? 0), source: (body as RetryResponse).source });
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      if (abort.current === controller) setPending(false);
    }
  }

  const before = result?.original ?? (typeof original?.delta === "number" ? original.delta : null);
  const gain = result && before !== null ? result.delta - before : null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      destroyOnHidden
      width={{ xs: "calc(100vw - 24px)", sm: 600 }}
      afterOpenChange={(o) => o && box.current?.focus()}
      title={
        <span className="flex items-center gap-2 text-base">
          <RotateCcw size={16} className="text-acc" aria-hidden="true" />
          Retry this line
        </span>
      }
      styles={{
        container: { background: "#0c0c14", border: "1px solid rgb(255 255 255 / 0.08)", boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.9)" },
        header: { background: "transparent" },
        mask: { backdropFilter: "blur(6px)", background: "rgb(5 5 10 / 0.6)" },
      }}
    >
      {original && (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-mute">The judge re-scores only this line, at the same moment of the call. Your saved debrief stays as it is.</p>

          {buyerLine && (
            <div className="rounded-xl border border-line bg-white/5 p-3 leading-snug">
              <div className="mb-1 text-xs font-semibold text-mute">
                {buyerName} · {fmt(buyerLine.start)}
              </div>
              {buyerLine.text}
            </div>
          )}

          <div className="rounded-xl bg-white/5 p-3 leading-snug">
            <div className="mb-1 flex items-center justify-between text-xs text-mute">
              <span className="font-semibold">You said · {fmt(original.start)}</span>
              {typeof original.delta === "number" && <span className={`chip ${deltaChip(original.delta)}`}>{signed(original.delta)}</span>}
            </div>
            <span className="text-fg/80 line-through decoration-bad/50 decoration-1">{original.text}</span>
            {original.reason && <div className="mt-1.5 text-xs text-mute">{original.reason}</div>}
          </div>

          {target?.hint && (
            <div className="flex items-start gap-3 rounded-xl border border-acc-d/25 bg-acc-d/[0.07] p-3 leading-snug">
              <Lightbulb size={16} className="mt-0.5 shrink-0 text-acc" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-acc">Coach's line</div>
                <div className="mt-0.5">{target.hint}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
                onClick={() => {
                  setText(unwrap(target.hint!));
                  box.current?.focus();
                }}
              >
                Use it
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="retry-line" className="mb-1.5 block text-xs font-semibold text-mute">
              Your new line
            </label>
            <textarea
              id="retry-line"
              ref={box}
              value={text}
              maxLength={600}
              rows={3}
              placeholder={`What would you say to ${buyerName} instead?`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="w-full resize-y rounded-xl border border-line bg-panel-2 p-3 text-[15px] leading-snug text-fg outline-none transition placeholder:text-mute-d focus:border-acc-d/60 focus:ring-2 focus:ring-acc-d/20"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[11px] text-mute-d">
                <CornerDownLeft size={12} aria-hidden="true" /> ⌘/Ctrl + Enter · {text.trim().length}/600
              </span>
              <button type="submit" className="btn btn-accent btn-cta cta-quiet !py-2.5" disabled={pending || text.trim().length < 2}>
                <Sparkles size={16} aria-hidden="true" />
                {pending ? "Scoring…" : attempts ? "Score this version" : "Score my new line"}
              </button>
            </div>
          </form>

          <div aria-live="polite">
            {pending && (
              <div role="status" className="skel-in rounded-xl border border-line p-4">
                <span className="sr-only">Scoring your line…</span>
                <div className="flex items-center gap-3">
                  <Sk className="h-7 w-14 rounded-full" />
                  <Sk className="h-4 w-4" />
                  <Sk className="h-7 w-14 rounded-full" />
                </div>
                <Sk className="mt-3 h-4 w-4/5" />
              </div>
            )}
            {error && !pending && <p className="rounded-xl bg-bad/10 p-3 text-bad">{error}</p>}
            {result && !pending && (
              <div key={attempts} className="pop rounded-xl border border-line bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`chip text-base tabular-nums ${deltaChip(before)}`} title="Original line">
                    {before === null ? "n/a" : signed(before)}
                  </span>
                  <ArrowRight size={16} className="text-mute" aria-hidden="true" />
                  <span className={`chip pop text-base tabular-nums ${deltaChip(result.delta)}`} style={{ animationDelay: "120ms" }} title="New line">
                    {signed(result.delta)}
                  </span>
                  {gain !== null && (
                    <span className={`text-sm font-semibold ${gain > 0 ? "text-good" : gain < 0 ? "text-bad" : "text-mute"}`}>
                      {gain > 0 ? `${signed(gain)} better` : gain < 0 ? `${gain} worse` : "Same effect"}
                    </span>
                  )}
                </div>
                <p className="mt-2 leading-snug">{result.reason}</p>
                <p className="mt-2 text-[11px] text-mute-d">
                  {result.source === "ai" ? "Scored by the AI judge" : "Scored with the offline rubric (AI judge unavailable)"} · buyer interest would be {signed(result.score)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
