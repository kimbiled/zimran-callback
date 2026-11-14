# Callback

**Practice the cold call before the interview.** Callback puts a sales candidate on a live voice call with an AI buyer who has hidden pains, a budget and real objections. An interest meter reacts to every sentence, and the call ends with a debrief: a 0–100 scorecard, quotes with timestamps and better lines to say next time.

Built for Business Cup 2.0 (B2C, web, US adults 25–45 preparing for SDR, AE and sales engineer interviews).

- No sign-up: an anonymous cookie session, 3 free calls
- Voice or text mode (no mic needed)
- Buyer built from a pasted job posting
- Sample call and debrief at `/sample` for anyone without a mic

## How it works

```
Browser ── WebRTC ──> GPT-Live (OpenAI) or ElevenLabs Agent (the buyer: voice, LLM, turn-taking)
   │                        ▲  private note with current interest after every verdict
   │ each rep turn          │
   └──> POST /api/judge ──> judge model (AI Gateway) ──> guards in code ──> meter
   └──> POST /api/debrief ─> debrief model + metrics in code ──> Neon Postgres
```

- **The actor and the judge are different models.** The buyer only plays the role. A separate judge scores every rep turn from -25 to +25.
- **Guards in code** (`lib/ai/guards.ts`): the judge must quote the rep's exact words or the delta is zeroed; deltas are clamped; monologues over ~60s are penalized regardless of the model; only known pain ids count.
- **Metrics are computed, not generated** (`lib/metrics.ts`): talk ratio, questions, filler words per 100 words, longest monologue.
- **Meter drives the buyer.** After each verdict the app sends the agent a private contextual update with the current interest, so the buyer warms up or cools down with the meter.
- **Never breaks.** If AI Gateway is unavailable, a deterministic rubric (`lib/ai/heuristics.ts`) scores the call and builds the debrief.

## Run locally

```bash
npm install
cp .env.example .env.local   # all optional; see below
npm run dev                  # http://localhost:3000
npm test                     # unit tests (metrics, guards, rubric, sample)
```

Without any env vars the app runs end to end: in-memory storage, the public ElevenLabs agent, and the offline rubric instead of the AI judge.

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel (framework: Next.js, no build settings needed).
2. Set environment variables in Project Settings:
   | Variable | Required | Notes |
   |---|---|---|
   | `DATABASE_URL` | yes | Neon connection string for the `callback` database (pooled). Tables are created automatically on first request. |
   | `ELEVENLABS_AGENT_ID` | no | Defaults to `agent_5501m7chgm92fe7rbwpaw8behtws`. |
   | `ELEVENLABS_API_KEY` | no | Turns on signed URLs so the agent can be private. |
   | `OPENAI_API_KEY` | no | Voice calls run on GPT-Live (see below). Paid API tier required. |
   | `GPT_LIVE_MODEL` | no | Defaults to `gpt-live-1`. |
   | `VOICE_PROVIDER` | no | `elevenlabs` keeps voice on ElevenLabs even with an OpenAI key. |
   | `EVAL_KEY` | no | Any secret; enables `GET /api/eval?key=...`. |
   | `STRIPE_SECRET_KEY` | no | Stripe test key. Without it, checkout runs in demo mode. |
   | `AI_GATEWAY_API_KEY` | no on Vercel | Vercel uses OIDC automatically. Enable AI Gateway for the team. |
3. Deploy, then open `/api/health` to see what's on: `{"db":"neon","ai":{...},"voice":{...}}`.
4. Run the judge eval for the Proof slide: `BASE_URL=https://<your-app>.vercel.app EVAL_KEY=... npm run eval`.

## Project layout and ownership

Two people, two folders, one shared contract (`lib/types.ts`), so merges don't conflict.

| Owner | Area | Files |
|---|---|---|
| **A** | Server and UI | `app/**/page.tsx`, `app/layout.tsx`, `components/*`, `lib/server/*`, `lib/plans.ts`, `lib/sample.ts`, `lib/labels.ts`, routes `calls`, `progress`, `checkout`, `health`, `personas` |
| **B** | AI and voice | `lib/ai/*`, `lib/voice/*`, `lib/personas.ts`, `lib/metrics.ts`, routes `judge`, `debrief`, `persona-from-job`, `eval` |
| both | Contract | `lib/types.ts` (change only together) |

## API

| Route | Purpose |
|---|---|
| `GET /api/personas` | Public buyer list (hidden profiles stripped) |
| `POST /api/calls` | Start a call: free-limit check, DB row, voice credentials + dynamic variables |
| `POST /api/judge` | Score the latest rep turn → `{delta, score, reason, evidenceQuote, painsUncovered}` |
| `POST /api/debrief` | Final debrief (idempotent), counts the call against the free limit |
| `POST /api/persona-from-job` | Build a buyer from a job posting |
| `GET /api/calls/:id` | Call with transcript and debrief |
| `GET /api/progress` | This browser's calls, scores and plan |
| `POST /api/checkout` | Stripe Checkout, or demo mode |
| `GET /api/eval?key=` | Judge vs. labeled turns (16 cases) |
| `GET /api/health` | What's configured |

## GPT-Live voice (OpenAI)

With `OPENAI_API_KEY` set, voice calls use `gpt-live-1` over WebRTC. The key never reaches the browser:

```
Browser: getUserMedia → RTCPeerConnection + data channel "oai-events" → SDP offer
   └──> POST /api/voice/session {callId, sdp}
          server: checks the call belongs to this cookie session, adds the buyer prompt
          (lib/voice/brief.ts → buyerInstructions) and the voice, then
          POST https://api.openai.com/v1/live/sessions {session, transport:{type:"webrtc", sdp}}
   <── SDP answer
Browser ⇄ OpenAI: mic audio up, buyer audio down (plays immediately), events on "oai-events"
```

- Opening line: `session.commentary.append` right after `session.started`.
- Interest note after each judge verdict: `session.thinking.append` (not spoken, doesn't interrupt).
- Transcripts arrive as `session.input_transcript.delta` / `session.output_transcript.delta` with no end-of-turn event; `lib/voice/turns.ts` closes a turn when the other side starts talking or after a pause.
- "Is talking" comes from the loudness of the remote audio track (GPT-Live has no speaking events).
- Hang-up: `session.close` → `session.closed`.
- Text mode stays on ElevenLabs (GPT-Live has no text-only mode). If GPT-Live fails to connect, the call falls back to the ElevenLabs agent automatically.
- Voices: Jessica → `gleam`, Sarah → `delta`, Roger → `meridian`, Chris → `cinder`, Eric → `vesper` (`lib/voice/server.ts`).

## ElevenLabs agent

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

## Для команды (кратко)

- **A** — сервер и интерфейс, **B** — AI и голос; общий контракт — `lib/types.ts`.
- Локально: `npm install && npm run dev`. Без переменных окружения всё работает (память вместо БД, офлайн-рубрика вместо AI).
- Перед сдачей: задеплоить на Vercel с `DATABASE_URL`, открыть `/api/health`, прогнать `npm run eval` и вписать точность судьи в слайд Proof.
