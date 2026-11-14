# Callback

[![CI](https://github.com/kimbiled/zimran-callback/actions/workflows/ci.yml/badge.svg)](https://github.com/kimbiled/zimran-callback/actions/workflows/ci.yml)

**Practice the cold call before the interview.** Callback puts a sales candidate on a live voice call with an AI buyer who has hidden pains, a budget and real objections. An interest meter reacts to every sentence, and the call ends with a debrief: a 0–100 scorecard, quotes with timestamps and better lines to say next time.

**Live demo: https://zimran-callback.vercel.app** · no sign-up · works without a mic (text mode, or the sample debrief at [`/sample`](https://zimran-callback.vercel.app/sample))

Built for Business Cup 2.0 · track Skills · B2C, web only.

---

## Contents

- [The problem](#the-problem)
- [What it does](#what-it-does)
- [Try it in 2 minutes](#try-it-in-2-minutes)
- [How it works](#how-it-works)
- [How a call is scored](#how-a-call-is-scored)
- [The buyers](#the-buyers)
- [Pricing](#pricing)
- [Tech stack](#tech-stack)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Tests and the judge eval](#tests-and-the-judge-eval)
- [Deploy to Vercel](#deploy-to-vercel)
- [API](#api)
- [Voice: GPT-Live and the ElevenLabs fallback](#voice-gpt-live-and-the-elevenlabs-fallback)
- [Cost and abuse limits](#cost-and-abuse-limits)
- [Privacy and security](#privacy-and-security)
- [Project layout and ownership](#project-layout-and-ownership)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Для команды (кратко, по-русски)](#для-команды-кратко-по-русски)

---

## The problem

People moving into tech sales (SDR, AE, Customer Success, Sales Engineer) almost always face a **role-play cold call** in the final interview round. It is the round that decides the offer, and there is nowhere to practice it:

- friends don't play a skeptical VP who is busy and hides the real problem;
- interview prep tools ask generic questions instead of running a live call;
- sales simulators exist, but they are sold to companies (B2B), not to the candidate.

Callback is for one user: a person aged 25–45 in the US who is about to take that call. They practice alone, as many times as they need, and see exactly what to say differently.

## What it does

| Feature | Where |
|---|---|
| Live voice call with an AI buyer: interruptions, objections, a hidden situation | `/call/[personaId]` |
| Text mode with the same buyer and judge, for when the mic doesn't work | toggle before the call |
| Interest meter from −100 to +100, with the reason for every change | during the call |
| Debrief: 0–100 score on 5 criteria, quotes with timestamps, "say this instead", interest chart, turn-by-turn replay, hidden pains found and missed | `/debrief/[callId]` |
| Metrics counted in code: talk ratio, questions, filler words per 100 words, longest monologue | debrief |
| Buyer built from a pasted job posting | home page |
| Progress across calls | `/progress` |
| Sample debrief of a real call, no mic needed | `/sample` |
| Plans and checkout (Stripe test mode, or demo mode without a key) | `/pricing` |

No login: the user is an anonymous cookie session with 3 free calls.

## Try it in 2 minutes

1. Open https://zimran-callback.vercel.app and pick **Jessica Reed** (easy).
2. Choose **Voice** and allow the microphone (or **Text** if you can't).
3. Start badly: pitch the product before asking anything. The meter drops, and the reason says why.
4. Then ask: *"How long does it take a new front-desk hire to get fully up to speed?"* The meter climbs: you uncovered a hidden pain.
5. Ask for a 20-minute meeting at a specific time, then press **End call** and read the debrief.

## How it works

```
                       ┌──────────────────────────── voice ────────────────────────────┐
Browser (Next.js) ─────┤ GPT-Live (OpenAI) over WebRTC          ← default with OPENAI_API_KEY │
   mic ⇄ buyer audio   │ ElevenLabs Agent over WebRTC/WebSocket ← text mode and fallback       │
                       └────────────────────────────────────────────────────────────────┘
   │  each rep turn (text)                          ▲ private note: "your interest is +38"
   ├──> POST /api/judge ──> judge model (AI Gateway) ──> guards in code ──> meter
   │                         └─ AI unavailable? → deterministic rubric (never breaks)
   └──> POST /api/debrief ─> debrief model + metrics in code ──> Neon Postgres
```

- **Audio never touches our server.** The browser talks to the voice provider directly; our server only sees text turns and does scoring, storage and payments.
- **The actor and the judge are different models.** The buyer only plays the role. A separate judge scores every rep turn from −25 to +25.
- **The meter drives the buyer.** After each verdict the app sends the buyer a private note with the current interest, so the buyer warms up or cools down with the meter.
- **Never breaks.** If AI Gateway is unavailable, a deterministic rubric (`lib/ai/heuristics.ts`) scores the call and builds the debrief, and the debrief says so.

## How a call is scored

**Per turn (live).** `POST /api/judge` sends the judge the last 10 turns, the buyer's hidden profile and the current score. The judge returns `delta`, a reason, an evidence quote and the pains uncovered. Code then enforces the rules (`lib/ai/guards.ts`):

- the evidence quote must appear in the rep's actual words, or the delta is zeroed;
- the delta is clamped to ±25, the score to −100…+100; the server does the arithmetic, not the model;
- only pain ids that exist in the profile count;
- a monologue over ~60 seconds is penalized regardless of what the model says.

**Final debrief.** One model call after the call: full transcript, profile and metrics in; 5 criteria out, each 0–20 with a quote, a timestamp and a better line. Quotes are checked against the transcript the same way. The total is computed in code.

| Criterion | What is checked | Scored by |
|---|---|---|
| Opening | Introduced themselves, gave a reason, got permission to continue | model |
| Discovery | Open questions; how many hidden pains were uncovered | model + profile |
| Objection handling | Acknowledged, asked a follow-up, didn't argue | model |
| Value | Tied the product to a pain found on the call, not a feature list | model |
| Next step | Proposed a specific time and got agreement | model + meeting triggers |
| Talk ratio | Rep's share of talk time (aim 40–60%) | code |
| Questions | Sentences ending in `?` or starting like a question (speech-to-text often drops `?`) | code |
| Filler words | um, uh, you know, basically… per 100 words | code |
| Longest monologue | Seconds, from turn timestamps | code |

## The buyers

Four ready-made buyers (all fictional), plus any buyer generated from a job posting.

| Buyer | Difficulty | Company | You sell | Opens with |
|---|---|---|---|---|
| Jessica Reed, VP of People | easy | BrightPath Urgent Care, 14 clinics, 650 people | Onboarding and training platform for frontline staff | "Hello, this is Jessica." |
| Mike Torres, VP of Sales | medium | Summit Building Supply | AI conversation intelligence for reps' calls | "Torres. Make it quick, I've got a pipeline review in five minutes." |
| Linda Hayes, CFO | hard | GreenCart | Supplier reconciliation and month-end close automation | "Linda Hayes speaking." |
| Ryan Brooks, CTO | hard | PayLoop | Cloud observability and alerting | "Yeah, who's this?" |

Each has a hidden profile (`lib/personas.ts`): 3 weighted pains with keywords, budget and decision process, objections, conditions for agreeing to a meeting, and turn-offs. The buyer reveals one pain at a time, only to a good question.

## Pricing

| Plan | Price | For |
|---|---|---|
| Free | $0 | 3 calls up to 5 minutes, 4 buyers, full debrief |
| Interview Sprint | $49 one-time, 7 days | Before the interview: 120 voice minutes, buyers from your job posting |
| Offer Call (soon) | $29 add-on | Salary negotiation with an AI recruiter |
| Rep Gym | $39 / month | After the hire: 150 minutes a month, new buyers weekly |

Checkout uses Stripe in **test mode** (card `4242 4242 4242 4242`). Without `STRIPE_SECRET_KEY` it runs in demo mode: the plan activates and nothing is charged.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, TypeScript (strict) |
| Voice | OpenAI GPT-Live (`gpt-live-1`, WebRTC); ElevenLabs Agents (`@elevenlabs/react`) as fallback and for text mode |
| Judge and debrief | Vercel AI SDK through Vercel AI Gateway (`openai/gpt-4.1-mini` judge, `openai/gpt-4.1` debrief), zod schemas |
| Database | Neon Postgres (`@neondatabase/serverless`); in-memory store when `DATABASE_URL` is not set |
| Payments | Stripe Checkout (test mode) |
| Tests and CI | vitest; GitHub Actions runs typecheck, tests and build on every push |
| Hosting | Vercel |

## Run locally

Requires Node.js 22 (≥ 22.22 recommended).

```bash
npm install
cp .env.example .env.local   # every variable is optional
npm run dev                  # http://localhost:3000
```

With no variables at all the app still runs end to end: in-memory storage, the public ElevenLabs agent for voice, and the offline rubric instead of the AI judge. Add keys one by one to switch each part to the real service; `GET /api/health` shows what is on.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (vitest) |
| `npm run eval` | Judge accuracy on labeled turns against a running app (see below) |

## Environment variables

Put secrets in `.env.local` (git-ignored) or in Vercel project settings. **Never in `.env.example`**: it is committed and the repo is public.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes in production | Neon pooled connection string. Tables are created on the first request. Without it, data lives in memory (local dev only). |
| `OPENAI_API_KEY` | no | Voice calls run on GPT-Live. Needs a paid OpenAI API tier. |
| `GPT_LIVE_MODEL` | no | Defaults to `gpt-live-1`. |
| `VOICE_PROVIDER` | no | `elevenlabs` keeps voice on ElevenLabs even with an OpenAI key. |
| `ELEVENLABS_AGENT_ID` | no | Defaults to the project's public agent `agent_5501m7chgm92fe7rbwpaw8behtws`. |
| `ELEVENLABS_API_KEY` | no | Turns on signed URLs, so the ElevenLabs agent can be private. |
| `AI_GATEWAY_API_KEY` | locally only | On Vercel, AI Gateway authenticates through OIDC; just enable AI Gateway for the team. |
| `JUDGE_MODEL` / `DEBRIEF_MODEL` | no | Default `openai/gpt-4.1-mini` / `openai/gpt-4.1`. |
| `AI_DISABLED` | no | `1` forces the offline rubric. |
| `FREE_CALL_LIMIT` | no | Default 3. |
| `MAX_CALL_SECONDS` | no | Default 300. |
| `STRIPE_SECRET_KEY` | no | Stripe test key. Without it, checkout runs in demo mode. |
| `EVAL_KEY` | no | Any secret; enables `GET /api/eval?key=…`. |

## Tests and the judge eval

```bash
npm test
```

Unit tests cover the parts that must be exact:

| File | Covers |
|---|---|
| `tests/metrics.test.ts` | Talk ratio, questions, filler words, longest monologue |
| `tests/guards.test.ts` | Quote grounding, clamping, monologue penalty, unknown pain ids |
| `tests/heuristics.test.ts` | Offline rubric for the judge and the debrief |
| `tests/voice.test.ts` | GPT-Live transcript → turns assembly, transcript cleanup, question counting, provider and voice selection, buyer instructions |

**Judge eval.** `lib/ai/eval-cases.ts` holds labeled rep turns (good and bad versions of the same moment). `npm run eval` sends them to `GET /api/eval` on a running app, which runs the same `judge()` function as production, and prints how many verdicts point the right way and how many deltas are backed by a verified quote.

```bash
BASE_URL=https://zimran-callback.vercel.app EVAL_KEY=<same as on the server> npm run eval
```

It is run by hand, not in CI, because it spends model tokens.

**Results:** _not run yet: the AI judge on production currently falls back to the offline rubric (see [Known limitations](#known-limitations))._

## Deploy to Vercel

1. Import this repository in Vercel (framework Next.js, default build settings).
2. **Database:** Storage → Create → Neon. In *Custom Prefix* enter `DATABASE`, so the variable is named `DATABASE_URL` (the default prefix `STORAGE` produces `STORAGE_URL`, which the app does not read).
3. **AI:** enable AI Gateway for the team (vercel.com → AI Gateway). No key is needed on Vercel.
4. **Voice:** add `OPENAI_API_KEY` for GPT-Live (optional; without it voice uses ElevenLabs).
5. Optional: `STRIPE_SECRET_KEY`, `EVAL_KEY`, `ELEVENLABS_API_KEY`.
6. **Redeploy** after adding variables: they apply only to new deployments.
7. Open `/api/health`. A fully configured deployment shows `"db":"neon"`, an `ai` object and `"provider":"gpt-live"`.

## API

| Route | Purpose |
|---|---|
| `GET /api/personas` | Public buyer list (hidden profiles stripped) |
| `POST /api/calls` | Start a call: free-limit check, DB row, voice provider and credentials |
| `POST /api/voice/session` | GPT-Live handshake: browser SDP offer → server adds the prompt and key → OpenAI SDP answer |
| `POST /api/judge` | Score the latest rep turn → `{delta, score, reason, evidenceQuote, painsUncovered, source}` |
| `POST /api/debrief` | Final debrief (idempotent); counts the call against the free limit |
| `POST /api/persona-from-job` | Build a buyer from a pasted job posting |
| `GET /api/calls/:id` | Call with transcript and debrief |
| `GET /api/progress` | This browser's calls, scores and plan |
| `POST /api/checkout` | Stripe Checkout session, or demo mode |
| `GET /api/eval?key=` | Judge vs. labeled turns |
| `GET /api/health` | What is configured on this deployment |

The shared request and response types live in `lib/types.ts`.

## Voice: GPT-Live and the ElevenLabs fallback

### GPT-Live (default when `OPENAI_API_KEY` is set)

The OpenAI key never reaches the browser, and neither does the buyer's hidden profile:

```
Browser: getUserMedia → RTCPeerConnection + data channel "oai-events" → SDP offer
   └──> POST /api/voice/session {callId, sdp}
          server: checks the call belongs to this cookie session and hasn't connected yet,
          builds the buyer prompt (lib/voice/brief.ts → buyerInstructions) and picks the voice,
          POST https://api.openai.com/v1/live/sessions {session, transport:{type:"webrtc", sdp}}
   <── SDP answer
Browser ⇄ OpenAI: mic audio up, buyer audio down (plays immediately), events on "oai-events"
```

| Need | How it's done (`lib/voice/gptLive.ts`) |
|---|---|
| Buyer answers the phone | `session.commentary.append` with the opening line right after `session.started` |
| Interest note after each verdict | `session.thinking.append` (not spoken, doesn't interrupt) |
| Turns | Transcripts arrive as `session.input_transcript.delta` / `session.output_transcript.delta` with no end-of-turn event. `lib/voice/turns.ts` keeps a buffer per speaker: a rep turn closes when the rep has been quiet 1.2 s and the buyer is answering, or after 2.5 s of silence; a buyer turn after 1.5 s. Turns are emitted in the order they started, so a "Mm-hm" never cuts the rep's sentence. |
| "Is talking" indicator | Loudness of the remote audio track (GPT-Live has no speaking events) |
| Hang up | `session.close` → `session.closed` |
| Delegation requests | Answered with `session.thinking.append` "nothing can be looked up", so the buyer doesn't stall |

Voices: Jessica → `gleam`, Sarah → `delta`, Roger → `meridian`, Chris → `cinder`, Eric → `vesper` (`lib/voice/server.ts`). GPT-Live costs $0.05 per minute of voice.

### ElevenLabs (text mode, fallback, or `VOICE_PROVIDER=elevenlabs`)

GPT-Live has no text-only mode, so text calls always use ElevenLabs. If GPT-Live fails to connect, the call switches to ElevenLabs automatically.

One agent serves every buyer. Each call passes `{{name}}`, `{{opening_line}}` and `{{brief}}` as dynamic variables and overrides the voice per buyer. Settings: English, `gpt-4.1-mini`, `eleven_flash_v2`, max 300 seconds, `end_call` tool on, client overrides allowed for voice, first message and text-only mode.

<details>
<summary>Agent system prompt</summary>

```
You are role-playing a real person on a live phone call inside Callback, a cold-call simulator people use to prepare for sales job interviews. The person talking to you is practicing. Here is your character and your private situation:

{{brief}}

Rules for the whole call:
- Stay fully in character as {{name}}. Never say you are an AI, a simulation or a coach. Never give feedback, tips or hints about what the caller should do.
- Talk like a busy US professional on the phone: one to three short sentences per turn, natural and a little informal. No lists, no markdown.
- Never volunteer your private situation. Reveal one detail at a time, only after the caller earns it with a relevant, open question. Give numbers only when asked to quantify.
- Raise your objections when they fit. If the caller pitches before learning anything about you, talks for a long time, or ignores what you just said, get colder and shorter and try to wrap up.
- Agree to a next step only when the conditions in your private situation are met. Then confirm a concrete time or number.
- You may receive private notes about your current interest level. Let them shape your tone, but never mention them.
- If the caller is rude or goes off-topic, say goodbye politely and end the call.
```
</details>

## Cost and abuse limits

- Calls are capped at 5 minutes (`MAX_CALL_SECONDS`) by a client timer; the ElevenLabs agent has the same cap.
- 3 free calls per anonymous session. A call counts only once it gets a debrief, so a failed connection never burns a free call.
- `/api/voice/session` opens one OpenAI session per call and only for a live call that belongs to the caller's cookie session.
- Judge calls time out after 8 seconds and fall back to the rubric.
- Audio is not stored, only the text transcript.

## Privacy and security

- API keys live only in server environment variables; the repo has `.env.example` with empty values.
- With GPT-Live, the buyer's hidden profile is assembled on the server and never sent to the browser. (With ElevenLabs, it travels as a dynamic variable and is visible in devtools; acceptable for the demo.)
- The buyer list (`/api/personas`) strips hidden profiles; a buyer's hidden situation is revealed only after the call, in the debrief. Call responses never include the session id.

## Project layout and ownership

Two people, two folders, one shared contract (`lib/types.ts`), so merges don't conflict.

| Owner | Area | Files |
|---|---|---|
| **A** | Server and UI | `app/**/page.tsx`, `app/layout.tsx`, `components/*`, `lib/server/*`, `lib/plans.ts`, `lib/sample.ts`, `lib/labels.ts`, routes `calls`, `progress`, `checkout`, `health`, `personas` |
| **B** | AI and voice | `lib/ai/*`, `lib/voice/*`, `lib/personas.ts`, `lib/metrics.ts`, `tests/*`, routes `judge`, `debrief`, `persona-from-job`, `eval`, `voice/session` |
| both | Contract | `lib/types.ts` (change only together) |

```
app/                 pages and API routes (Next.js App Router)
components/          CallRoom, Meter, DebriefView, ScoreChart, PricingCards, JobPersona…
lib/ai/              judge, debrief, guards, offline rubric, prompts, eval cases, persona generator
lib/voice/           GPT-Live client and turn assembly, ElevenLabs hook, buyer prompt, server-side voice config
lib/server/          database, anonymous session, input validation
lib/metrics.ts       metrics counted in code
lib/personas.ts      the four buyers and their hidden profiles
tests/               vitest unit tests
scripts/eval.mjs     judge eval runner
```

## Known limitations

- **AI judge on production falls back to the offline rubric** right now (`"source":"heuristic"` from `/api/judge`). The likely cause is AI Gateway not being enabled or funded for the Vercel team; check the `judge AI failed` lines in Vercel logs.
- With GPT-Live the buyer can say goodbye but can't hang up by itself; the call ends with **End call** or the 5-minute cap.
- GPT-Live turn boundaries are inferred from pauses; very long pauses inside one sentence can still split a turn.
- Voice minutes are not metered per plan yet; plans differ only in what the pricing page promises.
- The Offer Call plan is marked "soon".

## Roadmap

- Replay of a real recorded call with original timing (`/replay/[callId]`)
- 2-minute daily objection warm-up with a streak
- Offer negotiation call with an AI recruiter ($29 add-on)
- Customer Success and Sales Engineer roles; a short recruiter round before the call
- Vercel Analytics events (`call_started`, `call_finished`, `debrief_viewed`, `second_call`)
- Later: technical interview tracks (DevOps, QA, ML) with live coding

## Для команды (кратко, по-русски)

- **Прод:** https://zimran-callback.vercel.app · здоровье: `/api/health` · репозиторий публичный, ключи только в `.env.local` и в Vercel.
- **Роли:** A — сервер и интерфейс, B — AI и голос; общий контракт — `lib/types.ts`, меняем только вдвоём.
- **Локально:** `npm install && npm run dev`. Без переменных всё работает (память вместо БД, офлайн-рубрика вместо AI, голос ElevenLabs).
- **Голос:** с `OPENAI_API_KEY` голосовые звонки идут через GPT-Live, текстовые и аварийные — через ElevenLabs.
- **Перед сдачей:** починить AI-судью на Vercel (AI Gateway), прогнать `npm run eval` и вписать результат сюда и на слайд «Proof», заменить плейсхолдеры в деке.
