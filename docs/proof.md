# Proof — verified evidence and remaining live checks

## Local engineering evidence

- Paired judge harness: 20 scripted calls, 10 strong/weak pairs, the same production judge function.
- Offline rubric: 10/10 pairs ordered correctly; 50/50 score changes carry a grounded quotation. This does **not** establish cloud-model accuracy.
- Metrics and final totals are computed in code; invented or reordered evidence cannot move the score.
- 91 tests in 14 files pass, along with TypeScript and the production build. GPT-Live transport, source provenance, sample publication, playback, feedback, SDR/AE flow and fallback regressions are covered. Browser smoke tests completed text → debrief → feedback and AE discovery → debrief without JavaScript errors; their answers are not real-user research.
- Live paired judge eval on 2026-11-14 via the local application and AI Gateway, model `openai/gpt-4.1-mini`: **10/10 correctly ordered pairs**, **60/60 retained AI verdicts**, **60/60 retained score changes with grounded evidence**, mean final interest **+5.6 vs −52.7**. Four rate-limited batches required one retry each; the first unpaced mixed-source run was rejected. This measures the scripted set, not general accuracy or availability. Grounding is measured after server guards and does not certify unfiltered model quotations. [Recorded results](../evals/proof/live-2026-11-14.json).
- Five synthetic SDR/AE text calls and `openai/gpt-4.1` debriefs passed ownership, source, quote/timestamp, total, final decision and idempotence checks. Strong SDR scored 71/100, weak pitch/injection 2/100, AE 75/100; the retracted meeting remained `no_meeting`. Independent review checked the actual model outputs. These are not human voice calls.
- Three factual summaries of actual Datadog/Ramp vacancies produced appropriate fictional IT/finance customer buyers, each with exactly three quantified pains. Generic unquantified outputs discovered during testing led to a stricter generation schema. Reproduce with `npm run test:live`; it spends model tokens.

## Evidence that must come from production

Production inference and latency have not been verified from this workspace. The local live test above uses cloud models but does not establish that the production project's credentials/balance work. Add the correct production credentials, deploy and run the protected probe/live eval on that deployment.

Publish a completed, genuinely recorded voice call with model debrief and explicit publication consent; `/replay/[id]` then replays saved timings and judge events. The hardcoded `/sample` is scripted and is not a real recording.

Tester count, usefulness, willingness to pay and customer quotes must come from actual users. `/api/feedback/proof` exports anonymous-session counts and consented quotes behind EVAL_KEY authorization. Sessions are not verified unique people. No tester counts or quotes have been invented for this slide.

Three real job-posting summaries and source links are in `evals/jobs/real-postings.json`; their generated buyers were reviewed live. Five real calls and voice auditions still require an OpenAI-enabled deployment. No pitch-deck file was supplied in this workspace, so this file is copy-ready evidence for its Proof slide, not a claim that the original deck was edited.
