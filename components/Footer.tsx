import Link from "next/link";
import { ArrowUpRight, Code2, Lock, Mic, PhoneCall, Scale, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";
import { Logo } from "./Logo";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Practice a call", "/#buyers"],
      ["Sample debrief", "/sample"],
      ["Your progress", "/progress"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Practice by level",
    links: [
      ["Easy · Jessica, HR", "/call/jessica-hr?role=sdr"],
      ["Medium · Mike, Sales", "/call/mike-sales?role=sdr"],
      ["Hard · Linda, CFO", "/call/linda-cfo?role=sdr"],
      ["AE discovery call", "/call/mike-sales?role=ae"],
    ],
  },
];

const TRUST = [
  { icon: Scale, text: "Separate judge model, 10/10 on the eval" },
  { icon: ShieldCheck, text: "Every score move backed by your own quote" },
  { icon: Lock, text: "No audio stored, transcript only" },
  { icon: Mic, text: "No mic? The same call works in text" },
];

export function Footer() {
  return (
    <footer className="relative mt-10 overflow-hidden border-t border-white/[0.06]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-acc-d/60 to-transparent" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-5 pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          {/* Brand */}
          <Reveal>
            <Link href="/" className="group inline-flex items-center" aria-label="Callback home">
              <Logo size={28} />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">
              Rehearse the call that gets you hired. Live AI buyers, a meter that reacts to every sentence, and a debrief that tells you what to say next time.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-good/25 bg-good/[0.06] px-3 py-1.5 text-xs font-semibold text-good">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
              </span>
              All systems live · voice, judge, debrief
            </div>
            <div className="mt-6">
              <Link href="/call/jessica-hr?role=sdr" data-magnetic className="btn btn-accent btn-cta cta-quiet px-5 py-3 text-sm">
                <PhoneCall size={16} aria-hidden="true" /> Start a free call
              </Link>
            </div>
          </Reveal>

          {COLUMNS.map((col, i) => (
            <Reveal key={col.title} index={i + 1}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-mute-d">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="group inline-flex items-center gap-1 text-sm text-mute transition-colors hover:text-fg">
                      {label}
                      <ArrowUpRight size={13} className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}

          <Reveal index={3}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-mute-d">Why you can trust the score</h2>
            <ul className="mt-4 space-y-3">
              {TRUST.map((t) => (
                <li key={t.text} className="flex items-start gap-2.5 text-sm text-mute">
                  <t.icon size={15} className="mt-0.5 shrink-0 text-acc" aria-hidden="true" />
                  {t.text}
                </li>
              ))}
            </ul>
            <div className="mt-6 text-xs text-mute-d">
              Built by <span className="text-fg">Nursultan</span> (server &amp; interface) and <span className="text-fg">Tlegen</span> (AI &amp; voice)
            </div>
          </Reveal>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/[0.06] py-6 text-xs text-mute-d sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Callback · Made for Business Cup 2.0 · Skills track</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Voice by GPT-Live · Stripe in test mode</span>
            <a href="https://github.com/kimbiled/zimran-callback" className="inline-flex items-center gap-1.5 hover:text-fg">
              <Code2 size={14} aria-hidden="true" /> Source on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Giant wordmark that rises in as you reach the bottom */}
      <Reveal variant="up" className="pointer-events-none select-none">
        <div
          aria-hidden="true"
          className="display -mb-[0.22em] text-center text-[19vw] leading-none tracking-[-0.06em] text-transparent [-webkit-background-clip:text] [background-clip:text] [background-image:linear-gradient(180deg,rgb(255_255_255/0.14),rgb(255_255_255/0))]"
        >
          CALLBACK
        </div>
      </Reveal>
    </footer>
  );
}
