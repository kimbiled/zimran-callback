# B: production verification runbook

Code is integrated locally from `kimbiled/zimran-callback` main `7cec63f`, preserving the earlier B evidence guards, metrics, scoring state and offline text path, plus upstream SDR/AE selection and test-only Stripe. The target is GPT-Live (`gpt-live-1`), with its own Live API, not `gpt-realtime`.

The actual production project is [kimbileds-projects/zimran-callback](https://vercel.com/kimbileds-projects/zimran-callback), confirmed by the GitHub commit deployment status. The current Vercel connection can access only `tolik998s-projects`; the production team returns 403 and its access-grant request returns 404. A project owner must grant team membership before production logs, settings and deployment can be changed here. Public site and repository access do not grant Vercel administration access.

Local Gateway setup was completed on 2026-11-14 in the personal team with explicit approval. `Callback B — judge` has a $5 total key budget without refresh and expires on 2026-12-14. The secret is in ignored `.env.local`; `AI_PROVIDER=gateway` and `AI_DISABLED=0` select it locally. Free credits were activated by the user. Live validation completed 60 retained AI judge verdicts, five synthetic model debriefs and three generated buyers; see `evals/proof/live-2026-11-14.json`. Four rate-limited eval batches required a retry. The production project owner still needs to add `AI_GATEWAY_API_KEY` as an encrypted server variable, select `AI_PROVIDER=gateway` and redeploy; the local setup does not alter that project's environment. No credit purchase or auto-top-up was enabled.

## Judge and one billing path

`AI_PROVIDER=auto` uses the configured OpenAI project key for the separate judge/debrief/text models. Gateway remains available when deliberately selected or when only Gateway/OIDC is configured. No additional Gateway balance is required for direct OpenAI requests.

`/api/health` reports configuration and worker-local safe diagnostics. It is not an inference or balance test. Protected `POST /api/ai/probe` returns success only after the judge produces `source: ai`; billing/auth/rate/schema failures remain visible as structured `judge AI failed` log records. The rubric remains explicitly labelled when used.

Use existing project credentials; do not paste keys into chats or commit them. Secret creation/local writes require the secure OpenAI key setup flow. No credit purchase, auto-recharge or subscription change is performed by this code change.

## Live evidence order

1. Obtain Vercel team access; inspect the exact `judge AI failed` error and environment metadata without printing secret values.
2. Select the existing OpenAI key/direct backend or repair Gateway funding/auth. Add an encrypted `EVAL_KEY` to production/preview and redeploy the reviewed code.
3. Run the one-request probe, then `BASE_URL=... npm run eval -- --live` with EVAL_KEY available securely. The command evaluates paced pairs, records bounded infrastructure retries and rejects retained heuristic/mixed results or accuracy below 80%. Each batch stays within function duration; the full run can take several minutes on free credits. `npm run test:live` separately checks synthetic call flows and generated buyers.
4. Review generated buyers using the three actual posting summaries and source URLs in `evals/jobs/real-postings.json`. Confirm fictional identities, appropriate customer role/product, three realistic pains and usable objections.
5. Make five real calls: all four buyers plus a generated buyer. Review voice intelligibility, interruption, greeting, buyer hangup, end-of-call transcript, evidence quotes and five debrief criteria. Browser tests and mocked provider tests do not establish voice quality.
6. Select a genuinely recorded good voice call with model debrief. As its owner, POST `{callId,consent:true}` to `/api/samples`; verify `/replay/[id]` opens without a microphone and tracks recorded events. Never publish the scripted `/sample` as a recording.
7. Enable Web Analytics in the Vercel project and deploy. Send the site to consenting testers through authorized channels, collect real answers, and export `/api/feedback/proof` with bearer authorization. This work does not invent testers or send unsolicited invitations.
8. Update the supplied pitch deck's Proof slide from actual live-eval artifacts and consented feedback. No deck file is present here; `docs/proof.md` holds the current evidence and remaining checks.

## Voice implementation boundaries

The browser creates mic tracks and `oai-events`, gathers ICE, sends SDP to the authenticated server broker, applies the provider answer and waits for `session.started`. The permanent key and private buyer instructions stay on the server. The server persists a one-session-attempt claim per call.

Caption events use `event_id`, `start_ms` and `end_ms`; duplicates are ignored and both speakers are assembled independently. Media is WebRTC audio, not JSON audio events. Farewell detection is conservative and waits for playback/silence grace; verify its naturalness with real voices before calling it fully validated.

`session.close` waits for `session.closed` or a bounded cleanup timeout. The model has no direct ElevenLabs-style `end_call` tool. The five-minute cap is enforced by the browser; GPT-Live does not offer a matching startup max-duration field, and a strict server cap needs a trusted sideband controller. Browser media is not stored by this app.

Official references: [Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [GPT-Live model](https://developers.openai.com/api/docs/models/gpt-live-1), [Live conversations](https://developers.openai.com/api/docs/guides/live-conversations), [API credit benefit](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

## Local checks

`npm test`, `npm run typecheck`, `npm run build`, `npm run eval -- --offline`. Test setup clears cloud credentials and database URLs, so a developer's `.env.local` cannot cause offline tests to write production data. Tests use mocks when exercising provider success/failure paths.
