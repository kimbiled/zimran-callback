import Link from "next/link";
import { PERSONAS, toPublic } from "@/lib/personas";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { JobPersona } from "@/components/JobPersona";
import { PhoneIcon } from "@/components/Header";

const STEPS = [
  { n: "01", title: "Pick a buyer", text: "Choose a ready-made buyer or paste the job posting. We build the buyer for that company." },
  { n: "02", title: "Take the call", text: "A live voice call with an AI buyer who has hidden pains, a budget and real objections." },
  { n: "03", title: "Watch the meter", text: "Interest climbs when you uncover real pain and drops when you pitch too early." },
  { n: "04", title: "Get the debrief", text: "Scorecard, quotes with timestamps and better lines. Call again and watch your score climb." },
];

const DEMO = [
  { who: "Mike", text: "We already have Salesforce. We're good.", d: null },
  { who: "You", text: "Makes sense. What share of calls do your reps actually log?", d: 10 },
  { who: "Mike", text: "Honestly? Maybe forty percent.", d: null },
  { who: "You", text: "How does that show up in your forecast?", d: 18 },
];

export default function Home() {
  const buyers = PERSONAS.map(toPublic);
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-12 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        <div className="rise">
          <div className="chip bg-acc-d/15 text-acc">For SDR, AE and sales engineer interviews</div>
          <h1 className="display mt-4 text-5xl sm:text-6xl">Practice the cold call before the interview.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mute">
            Get on a live voice call with an AI buyer who has hidden pains, a budget and real objections. An interest meter reacts to every sentence. Then you get a debrief with quotes, timestamps and better lines.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#buyers" className="btn btn-primary px-6 py-3.5">
              <PhoneIcon /> Start a free call
            </Link>
            <Link href="/sample" className="btn btn-ghost px-6 py-3.5">
              See a sample debrief
            </Link>
          </div>
          <p className="mt-4 text-sm text-mute">No sign-up · Runs in your browser · No mic? Switch to text</p>
        </div>

        <div className="rise rounded-[28px] bg-ink p-6 text-paper shadow-xl">
          <div className="flex items-center justify-between text-sm text-mute-d">
            <span>Live call · Mike Torres, VP of Sales</span>
            <span className="font-mono">1:04</span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-mute-d">Buyer interest</div>
            <div className="display text-5xl">+21</div>
            <div className="relative mt-2 h-4 overflow-hidden rounded-full bg-ink-3">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-1/2 w-[10.5%] rounded-r-full" style={{ background: "linear-gradient(90deg,#86efac,#22c55e)" }} />
            </div>
          </div>
          <ul className="mt-5 space-y-2">
            {DEMO.map((t, i) => (
              <li key={i} className={`rounded-xl p-3 text-sm ${t.who === "You" ? "bg-white/10" : "bg-ink-3/60"}`}>
                <div className="mb-1 flex justify-between text-xs text-mute-d">
                  <span className="font-semibold">{t.who}</span>
                  {t.d && <span className="chip bg-good-d/20 text-good-d">+{t.d}</span>}
                </div>
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <div className="font-mono text-sm text-acc">Step {s.n}</div>
              <div className="display mt-2 text-xl">{s.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-mute">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="buyers" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-4xl">Who do you want to call?</h2>
            <p className="mt-2 text-mute">Every buyer has three hidden pains, a budget and objections. Your goal: earn the meeting.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {buyers.map((p) => (
            <Link key={p.id} href={`/call/${p.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between">
                <span
                  className={`chip ${p.difficulty === "easy" ? "bg-good/10 text-good" : p.difficulty === "medium" ? "bg-acc-d/15 text-acc" : "bg-bad/10 text-bad"}`}
                >
                  {DIFFICULTY_LABEL[p.difficulty]}
                </span>
                <span className="text-xs text-mute">{p.industry.split(" · ")[0]}</span>
              </div>
              <div className="display mt-4 text-2xl">{p.name}</div>
              <div className="text-sm text-mute">
                {p.title} at {p.company}
              </div>
              <p className="mt-3 text-sm leading-relaxed">
                <span className="text-mute">You sell </span>
                {p.product}.
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                <span className="text-mute">Goal: </span>
                {p.goal}.
              </p>
              <span className="btn btn-primary mt-5 w-full group-hover:bg-[#2a2e40]">
                <PhoneIcon /> Call {p.name.split(" ")[0]}
              </span>
            </Link>
          ))}
          <JobPersona />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-6 rounded-[28px] bg-ink p-8 text-paper md:grid-cols-[1.4fr_1fr] md:p-10">
          <div>
            <h2 className="display text-3xl">The buyer and the judge are different models.</h2>
            <p className="mt-3 leading-relaxed text-mute-d">
              The buyer only plays the role. A separate judge scores each of your sentences and must quote your exact words to move the meter. Talk ratio, questions, filler words and monologues are counted in code, not guessed by AI.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <Link href="/sample" className="btn btn-accent">
              Open a sample debrief
            </Link>
            <Link href="/pricing" className="btn border border-white/20 text-paper hover:bg-white/5">
              Plans from $0
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
