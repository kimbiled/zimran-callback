"use client";
// Coach whisper: a quiet glass card under the transcript with one suggested next line.
// Types itself in, can be dismissed, and never blocks the call.

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

export type HintState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; hint: string; source: "ai" | "heuristic"; id: number }
  | { status: "limited" };

function useTyped(text: string, key: number, cps = 55): string {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      return;
    }
    const id = setInterval(() => {
      setShown((n) => {
        if (n >= text.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 1000 / cps);
    return () => clearInterval(id);
  }, [text, key, cps]);
  return text.slice(0, shown);
}

export function CoachHint({ state, onDismiss }: { state: HintState; onDismiss: () => void }) {
  if (state.status === "idle") return null;
  return (
    <div className="card rise mt-3 border-vio/30 bg-vio/[0.06] p-3.5 pr-10 text-sm" role="status" aria-live="polite">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#b9a8ff]">
        <Sparkles size={13} aria-hidden="true" />
        Coach whisper
        {state.status === "ready" && state.source === "heuristic" && <span className="font-medium normal-case tracking-normal text-mute-d">· quick tip</span>}
      </div>
      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-mute-d">
          <span className="bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Thinking of your next line…
        </div>
      )}
      {state.status === "limited" && <div className="text-mute-d">The coach is resting for now. You've got this.</div>}
      {state.status === "ready" && <Typed text={state.hint} id={state.id} />}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-mute-d transition hover:bg-white/10 hover:text-fg"
        aria-label="Dismiss coach hint"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function Typed({ text, id }: { text: string; id: number }) {
  const typed = useTyped(text, id);
  const done = typed.length >= text.length;
  return (
    <p className="leading-snug text-fg">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {typed}
        {!done && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#b9a8ff]" />}
      </span>
    </p>
  );
}
