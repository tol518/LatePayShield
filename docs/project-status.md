# Project Status

**Last updated:** 3 September 2026
**Phase:** Both outcome branches proven on testnet; all nine legal-assistance tasks complete for the event scope. The UK-law snapshot is approved, so the calculator and S2's legal sentence are live. No delivery transport is connected, by choice (D-019).  
**Current base:** Remote `main` commit `2efb083`
**Test baseline:** 59 root executions and 242 in `web/`, both passing, with the production build succeeding. Counts quoted inside the entries below are historical — each records the total when that task landed.
**Deployed contract:** `0x1863Ee87a6C66c8a37F481B55c3acEcF3C506dfa` (redeployed 3 September 2026, D-022). The previous deployment `0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1` keeps its own history and evidence; that evidence is about the old contract and is not evidence about this one.

This file records current truth. Target behavior belongs in the other documents.
Task assignment and progress tracking live in `issue-board.md`.
The exact external tools and URLs used to create this evidence are recorded in
[`tooling-runbook.md`](tooling-runbook.md).

## Working and verified

- The local web service no longer treats network reachability as permission.
  Every `/api/` route requires an operator token in `X-LatePay-Operator-Token`,
  case reads and writes are scoped to the owning operator, every request
  including the served page must carry a loopback peer/`Host`/`Origin` in the
  default deployment, and a non-loopback bind exits before listening unless
  `WEB_AUTHENTICATED_DEPLOYMENT`, `WEB_OPERATOR_TOKENS`, and
  `WEB_ALLOWED_ORIGINS` are all set. Nine new executions cover this, seven of
  them driving the real service over HTTP; the complete web suite is now 50
  passing executions and the production build still succeeds. A hand-run
  `npm start` on a scratch database confirmed the served page carries the
  generated token, that `GET /api/cases` without it returns `401` and with it
  returns an empty list, and that a cross-origin `text/plain` `POST` returns
  `403`. This closes the case-API access-control finding recorded
  in D-010. Multi-user identity and encryption at rest remain later work.
- A local SQLite case-file slice now stores human-confirmed invoice facts,
  source quotes/fingerprints, and communication notes while joining live
  XRPL/FDC outcome data by Coston2 agreement ID. Raw invoice text remains
  request-only. Eight store tests and four case-draft/handoff tests pass; the complete web
  suite now has 50 passing executions and the production build succeeds. After
  a new agreement registration, the UI now links its agreement ID to an
  unconfirmed case draft pre-filled from the same invoice and the final reviewed
  agreement values; saving still requires separate human confirmation. A
  temporary-database browser run created a confirmed case for live agreement `8`,
  displayed its `PaidVerified` status and evidence ID from Coston2, and appended a
  communication note. Desktop and narrow layouts had no application-owned
  console errors or horizontal overflow.
- A deterministic eligibility questionnaire and escalation module,
  `web/shared/eligibility.js`, now routes cases without any model involvement.
  It exports eight questions plus three derived and completeness checks
  (an unanswered-question check, a high-value threshold read from
  `VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS`, and an
  invoice-due-date-versus-agreement-deadline comparison against a live Coston2
  read) across fourteen reason codes on the `professional_review` and
  `operator_action` routes. Answers persist one row per case in
  `case_eligibility` (`case_id`, `answers_json`, `assessed_at`); no outcome is
  ever stored, because `assess()` recomputes it in the browser on every read
  from the saved answers and the agreement's on-chain `dueAt` (D-011). A new
  `PUT /api/cases/:id/eligibility` route saves answers, scoped to the owning
  operator, returning `404` for a missing or cross-operator case and `400` for
  an invalid answer map; `GET /api/cases/:id` now carries `eligibility` as
  `{ answers, assessedAt }` or `null`. 13 fixture tests in
  `web/shared/eligibility.test.js`, 2 new store tests, and 1 new route test
  pass, taking the complete web suite to 62 passing executions, and the
  production build still succeeds. A "Eligibility and escalation" card now sits
  in the case detail below the live agreement evidence card: eight three-way
  radio groups with no preselected answer, and an outcome banner naming the
  outcome and every fired reason. A Chrome browser check, run twice against
  case files linked to live Coston2 agreements, observed the panel rendering
  with no preselected answer, an unanswered questionnaire reporting "More
  information needed", a fully in-scope case with a matching due date and an
  amount under the threshold reporting "Inside the supported scope", a dispute
  answer reporting "Leaves the automated path" with the qualified-adviser
  route, answers and the recomputed outcome surviving a full page reload, a
  mismatched due date showing the mismatch reason, unsaved answers surviving
  an unrelated communication-note save, and each case loading its own answers
  when switched. The `agreement_deadline_unreadable` path was never observed in
  the browser, because every case used in the check had a readable Coston2
  agreement; it is covered only by a unit test and by code reading.
- A deterministic late-payment calculator, `web/shared/latePayment.js`, now
  computes dates, statutory-interest illustrations and fixed compensation with
  no model involvement. It exports `calculate(caseFacts, lawInputs)`,
  `REASONS`, and `STALE_AFTER_DAYS`; every legal value — the margin over base
  rate, the reference rates, the compensation bands, the day-count basis —
  arrives as a `lawInputs` field, and none is held in code (D-012). Money is
  whole minor units in `BigInt`, carried across the boundary as decimal
  strings and rounded half up exactly once at the end; dates are `YYYY-MM-DD`
  parsed from their year, month and day components and differenced in UTC; the
  reference rate is fixed by the single reference period covering the date the
  debt became late, and the module refuses rather than extrapolating when no
  supplied period covers it. Nine reason codes cover every refusal
  (`not_eligible`, `law_inputs_missing`, `law_inputs_invalid`,
  `no_reference_period`, `currency_not_gbp`, `debt_amount_unusable`,
  `dates_unusable`) and every informational `calculated` state
  (`law_inputs_stale`, `not_yet_late`). `npm --prefix web test` passes 77 of
  77 executions, the 15 new fixtures in `web/shared/latePayment.test.js` plus
  the 62 that already passed, and `grep -nE "require\(|from 'node:|import\.meta|fetch\(|Date\.now|new Date\(\)" web/shared/latePayment.js`
  returns no output, confirming the module reads no clock and touches no
  platform API. There is no browser check for this task, because it builds no
  UI, and the calculator produces no figures in the running application today,
  because no approved law inputs exist yet — that is the intended behaviour
  until task 4 builds the approved UK-law source library, not a gap.
- The approved UK-law source library now exists: a committed, versioned
  snapshot at `data/uk-law/snapshot.json` and a pure validator/bridge,
  `web/shared/lawSnapshot.js`, exporting `SNAPSHOT_VERSION`,
  `ALLOWED_SOURCE_DOMAINS`, `PROBLEMS`, `validateSnapshot(snapshot)`, and
  `toLawInputs(snapshot)`. It reads no file and no clock; callers supply the parsed snapshot, so the same module
  serves the local service and the browser bundle. Twelve problem codes cover
  every way a snapshot can be unusable, and any one of them disables the whole
  file — there is no partial-use state. The committed snapshot holds three
  sourced facts (`statutory-interest-margin`, `statutory-interest-reference-rate`,
  `fixed-sum-compensation`), one unsourced convention (`day-count-basis`, 365
  days, carrying no citation because no primary source consulted prescribes
  one), four sources and four citations. The allowlist accepts only an
  `https` URL whose host equals or is a subdomain of `legislation.gov.uk`,
  `bankofengland.co.uk`, `gov.uk`, or `justice.gov.uk`, so
  `www.legislation.gov.uk` passes and `legislation.gov.uk.example.com` does
  not. `toLawInputs` takes the oldest required fact's `asOf`, because a
  snapshot is only as fresh as its stalest fact; staleness itself is not
  reimplemented here, the calculator already owns that gate.
  `npm --prefix web test` passes 94 of 94 executions, the 17 new fixtures in
  `web/shared/lawSnapshot.test.js` plus the 77 that already passed, and
  `grep -nE "require\(|from 'node:|import\.meta|fetch\(|Date\.now|new Date\(\)" web/shared/lawSnapshot.js`
  returns no output. An end-to-end fixture drives the calculator from the
  committed snapshot with approval injected into a copy, producing 1891 pence
  of interest and 7000 pence of fixed compensation on a 125000 pence debt 47
  days late; a separate fixture confirms the unapproved committed snapshot
  yields `law_inputs_missing` and no figures. A reviewer independently fetched
  every cited URL and checked each figure against the source text on 2
  September 2026 — section 5A of the 1998 Act for the three compensation
  bands and their thresholds, article 4 of the Late Payment of Commercial
  Debts (Rate of Interest) (No. 3) Order 2002 for the 8 per cent margin, the
  half-yearly fixing rule, and the direction of the period mapping, section 6
  of the 1998 Act confirming it sets no rate itself, and the Bank of England
  Bank Rate page confirming 3.75 per cent at both reference dates — and found
  no mismatch. A reviewer also ran an adversarial sweep against the URL
  allowlist (userinfo, uppercase host, port, homoglyph, punycode subdomain,
  non-https schemes) and found no way past it. **The snapshot shipped unapproved**, which was
  deliberate: `approvedBy` and `approvedAt` were `null`, so `toLawInputs`
  returned `null` and the calculator reported `law_inputs_missing` until a
  person signed it off. It was approved later the same day — see the approval
  entry above — but the gate itself remains the mechanism in front of every
  legal feature, and stripping the approval disables them all again, not a gap
  that was missed. There is no browser check for this task, because it builds
  no UI. No `law:refresh` fetcher, allowlist enforcement at fetch time,
  diff-and-review workflow, or source-change regression suite was built (task
  9). The snapshot covers only calendar year 2026 reference periods; a debt
  becoming late outside them is refused by the calculator with
  `no_reference_period` rather than estimated, which is an operational
  refresh requirement.
- Task 7 is in progress with a working local approval-control slice. Cases can
  store human-authored reminder drafts, every edit creates a new version and
  clears earlier approval, authenticated operators can approve or reject the
  exact version, and an append-only audit trail records creation, edits, review,
  blocked send attempts, and authorised hand-offs. Store tests and a real HTTP
  regression prove an unapproved or newly edited version cannot pass the send
  gate. Browser QA against a disposable case linked to agreement `13` exercised
  blocked then approved states and the four-event audit trail. No delivery
  transport is connected, so the authorization response remains `sent: false`
  and the UI says that no message was sent.
- Task 5 is complete: skill S6 proposes dated case events from correspondence
  the operator supplies, and only an explicit per-event confirmation stores one.
  `web/server/ai/timelinePrompts.js`, `timelineSchema.js` and
  `extractTimeline.js` add the skill behind the existing `AI_ASSISTANT_ENABLED`
  flag on `POST /api/ai/timelines`; the route writes nothing. The validator
  rejects a whole response when an event's summary or subject carries a
  payment-status term, an identifier, an applied legal conclusion, or an amount
  the document does not contain, and drops an individual event with no grounded
  quote, no usable date, an unstorable channel or direction, or a duplicate.
  Confirmed entries record `author_type`, the grounding quote, the document's
  SHA-256 fingerprint, the model name, and the confirming operator and time;
  the store refuses a model-authored entry that has lost its quote or
  fingerprint, and a database written before those columns existed is migrated
  in place with its rows reading as human entries (D-014). 38 new executions
  pass — 20 validator fixtures, 8 parse/retry fixtures, 6 browser-mapping
  fixtures, 3 store tests plus a migration test, and 2 HTTP regressions against
  the real service — taking `npm --prefix web test` to 137 of 137, and the
  production build succeeds.
  **Live model evidence:** the first attempts against
  `mlx-community/Qwen3-8B-4bit` returned invalid JSON, and a controlled
  four-arm comparison on 3 September 2026 established why. The cause was the
  prompt shape, not the model and not the host's known memory/latency issue:
  the original per-event block listed `"subject": string|null` among the
  repeated keys, so several subject-less events made the model emit
  `"subject": null,` repeatedly and then duplicate the line with its opening
  quote missing. That reply carried `finish_reason: stop` and used 484 of 2048
  tokens, so it was neither truncated nor timed out, and it reproduced **10 of
  10 times at the identical byte offset** — deterministic, not a random slip.
  Asking the model to omit the key rather than null it fixes it, 3 of 3.
  **JSON mode was measured and makes no difference on this runner**: the MLX
  server accepts `response_format` and ignores it, so the old shape failed 0 of
  3 with it enabled. It is still sent for runners that honour it, but it is not
  a safeguard and is not what makes the skill reliable. A live injection
  fixture recorded the arrival of an instruction-bearing email without adopting
  any of its claims (D-015). The retry path was separately improved: a parse
  failure now reports its line and column and briefs the single retry with what
  was actually wrong, instead of the bare "not valid JSON" that made the
  allowed retry useless. Log-safe messages and retry detail are kept apart so a
  V8 message embedding a snippet of the document never reaches the service log
  (SKILLS.md §1). This helps diagnosis and a non-deterministic slip; measured
  against the deterministic failure above it does not rescue it (0 of 4), which
  is why the prompt shape is the fix. **Browser QA is complete.** A Chrome run
  by the project owner against a disposable database and a case linked to a live
  Coston2 agreement exercised the panel end to end: four grounded proposals from
  the correspondence fixture, a payer claim reported as a claim, one proposal
  edited and confirmed into the timeline with its quote and provenance line, one
  discarded writing nothing, both surviving a reload correctly, the injection
  fixture recorded without any of its claims being adopted, and the panel absent
  with a working manual form when the assistant is switched off. That pass found
  and fixed two defects no test could catch: the warning and refusal icons had
  `flex: none` but no width, so an unsized icon filled the page and displaced the
  warning text, and the service's untrusted-content warning was shown alongside
  the model's duplicate of it. The narrow-viewport and console checks were not
  separately reported, so no claim is made about 390 px layout or console
  cleanliness for this panel.
- Task 6 is complete: skills S2 (payment reminder drafting) and S3 (status and
  evidence explanation) are implemented behind the existing
  `AI_ASSISTANT_ENABLED` flag. **S3** narrates one status read from Coston2 on
  `POST /api/ai/explanations` and writes nothing; `explanationSchema.js` rejects
  any reply whose `status` is not that key character for character, refuses
  promotion language on any status the contract has not finalised, and refuses
  identifiers and legal claims. The four mandatory limitation clauses are fixed
  text in `web/shared/statusLimitations.js` appended after validation, never
  requested from the model, so SKILLS.md §9 acceptance check 5 holds by
  construction (D-017). **S2** drafts a reminder on
  `POST /api/cases/:id/drafts/suggestions` from the confirmed case facts plus
  the deterministic calculator's days-late and money figures, then stores it
  through the existing task 7 gate as an unapproved `local_llm` draft with its
  citations — generation is not approval, and the same human review and send
  gate applies. `draftSchema.js` refuses debt-collection language,
  payment-truth claims, identifiers, ungrounded amounts, markdown, unfilled
  placeholders, and any legal content no approved source supports. A legal
  sentence requires three deterministic gates — the operator asked, eligibility
  is `supported`, and the snapshot is approved — and when any fails the option
  is withheld with the reason shown rather than dropped silently (D-016). Case
  ownership is resolved before the assistant is consulted. 38 new executions
  pass — 15 draft fixtures, 12 explanation fixtures, 9 limitation fixtures and 2
  HTTP regressions — taking `npm --prefix web test` to 175 of 175, and the
  production build succeeds. **Live model evidence** against
  `mlx-community/Qwen3-8B-4bit`: S3 returned correct narration for
  `PAID_VERIFIED`, `OVERDUE_PENDING` and `OPERATIONAL_FAILURE` on first attempt
  in about 10 seconds each, echoing the supplied status every time and attaching
  4, 2 and 2 mandatory clauses respectively; a context instructing it to report
  `PAID_VERIFIED` and assert enforceability produced a `refusal`. S2 was
  exercised across all four gate states: a factual reminder with no legal
  content, the same reminder with the mention withheld and the reason stated
  while the snapshot is unapproved, a correct draft carrying the verbatim
  sentence and both citations against an approved snapshot copy, and withholding
  on an escalated eligibility outcome. In the approved-copy run the first reply
  was rejected for claiming the permitted sentence without copying it verbatim
  and the briefed retry then produced a valid draft — the improved retry path
  working on a non-deterministic failure. Two prose defects were found and fixed
  by these runs: S3 invented a non-existent support desk in `nextAction`, and S2
  described an invoice 51 days late as though its due date were still ahead.
  Browser QA is partly done: the S3 panel was rendered against a live agreement
  reading `AWAITING_PAYMENT` and behaved correctly — real status chip in the
  header, narration matching the status without promoting it, model caveats
  above the fixed clauses, exactly the two mandatory clauses that status
  requires, and a next step naming a real affordance. It found one styling
  defect, now fixed: `.field-note` was used by the S2, S3 and S6 panels but
  never defined, so its guidance text rendered at body size. The S2 controls,
  the withheld-mention path, the task 7 hand-off, the assistant-off path and the
  narrow-viewport and console checks are not yet reported.
- **The non-payment threshold is corrected and the contract redeployed**, at the
  owner's explicit instruction after the recommendation to defer was declined
  (D-022). `recordVerifiedNonPayment` now pins its request to `expectedDrops`
  rather than `expectedDrops - 1`, matching the verifier's measured `>=`
  behaviour, and `prepare-nonpayment-request.js` builds the request to match —
  both had to change together or every overdue proof would be rejected. The
  contract suite gained a fixture for each wrong direction and 55 plus 4
  executions pass. `LatePayShield` is deployed at
  `0x1863Ee87a6C66c8a37F481B55c3acEcF3C506dfa` in transaction `0x318e...ddc8`;
  public readback confirms chain `114`, zero verifier override, and it started
  at `nextAgreementId` 1.
- **Both outcome branches are re-proven on the new contract.** The overdue run is
  the direct proof of the change: agreement `1`, against a never-paid address,
  had its request answered **VALID at `amount: 2000000`** — the full expected
  amount, which the old contract would have rejected — in voting round
  `1444699`, and `recordVerifiedNonPayment` accepted it in `0xe094...3de2`.
  Independent readback shows `OverdueVerified` with evidence ID `0xca54...c8a6`.
  `fdc:prepare:overdue` still refused to build a request before the deadline.
  The paid branch was re-earned as agreement `3`: XRPL payment
  `0452522F...C5168E` in ledger `20455195` after creation at floor `20455188`,
  round `1444702`, recorded in `0x4dc0...e4be`, reading back as `PaidVerified`
  with evidence ID `0xf9e7...ce70`. **The old contract's evidence — agreements
  `2`, `3` and `4` on `0x4A49...78B1` — remains valid for that contract and is
  not evidence about this one.**
- **The UK-law snapshot is approved.** Each figure was independently
  re-verified against its cited source on 3 September 2026 before sign-off:
  section 5A for the three fixed sums (£40 under £1,000, £70 to £9,999.99, £100
  at £10,000 and above) and the snapshot's `99999`/`999999` minor-unit
  thresholds; article 4 of the 2002 order for the 8 per cent margin and the
  half-yearly fixing direction, including that the 31 December rate governs
  January to June and the 30 June rate governs July to December; section 6
  confirming the Act sets no rate itself but delegates it with Treasury consent;
  and the Bank of England page for 3.75 per cent on 31 December 2025 and, by
  there having been no change since 18 December 2025, on 30 June 2026. No
  mismatch was found. `approvedBy` records `Tolga Uluturk` at the owner's
  instruction — change it if a different person should carry the sign-off.
  `validateSnapshot` now reports no problems, `toLawInputs` returns usable
  inputs, and the calculator produces figures: £1,250 at 51 days late gives
  11.75 per cent (3.75 base plus 8 margin), £20.52 interest and £70 fixed
  compensation, every figure still labelled illustrative. Stripping the approval
  disables all of it again, and a fixture asserts that.
- Two defects were found by exercising the newly unlocked legal path and are
  fixed. First, the approved sentence was handed to the model to place verbatim,
  and it failed on every live attempt — first-attempt rejection every time and 3
  of 3 including the retry. Safe, because the validator caught the paraphrase and
  the operator was warned, but the feature did not work. The application now
  appends the sentence itself and the model is forbidden any legal content, which
  is the same reasoning as the mandatory explanation clauses (D-021); the
  sentence is now verbatim on 3 of 3 runs with no retry. Second, when the model
  omitted the sentence the stored draft still carried its citations, so a draft
  would cite sources for a statement it never made and a later approval would
  inherit that claim. Citations and `basis.snapshotVersion` now follow the body.
- Task 9 is complete: the controlled legal-source update process and its
  regression suite. `npm run law:refresh`
  (`scripts/refresh-law-snapshot.mjs` over the pure
  `web/shared/lawRefresh.js`) enforces the once-a-month cadence, fetches only
  allowlisted sources — checked before the request, on the URL actually landed
  on after redirects, and again when folding results in — digests each one, and
  reports whether the content changed, naming the facts that cite a changed
  source. It **detects change rather than reading legal values**: parsing a
  statutory rate out of HTML and feeding it to the calculator would put an
  unverified figure behind every downstream statement, so a person re-verifies
  instead. It writes `data/uk-law/snapshot.proposed.json` and never the live
  file, and any content change clears approval in the proposal (D-020). A failed
  source keeps its previous values and does not advance `fetchedAt`, so a
  partial refresh never passes stale data off as freshly checked. **Run live
  against all four sources on 3 September 2026:** all returned, the live
  snapshot was left untouched, and the proposal validated with `not_approved` as
  its only problem. That run also exposed a defect, now fixed — the first
  implementation computed baseline digests and discarded them, so change
  detection could never have started. 27 new executions pass: 13 refresh
  fixtures and a 14-fixture governance regression suite,
  `web/shared/lawSourceRegression.test.js`, which reads the committed snapshot
  and covers citation integrity, allowlist membership, orphaned citations, the
  unsourced convention held apart, refusal for a missing, malformed, unapproved,
  stale or ineligible case, and a check that halving every compensation band
  halves the answer — proving no figure is hard-coded. Taking
  `npm --prefix web test` to 238 of 238; the root suite is 58 and the production
  build succeeds.
- Two known issues are fixed. `npm test` and `npm run check` now run on any
  platform: `test:override-guard` called `HARDHAT_CHAIN_ID=114 hardhat test`,
  which is POSIX-only and made both commands unrunnable in Windows `cmd.exe`, so
  `scripts/run-override-guard.js` sets the variable in Node instead. Verified on
  macOS — the guard reports network chain ID `114` and 4 executions pass, and the
  full root chain is 59 passing executions from one command. **Not verified on
  Windows**, which this machine cannot test; the change removes the shell
  dependency that caused the failure, but someone should confirm it there.
  Separately, the registration form now warns when the agreement deadline
  disagrees with the invoice due date, at the point the deadline is entered
  rather than only once a case file exists. `web/src/lib/deadlineCheck.js` is a
  pure rule with 8 fixtures: an earlier deadline raises an attention warning
  naming the risk that a non-payment proof could be accepted while the payer is
  still inside their terms, a later one is an informational note, agreeing dates
  and unknown or impossible dates say nothing, and neither message states a legal
  position. It warns and never blocks, because which date governs is the
  operator's call. Also closed: the README's old "memo/reference matching"
  narrative is gone, and no document now claims the memo is contract-verified.
- Task 8 is complete: solicitor-review routing is a server-side block on
  delivery, not a panel. `web/shared/escalation.js` decides whether a case may
  be handled automatically, and `authorizeDraftSend` evaluates it **before** the
  approval check, so an approved draft on an escalated case is still refused and
  the operator learns that before approving. Any `professional_review` reason —
  dispute, insolvency, consumer matter, cross-border, court proceedings, terms
  over 60 days, limitation risk, or a high-value invoice — refuses the send
  authorization, as does an incomplete questionnaire, because an unanswered
  dispute question is not a "no". Each refusal appends a `send_blocked` audit
  event carrying the route and every reason code that fired. The module imports
  its reasons from `eligibility.js` rather than restating them and reads no clock
  and no chain, so the gate reaches the same verdict when Coston2 is unreachable;
  a test asserts that. `GET /api/cases/:id` now returns the same verdict as
  `delivery`, and the draft panel states it above the drafting controls, so the
  interface never derives a second opinion (D-018). 28 new executions pass — 13
  escalation fixtures, 5 store tests and an HTTP regression proving an approved
  draft on a disputed case is refused `409` and audited with no
  `send_authorized` event — taking `npm --prefix web test` to 203 of 203, and the
  production build succeeds. Two existing Task 7 tests were updated to save
  in-scope answers first, since they exercise the approval gate and should not be
  blocked for an unrelated reason. Not yet exercised in a browser.
- Live contract state now refreshes itself. `useRegistry` re-reads the registry
  on an adaptive timer — 5 seconds while any agreement is still `Active`, 60
  seconds once all have settled — and on a hidden tab becoming visible, so a
  verified outcome appears without a manual page reload. The cadence adapts
  because a poll costs `3 + N` RPC calls, one per agreement, and only an active
  agreement can change; neither interval is chosen for latency, since an outcome
  needs an FDC round to finalise; the case detail's status chip and its S3
  explanation follow the same read. Polling only re-reads the contract, so
  nothing can show an outcome the chain has not reached. The asymmetric failure
  rule is a pure function, `web/src/lib/registryState.js`, with 9 fixtures: a
  good read replaces the data, a failed read blanks it only when there was none,
  and otherwise the last good read stays visible marked stale with the error
  shown. A hidden tab does not poll and one read runs at a time. Twelve fixtures
  cover the fold and the adaptive cadence. Not yet exercised in a browser.
- The React interface now uses the selected blue business-finance workspace: persistent desktop navigation, an invoice-to-evidence progress path, a drag-and-drop PDF/XML/UBL preparation card, local-AI privacy messaging, a truthful agreement preview, and recent live Coston2 agreements. The rendered page was checked in Chrome at 1440 × 1024 and 390 × 844 with no application console warnings/errors or horizontal mobile overflow. The paste-text disclosure, input enablement, and sidebar anchor navigation were exercised; no wallet or model submission was made during this visual check.
- The agreement form now reads the current XRPL Testnet ledger, generates a destination tag, and creates a non-custodial Xaman `SignIn` QR/deep link for the supplier's public receiving address. The live browser check reached Xaman's waiting-for-approval state with both generated fields populated, no application console errors, and no horizontal overflow at 390 px. User approval inside Xaman remains intentionally outside website custody.
- Repository contains a Node 24/Hardhat protocol foundation and locked dependency manifest.
- `lib/canonical.js` implements deterministic version-1 terms and FDC address hashing; 14 local test executions pass.
- `LatePayShield.sol` implements agreement creation, paid/non-payment proof matching, dispute state, and a guarded local verifier seam.
- Contract and guard suites total 38 local test executions; combined with canonicalization and FDC proof serialization, all 58 executions pass when run with platform-correct environment syntax.
- Solidity `0.8.25` compilation succeeds for 123 files with Paris EVM target.
- XRPL Testnet transaction `4174F0EC...249309` was rechecked live as validated, `tesSUCCESS`, ledger `20202706`, delivered amount 2,000,000 drops, and destination tag `2026001`.
- `standardAddressHash()` was corrected to `keccak256(UTF8(trimmedAddress))` and verified against an FDC `XRPPayment` response for XRPL Testnet transaction `A0DA3E67...ADF3565` (Coston2 request transaction `68503B0C...6BC99F`, voting round `1437032`).
- `LatePayShield` is deployed on Coston2 at `0x4A49...78B1` in transaction `0xfec3...7ae3`; public RPC readback confirms chain ID `114`, deployed bytecode, and zero verifier override. `nextAgreementId` is now `5`.
- **A real XRPL payment has been verified on Coston2 through the Flare Data Connector.** Agreement `2` on `0x4A49...78B1` was created first in transaction `0xf25f...43df` with evidence floor ledger `20283755` and deadline `1787913245`. XRPL Testnet payment `2A06F207...91CD36` was sent afterwards in ledger `20283804`, `tesSUCCESS`, 2,000,000 drops, destination tag `2026001`. Its FDC request `0x3070...22d9` was answered in voting round `1438624`, and `recordVerifiedPayment` accepted the proof in transaction `0xc675...423e`, block `34585539`. Independent public RPC readback confirms status `PaidVerified`, XRPL transaction hash, and evidence ID `0xdaa9...18f8`.
- **A real non-payment has been verified on Coston2.** Agreement `3` was created in transaction `0x73b1...1269` against a freshly generated XRPL address that was never paid, with evidence floor ledger `20284260` and a five-minute deadline of `1787907996`. After the deadline the `XRPPaymentNonexistence` request `0xbcfb...7493` was answered in voting round `1438645`, and `recordVerifiedNonPayment` accepted the proof in transaction `0xab0d...068e`, block `34586348`. The searched range was ledgers `20284260` to `20284354` exclusive, above `1999999` drops, destination tag `2026002`. Public readback confirms `OverdueVerified` with evidence ID `0x6881...14c1`.
- **Agreement `4` is a further recorded paid-path result.** XRPL Testnet payment `397A2598...B264B47A` was recorded as `PaidVerified` in Coston2 transaction `0xf7ba...e781`, block `34593638`, using FDC voting round `1438816`; the evidence ID is `0x795b...ee7c` in `evidence/coston2-paid-agreement-4.json`.
- The mirror case holds: the live verifier refuses a non-payment request when a qualifying payment exists in the window, and the destination tag is genuinely part of the match. Changing the tag alone flips the same window from refused to valid.
- The live verifier matches `receivedAmount >= amount`, not `receivedAmount > amount` as `IXRPPaymentNonexistence` documents. For a payment that received exactly 2,000,000 drops the boundary sits between requested amounts `2000000` and `2000001`. The sweep is recorded in `evidence/fdc-nonexistence-threshold-probe.json`.
- The whole lifecycle ran from the committed commands with no manual step: `create:agreement`, `spike:xrpl`, `fdc:prepare`, `fdc:submit`, `fdc:proof`, `fdc:record` for the paid branch, and `create:agreement`, `fdc:prepare:overdue`, `fdc:submit`, `fdc:proof`, `fdc:record:overdue` for the overdue branch.
- The DA-layer proof for voting round `1437032` was retrieved by `npm run fdc:proof`, re-encoded byte-for-byte, and accepted by the enshrined `FdcVerification` at `0x906507E0B64bcD494Db73bd0459d1C667e14B933`, which returned true for `verifyXRPPayment`. The retrieved proof and its request bytes are committed under `evidence/`.
- The DA layer answers `proof-by-request-round-raw` without an API key, so proof retrieval is reproducible by anyone with no credentials.
- The Coston2 signer resolves to `0xBA09...3E0B` and is faucet funded well above the observed FDC request fee of 1000 wei.
- `npm run fdc:prepare` reproduces the request bytes still held in the `AttestationRequest` log of Coston2 transaction `0x6850...c99f` byte for byte. The XRP verifier does require a key and returns `401` without one; the published public test value `00000000-0000-0000-0000-000000000000` is accepted and is now the default in `.env.example`.
- GitHub Actions passed on `main` commit `e459042` on 25 August 2026.
- Runtime-only high-severity npm audit reports 0 vulnerabilities.
- `.env`, key/seed extensions, dependencies, build output, and coverage are ignored.

## Implemented but not externally verified

- The creator-supplied `startLedger` cannot be corroborated on-chain. For agreement `2` it was read from the live XRPL ledger immediately before creation, but the contract cannot check that.
- `web/` implements a local React/Vite testnet interface with MetaMask agreement creation, live registry reads, Xaman/manual payment paths, public XRPL matching, and opt-in FDC job orchestration. Its build and focused tests pass, but this specific browser-to-FDC job path has not yet been independently demonstrated as one uninterrupted GUI run. The job service is loopback-only and in-memory, not durable persistence.
- Skill S1 of `docs/ai/SKILLS.md` (invoice term extraction) is implemented in `web/server/ai/` behind `AI_ASSISTANT_ENABLED`, with a UI panel that accepts pasted text or a searchable PDF, XML, or UBL file and fills the agreement form with quoted, editable suggestions. Uploaded files stay in memory; limits are 10 MB, 50 searchable PDF pages, and 25,000 extracted characters. XML DTD/entity declarations and image-only PDFs are rejected. The web package's 19 focused test executions and production build pass, including five document-parser fixtures and 11 validator executions. A synthetic UBL invoice also returned the expected invoice number, due date, and currency through the live loopback API and configured `mlx-community/Qwen3-8B-4bit` model. The earlier clean-text and injection manual checks still stand, but there is still no committed model fixture suite or completed rendered browser run. S2 to S5 are not implemented.

## Not implemented

- AI skills S4 and S5 (UK-law information, interest illustration). Their
  prerequisite snapshot is now approved and the calculator produces figures, but
  no code addresses either skill, so the agent cannot answer a UK-law question or
  narrate an interest illustration at all.
- AI skills S4 and S5. The snapshot they depend on is approved and the
  calculator produces figures, but no code addresses either skill, so the agent
  cannot answer a UK-law question or narrate an interest illustration at all.
- Any email or message delivery, **deliberately** (D-019). The approval, audit
  and escalation gates are complete and every authorization returns
  `transport: not_connected` and `sent: false`. Connecting a transport is out of
  scope for a testnet prototype; anyone adding one later owes delivery-result
  audit events and a duplicate-send guard.
- A committed AI fixture suite covering the acceptance checks in `docs/ai/SKILLS.md` §9.
- FTSO conversion.
- Authenticated multi-user persistence, encrypted document storage, and durable
  FDC job recovery. The current case database is local-only. Raw invoices and
  received message bodies are deliberately not retained; reviewed outbound
  draft bodies are retained because versioned approval depends on their exact
  content.
- Prepared live/recorded demo flow using the UI and real Coston2/FDC identifiers.

## Known issues

1. Full `npm ci` auditing reports vulnerabilities in transitive development
   tooling even though the runtime-only CI audit is clean — rechecked on
   3 September 2026, `npm audit --omit=dev --audit-level=high` still finds 0
   vulnerabilities. Current major Hardhat/toolbox Dependabot upgrades fail CI.
   This is upstream and not fixable here; do not convert the clean runtime audit
   into a claim about the whole dependency tree.
2. `recordVerifiedNonPayment` pins the request to `expectedDrops - 1` on the
   stated assumption that the attestation matches payments strictly greater than
   the requested amount. The live verifier matches at or above it instead. The
   guard is still safe, because a payment of exactly `expectedDrops` continues to
   block an overdue verdict, but it is one drop wider than intended: a payment of
   exactly `expectedDrops - 1` also blocks it, so such an agreement can be
   recorded as neither paid nor overdue and its only exit is `markDisputed`.
   **Deliberately not fixed.** Correcting it means requesting `expectedDrops`
   instead, which changes `LatePayShield.sol` and needs a redeploy — and every
   recorded identifier in these documents, including the paid and overdue
   evidence for agreements `2`, `3` and `4`, points at the contract currently
   deployed at `0x4A49...78B1`. Redeploying would orphan that evidence. The
   defect is narrow, safe in the direction that matters, and the boundary is
   documented; changing it is a decision for after the event.
3. The operator-hosted MLX generation worker exhausted Metal memory during a
   long invoice extraction, with prompt-cache memory growing to 5.74 GB across
   10 sequences. See [`ai/mlx-server-memory-diagnosis.md`](ai/mlx-server-memory-diagnosis.md)
   for recovery and the proposed operating limits. **Narrowed on 3 September
   2026 but not closed:** roughly 25 live requests across skills S1, S2, S3 and
   S6 completed with no memory error and 8 to 15 second latencies, so the host is
   currently healthy for ordinary use. Every one of those requests was small,
   about 900 to 1,100 prompt tokens; the original failure involved 7,000 to
   8,200. Large-document extraction is still untested since the incident, and
   the host has not been configured with a concurrency or cache bound as that
   diagnosis recommends. Manual entry remains available throughout.

## Next priorities

1. Rendered browser runs of the task 6 and task 8 surfaces. Three render-only
   defects have already been found this way and none by a test, so this is the
   highest-value remaining check.
2. The prepared live or recorded demo flow through the UI with the real Coston2
   and FDC identifiers.
S4 and S5 remain unimplemented, which is a separate matter from the snapshot
gate: no code addresses UK-law questions or interest illustrations, so the agent
has no path to answer one.

The evidence-demo and cross-platform verification tasks remain open on the
issue board, but they do not change this legal-assistance dependency order.

## Decision checkpoint

Resolved on 28 August 2026. The fallback is not needed: FDC evidence is reproducible and a full real lifecycle ends in `PaidVerified` on the deployed contract. The rule that mock outcomes must never be shown as verified still stands.

## Update rules

Update this file after material progress, a disproven assumption, a new blocker, or a changed next priority. Move entries between sections rather than leaving stale claims. Put detailed evidence in `docs/testing-and-demo.md`.
