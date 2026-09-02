# Project Status

**Last updated:** 2 September 2026
**Phase:** Both outcome branches proven on testnet; local AI extraction and confirmed case files wired into the UI
**Current base:** Remote `main` commit `2efb083`

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
  them driving the real service over HTTP; the complete web suite is now 46
  passing executions and the production build still succeeds. A hand-run
  `npm start` on a scratch database confirmed the served page carries the
  generated token, that `GET /api/cases` without it returns `401` and with it
  returns an empty list, and that a cross-origin `text/plain` `POST` returns
  `403`. This closes
  [`security/missing-case-api-access-control.md`](security/missing-case-api-access-control.md).
  Multi-user identity and encryption at rest remain later work.
- A local SQLite case-file slice now stores human-confirmed invoice facts,
  source quotes/fingerprints, and communication notes while joining live
  XRPL/FDC outcome data by Coston2 agreement ID. Raw invoice text remains
  request-only. Five store tests and four case-draft/handoff tests pass; the complete web
  suite now has 46 passing executions and the production build succeeds. After
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
  non-https schemes) and found no way past it. **The snapshot is not
  approved**: `approvedBy` and `approvedAt` are `null`, so `toLawInputs`
  returns `null` and the calculator reports `law_inputs_missing` until a
  person signs it off — this gates every downstream legal-information and
  calculation feature and is recorded here as an outstanding item, not a gap
  that was missed. There is no browser check for this task, because it builds
  no UI. No `law:refresh` fetcher, allowlist enforcement at fetch time,
  diff-and-review workflow, or source-change regression suite was built (task
  9). The snapshot covers only calendar year 2026 reference periods; a debt
  becoming late outside them is refused by the calculator with
  `no_reference_period` rather than estimated, which is an operational
  refresh requirement.
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

- AI skills S2 to S5 (reminder drafting, status explanation, UK-law information, interest illustration).
- `npm run law:refresh`, its fetcher, allowlist enforcement at fetch time, and
  the diff-and-review workflow (task 9). S4 and S5 stay disabled while the
  committed snapshot remains unapproved.
- A committed AI fixture suite covering the acceptance checks in `docs/ai/SKILLS.md` §9.
- FTSO conversion.
- Authenticated multi-user persistence, encrypted document storage, and durable
  FDC job recovery. The current case database is local-only and raw invoice and
  message bodies are deliberately not retained.
- Prepared live/recorded demo flow using the UI and real Coston2/FDC identifiers.

## Known issues

1. `npm run check` and `npm test` fail at the override-guard step in Windows `cmd.exe` because the package script uses POSIX environment assignment. The underlying guard tests pass with PowerShell syntax.
2. Full `npm ci` auditing reports vulnerabilities in transitive development tooling even though the runtime-only CI audit is clean. Current major Hardhat/toolbox Dependabot upgrades fail CI.
3. README's original “memo/reference matching” narrative exceeded the contract: the memo is captured in XRPL evidence but is not checked by `LatePayShield.sol`.
4. `recordVerifiedNonPayment` pins the request to `expectedDrops - 1` on the stated assumption that the attestation matches payments strictly greater than the requested amount. The live verifier matches at or above it instead. The guard is still safe, because a payment of exactly `expectedDrops` continues to block an overdue verdict, but it is one drop wider than intended: a payment of exactly `expectedDrops - 1` also blocks it, so such an agreement can be recorded as neither paid nor overdue and its only exit is `markDisputed`. Correcting it means requesting `expectedDrops` instead, which changes the contract and needs a redeploy.
5. The operator-hosted MLX generation worker exhausted Metal memory during a long invoice extraction. The endpoint remained reachable, but prompt-cache memory grew to 5.74 GB across 10 sequences and generation failed with `Insufficient Memory`. See [`ai/mlx-server-memory-diagnosis.md`](ai/mlx-server-memory-diagnosis.md) for recovery and the proposed operating limits. Until the Mac mini host is restarted and bounded, large AI extraction requests may time out or fail; manual entry remains available.
6. The current registration form can still accept a contract deadline earlier
   than the invoice due date carried into the case file, and neither field
   blocks confirmation. The eligibility questionnaire now surfaces that
   mismatch, as the `due_date_mismatch` reason in its outcome banner, once a
   case is opened, but registration itself still gives no warning at the point
   the dates are entered.

## Next priorities

1. Approve the committed UK-law snapshot — a person must set `approvedBy` and
   `approvedAt` in `data/uk-law/snapshot.json` after checking each figure
   against its source. Until that happens `toLawInputs` returns `null` and
   the calculator reports `law_inputs_missing` for every case; this gates
   every downstream legal-information and calculation feature.
2. Once approved, extend the local LLM with confirmed timeline extraction,
   source-grounded explanations and reminder drafts (tasks 5-6 of the build
   order).
3. Add approval/audit/send controls, solicitor-review routing, and the controlled
   source-update regression suite in the order recorded in
   [`plans/legal-assistance-build-order.md`](plans/legal-assistance-build-order.md)
   (tasks 7-9).

The evidence-demo and cross-platform verification tasks remain open on the
issue board, but they do not change this legal-assistance dependency order.

## Decision checkpoint

Resolved on 28 August 2026. The fallback is not needed: FDC evidence is reproducible and a full real lifecycle ends in `PaidVerified` on the deployed contract. The rule that mock outcomes must never be shown as verified still stands.

## Update rules

Update this file after material progress, a disproven assumption, a new blocker, or a changed next priority. Move entries between sections rather than leaving stale claims. Put detailed evidence in `docs/testing-and-demo.md`.
