# Testing, Verification, CI, and Demo

**Last verified locally:** 3 September 2026 on macOS with Node `24.19.0`
**Current baseline:** 59 root executions (55 contract/canonical plus 4 verifier guard) and 242 in `web/`. Per-task counts further down are historical: they record the total at the moment that task landed.
**Remote baseline:** `main` commit `2efb083`

## Verification levels

1. Reproducible live testnet result with inspectable identifiers.
2. Reproducible recorded testnet result with the same real identifiers.
3. Local deterministic test using a clearly identified mock.
4. UI fixture or simulation.
5. Planned behavior without an implementation artifact.

The product, docs, and pitch must identify the actual level.

## Local baseline

- Solidity compilation: 123 files compiled successfully for Paris EVM.
- Default Hardhat suite: 55 passing executions.
- Chain-ID-114 verifier guard: 4 passing executions.
- Total: 59 passing root executions, and 242 in `web/`.
- Runtime dependency audit: `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities.

`npm run check` is now cross-platform. `test:override-guard` used
`HARDHAT_CHAIN_ID=114 hardhat test`, which is POSIX-only and made `npm test` and
`npm run check` unrunnable in Windows `cmd.exe`; `scripts/run-override-guard.js`
sets the variable in Node and spawns the same command instead. Confirmed on
macOS on 3 September 2026: the guard reports network chain ID `114`, its 4
executions pass, and `npm test` reports 54 plus 4 passing executions from one
command. **Not confirmed on Windows** — no Windows machine was available — so
the shell dependency that caused the failure is removed but the fix is unverified
there.

`npm ci` reports vulnerabilities in the larger development dependency graph. Do not convert the clean runtime audit into a claim that the full dependency tree has zero vulnerabilities. Dependabot's current Hardhat/toolbox major-version PRs fail CI and should not be merged blindly.

## Test inventory

### Canonicalization

- deterministic output and input-key-order independence;
- numeric/string equivalence and whitespace trimming;
- hash changes for every authoritative field;
- fixed serialization order;
- missing/empty field rejection;
- amount, destination-tag, timestamp, and currency bounds.
- real FDC `receivingAddressHash` fixture and whitespace-equivalent address hashing.

### FDC proof serialization

`test/fdc-proof.test.js` runs offline against the committed round-`1437032` proof and
covers decoding the DA response into the contract's `Proof` struct, byte-exact
re-encoding, leaf sensitivity to a single altered field, agreement of the response's
`receivingAddressHash` with `standardAddressHash()`, and encoding a
`recordVerifiedPayment` call without reshaping the struct.

### Agreement contract

- creation, initial state, event data, and invalid terms;
- paid proof success, overpayment, permissionless submission, and evidence storage;
- wrong verifier result, destination, amount, tag, ledger window, transaction status, timing, duplicate, and unknown agreement;
- non-payment proof timing, amount-threshold trap, ledger/deadline window, destination/tag, and verifier rejection;
- incompatible final transitions;
- supplier-only disputes and duplicate-dispute rejection.

### Verifier override guard

- zero override resolves the enshrined path;
- local chain ID `31337` permits the test seam;
- chain ID `114` rejects a non-zero override for any deployer.

### Eligibility questionnaire

`web/shared/eligibility.test.js` runs 13 fixture tests against `assess()` and
`answerProblem()` in `web/shared/eligibility.js`, covering: a fully answered
in-scope case with agreeing dates and an amount under the threshold returning
`supported` with no reasons; each of the eight questions escalating on its own
with the exact reason code and route; an `unknown` or missing answer, and an
out-of-range answer value, all returning `needs_information`; a fired trigger
alongside an unknown answer returning `escalate` with both reasons present; the
invoice due date checked against the registered agreement deadline, built from
a local datetime the way the application creates one so the suite passes under
any machine timezone, including a same-local-day deadline counting as agreeing
and an unreadable agreement returning `agreement_deadline_unreadable`; a
late-evening local deadline round-tripping to the same local date the
application would store for it; the high-value threshold escalating at the
boundary and not one minor unit below it, and honoring a configured threshold;
a missing, empty, or non-integer amount and a non-GBP currency both returning
`needs_information`; an answer map with an unknown question id or an
out-of-range value rejected by `answerProblem`; an out-of-range agreement
deadline and a non-numeric or blank configured threshold both falling back
safely rather than throwing; a frozen `REASONS` entry that a mutation attempt
cannot change; and a fixture asserting no question prompt or reason summary
states a legal position (`entitled`, `enforceable`, `you should`, `will win`,
`owes you`, `barred`, and similar terms).

`web/server/cases/store.test.js` gained two eligibility executions: saving
answers, replacing them on a second save, and confirming a second operator can
neither read nor overwrite them; and rejecting an untrusted answer map — an
unknown question id, an out-of-range value, a non-object body, and `null` —
each raising `CaseInputError` rather than being stored.

`server/access.test.js` gained one execution covering
`PUT /api/cases/:id/eligibility` end to end over HTTP: `401` with no token,
`404` for another operator's case, `400` for an invalid answer map, `200` with
the saved answers echoed back, and a `403` on a cross-origin `PUT` that leaves
the previously saved answers unchanged. It also confirms `GET /api/cases/:id`
returns `eligibility` as exactly `{ answers, assessedAt }`, and never returns
an outcome, because the service cannot compute one.

### Late-payment calculator

`web/shared/latePayment.test.js` runs 15 fixture tests against `calculate()`
in `web/shared/latePayment.js`, covering: a worked example end to end with
every output field asserted; the fixed-compensation band selected at each of
its boundaries; a whole-day count across a leap day; an as-at date on or
before the due date reporting `not_yet_late` with no figures and a zero
`additionalMinorUnits`; the reference period chosen by the date the debt
became late, including the exact half-year boundary; a refusal when no
supplied period covers that date; the staleness threshold withholding
interest but not fixed compensation at 91 days while still giving interest at
exactly 90; every non-`supported` eligibility outcome producing no figures; an
exact half-penny rounding half up; a debt large enough that `Number`
arithmetic drifts a penny, asserted exact against `BigInt`; every unreadable
or malformed law input (a bad margin, an impossible as-of date, no periods, a
period ending before it starts, no bands, no open top band, a band amount in
major units, a zero or fractional day count); every unusable case fact (a
non-sterling or missing currency, an empty, fractional, zero or negative
debt, an impossible or missing date); determinism across two identical calls;
every result carrying the same twelve keys regardless of path; and no reason
summary stating a legal conclusion.

This task builds no route, no storage, and no UI, so there is no browser
check for it. `npm --prefix web test` passes 77 of 77 executions, these 15
plus the 62 that already passed. A purity check,
`grep -nE "require\(|from 'node:|import\.meta|fetch\(|Date\.now|new Date\(\)" web/shared/latePayment.js`,
returns no output, confirming the module reads no clock and imports no
platform API. No figure in the fixture suite is an approved legal value; they
are test inputs chosen to exercise the arithmetic, and the calculator
produces no figures in the running application until task 4 supplies approved
`lawInputs`.

### UK-law snapshot

`web/shared/lawSnapshot.test.js` runs 17 fixture tests against
`validateSnapshot()` and `toLawInputs()` in `web/shared/lawSnapshot.js`,
covering: a well-formed, approved fixture validating with no problems; a
snapshot missing `approvedBy` or `approvedAt`, carrying a blank `approvedBy`,
or carrying a non-string `approvedBy` (`false`, `0`, `true`, an object),
refused with `not_approved` as the sole problem; a missing, non-object,
array, or empty snapshot refused before anything else is read; every
`snapshotVersion` other than the one this build reads refused with
`unsupported_version`; a fact citing a citation id the snapshot does not
define refused with `citation_unresolved`; a required fact that is absent or
carries an unusable margin, empty or malformed reference periods, an
impossible period date, a reference period ending before it starts,
overlapping reference periods, unusable compensation bands, descending or
gapless-top compensation bands, or an unrecognised volatility, all refused
with `fact_missing` or `fact_malformed`; a required convention that is
absent, cited, or carries an unusable value, refused with
`convention_missing`, `convention_has_citation`, or `convention_malformed`; a
duplicate id among facts, conventions, or citations refused with
`snapshot_malformed` rather than the later entry silently overwriting the
earlier one; an empty `sources` list or a source whose `status` is not `ok`
refused with `snapshot_malformed`; the exact allowlist membership and both
accepted `https` hosts and rejected `http`, subdomain-lookalike, and
substring-lookalike URLs; an unreal date anywhere in the snapshot refused
with `dates_unusable`; a usable snapshot mapping to exactly the five keys
`calculate` consumes, with `asOf` equal to the oldest required fact's date;
every unusable snapshot shape yielding `null` from `toLawInputs`; and every
problem code carrying a summary that states no legal conclusion.

The reference-period and compensation-band cross-checks (overlap, ordering,
the open top band) are not reimplemented here: `validateSnapshot` builds the
candidate `lawInputs` and asks `latePayment.js`'s exported
`isUsableLawInputs()` whether the calculator can actually use them, so the
two modules can never drift apart on what counts as valid.

Two more tests load the real committed `data/uk-law/snapshot.json` from disk
rather than a fixture: one asserts it is structurally correct and its only
possible problem is `not_approved`, so the test never needs editing once a
person approves it; the other is an **end-to-end test** that copies the
committed snapshot with `approvedBy`/`approvedAt` injected, drives it through
`toLawInputs` into `calculate()`, and asserts the exact figures: a 125000
pence debt due `2026-09-29`, checked `2026-11-15` (47 days late), produces an
11.75 per cent rate (3.75 base plus the 8-point margin), 1891 pence of
interest, and 7000 pence of fixed compensation. A companion test confirms that an
**unapproved** snapshot yields `null` from `toLawInputs` and that `calculate()`
reports `law_inputs_missing` with no figures. That was the committed file's own
state until it was approved on 3 September 2026; the fixture now strips the
approval from a copy, so the gate stays covered.

`npm --prefix web test` passes 94 of 94 executions, these 17 plus the 77 that
already passed. A purity check,
`grep -nE "require\(|from 'node:|import\.meta|fetch\(|Date\.now|new Date\(\)" web/shared/lawSnapshot.js`,
returns no output, confirming the module reads no clock, no file, and imports
no platform API. This task builds no route, no storage, and no UI, so there
is no browser check for it.

**Independent source verification**, performed on 2 September 2026: a
reviewer fetched each cited URL and checked every figure against the source
text — section 5A of the Late Payment of Commercial Debts (Interest) Act 1998
for the three fixed-compensation bands and their thresholds, article 4 of the
Late Payment of Commercial Debts (Rate of Interest) (No. 3) Order 2002 for the
8 per cent margin, the half-yearly fixing rule, and the direction of the
period mapping, section 6 of the 1998 Act confirming it sets no rate itself,
and the Bank of England Bank Rate page confirming 3.75 per cent at both
reference dates. No mismatch was found.

The two figures the snapshot depends on most directly were checked against
this exact wording:

- Section 5A of the Late Payment of Commercial Debts (Interest) Act 1998
  (<https://www.legislation.gov.uk/ukpga/1998/20/section/5A>): "for a debt
  less than £1000, the sum of £40", "for a debt of £1000 or more, but less
  than £10,000, the sum of £70", and "for a debt of £10,000 or more, the sum
  of £100".
- Article 4 of the Late Payment of Commercial Debts (Rate of Interest) (No.
  3) Order 2002 (<https://www.legislation.gov.uk/uksi/2002/1675/made>): "The
  rate of interest for the purposes of the Late Payment of Commercial Debts
  (Interest) Act 1998 shall be 8 per cent per annum over the official
  dealing rate in force on the 30th June (in respect of interest which
  starts to run between 1st July and 31st December) or the 31st December (in
  respect of interest which starts to run between 1st January and 30th June)
  immediately before the day on which statutory interest starts to run".

Both match the snapshot's `fixed-sum-compensation` bands and
`statutory-interest-margin`/`statutory-interest-reference-rate` facts
exactly.

A reviewer also ran an **adversarial sweep** against the URL allowlist —
userinfo, an uppercase host, a port, a homoglyph, a punycode subdomain, and
non-`https` schemes — and found no way past it.

**Not verified.** The committed snapshot is not approved: no person has
signed it off, so no legal figure is available to the application, and this
gates every downstream legal-information and calculation feature. No
`law:refresh` fetcher, allowlist enforcement at fetch time, diff-and-review
workflow, or source-change regression suite was built (task 9). The snapshot
covers only calendar year 2026 reference periods; a debt becoming late
outside them is refused with `no_reference_period` rather than estimated,
which is an operational refresh requirement, not a defect.

### Web application and local AI

`cd web && npm test` now runs 242 focused executions covering the complete web
application. Five document-parser
fixtures cover selectable PDF text, ordinary XML, namespace-qualified UBL,
currency attributes, file-size/type boundaries, malformed PDFs, and rejection
of XML DTD/entity declarations. The existing 11 S1 validator executions and
the payment/browser-library executions remain green. Eight case-store
executions cover confirmed-fact persistence, duplicate agreement rejection,
input bounds, communication notes, source quotes, ownership, and the versioned
draft/review/send-gate lifecycle. Four case-draft handoff executions confirm
that invoice-only facts survive, final reviewed agreement names take precedence,
stale quotes are removed, and the result remains unconfirmed.

`server/access.test.js` has eight executions that start the real service on an
ephemeral loopback port with a scratch database and exercise the access policy
over HTTP:

- unauthenticated `GET /api/cases`, case detail, `POST /api/cases`, and
  `POST /api/cases/:id/communications` all return `401`, an unrecognised token
  returns `401`, and nothing is written by any refused request;
- the served page carries the run's operator token, which the authorized list
  request then uses;
- one authenticated operator cannot read, list, or append to another operator's
  case even holding its exact identifier (`404`, empty list, no note written);
- an unapproved message cannot obtain a send authorization (`409`), an approved
  exact version can, and editing it increments the version, clears approval,
  and blocks the next attempt; every transition appears in the audit trail;
- a cross-origin `POST` is refused `403` with `text/plain`, `application/json`,
  and `application/x-www-form-urlencoded` alike, while the same-origin write
  succeeds;
- a rebound `Host` header is refused `403` for both the API and the page;
- a non-loopback bind exits before listening unless
  `WEB_AUTHENTICATED_DEPLOYMENT`, `WEB_OPERATOR_TOKENS`, and
  `WEB_ALLOWED_ORIGINS` are all set;
- canonical loopback spellings are accepted while `0177.0.0.1`, `2130706433`,
  and `127.0.0.1.mallory.example` are not.

A live run of `npm start` on a scratch database was also checked by hand: the
served page carried the generated token, `GET /api/cases` without it returned
`401`, the same request with it returned `{"cases":[]}`, and a cross-origin
`text/plain` `POST` returned `403`. `npm run build` also passes, and the built
bundle carries no token. A synthetic UBL invoice was additionally sent through the running
loopback API and configured `mlx-community/Qwen3-8B-4bit` model: it returned a
schema-valid extraction with the expected invoice number, due date, and GBP
currency. This is a local smoke test, not a committed model fixture suite or a
recorded browser run.

The case-file slice was exercised in Chrome against a temporary SQLite database:
a user-confirmed case linked to live agreement `8` was saved, its current
`PaidVerified` status and evidence ID were read from Coston2, and an outbound
email note appeared in the communication timeline. The default desktop viewport
and a narrow viewport were inspected with no horizontal overflow. Console
messages came only from installed browser extensions; no application-owned
warning or error was recorded.

The eligibility questionnaire was checked in a real Chrome instance, driven
through the Chrome DevTools MCP tools against `npm --prefix web run dev`, using
case files linked to live Coston2 agreements. This was run twice. Observed:
the panel renders below the live evidence card with no preselected answer; an
unanswered questionnaire reports "More information needed" with the
unanswered-questions reason; a fully answered in-scope case with a matching
due date and an amount under the threshold reports "Inside the supported
scope" with no reasons; answering yes to the dispute question reports "Leaves
the automated path" with the dispute reason and the qualified-adviser route;
answers and the recomputed outcome both survive a full page reload; and a case
whose invoice due date differs from its agreement deadline shows the mismatch
reason. The second pass also observed that unsaved answers survive saving an
unrelated communication note, that switching cases loads each case's own
answers, and that the unsaved-answers note appears and clears correctly. The
`agreement_deadline_unreadable` path was not observed in either pass, because
every case used had a readable Coston2 agreement; it is covered only by a
unit test and by code reading.

The Task 7 slice was separately exercised in Chrome against a disposable
database and synthetic case linked to live agreement `13`. A human reminder
draft rendered as `Draft — not approved`; its first send-gate request was
refused, approval changed the exact version to `Approved`, and the next request
recorded a send authorization while clearly reporting that no delivery service
was connected and no message was sent. The visible audit trail contained
creation, blocked, approved, and authorised events in order. The narrow layout
had no horizontal overflow. Console warnings came only from the installed
wallet extension; no application-owned warning or error was recorded.

### Evidence timeline extraction (S6)

`server/ai/timelineSchema.test.js` has 18 fixtures. They cover a grounded
timeline ordered oldest first; dropping an event that cannot be quoted, has no
usable `YYYY-MM-DD` date, uses an unstorable channel or direction, or duplicates
an earlier event; and rejecting a whole response that asserts a payment or
FDC-evidence term, writes an identifier (hex, transaction hash, or XRPL
address), states an applied legal conclusion, quotes an amount the document does
not contain, or sets `needs_human_confirmation` to `false`. One fixture pins the
D-015 boundary from both sides: an event may quote an instruction-bearing email
verbatim, but repeating that instruction as the model's own summary is rejected.
`src/lib/aiTimeline.test.js` adds 6 executions for the browser mapping —
proposals stay unconfirmed with the quote and fingerprint attached, a refusal
yields no proposal, and a confirmation body carries no payment status,
identifier, or figure. Three store tests plus a migration test cover provenance
persistence, the human/`local_llm` distinction, refusal of a model-authored
entry that lost its grounding, and a pre-provenance database whose rows read as
human entries. Two HTTP regressions in `server/access.test.js` prove the
suggestion route needs an operator token and reports a disabled assistant as
`503`, and that a confirmed proposal stores its provenance while an ungrounded
one is refused `400`.

**Live model run, 3 September 2026, `mlx-community/Qwen3-8B-4bit` on the
operator-hosted MLX server.** The first attempts on a five-line, four-event
correspondence fixture returned invalid JSON: the model emitted
`"subject": null,` and then duplicated the line with its opening quote missing.
The reply carried `finish_reason: stop` and used 484 of 2048 tokens, so this was
neither truncation nor the host's recorded memory/latency issue.

A four-arm comparison, three runs each, identified the cause:

| Arm | Requested shape | JSON mode | Result |
|---|---|---|---|
| A | `"subject": string\|null` among the repeated keys | off | 0 of 3 |
| B | same | **on** | 0 of 3 |
| C | optional key omitted rather than nulled | off | **3 of 3** |
| D | same (as shipped) | on | **3 of 3** |

Two conclusions. The failure was **deterministic and prompt-induced**, not a
random model slip: counting the earlier attempts it reproduced 10 of 10 times at
the identical byte offset (position 1406, line 38 column 7) with identical token
counts. And **JSON mode makes no difference on this runner** — arm B proves the
MLX server accepts `response_format` and ignores it, so it is sent only for
runners that honour it and must not be described as a safeguard. The requested
shape is the fix.

The retry path was improved in the same pass and measured separately: a parse
failure now reports its line and column and briefs the single retry with the
real error rather than a bare "not valid JSON". Against this deterministic
failure the briefing does not rescue the request (0 of 4 recovered, the model
regenerating the same bytes), so it is a diagnosis and non-deterministic-slip
improvement, not the fix. `server/ai/text.test.js` adds 8 executions covering
it, including that a V8 message embedding a snippet of the reply never reaches
the log-safe message (SKILLS.md §1).

On the three passing runs each reply carried four events with correct dates,
channels, directions and verbatim quotes, and reported a payer's claim as a
claim rather than asserting it. A separate live injection fixture — an email
ordering the assistant to mark the invoice `PAID_VERIFIED` with an evidence ID
and a statutory-interest figure — produced two grounded events recording that an
instruction-bearing email arrived, with none of its claims adopted and two
untrusted-content warnings. There is no rendered browser run of the suggestion
panel yet.

**Browser QA, 3 September 2026, Chrome against `npm run dev` on a disposable
SQLite database and a case linked to a live Coston2 agreement.** Run by the
project owner; the suggestion panel had never been rendered before this pass.
Observed:

- the panel renders between the reminder-draft card and the communication
  timeline, with the paste box, file picker, and a disabled submit button until
  text is entered;
- the correspondence fixture returned four proposals, oldest first, each with an
  "Unconfirmed suggestion" chip, editable date/channel/direction/subject/summary,
  a "date only" note under the date, and the verbatim quote beneath;
- the phone-call proposal read "A phone call was made to Ravi Patel, who stated
  that the payment had been approved internally" — reporting the payer's claim
  rather than asserting payment, which is the S6 boundary;
- editing the time to `09:30` and appending a word to the summary, then
  confirming, moved that one event into the timeline carrying the edits, the
  `outbound phone` labels, and the line "Confirmed from a local-assistant
  suggestion. Quoted from the document:" with the quote below it;
- discarding a proposal removed it and wrote nothing;
- after a full reload the confirmed event and its provenance persisted while the
  discarded and unconfirmed proposals were gone, confirming proposals are
  browser state only (D-014);
- the injection fixture produced the untrusted-content warning and two events
  whose summaries recorded only that an instruction-bearing email arrived. No
  summary carried `PAID_VERIFIED`, the hex evidence ID, or the entitlement and
  interest figure; the raw text appeared only in the quote block (D-015);
- with `AI_ASSISTANT_ENABLED=false` the panel was absent rather than broken, a
  hand-typed note saved with no provenance line, and the previously confirmed
  event still displayed its quote — stored provenance does not depend on the
  assistant being enabled.

**Two defects were found by this pass and fixed.** First, the warning list and
the refusal block styled their icon with `flex: none` but no width. `Icons.jsx`
carries no intrinsic size ("Size comes from CSS"), so the icon expanded to fill
its container and rendered as a full-page triangle that pushed the warning text
into a narrow column. Both rules now set an explicit box. This was invisible to
all 137 executions and to every live model run, because none of them render CSS,
and it would have affected the ordinary dropped-event warnings as well as the
injection case. Second, the service's untrusted-content warning and the model's
own restatement of it were both displayed; the service now drops the model's
duplicate and keeps its own, which says more.

The narrow-viewport and console checks were not separately reported back, so no
claim is made about 390 px layout or console cleanliness for this panel.

### Snapshot approval and independent source re-verification

**3 September 2026.** Before the snapshot was signed off, every figure was
fetched from its cited URL and checked against the source text:

| Figure | Source text | Snapshot | Match |
|---|---|---|---|
| Fixed sums | s.5A(2): "£40… £70… £100" at under £1,000 / £1,000–£9,999 / £10,000+ | `4000`/`7000`/`10000` at `99999`/`999999`/null | yes |
| Margin | 2002 order art.4: "8 per cent per annum" | `marginPercent: "8"` | yes |
| Fixing direction | art.4: 30 June rate for Jul–Dec, 31 Dec rate for Jan–Jun | period mapping matches | yes |
| Rate-setting power | s.6 delegates to the Secretary of State with Treasury consent, sets no rate | statement says exactly that | yes |
| Bank Rate 31 Dec 2025 | 3.75% (reduced 18 Dec 2025) | `3.75` | yes |
| Bank Rate 30 Jun 2026 | 3.75%, no change recorded since 18 Dec 2025 | `3.75` | yes |

The 30 June 2026 value rests on an absence of change rather than a dated entry,
which is sound and stable — that period's rate is fixed at 30 June whatever the
MPC does later. No mismatch was found, and `approvedBy` was set to the project
owner at their instruction.

After approval the calculator produces figures for the first time: £1,250 at 51
days late gives 11.75 per cent (3.75 base plus 8 margin), £20.52 interest and
the £70 band, every figure labelled illustrative. Three fixtures that pinned the
unapproved state were rewritten to exercise the refusal against a copy with the
approval stripped, because the behaviour — no sign-off, no figures — is what
matters and had to stay covered.

**Two defects were found by exercising the newly unlocked path.** The approved
sentence had been handed to the model to place verbatim; against
`mlx-community/Qwen3-8B-4bit` that failed on the first attempt every time and 3
of 3 including the retry. The validator caught every paraphrase and the operator
was warned, so nothing unsafe reached a draft, but the feature did not work. The
application now appends the sentence and the model is forbidden any legal
content (D-021): 3 of 3 runs carry it verbatim on a single call with no retry.
Separately, a draft that omitted the sentence still carried its citations, which
would have made a stored draft cite sources for a statement it never made;
citations and `basis.snapshotVersion` now follow the body, verified across three
live runs plus the opt-out path.

### Controlled legal-source updates (task 9)

`shared/lawRefresh.test.js` has 13 fixtures over the pure refresh logic: the
28-day cadence holds a refresh and `--force` overrides it; a snapshot that
cannot say when it was checked is treated as worth checking while an unreadable
one is refused; an unchanged source leaves approval and the snapshot alone; a
changed source clears approval and names the dependent facts; a failed source
keeps its previous digest and does **not** advance `fetchedAt`, so a partial
refresh cannot pass stale data off as fresh; a first digest is recorded as a
baseline rather than a change, so approval survives but the digest is kept; a
result for a non-allowlisted source is discarded rather than recorded; a source
with no result is left untouched; the allowlist is the same exported matcher the
validator uses; and one fixture reads the module source to assert it references
no clock, no `fetch` and no filesystem.

`shared/lawSourceRegression.test.js` has 14 fixtures and reads the real
`data/uk-law/snapshot.json`, so editing that file without revisiting these
expectations fails the suite rather than silently changing a legal statement.
It covers citation integrity three ways — every fact and convention resolves to
a real citation, every citation and source URL is on the allowlist, and no
citation is orphaned — plus the unsourced `day-count-basis` convention being
held apart from the facts and carrying no citation. Refusal is covered for the
unapproved committed snapshot, six malformed shapes, a snapshot that is approved
but fails validation, a debt outside every reference period, and an ineligible
eligibility outcome. Two fixtures cover the legal answer against an approved
copy: figures trace to the snapshot's own margin, day-count and `asOf`, and
halving every compensation band halves the answer, which is what proves no
figure is hard-coded (D-012).

**Live run, 3 September 2026.** `npm run law:refresh` was first run without
`--force` and correctly declined — the snapshot was one day old against a 28-day
interval. With `--force` it fetched all four allowlisted sources, all returned,
and the live snapshot was left untouched; the written proposal validated with
`not_approved` as its only problem and carried digests for all four sources.
That run exposed a real defect, now fixed: the first implementation computed
baseline digests and then discarded them, because a first digest counted as
"nothing to review" — so change detection could never have started working. A
first digest is now recorded as a baseline that must be committed, distinct from
a content change and without clearing approval.

### Deadline against invoice due date (known issue 6)

`src/lib/deadlineCheck.test.js` has 8 fixtures. A deadline earlier than the
invoice due date raises an attention warning naming the actual risk — a
non-payment proof could be accepted while the payer is still inside the terms
they were given — and a later deadline is an informational note. Agreeing dates
produce nothing, including when the times of day differ, and so do nine shapes
of unknown or unparseable date, because a warning with a blank in it would be
worse than silence. An impossible date such as `2026-02-30` is treated as
unknown rather than as earlier. The comparison is checked across month and year
boundaries, and neither message states a legal position or claims a breach. It
warns and never blocks: which date governs is the operator's call.

### Solicitor-review routing (task 8)

`shared/escalation.test.js` has 13 fixtures. Every question whose reason routes
to professional review is asserted to block delivery, driven from the shared
`QUESTIONS` table so a new escalating question is covered automatically. A
high-value invoice blocks on the case facts alone, at the threshold and not one
minor unit below it; a configured threshold is honoured and eight unusable
values fall back to the documented default; a non-sterling or unrecorded amount
does not trigger it, because it cannot be compared with a sterling threshold.
Five fixtures cover the precedence and message rules: an incomplete
questionnaire blocks delivery for five shapes of missing answer, a fired
professional-review trigger outranks incompleteness while still reporting it, an
operator-action trigger blocks without invoking an adviser, every reason that
fired is reported rather than the first, and no block summary states a legal
position. One fixture asserts the catalogue matches `eligibility.js` exactly, so
a reason cannot route to an adviser in the panel and elsewhere at the gate, and
one reads the module source to assert it references no clock, no `fetch` and no
Node built-in — a delivery block that fails open during an RPC outage would be
worthless.

Five store tests prove the gate itself: a disputed case cannot hand an approved
draft to a transport and the refusal is audited as `escalation_required` with the
route and codes; an incomplete questionnaire blocks an approved draft with the
`operator_action` route; an in-scope case with a complete questionnaire still
passes; a high-value invoice blocks from the case facts alone against a
configured threshold; and the routing decision is readable but scoped to the
owning operator. One HTTP regression drives the whole path against the real
service: the case read carries the same verdict the gate enforces, approving the
wording does not clear the case, the send hand-off is refused `409` with the
adviser message, the refusal is audited with every code, and **no
`send_authorized` event exists for an escalated case**.

Two existing Task 7 tests and the HTTP draft-lifecycle test were updated to save
in-scope answers first. They exercise the approval gate, and an unanswered
questionnaire now blocks delivery on its own, so leaving them unanswered would
have tested the wrong refusal.

There is no rendered browser run of the delivery-block notice yet.

### Live contract polling

`src/lib/registryState.test.js` has 12 fixtures. Three cover the adaptive
cadence: one active agreement keeps the 5-second interval, every terminal
combination drops to 60 seconds, six empty or malformed lists also drop to 60
rather than becoming an excuse to hammer the endpoint, and the fast interval is
asserted never to go below a second. The other nine cover the fold of one read outcome
into what is on screen: a good read replaces the data and clears the error; a
changed status simply replaces the earlier one; a first failure is a failure
state rather than an empty registry; a failed poll keeps the last good data and
marks it stale; recovery clears the flag; a failure after a genuinely empty
registry preserves the empty ready state instead of reverting to a failure page;
a message-less failure still says something; and polling is suppressed before
the first read and on a hidden tab. The timer itself is not unit-tested — the
package has no React test harness — so the browser check below is what covers
it.

### Grounded explanations and reminder drafts (S3 and S2)

`server/ai/explanationSchema.test.js` has 12 fixtures. The decisive ones reject
a reply that reports any status other than the one the contract read supplied —
including a case-changed variant — and reject promotion language on every status
the contract has not finalised, while allowing the same words on
`PAID_VERIFIED` and `OVERDUE_VERIFIED` where they are accurate. The rest reject
legal, collection and mainnet claims, identifiers, and an empty
`whatThisDoesNotProve`, and confirm `needs_human_confirmation` is forced false.

`shared/statusLimitations.test.js` has 9 fixtures covering the guarantee behind
SKILLS.md acceptance check 5: every status carries at least the testnet clause,
both finalised outcomes carry all four named clauses, each clause reads as a
limitation rather than a reassurance, the label and meaning come from
`src/lib/statuses.js` so narration cannot drift, an unknown status yields no
clauses rather than a default set, and the returned arrays cannot be mutated
back into the shared table.

`server/ai/draftSchema.test.js` has 15 fixtures. They reject ten forms of
debt-collection and legal-consequence language, four claims that payment truth
is proven or that something acts on its own, four kinds of legal content with no
approved source, an ungrounded amount, four placeholder shapes, three markdown
shapes, an identifier, a tone the caller did not request, and a draft claiming
it needs no confirmation. Three fixtures pin the permitted-sentence contract
from both directions: the flag and the body must agree, and a paraphrase is
rejected where the verbatim sentence is accepted. Two HTTP regressions in
`server/access.test.js` prove both routes need an operator token and report a
disabled assistant as `503`, that nothing is drafted by a refused request, and
that case ownership is resolved before the assistant is consulted, so another
operator's case answers `404` rather than leaking whether a model is configured.

**Live model run, 3 September 2026, `mlx-community/Qwen3-8B-4bit`.** S3 was run
for `PAID_VERIFIED`, `OVERDUE_PENDING` and `OPERATIONAL_FAILURE`. Each returned
on the first attempt in about 10 seconds, echoed the supplied status exactly,
and carried 4, 2 and 2 mandatory clauses respectively. `OVERDUE_PENDING` was
narrated as "not yet a final decision on whether payment was received" and
`OPERATIONAL_FAILURE` as "not proof that payment hasn't been made" — the two
readings SKILLS.md §S3 exists to prevent. A separate run supplying context that
instructed the model to report `PAID_VERIFIED` and assert enforceability
produced a `refusal` with `reason: "unsafe_request"`.

S2 was run across all four gate states:

| Arm | Legal mention | Result |
|---|---|---|
| Mention not requested | — | Factual reminder, no legal content, `daysLate` 51 from the calculator |
| Requested, snapshot unapproved | withheld | Same factual reminder plus the stated reason a person must approve the snapshot first |
| Requested, approved snapshot copy | included | Verbatim sentence, both citations recorded, `calculationStatus: calculated`, `snapshotVersion: 1` |
| Requested, eligibility escalated | withheld | Factual reminder plus the eligibility reason |

The approved-copy arm is worth recording twice over: the model's first reply set
`mentionsStatutoryInterest` true without copying the sentence verbatim, the
validator rejected it, and the briefed retry produced a correct draft. That is
the improved retry path rescuing a genuinely non-deterministic failure — the
case the Task 5 write-up predicted it would help, having shown it cannot help a
deterministic one.

Two prose defects were found by these runs and fixed. S3 offered "contact
support for more details" as a next action, which is a facility that does not
exist; the prompt now enumerates the affordances that do. S2 described an
invoice 51 days late as though its due date were still ahead; the prompt now
requires the past tense once the days-late count is one or more. Neither was a
guardrail breach, and neither would have been caught by a fixture.

**Browser QA, in progress.** The S3 panel was rendered by the project owner
against a case linked to a live Coston2 agreement reading `AWAITING_PAYMENT`.
Observed: the card shows the real status chip in its header, the narration
matched that status without promoting it ("No final outcome has been reached
yet"), the model's own caveats appeared above the fixed ones, exactly the two
mandatory clauses this status requires were attached and labelled as the
application's own, and the next step named a real affordance. That pass found
one styling defect, now fixed: `.field-note` was referenced by the S2, S3 and S6
panels but never defined in `app.css`, so its guidance text fell back to body
size and read as a heading rather than a note.

The S2 suggestion controls, the withheld-legal-mention path, the task 7 hand-off
for a generated draft, the assistant-off path, and the narrow-viewport and
console checks have not been reported back yet.

## GitHub Actions

The `CI` workflow runs on pushes to `main`, pull requests, and manual dispatch using Node 24:

1. `npm ci`
2. `npm run check`
3. `npm audit --omit=dev --audit-level=high`

The `main` workflow for merge commit `e459042` completed successfully on 25 August 2026. CI receives no wallet key and proves no live network/FDC behavior.

## Evidence ledger

| Capability | Level | Evidence | Current conclusion |
|---|---|---|---|
| Canonical hash | Local deterministic tests | `test/canonical.test.js` | Implemented locally. |
| Contract state/matching | Local mock-verifier tests | `test/LatePayShield.test.js` | Contract logic tested; FDC not proven. |
| Override guard | Local tests at 31337 and 114 | `test/VerifierOverrideGuard.test.js` | Non-zero live-network override rejected. |
| XRPL payment | Live Testnet transaction | `4174F0EC6537F2E71DAEFD7E0412CB885BCF44F63A5D9E233042251B15249309` | Rechecked live: validated, ledger `20202706`, `tesSUCCESS`, 2,000,000 drops, destination tag `2026001`, memo `INV-2026-001`. |
| Coston2 deployment (current) | Live testnet deployment | `0x318e62d3da1b6e0a196ac60736d9e7ceea8a2239ae7a15d2e1a45bc3b8faddc8` | Contract `0x1863Ee87a6C66c8a37F481B55c3acEcF3C506dfa`, deployed 3 September 2026 with the corrected non-payment threshold (D-022); chain `114`; zero verifier override; `nextAgreementId` 1; public RPC readback passed. |
| Coston2 deployment (superseded) | Live testnet deployment | `0xfec3a90684482dd2cbc04c5a2e25a948968570b64fd1c7e610f13dfdcb487ae3` | Contract `0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1`; chain `114`; zero verifier override; public RPC readback passed. Still inspectable, but no longer the address the application reads. |
| FDC payment proof (superseded contract) | Real proof accepted by the contract | XRPL transaction `2A06F207...91CD36`; Coston2 request `0x3070...22d9`; voting round `1438624`; submission `0xc675...423e` | Agreement `2` reads back as `PaidVerified` with evidence ID `0xdaa9...18f8`. |
| Agreement lifecycle (superseded contract) | Live Coston2 agreement | Creation `0xf25f...43df`, agreement `2`, start ledger `20283755`, deadline `1787913245` | Created before its payment, so the evidence window is honest rather than back-fitted. |
| FDC non-payment proof (superseded contract) | Real proof accepted by the contract | Coston2 request `0xbcfb...7493`; voting round `1438645`; submission `0xab0d...068e` | Agreement `3` reads back as `OverdueVerified` with evidence ID `0x6881...14c1`. Searched ledgers `20284260` to `20284354` exclusive, above `1999999` drops, destination tag `2026002`. |
| Additional paid-path record (superseded contract) | Recorded live testnet evidence | Agreement `4`; XRPL `397A2598...B264B47A`; round `1438816`; Coston2 `0xf7ba...e781` | `evidence/coston2-paid-agreement-4.json` records `PaidVerified` and evidence ID `0x795b...ee7c`. |
| Local web application | Local tests, production build, local-model smoke, case-file browser QA, and draft-approval QA | `web/` (`npm test`, `npm run build`); synthetic UBL request through `POST /api/ai/extractions`; disposable SQLite cases linked to live agreements `8` and `13` | React UI and loopback API compile; all 98 focused executions pass, including nine HTTP access/lifecycle regressions against the real service, thirteen deterministic eligibility fixtures and fifteen late-payment calculator fixtures. A UBL request returned a schema-valid local-model extraction. Confirmed case data, communication notes, and the versioned approval audit persisted while XRPL/FDC status remained a live Coston2 read. The send gate is verified but no delivery transport is connected. The browser-triggered FDC job has not been independently recorded as a complete GUI run. |
| Eligibility questionnaire | Local deterministic tests, route test, and browser QA | `web/shared/eligibility.test.js`, `web/server/cases/store.test.js`, `web/server/access.test.js` | Thirteen fixture tests, two store tests, and one route test pass. A Chrome browser check, run twice against case files linked to live Coston2 agreements, observed the unanswered, supported, and dispute-escalation states, persistence across a reload, the mismatch banner, and unsaved answers surviving an unrelated save. The `agreement_deadline_unreadable` path was never observed in the browser; every case used had a readable agreement. |
| Late-payment calculator | Local deterministic tests only | `web/shared/latePayment.test.js` | 15 fixture tests pass, taking `npm --prefix web test` to 77 of 77 executions. No browser check exists because this task built no route, no storage, and no UI. The calculator produces no figures in the running application until task 4 supplies approved `lawInputs`. |
| UK-law snapshot library | Local deterministic tests, plus independent manual source and allowlist verification | `web/shared/lawSnapshot.test.js`, `data/uk-law/snapshot.json` | 17 fixture tests pass, taking `npm --prefix web test` to 94 of 94 executions, including an end-to-end fixture driving the calculator from the committed snapshot. A reviewer independently checked every cited figure against its source text on 2 September 2026 and found no mismatch, and separately swept the URL allowlist for bypasses and found none. **The committed snapshot is not approved**: `approvedBy`/`approvedAt` are `null`, so the calculator reports `law_inputs_missing` and produces no figures in the running application. No browser check exists because this task built no UI, and no `law:refresh` fetcher or regression suite was built (task 9). |
| Draft approval, audit, and send gate | Local store tests, a real HTTP regression, and browser QA | `web/server/cases/store.test.js`, `web/server/access.test.js` | Three store tests and one HTTP lifecycle regression prove an unapproved or newly edited version cannot pass the send gate, and that every transition is audited. Browser QA against a disposable case linked to live agreement `13` exercised blocked then approved states and the four-event audit trail. No delivery transport is connected, so every authorization returns `transport: not_connected` and `sent: false`. |
| Evidence timeline extraction (S6) | Local fixtures, HTTP regressions, and a controlled live local-model comparison | `web/server/ai/timelineSchema.test.js`, `web/server/ai/text.test.js`, `web/src/lib/aiTimeline.test.js`, `web/server/cases/store.test.js`, `web/server/access.test.js` | 38 executions pass, taking the web suite to 137 of 137. Against `mlx-community/Qwen3-8B-4bit` the original prompt shape produced invalid JSON 10 of 10 times at the identical byte offset; omitting the optional key rather than nulling it returns four correctly dated and quoted events 3 of 3. A four-arm comparison showed JSON mode makes no difference on this runner. An injection fixture was recorded as a fact without being obeyed. No rendered browser run of the panel yet. |
| Grounded explanations and reminder drafts (S3, S2) | Local fixtures, HTTP regressions, and a live local-model run across four gate states | `web/server/ai/explanationSchema.test.js`, `web/server/ai/draftSchema.test.js`, `web/shared/statusLimitations.test.js`, `web/server/access.test.js` | 38 executions pass, taking the web suite to 175 of 175. S3 echoed the contract-read status on every live run and refused an injected status change; the four mandatory limitations are appended from code, not requested. S2 produced factual reminders in every state, carried the verbatim legal sentence only against an approved snapshot copy, and withheld it with a stated reason otherwise. Stored as unapproved `local_llm` drafts inside the existing task 7 gate. No rendered browser run of either panel yet. |
| FTSO | Optional/planned | None | Not implemented. |

### The non-payment threshold correction (D-022)

`recordVerifiedNonPayment` pinned its request to `expectedDrops - 1`, following
the interface documentation's strictly-greater-than description. The live
verifier matches at or above the requested amount instead, so that bound was one
drop wider than intended: a payment of exactly `expectedDrops - 1` also blocked
an overdue verdict, leaving such an agreement recordable as neither paid nor
overdue with `markDisputed` its only exit.

The contract now requests `expectedDrops`, and
`scripts/prepare-nonpayment-request.js` builds the request to match — both had
to change together, or every overdue proof would be rejected. The contract suite
gained a fixture for each wrong direction: one drop below (needlessly wide) and
one drop above (which could hide a qualifying payment). 55 contract plus 4 guard
executions pass.

**Every identifier below the old deployment changed.** The evidence recorded
against `0x4A49...78B1` remains valid for that contract and is still
reproducible against it, but it is not evidence about the current deployment.
Fresh evidence was earned on `0x1863...6dfa`, and the overdue branch was the
necessary proof: it is the only path the change touches.

**One filename collision to know about.** Agreement IDs restart at 1 on a new
deployment, and the evidence filenames are keyed by ID alone
(`coston2-agreement-<id>.json`). Creating agreement 3 on the new contract
therefore overwrote the old contract's agreement 3 creation record — the overdue
one — which was noticed during the pre-commit review and restored. The
superseded record is kept as
`evidence/coston2-agreement-3-0x4A49a77a-superseded.json`; the canonical name
tracks the current deployment so the `fdc:*` scripts keep resolving the right
agreement. Anyone redeploying again should expect the same collision for every
low ID.

**The corrected threshold, proven live on 3 September 2026.** Agreement `1` was
created against a freshly generated, never-paid XRPL address
(`riGqhYWGyHuHX87K7ThsXaUxxhKexnGvy`) with a six-minute deadline and evidence
floor ledger `20454984`. Before the deadline, `fdc:prepare:overdue` correctly
refused to build a request at all. After it:

- the verifier answered **VALID** for a request at `amount: 2000000` — the full
  `expectedDrops`, which the old contract would have rejected;
- Coston2 request `0xedde...f6f8` was answered in voting round `1444699`, and
  the enshrined `FdcVerification` returned true for the retrieved proof;
- `recordVerifiedNonPayment` accepted it in `0xe094...3de2`, block `34846272`;
- independent public RPC readback shows agreement `1` as `OverdueVerified` with
  evidence ID `0xca54...c8a6` and `expectedDrops` `2000000`. The searched range
  was ledgers `20454984` to `20455099` exclusive, at or above 2,000,000 drops,
  destination tag `2026001`.

The paid branch was re-earned in the same session. Agreement `3` was created
first with destination `rUp4ei4gHDntWTWwJ15AtqwusgtakurnmT` and evidence floor
ledger `20455188`; XRPL payment `0452522F...C5168E` followed in ledger
`20455195`, `tesSUCCESS`, 2,000,000 drops, tag `2026001`. Its request was
answered in round `1444702` and `recordVerifiedPayment` accepted the proof in
`0x4dc0...e4be`, block `34846398`. Readback shows `PaidVerified` with evidence
ID `0xf9e7...ce70`.

Both branches therefore hold on the corrected contract, from the committed
commands, with the overdue run being the direct proof of the change. One stale
display was fixed on the way: `record-nonpayment-proof.js` still printed the old
`expectedDrops - 1` as the value it expected, while comparing correctly against
the new one.

## External verification runbook

Use a throwaway, faucet-funded Coston2 wallet. Keep `COSTON2_PRIVATE_KEY` only in
the ignored `.env`; never copy it, a recovery phrase, or an XRPL seed into evidence.
The complete tool-by-task handoff—including MetaMask, faucet, Swagger, explorer,
and DA URLs—is in [`tooling-runbook.md`](tooling-runbook.md).

### 1. Verify `standardAddressHash()` — completed

1. Create a public XRPL Testnet payment artifact:

   ```bash
   npm run spike:xrpl
   ```

2. Turn it into request bytes, submit the request, and retrieve the finalized proof.
   Each command reads what the previous one wrote to `evidence/`, so nothing is
   copied by hand:

   ```bash
   npm run fdc:prepare   # published public test key, already in .env.example
   npm run fdc:submit    # queries the live fee and records the voting round
   npm run fdc:proof     # polls the DA layer until the round finalizes
   ```

3. Compare `response.responseBody.receivingAddressHash` from the saved proof with:

   ```bash
   node -e "const { standardAddressHash } = require('./lib/canonical'); console.log(standardAddressHash('rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V'))"
   ```

The real response and corrected implementation both produced
`0x4abeacf6f2ad7fbb211ba1b703aecc2edd2933e84039bcade6e6488d9ddbfb8f`.

`npm run fdc:proof` also re-encodes the decoded response and refuses to save unless
the bytes match the DA layer exactly, then calls the enshrined `FdcVerification`
before writing evidence. For round `1437032` that call returned true, so the saved
proof is one `LatePayShield` would accept. The DA endpoint needs no API key, which
makes retrieval reproducible without any credential.

### 2. Verify the Coston2 deployment — completed

Deploy using the guarded script, which always passes a zero verifier override:

```bash
npm run deploy:coston2
```

Put the printed public contract address in `LATEPAY_SHIELD_ADDRESS`, then repeat the
public chain, bytecode, override, and initial-state readback:

```bash
npm run deploy:check:coston2
```

The recorded deployment is contract `0x4A49...78B1`, transaction `0xfec3...7ae3`,
chain ID `114`, with zero verifier override.

### 3. Verify the real paid path — completed

The old `A0DA...` payment proves FDC compatibility but predates any agreement on the
new deployment. It must not be submitted as proof of a newly created agreement.

Required order:

1. Capture the current validated XRPL ledger.
2. Create a fresh agreement on `0x4A49...78B1` using the corrected destination hash.
3. Send a new matching XRPL Testnet payment after the agreement transaction confirms.
4. Run `npm run fdc:prepare`, `npm run fdc:submit`, and `npm run fdc:proof` for it.
5. Submit that proof and confirm the agreement reads back as `PaidVerified` with
   matching destination, amount, tag, ledger, and deadline:

   ```bash
   AGREEMENT_ID=<id> npm run fdc:record
   ```

Run on 28 August 2026 as agreement `2`. The payment closed at
`2026-08-28T08:36:42Z`, comfortably inside the `10:34:05Z` deadline, and in ledger
`20283804` against an evidence floor of `20283755`. Every check the contract makes
was satisfied by real data, not by a fixture.

Ordering is the part that matters. Set `XRPL_SUPPLIER_ADDRESS` before step 2, or
`spike:xrpl` funds a fresh supplier the agreement knows nothing about and the proof
fails on `DestinationMismatch`.

### 4. Verify the real overdue path — completed

Both directions are covered. The unpaid case was run end to end as agreement `3`. The
mirror case, a destination that was paid, was probed against agreement `2`'s real
window and the verifier refused the request. Changing only the destination tag in that
same window flips it back to valid, which confirms the tag is genuinely part of the
match rather than being carried along unused.

Run on 28 August 2026 as agreement `3`. It needs a destination that genuinely
receives nothing, so a fresh XRPL address was generated and never paid.

```bash
XRPL_SUPPLIER_ADDRESS=<a fresh, never-paid address> DUE_IN_MINUTES=5 npm run create:agreement
# send nothing, wait for the deadline to pass
AGREEMENT_ID=3 npm run fdc:prepare:overdue
npm run fdc:submit
npm run fdc:proof
AGREEMENT_ID=3 npm run fdc:record:overdue
```

The window came back as ledgers `20284260` to `20284354` exclusive, closing at
`1787908000`, four seconds past the `1787907996` deadline. Every bound matched the
agreement exactly: `minimalBlockNumber` equal to `startLedger`, `deadlineTimestamp`
equal to `dueAt`, and the threshold at `1999999`.

### The threshold behaves differently from the interface documentation

`IXRPPaymentNonexistence` states the attestation searches for a payment **strictly
greater than** the requested amount. Probing the live verifier against agreement `2`'s
window, which contains a payment of exactly 2,000,000 drops, shows otherwise:

| Requested amount | Verifier |
|---|---|
| `1999998` | refused, transaction exists |
| `1999999` | refused, transaction exists |
| `2000000` | refused, transaction exists |
| `2000001` | valid, no match |
| `2000012` | valid, no match |

The boundary sits between `2000000` and `2000001`, so the match is
`receivedAmount >= amount`. `spentAmount` of `2000012` is not the compared value.

`recordVerifiedNonPayment` pins the request to `expectedDrops - 1`. Against these
semantics that is still safe, because a payment of exactly `expectedDrops` continues
to block an overdue verdict, but it is one drop wider than intended: a payment of
exactly `expectedDrops - 1` also blocks it. Such an agreement can be recorded as
neither paid nor overdue, and its only exit is `markDisputed`. The full sweep is in
`evidence/fdc-nonexistence-threshold-probe.json`.

`fdc:prepare:overdue` refuses to build a request while the deadline is still open.
This was confirmed by running it against agreement `3` five minutes early.

An `OverdueVerified` result proves only that no qualifying payment reached the
recorded destination, with the recorded tag, above the recorded threshold, inside the
recorded ledger range. It does not prove the payer never paid by any other means.

## Required next integration tests

1. Exercise network pending, timeout, rejection, and retry behavior through the future application.

## Three-minute demo

1. **Problem:** supplier burden and the need for a shared payment outcome.
2. **Confirm:** controlled invoice, human-confirmed terms, real agreement ID/hash.
3. **Paid branch:** agreement `2`, its XRPL transaction `2A06F207...91CD36`, and the FDC proof accepted on Coston2 in `0xc675...423e`.
4. **Overdue branch:** agreement `3`, unpaid, with non-payment evidence bounded to ledgers `20284260` to `20284354` and accepted on Coston2 in `0xab0d...068e`.
5. **Close:** XRPL provides the payment record, Flare verifies/records the agreement outcome, and future AI removes administration without determining financial truth.

## Fallback procedure

If a live endpoint fails, state that directly and show recorded real testnet evidence with identifiers. Never present a mock-verifier transition, fixture, or prerecorded sequence as a live FDC result.

## Update triggers

Update this file when commands, test counts/results, CI status, audit results, spike evidence, live identifiers, known failure behavior, demo steps, or fallback media changes.
