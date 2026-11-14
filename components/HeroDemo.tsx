"use client";
// Hero product demo: a looping, scripted walkthrough of how Callback works, in an app window.
// Left: the call (buyer picked → lines type out → the judge scores each rep turn with a quote).
// Right: what the system tracks live (interest meter, hidden pains unlocking, metrics, debrief).
// With prefers-reduced-motion the finished state is shown and nothing animates.

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Gauge, Loader2, Lock, LockOpen, MessageSquareText, PhoneCall, Scale, Sparkles, UserRound } from "lucide-react";

type Step =
  | { kind: "pick" }
  | { kind: "line"; who: "buyer" | "rep"; text: string }
  | { kind: "judge"; d: number; why: string; quote: string; pain?: number }
  | { kind: "done" };

const SCRIPT: Step[] = [
  { kind: "pick" },
  { kind: "line", who: "buyer", text: "Torres. Make it quick, I've got a pipeline review in five." },
  { kind: "line", who: "rep", text: "Fair. 20 seconds: what share of your reps' calls actually get logged?" },
  { kind: "judge", d: 12, why: "Open question, no pitch", quote: "what share of your reps' calls actually get logged?" },
  { kind: "line", who: "buyer", text: "Honestly? Maybe forty percent." },
  { kind: "line", who: "rep", text: "How does that show up in your forecast?" },
  { kind: "judge", d: 11, why: "Dug into a real pain", quote: "How does that show up in your forecast?", pain: 0 },
  { kind: "line", who: "buyer", text: "We missed last quarter by 9%. Nobody saw it coming." },
  { kind: "line", who: "rep", text: "Worth 15 minutes Thursday to see which deals slip before they do?" },
  { kind: "judge", d: 14, why: "Concrete next step", quote: "15 minutes Thursday", pain: 1 },
  { kind: "done" },
];

const PAINS = ["Only ~40% of calls get logged", "Forecast missed by 9%", "New reps take 5 months to ramp"];
const TYPE_MS = 20;
const GAP_MS = 620;

type Item = { step: Step; text?: string; at?: number };

export function HeroDemo() {
  const [items, setItems] = useState<Item[]>([]);
  const [score, setScore] = useState(0);
  const [pains, setPains] = useState<number[]>([]);
  const [status, setStatus] = useState<"dialing" | "live" | "scoring" | "done">("dialing");
  const [clock, setClock] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(0);
  clockRef.current = clock;

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setItems(SCRIPT.map((step) => ({ step, text: step.kind === "line" ? step.text : undefined })));
      setScore(37);
      setPains([0, 1]);
      setStatus("done");
      setClock(71);
      return;
    }
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tick = setInterval(() => setClock((c) => c + 1), 1000);

    (async () => {
      await sleep(600);
      while (!cancelled) {
        setItems([]);
        setScore(0);
        setPains([]);
        setStatus("dialing");
        setClock(0);
        let total = 0;
        for (const step of SCRIPT) {
          if (cancelled) return;
          if (step.kind === "line") {
            setStatus("live");
            setItems((s) => [...s, { step, text: "", at: clockRef.current }]);
            for (let i = 1; i <= step.text.length; i++) {
              if (cancelled) return;
              await sleep(TYPE_MS);
              setItems((s) => s.map((x, k) => (k === s.length - 1 ? { ...x, text: step.text.slice(0, i) } : x)));
            }
          } else if (step.kind === "judge") {
            setStatus("scoring");
            await sleep(550);
            total += step.d;
            setScore(total);
            if (step.pain !== undefined) setPains((p) => [...p, step.pain!]);
            setItems((s) => [...s, { step }]);
            setStatus("live");
          } else {
            if (step.kind === "done") setStatus("done");
            setItems((s) => [...s, { step }]);
          }
          await sleep(GAP_MS);
        }
        await sleep(3600);
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items]);

  const mmss = `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, "0")}`;
  const lastLine = [...items].reverse().find((x) => x.step.kind === "line");
  const typing = lastLine && lastLine.step.kind === "line" && (lastLine.text ?? "").length < lastLine.step.text.length;
  const buyerTalking = typing && lastLine?.step.kind === "line" && lastLine.step.who === "buyer";

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#0a0a11]/90 shadow-[0_50px_140px_-40px_rgb(255_92_38/0.45)] backdrop-blur-xl">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate text-xs text-mute-d">callback · practice call</span>
      </div>

      <div className="grid md:grid-cols-[1.35fr_1fr]">
        {/* ---------- LEFT: the call ---------- */}
        <div className="border-white/[0.06] p-4 sm:p-5 md:border-r">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ff7a3d] to-[#ff2e6e] text-[#0a0508]">
              <PhoneCall size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">Call with Mike Torres</div>
              <div className="truncate text-xs text-mute-d">VP of Sales · Summit Building Supply</div>
            </div>
            <StatusPill status={status} />
          </div>

          <div ref={listRef} className="mt-4 h-[330px] space-y-2.5 overflow-hidden pr-1 sm:h-[360px]" aria-label="Demo of a practice call" aria-live="off">
            {items.map(({ step, text, at }, i) => {
              if (step.kind === "pick")
                return (
                  <Row key={i} icon={<UserRound size={15} aria-hidden="true" />}>
                    picked <b className="font-semibold text-fg">SDR cold call</b> · Medium buyer · voice
                  </Row>
                );
              if (step.kind === "line") {
                const rep = step.who === "rep";
                const isLast = i === items.length - 1;
                return (
                  <div key={i} className={`${rep ? "in-right ml-6 bg-acc-d/[0.1] ring-acc-d/25" : "in-left mr-6 bg-white/[0.05] ring-white/10"} rounded-2xl px-3.5 py-2.5 text-sm ring-1`}>
                    <div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mute-d">
                      {rep ? "You" : "Mike"}
                      {!rep && isLast && buyerTalking && (
                        <span className="bars" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                      <span className="ml-auto num normal-case">{`${Math.floor((at ?? 0) / 60)}:${String((at ?? 0) % 60).padStart(2, "0")}`}</span>
                    </div>
                    <span className={isLast && typing ? "caret" : ""}>{text}</span>
                  </div>
                );
              }
              if (step.kind === "judge")
                return (
                  <div key={i} className="pop rounded-2xl border border-[#febc2e]/40 bg-[#febc2e]/[0.07] px-3.5 py-2.5 text-xs leading-relaxed">
                    <div className="flex items-center gap-2 font-semibold text-[#ffd166]">
                      <Scale size={14} aria-hidden="true" /> judge scored this turn
                      <span className="num ml-auto rounded-full bg-good/15 px-2 py-0.5 text-good">+{step.d}</span>
                    </div>
                    <div className="mt-1 text-fg/90">{step.why}</div>
                    <div className="mt-1 flex items-start gap-1.5 text-mute">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
                      <span>
                        quote verified in your words: <i>“{step.quote}”</i>
                      </span>
                    </div>
                  </div>
                );
              return (
                <Row key={i} icon={<Sparkles size={15} className="text-acc" aria-hidden="true" />} accent>
                  debrief ready · <b className="num text-fg">72/100</b> · meeting booked
                </Row>
              );
            })}
          </div>
        </div>

        {/* ---------- RIGHT: what the system tracks ---------- */}
        <div className="hidden flex-col gap-4 p-5 md:flex">
          <div className="flex items-center gap-2 text-sm font-semibold text-mute">
            <Gauge size={15} aria-hidden="true" /> Live interest
          </div>
          <div className="flex items-end justify-between">
            <span className={`num text-5xl ${score > 0 ? "text-good" : "text-fg"}`}>{score > 0 ? `+${score}` : score}</span>
            <span className="text-xs text-mute-d">−100 … +100</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
            <div
              className="absolute inset-y-0 left-1/2 w-1/2 origin-left rounded-r-full transition-transform duration-700 ease-out"
              style={{ transform: `scaleX(${Math.min(1, score / 100)})`, background: "linear-gradient(90deg,#34d399,#a3f7cf)", boxShadow: "0 0 16px rgb(52 211 153/.55)" }}
            />
          </div>

          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-mute">
            <Lock size={14} aria-hidden="true" /> Hidden pains <span className="num ml-auto text-xs text-mute-d">{pains.length}/3</span>
          </div>
          <ul className="space-y-2">
            {PAINS.map((p, k) => {
              const open = pains.includes(k);
              return (
                <li
                  key={p}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-all duration-500 ${open ? "border-good/40 bg-good/[0.08] text-fg" : "border-white/[0.07] bg-white/[0.03] text-transparent"}`}
                >
                  {open ? <LockOpen size={13} className="shrink-0 text-good" aria-hidden="true" /> : <Lock size={13} className="shrink-0 text-mute-d" aria-hidden="true" />}
                  <span className={open ? "" : "select-none rounded bg-white/10 [text-shadow:0_0_8px_rgb(255_255_255/0.5)]"}>{p}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-mute">
            <MessageSquareText size={14} aria-hidden="true" /> Counted in code
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Talk", `${Math.min(46, 30 + items.length)}%`],
              ["Questions", String(items.filter((x) => x.step.kind === "line" && x.step.who === "rep").length)],
              ["Fillers", "0.8"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2">
                <div className="num text-lg">{v}</div>
                <div className="text-[11px] text-mute-d">{k}</div>
              </div>
            ))}
          </div>

          <div className={`mt-auto rounded-2xl border px-4 py-3 transition-all duration-700 ${status === "done" ? "border-acc-d/40 bg-acc-d/[0.08] opacity-100" : "border-white/[0.06] opacity-40"}`}>
            <div className="flex items-center justify-between text-xs text-mute">
              <span>Debrief</span>
              {status === "done" ? <span className="text-good">Meeting booked</span> : <span>after the call</span>}
            </div>
            <div className="num mt-1 text-3xl">{status === "done" ? "72" : "––"}<span className="text-base text-mute">/100</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, children, accent = false }: { icon: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`in-left flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm ${accent ? "text-fg" : "text-mute"}`}>
      <span className="text-mute-d">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function StatusPill({ status }: { status: "dialing" | "live" | "scoring" | "done" }) {
  const map = {
    dialing: { label: "Dialing", cls: "text-mute", icon: <Loader2 size={13} className="animate-spin" aria-hidden="true" /> },
    live: { label: "Live", cls: "text-bad", icon: <span className="live-dot" aria-hidden="true" /> },
    scoring: { label: "Judge scoring", cls: "text-[#ffd166]", icon: <Loader2 size={13} className="animate-spin" aria-hidden="true" /> },
    done: { label: "Done", cls: "text-good", icon: <CheckCircle2 size={13} aria-hidden="true" /> },
  }[status];
  return (
    <span className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold ${map.cls}`}>
      {map.icon} {map.label}
    </span>
  );
}
