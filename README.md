# Callback

Practice the cold call before the interview. A candidate calls a fictional buyer with hidden pains and objections, watches an interest meter and gets a five-criterion debrief with quotes, timestamps and better lines.

Demo: [zimran-callback.vercel.app](https://zimran-callback.vercel.app) · B2C, web, no registration. This branch continues upstream `7cec63f` and the locally verified B changes.

Two interview types use the same buyer: **SDR** is a cold call to book a meeting; **AE** is a scheduled discovery call to qualify pain, budget and decision makers, then book a demo. The buyer, judge and debrief receive the selected role.

Team: **A · Nursultan** owns server/UI; **B · Tlegen** owns AI/voice. `lib/types.ts` is the shared contract.

## Run

Node 24, then:

```powershell
npm ci
npm run dev -- --hostname 127.0.0.1
```

Without keys, choose **Text**: the buyer and judge use a clearly labelled deterministic rubric. Voice uses **GPT-Live (`gpt-live-1`) only**. ElevenLabs is no longer a dependency or fallback.

```powershell
npm test
npm run typecheck
npm run build
npm run eval -- --offline
```

## Architecture

```text
Browser microphone ↔ OpenAI GPT-Live via WebRTC
  SDP offer → /api/voice/session → server-only OpenAI key and hidden buyer prompt
  transcript → /api/judge → independent judge model → verified score event
  finish → /api/debrief → computed metrics + model criteria → Neon
Text → /api/buyer → same buyer profile, without a microphone
Published recording → /replay/[id] → original timestamps and saved judge events
Debrief → three feedback questions → consented quotes and aggregates
```

The actor and judge are separate models. Interest changes are clamped to ±25 per turn and −100…100 overall. Code verifies contiguous quotations, filters pain IDs and computes the total. Client-supplied score, timeline and discovered-pain fields are not authoritative. A missing model response is labelled `source: "heuristic"` and never counts as a successful live eval.

The four existing profiles remain Jessica Reed (HR), Mike Torres (Sales), Linda Hayes (Finance) and Ryan Brooks (Engineering). Start interest is 0 / −20 / −40 by difficulty. A pasted job posting can generate a fictional buyer under a validated schema.

## Configuration

Use an ignored `.env.local` or Vercel project environment settings. Never commit secrets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Required for persistent production data; local fallback is process memory. |
| `OPENAI_API_KEY` | GPT-Live plus direct OpenAI judge, debrief and text buyer. The key stays server-side. |
| `GPT_LIVE_MODEL` | `gpt-live-1`; this is the Live API, not the Realtime API. |
| `AI_PROVIDER` | `auto` prefers the OpenAI project key, otherwise Gateway; `openai` or `gateway` pins the backend. |
| `AI_GATEWAY_API_KEY` | Optional Gateway credential; Vercel can also supply OIDC in request context. |
| `JUDGE_MODEL` / `DEBRIEF_MODEL` | Defaults: `openai/gpt-4.1-mini` / `openai/gpt-4.1`. |
| `BUYER_MODEL` | Text actor; default `openai/gpt-4.1-mini`. |
| `AI_DISABLED` | `1` explicitly forces the offline rubric. |
| `EVAL_KEY` | Protects live evaluation, production probe and feedback export; send in an Authorization bearer header. |
| `FREE_CALL_LIMIT` / `MAX_CALL_SECONDS` | Defaults 3 and 300; browser voice cap never exceeds 300 seconds. |
| `STRIPE_SECRET_KEY` | Only `sk_test_` / `rk_test_` keys are accepted. Live keys are refused; without a key checkout uses demo mode. |

One OpenAI project key is sufficient for voice and judging; AI Gateway is optional. ChatGPT login and API billing are distinct. Eligible subscriptions may include [API credits covering GPT-Live](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), subject to account eligibility; no free voice entitlement is assumed.

## Fixing a production judge fallback

1. Inspect `/api/health`: `aiStatus` shows backend configuration and safe recent diagnostics. Configuration alone does not prove inference works. Recent diagnostics are worker-local; aggregated production logs remain the source for other workers.
2. With the existing OpenAI project key, use `AI_PROVIDER=openai`; otherwise configure/fund Gateway and use `AI_PROVIDER=gateway`. Redeploy after changing environment settings.
3. Search runtime logs for **`judge AI failed`**. New logs classify `auth`, `billing`, `rate_limit`, `model`, `timeout`, `schema` or `upstream`, without raw keys, transcripts or provider bodies.
4. A bearer-protected `POST /api/ai/probe` makes one judge request and succeeds only with `source: "ai"`. A heuristic result returns HTTP 503.
5. Run the live eval. Buying credits is not the remedy for every 429; confirm the classified error first.

## Eval and Proof

`evals/calls/paired.json` contains 10 strong/weak pairs: 20 scripted calls, 60 rep turns. Each pair uses identical buyer dialogue and the same `judgeTurn()` as production.

```powershell
# Safe local rubric verification; no live model calls:
npm run eval -- --offline
# With BASE_URL and EVAL_KEY configured for the deployment:
npm run eval -- --live
```

Live evaluation requires **all** verdicts to come from AI, ≥80% correctly ordered pairs and 100% grounded score changes. It is manual because it spends tokens. Offline results are not cloud-model quality evidence.

Verified offline baseline: **10/10 pairs**, mean final interest **−4.3 vs −42**, **50/50** score movements grounded. Live production results are not claimed from this workspace. See [Proof evidence](docs/proof.md) and [remaining production checks](docs/ai-voice.md).

Live model check on 2026-11-14 through the local production judge and AI Gateway: **10/10 pairs ordered correctly**, **60/60 AI verdicts**, **60/60 retained score movements grounded**, mean final interest **+5.6 vs −52.7**. Four rate-limited batches were retried after a pause; this is not a 100% availability claim. The initial unpaced run was rejected for mixed AI/heuristic results. These are 20 scripted calls, not production traffic or real-user accuracy. Machine-readable evidence: [live report](evals/proof/live-2026-11-14.json).

`npm run test:live` additionally checks five synthetic text calls (SDR, AE, injection, repetition and final refusal), five model debriefs and buyers from three factual summaries of actual job postings. It spends model tokens, uses `BASE_URL` (default `http://127.0.0.1:3001`) and writes an ignored `output/live-quality-checks.json`. The paired live eval uses small paced batches so a free-tier rate limit cannot masquerade as model success.

## Recorded replay and feedback

- `/sample` is the original **scripted example**, not a real recording.
- Publish an actual completed voice call with an AI debrief and a saved AI source for every judge verdict using owner-authenticated `POST /api/samples` with `{callId, consent:true}`. Missing/heuristic verdict sources, including legacy records without provenance, are refused. Publication shares its transcript; consent is explicit.
- `/replay/[id]` supports play, pause, restart and seek, showing recorded dates, original transcript times, interest and reasons. The landing page lists only published recordings.
- After a completed owned call, the form asks usefulness (1–5), willingness to pay $49, and an optional quote with permission. Unconsented or revoked quote text is discarded.
- `/api/feedback/proof` is bearer-protected and returns aggregates and consented quotes. Anonymous sessions are not verified unique people.
- Vercel Analytics is wired for pageviews and categorical call/debrief/feedback events. Enable Web Analytics on the Vercel project and deploy this branch. Transcripts, hidden profiles and quotes are never event properties.

## API

| Route | Purpose |
|---|---|
| `GET /api/personas` | Public buyer profiles |
| `POST /api/calls` | Start an owned call |
| `POST /api/voice/session` | Authenticated GPT-Live SDP handshake |
| `POST /api/judge` | Server-held score and evidence |
| `POST /api/buyer` | Cached text buyer response |
| `POST /api/debrief` | Idempotent report and quota accounting |
| `POST /api/persona-from-job` | Buyer generation, three requests per anonymous session/day |
| `GET /api/samples`, `POST /api/samples` | List/publish recordings with consent |
| `GET /api/replay/[id]` | Safe published replay data |
| `GET /api/feedback`, `POST /api/feedback` | Owned-call feedback |
| `GET /api/feedback/proof` | Protected genuine-feedback export |
| `GET /api/eval`, `POST /api/ai/probe` | Protected paid model validation |
| `GET /api/health` | Safe configuration/diagnostic state |

## Limits and remaining verification

Voice startup has a total deadline, partial resources are cleaned up, repeated caption events are deduplicated and late work cannot update a later call. One provider session attempt per call is claimed durably in Neon. Buyer farewell handling and the five-minute browser timer request graceful closure before releasing media.

GPT-Live has no configurable five-minute provider limit. An untrusted client can ignore a browser timer; authoritative server closure needs a trusted sideband controller. The existing A free-call quota is checked at start and charged at completion, so simultaneous call reservation and IP limits still require server-side hardening.

Three actual vacancy summaries in `evals/jobs/real-postings.json` were tested against cloud generation and the generated customer roles/products were reviewed. Five synthetic text-call debriefs were checked live; they do not substitute for five real voice calls. Real voice auditions, a genuine published recording, production configuration/inference and 20–50 testers still require service access and human participation. Buyer captions and timestamps originate on the client, so saved data is not forensic proof of human speech. No real calls, customer quotes or user counts are fabricated. The optional warmup is omitted.

Plans remain Interview Sprint $49 and Rep Gym $39/month. Stripe test card: `4242 4242 4242 4242`, any future date and any CVC. Live Stripe keys are blocked; demo checkout is not payment proof.
