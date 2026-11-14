# Proof — verified evidence and remaining live checks

## Local engineering evidence

- Paired judge harness: 20 scripted calls, 10 strong/weak pairs, the same production judge function.
- Offline rubric: 10/10 pairs ordered correctly; 50/50 score changes carry a grounded quotation. This does **not** establish cloud-model accuracy.
- Metrics and final totals are computed in code; invented or reordered evidence cannot move the score.
- 92 tests in 14 files pass, along with TypeScript and the production build. GPT-Live transport, source provenance, sample publication, playback, feedback, SDR/AE flow and fallback regressions are covered. Browser smoke tests completed text → debrief → feedback and AE discovery → debrief without JavaScript errors; their answers are not real-user research.
- Live paired judge eval on 2026-11-14 via the local application and AI Gateway, model `openai/gpt-4.1-mini`: **10/10 correctly ordered pairs**, **60/60 retained AI verdicts**, **60/60 retained score changes with grounded evidence**, mean final interest **+5.6 vs −52.7**. Four rate-limited batches required one retry each; the first unpaced mixed-source run was rejected. This measures the scripted set, not general accuracy or availability. Grounding is measured after server guards and does not certify unfiltered model quotations. [Recorded results](../evals/proof/live-2026-11-14.json).
- Five synthetic SDR/AE text calls and `openai/gpt-4.1` debriefs passed ownership, source, quote/timestamp, total, final decision and idempotence checks. Strong SDR scored 71/100, weak pitch/injection 2/100, AE 75/100; the retracted meeting remained `no_meeting`. Independent review checked the actual model outputs. These are not human voice calls.
- Three factual summaries of actual Datadog/Ramp vacancies produced appropriate fictional IT/finance customer buyers, each with exactly three quantified pains. Generic unquantified outputs discovered during testing led to a stricter generation schema. Reproduce with `npm run test:live`; it spends model tokens.

## Production evidence

On 2026-11-14, GitHub CI and Vercel deployment succeeded for code `9e6a599`. The public production site was checked with separate synthetic sessions against Neon using its existing direct OpenAI backend:

- All **13 judge responses** and **5 debriefs** used AI. Strong SDR scored **73/100**, early close/injection **4/100**, AE **74/100**, final refusal **33/100**, repeated question **16/100**. Both earned meetings and all three `no_meeting` outcomes were correct; final cancellation overrode the earlier acceptance.
- Literal evidence/timestamps, total arithmetic, debrief idempotence and one-time quota charging passed the same live script used locally.
- All **3 vacancy summaries** generated appropriate fictional IT/finance customers with three unique quantified pains, and each generated buyer could start a call.
- A separate conversational smoke used **2 AI buyer replies**, **2 AI judge responses** and an AI debrief. Repeating a buyer request returned the cached reply. An initial single-turn smoke also returned AI judge/debrief and an idempotent result.

[Recorded production results](../evals/proof/production-2026-11-14.json). These are synthetic text checks; the 60-verdict paired benchmark above ran locally through Gateway. Production EVAL_KEY and runtime logs could not be inspected under the connected Vercel account, which lacks access to the owning team. GPT-Live is configured, but configuration does not establish voice quality.

Manual review found unsupported Salesforce-integration and customer-success claims in two coaching outputs. A regression-tested output guard now replaces those known claim patterns with persona-aware questions, and the prompt explicitly forbids them. This narrow guard does not certify the factual accuracy of every generated recommendation; semantic review remains necessary.

## Evidence requiring human participation

Publish a completed, genuinely recorded voice call with model debrief and explicit publication consent; `/replay/[id]` then replays saved timings and judge events. The hardcoded `/sample` is scripted and is not a real recording.

Tester count, usefulness, willingness to pay and customer quotes must come from actual users. `/api/feedback/proof` exports anonymous-session counts and consented quotes behind EVAL_KEY authorization. Sessions are not verified unique people. No tester counts or quotes have been invented for this slide.

Three real job-posting summaries and source links are in `evals/jobs/real-postings.json`; their generated buyers were reviewed live locally and on production. Five real calls and voice auditions still require human testing. No pitch-deck file was supplied in this workspace, so this file is copy-ready evidence for its Proof slide, not a claim that the original deck was edited.
