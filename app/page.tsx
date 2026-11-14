import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Brain,
  Code,
  FileText,
  Gauge,
  Lock,
  Mic,
  MessageSquare,
  PhoneCall,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { PERSONAS, toPublic } from "@/lib/personas";
import { applyRole } from "@/lib/roles";
import { BuyerPicker } from "@/components/BuyerPicker";
import { PublishedReplays } from "@/components/PublishedReplays";
import { Reveal } from "@/components/Reveal";
import { StickyCta } from "@/components/StickyCta";
import { HeroDemo } from "@/components/HeroDemo";
import { CountUp } from "@/components/CountUp";

/** The recommended first call: the easy buyer, SDR cold call. */
const FIRST_CALL = "/call/jessica-hr?role=sdr";

const OBJECTIONS = [
  "We already use Salesforce.",
  "Just send me an email.",
  "We don't have budget this quarter.",
  "I've got two minutes. Go.",
  "How did you get this number?",
  "We tried something like this. It didn't stick.",
  "Talk to procurement.",
  "Our premiums are already too high.",
  "Call me next year.",
  "I'm not the right person.",
  "What's this going to cost me?",
  "We're locked into a contract.",
];

const STEPS = [
  { icon: Users, title: "Pick a buyer", text: "SDR cold call or AE discovery. Ready-made buyers, or one built from your job posting." },
  { icon: PhoneCall, title: "Take the call", text: "Live voice with an AI buyer who interrupts, objects and hides the real problem." },
  { icon: Gauge, title: "Watch the meter", text: "Interest climbs when you uncover pain and drops the moment you pitch too early." },
  { icon: FileText, title: "Get the debrief", text: "0–100 score, quotes with timestamps and better lines. Call again, beat your score." },
];

const PROOF = [
  { icon: Target, to: 10, suffix: "/10", text: "strong vs. weak calls ranked correctly by the judge" },
  { icon: ShieldCheck, to: 100, suffix: "%", text: "of meter moves backed by a quote you actually said" },
  { icon: Code, to: 4, suffix: " metrics", text: "talk ratio, questions, fillers, monologue: counted in code" },
];

function Orb({ size = 220, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`orb ${className}`} style={{ ["--size" as string]: `${size}px` }} aria-hidden="true">
      <div className="orb-core" />
      <div className="orb-ring" />
      <div className="orb-ring" />
      <div className="orb-ring" />
      <div className="orb-wave" />
      <div className="orb-wave" />
    </div>
  );
}

function Marquee({ items, reverse = false, dur = 46 }: { items: string[]; reverse?: boolean; dur?: number }) {
  const row = items.map((t) => (
    <span key={t} className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-mute">
      <Quote size={13} className="text-acc" aria-hidden="true" /> {t}
    </span>
  ));
  return (
    <div className={`marquee ${reverse ? "marquee-reverse" : ""}`} style={{ ["--marquee-dur" as string]: `${dur}s` }}>
      <div className="marquee-track">{row}</div>
      <div className="marquee-track" aria-hidden="true">
        {row}
      </div>
    </div>
  );
}

export default function Home() {
  // Public cards only (hidden profiles stay on the server), one set per interview type.
  const buyers = {
    sdr: PERSONAS.map((p) => toPublic(applyRole(p, "sdr"))),
    ae: PERSONAS.map((p) => toPublic(applyRole(p, "ae"))),
  };
  return (
    <>
      {/* ---------- HERO ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 text-center lg:pt-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <Reveal variant="down">
            <span className="eyebrow">
              <span className="rounded-full bg-gradient-to-r from-[#ff7a3d] to-[#ff2e6e] px-2 py-0.5 text-[11px] font-bold text-[#0a0508]">NEW</span>
              Live voice buyers · SDR &amp; AE interviews
            </span>
          </Reveal>
          <Reveal as="h1" variant="blur" index={1} className="display mt-6 text-5xl sm:text-7xl lg:text-8xl">
            Practice the cold call <span className="text-gradient">before the interview.</span>
          </Reveal>
          <Reveal as="p" index={2} className="mt-6 max-w-2xl text-lg leading-relaxed text-mute">
            Call an AI buyer with hidden pains, a budget and real objections. A live meter reacts to every sentence. Then a debrief shows exactly what to say next time.
          </Reveal>
          <Reveal index={3} className="mt-8 flex flex-wrap items-center justify-center gap-3" id="hero-cta">
            <Link href={FIRST_CALL} data-magnetic className="cta-halo btn btn-accent btn-cta px-7 py-4 text-base">
              <PhoneCall size={18} aria-hidden="true" /> Start a free call · 2 min
            </Link>
            <Link href="/sample" className="btn btn-ghost group px-6 py-4">
              See a sample debrief <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal index={4} className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-mute">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-good" aria-hidden="true" /> No sign-up
            </span>
            <span className="flex items-center gap-1.5">
              <Mic size={15} className="text-acc" aria-hidden="true" /> Voice in your browser
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare size={15} className="text-[#9b7bff]" aria-hidden="true" /> No mic? Use text
            </span>
          </Reveal>
          <Reveal as="p" index={5} className="mt-3 text-sm text-mute-d">
            Starts with Jessica, an easy buyer.{" "}
            <Link href="#buyers" className="font-semibold text-fg underline-offset-4 hover:underline">
              Or pick your own ↓
            </Link>
          </Reveal>
        </div>

        {/* Product demo: how a call works, end to end, in an app window */}
        <Reveal variant="flip" index={5} className="relative mx-auto mt-14 max-w-5xl text-left">
          <div className="pointer-events-none absolute -left-24 -top-20 hidden opacity-60 lg:block" aria-hidden="true">
            <Orb size={180} className="float" />
          </div>
          <div className="pointer-events-none absolute -inset-x-10 -bottom-10 top-10 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_50%_40%,rgb(255_92_38/0.22),transparent)] blur-2xl" aria-hidden="true" />
          <div className="tilt relative">
            <HeroDemo />
            {/* floating 3D chips */}
            <div className="pop-out float pointer-events-none absolute -left-40 top-[58%] hidden rounded-2xl border border-white/10 bg-panel-2/90 px-3 py-2 text-xs shadow-xl backdrop-blur xl:block">
              <div className="flex items-center gap-2 font-semibold text-good">
                <Sparkles size={13} aria-hidden="true" /> Pain uncovered
              </div>
              <div className="text-mute-d">forecast missed by 9%</div>
            </div>
            <div
              className="pop-out float pointer-events-none absolute -right-36 top-[30%] hidden rounded-2xl border border-white/10 bg-panel-2/90 px-3 py-2 text-xs shadow-xl backdrop-blur xl:block"
              style={{ animationDelay: "-3s" }}
            >
              <div className="flex items-center gap-2 font-semibold text-acc">
                <AudioLines size={13} aria-hidden="true" /> Talk ratio 42%
              </div>
              <div className="text-mute-d">right in the 40–60% zone</div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- OBJECTIONS MARQUEE ---------- */}
      <section aria-label="Objections you'll practice" className="space-y-3 py-6">
        <Reveal as="p" className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-mute-d">
          Objections you&apos;ll hear on the call
        </Reveal>
        <Marquee items={OBJECTIONS} />
        <Marquee items={[...OBJECTIONS].reverse()} reverse dur={54} />
      </section>

      {/* ---------- PROOF ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-12" aria-label="Why the score is real">
        <div className="grid gap-4 sm:grid-cols-3">
          {PROOF.map((p, i) => (
            <Reveal key={p.text} index={i} variant="flip" className="spot card lift p-6">
              <p.icon size={22} className="text-acc" aria-hidden="true" />
              <div className="num mt-4 text-5xl text-fg">
                <CountUp to={p.to} suffix={p.suffix} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-mute">{p.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <PublishedReplays />

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <Reveal as="p" className="text-xs font-semibold uppercase tracking-[0.2em] text-acc">
          How it works
        </Reveal>
        <Reveal as="h2" index={1} variant="blur" className="display mt-3 max-w-2xl text-4xl sm:text-5xl">
          From hello to debrief <span className="text-gradient">in four steps.</span>
        </Reveal>
        <div className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-0 right-0 top-[52px] hidden h-px bg-gradient-to-r from-transparent via-acc-d/50 to-transparent lg:block" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} index={i} variant="flip" className="tilt spot card p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#ff7a3d]/25 to-[#7c5cff]/25 ring-1 ring-white/10">
                  <s.icon size={22} className="text-fg" aria-hidden="true" />
                </span>
                <span className="num text-sm text-mute-d">0{i + 1}</span>
              </div>
              <div className="display mt-5 text-xl">{s.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- BENTO ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-4 md:grid-cols-6">
          <Reveal variant="scale" className="spot card group relative overflow-hidden p-7 md:col-span-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-acc">
              <Lock size={16} aria-hidden="true" /> Hidden buyer profile
            </div>
            <h3 className="display mt-3 text-3xl">The real problem is never said out loud.</h3>
            <p className="mt-2 max-w-lg text-mute">Every buyer hides three weighted pains, a budget and what earns a meeting. Hover to peek — on the call you&apos;ll have to earn it.</p>
            <ul className="mt-6 grid gap-2 sm:grid-cols-3">
              {["Onboarding takes 3–4 weeks", "30% of hires quit in 90 days", "Procedures live in group chats"].map((t, i) => (
                <li
                  key={t}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm blur-[6px] transition-all duration-500 group-hover:blur-0"
                  style={{ transitionDelay: `${i * 90}ms` }}
                >
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="scale" index={1} className="spot card relative flex flex-col items-center justify-center overflow-hidden p-7 text-center md:col-span-2">
            <Orb size={150} />
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#9b7bff]">
              <Brain size={16} aria-hidden="true" /> Actor ≠ judge
            </div>
            <p className="mt-2 text-sm text-mute">The buyer only plays the role. A separate model scores you, quote by quote.</p>
          </Reveal>
          <Reveal variant="scale" index={2} className="spot card p-7 md:col-span-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-good">
              <Code size={16} aria-hidden="true" /> Metrics computed, not guessed
            </div>
            <div className="mt-5 space-y-4">
              {[
                ["Talk ratio", 42, "42%"],
                ["Questions asked", 70, "7"],
                ["Filler words", 18, "1.8 / 100"],
              ].map(([label, pct, val], i) => (
                <div key={label as string}>
                  <div className="flex justify-between text-sm">
                    <span className="text-mute">{label}</span>
                    <span className="num">{val}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <Reveal
                      variant="left"
                      index={i + 2}
                      className="h-full rounded-full bg-gradient-to-r from-[#34d399] to-[#22d3ee]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal variant="scale" index={3} className="spot card relative overflow-hidden p-7 md:col-span-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-acc">
              <Sparkles size={16} aria-hidden="true" /> From your job posting
            </div>
            <h3 className="display mt-3 text-2xl">Practice on the buyer you&apos;ll actually call.</h3>
            <p className="mt-2 text-sm text-mute">Paste the vacancy. We build a buyer from that company&apos;s market, with pains and objections to match.</p>
            <Link href="#buyers" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-fg hover:text-acc">
              Build my buyer <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ---------- BUYERS ---------- */}
      <section id="buyers" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <Reveal as="p" className="text-xs font-semibold uppercase tracking-[0.2em] text-acc">
          Choose your call
        </Reveal>
        <Reveal as="h2" index={1} variant="blur" className="display mt-3 text-4xl sm:text-5xl">
          Who do you want to call?
        </Reveal>
        <Reveal as="p" index={2} className="mt-3 text-mute">
          Every buyer has three hidden pains, a budget and objections. Pick your interview, then your buyer.
        </Reveal>
        <BuyerPicker buyers={buyers} />
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-8">
        <Reveal variant="scale" className="spot card relative overflow-hidden rounded-[32px] px-6 py-16 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_0%,rgb(255_92_38/0.18),transparent)]" aria-hidden="true" />
          <div className="relative mx-auto flex justify-center">
            <Orb size={170} className="float" />
          </div>
          <h2 className="display relative mx-auto mt-10 max-w-3xl text-4xl sm:text-6xl">
            Your next interview is a phone call. <span className="text-gradient">Rehearse it tonight.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-mute">3 free calls. No sign-up. About 3 minutes each.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href={FIRST_CALL} data-magnetic className="cta-halo btn btn-accent btn-cta px-8 py-4 text-base">
              <PhoneCall size={18} aria-hidden="true" /> Start a free call
            </Link>
            <Link href="/pricing" className="btn btn-ghost px-6 py-4">
              Plans from $0
            </Link>
          </div>
        </Reveal>
      </section>

      <StickyCta href={FIRST_CALL} />
    </>
  );
}
