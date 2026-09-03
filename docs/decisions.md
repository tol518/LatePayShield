# Decision Log

Record durable product, architecture, security, data, and delivery decisions. Append new entries; supersede old decisions explicitly rather than rewriting history.

## D-001 - LatePay Shield is the locked concept

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** Build a verifiable payment-agreement prototype for small suppliers.

**Reason:** The late-payment problem is immediately understandable and gives XRPL settlement plus Flare evidence/state meaningful responsibilities within a two-person scope.

**Consequence:** Prioritize one evidence-backed paid/overdue workflow over a broad invoice platform.

## D-002 - Testnets and literal evidence claims

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** Use XRPL Testnet and Flare Coston2 only. Call a capability verified only when a real inspectable artifact supports the exact outcome.

**Reason:** Truthful testnet evidence is safer and more credible than unsupported production, legal, or decentralization claims.

**Consequence:** Pending, mismatch, failure, mock, and recorded-fallback boundaries are first-class behavior.

## D-003 - AI is administrative assistance

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** AI may extract candidate terms and draft explanations, but a human confirms terms and network evidence establishes payment outcomes.

**Consequence:** The core lifecycle must work without AI.

## D-004 - Route project context by task

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** Keep root agent instructions minimal and store durable context in focused documents loaded only as needed.

**Reason:** The original setup duplicated instructions and forced every session to load mixed product, architecture, status, and testing context.

**Consequence:** Material changes update the owning document and current status when applicable.

## D-005 - One canonicalization implementation

**Date:** 25 August 2026
**Status:** Accepted

**Decision:** `lib/canonical.js` exclusively owns version-1 field normalization, ordering, serialization, and invoice hashing.

**Reason:** Independent implementations can produce different on-chain commitments for the same displayed invoice.

**Consequence:** Future frontend/backend code imports the module and shares its fixtures; semantic changes require an explicit version decision.

## D-006 - FDC proof is the intended authority

**Date:** 25 August 2026
**Status:** Accepted, live integration unverified

**Decision:** Paid/non-payment outcome calls are permissionless. The contract verifies FDC proof data rather than trusting a team-controlled outcome caller.

**Reason:** Caller allowlisting would move payment truth back to the application operator.

**Consequence:** The production/testnet contract resolves Flare's enshrined verifier. Local verifier injection is restricted to chain ID `31337`.

## D-007 - Destination tag is the current invoice discriminator

**Date:** 25 August 2026
**Status:** Accepted for the current contract

**Decision:** Contract matching uses destination hash, minimum amount, destination tag, ledger lower bound, and deadline. XRPL memo/reference remains evidence/display metadata and is not contract-verified.

**Reason:** The implemented FDC response/request checks do not inspect the memo.

**Consequence:** Product copy must not claim memo/reference verification. Changing this requires a new evidence design and contract/data review.

## D-008 - The browser never addresses the model

**Date:** 28 August 2026
**Status:** Accepted

**Decision:** The local model is reached only by `web/server`, over an OpenAI-compatible HTTP endpoint configured in the ignored root `.env`. The browser calls same-origin `/api/ai/*`, and every reply is schema-validated in the service before it reaches the UI.

**Reason:** A direct browser call would put unvalidated model output on screen, which is the failure `docs/ai/SKILLS.md` §0 exists to prevent. It would also publish the model host to every client bundle and make CORS, mixed content, and private-network reachability into frontend problems.

**Consequence:** Swapping the model or its runner is a `.env` change. Any future skill adds a route and a validator in `web/server/ai/`, never a fetch from a component.

## D-009 - Case facts persist only after human confirmation

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Use a local SQLite case file keyed to one Coston2 agreement. Store
human-confirmed structured invoice facts, bounded source quotes, a source
fingerprint, and human-entered communication notes. Do not persist raw invoice
text or uploaded bytes in the first slice.

**Reason:** Case administration needs continuity across restarts, while model
output and browser state must not become payment or legal truth. The existing
contract is already the authority for agreement outcomes.

**Consequence:** The local LLM may prefill an unconfirmed case draft, but only an
explicit confirmation can write it. The UI joins the saved agreement ID to a
fresh Coston2 read for status and XRPL/FDC evidence. Document storage,
encryption, authentication, and multi-user access remain later work.

## D-010 - The local web service authenticates an operator instead of trusting reachability

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Gate every `/api/` route of `web/server/index.js` on an operator
token presented in `X-LatePay-Operator-Token`, and scope every case read and
write to the `owner_id` of the authenticated operator. Apply a network policy to
every request, the served page included: in a loopback deployment the peer, the
`Host` header, and any `Origin` header must be canonical loopback values, so a
cross-origin write is refused on the header alone whatever its `Content-Type`.
Refuse to bind a non-loopback `XAMAN_SERVER_HOST` unless
`WEB_AUTHENTICATED_DEPLOYMENT=true`, `WEB_OPERATOR_TOKENS`, and
`WEB_ALLOWED_ORIGINS` are all configured.

**Reason:** The case routes previously treated network reachability as
permission, so any client that could reach the port could read invoice, party,
and communication data or forge a case.
Locking the bind to loopback lowers exposure but is not an authorization
decision, and a browser page from another origin does not need to reach the port
itself to make the operator's browser do it.

**Consequence:** In a loopback deployment the service generates one token per run
and serves it in its own page as a meta tag, which only same-origin code can
read; `npm run dev` shares one token between the service and the Vite dev
server. A non-loopback deployment configures tokens explicitly and never puts
one in the page. Case rows written before ownership existed are migrated to
`local-operator`. Multi-user identity, sessions, and encryption at rest remain
later work: one token means one operator, not a user account system.

## D-011 - The eligibility outcome is computed at read time, never stored

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Persist only the operator's eligibility answers, in
`case_eligibility`, and compute the outcome in the browser from
`web/shared/eligibility.js` on every read, combining those answers with a live
Coston2 agreement read.

**Reason:** The invoice-due-date versus contract-deadline rule needs the
agreement's on-chain `dueAt`, which only the live registry read holds; the local
service never reads the chain, and copying a chain value into the case database
would make that database a second source of truth for an agreement term. An
outcome is also a function of the current rules, not a fact the operator
asserted: storing one would let a later rules change leave rows claiming an
outcome that those rules no longer produce, and task 3's calculator gates on
that outcome.

**Consequence:** The service validates and stores answers and returns no
outcome, because it cannot compute one. The same pure module and the same
fixtures cover the rules wherever they run. Recomputing costs nothing at this
size. A per-answer audit history is deliberately absent until task 7 defines
what an audit record must contain.

## D-012 - Legal values are calculator inputs, never constants in code

**Date:** 2 September 2026
**Status:** Accepted

**Decision:** `web/shared/latePayment.js` embeds no legal value. The margin over
base rate, the reference rates, the fixed-compensation bands and the day-count
basis all arrive as a `lawInputs` argument, and the module refuses to produce a
figure when they are missing, unreadable, or older than the freshness limit.
`STALE_AFTER_DAYS` is the sole number held in code, because it is this
repository's own currency policy rather than a fact about the law.

**Reason:** The approved UK-law source library is a later task, and this
repository does not state a legal fact without an inspectable source. Taking the
values as inputs let the calculator and its fixtures be built and tested first.
It also removes a defect class permanently: an approved source value and a copy
in code cannot drift apart when there is no copy.

**Consequence:** The calculator produces nothing until an approved source
supplies its inputs, which is the intended behaviour rather than a gap. The
fixture suite supplies its own law values, and no figure in it is an approved
legal value. Every result carries `lawAsOf` and `illustrative: true`, so no
consumer can render a figure without its date or present one as settled.

## D-013 - Retrieval and approval are separate, and an unsourced convention is held apart

**Date:** 2 September 2026
**Status:** Accepted

**Decision:** `data/uk-law/snapshot.json` holds each legal value beside the
primary source it was retrieved from, and carries `approvedBy` and `approvedAt`.
While those are unset the snapshot is unusable: `toLawInputs` returns null and
the calculator reports `law_inputs_missing`. The 365-day count basis is not
stored among the sourced facts. It sits in a separate `conventions` list, with
no citation and a statement that the operator chose it.

**Reason:** Retrieving a value from legislation.gov.uk makes it sourced, not
approved. Keeping the two distinct means the file records who accepted
responsibility for each figure, and a fetch that misread a page cannot reach a
user without a person having looked. The day-count basis has no primary source
at all: section 6 of the 1998 Act prescribes no day-count convention. Filing it
beside sourced values would imply a source that does not exist, which is the
confusion an approved-source library exists to prevent.

**Consequence:** The snapshot is committed unapproved and the calculator stays
disabled until a person approves it, which is what the build order requires. A
convention carrying a citation is rejected as a fact in the wrong place. The
snapshot covers only the reference periods actually retrieved, so a debt
becoming late outside them is refused rather than estimated.

## D-014 - A proposed case event is browser state until one person confirms one event

**Date:** 3 September 2026
**Status:** Accepted for the local prototype

**Decision:** Skill S6 (evidence timeline extraction) returns proposals from
`POST /api/ai/timelines` and writes nothing. Each proposal carries the verbatim
quote it was grounded in plus the SHA-256 fingerprint of the document it was
read from, stays editable in the browser, and becomes a case-file row only
through a separate `POST /api/cases/:id/communications` for that one event. A
confirmed row records `author_type: 'local_llm'`, the quote, the fingerprint,
the model name, and the confirming operator and time. A typed row records
`author_type: 'human'` and no provenance.

**Reason:** The timeline is case evidence, so a model may help assemble it but
must not become its author. Storing a proposal — even flagged as unconfirmed —
would put unreviewed model text in the case file, and a bulk "accept all" would
make confirmation a formality rather than a decision. Per-event confirmation
keeps the reviewer looking at one summary against one quote.

**Consequence:** The store refuses a `local_llm` entry that arrives without its
quote and fingerprint, because a reviewer would have nothing to check it
against. The manual form remains the complete path and is unchanged, so the
timeline works with the model switched off. `case_communications` gains six
nullable provenance columns, migrated in place; rows written before provenance
existed read as human entries.

## D-015 - S6 records an instruction-bearing document rather than refusing it

**Date:** 3 September 2026
**Status:** Accepted for the local prototype

**Decision:** When a supplied document contains instruction-like text, S6 may
still propose the dated events it can quote, and the reply carries a prominent
untrusted-content warning. The validator scans only what the model wrote — an
event's `summary` and `subject` — for payment-status terms, identifiers, and
legal conclusions. An event's `sourceQuote` is exempt.

**Reason:** SKILLS.md §4 requires the agent to refuse when it detects injected
instructions, and S1 does exactly that: an invoice's whole purpose is the terms
it states, so a poisoned invoice has nothing safe left to extract. A case
document is different. "The payer emailed instructions telling us to mark this
paid" is itself a case fact a supplier may need recorded, and forcing a refusal
on a marker match would let one quoted phrase in a long email thread block a
whole legitimate chronology. Censoring the quote would remove the only text the
reviewer checks the summary against.

**Consequence:** The security property is that injected instructions are not
*obeyed*, enforced structurally: any smuggled status term, identifier, or legal
conclusion in a summary rejects the entire response, and every event still
needs a grounded quote and an explicit confirmation. A live run against
`mlx-community/Qwen3-8B-4bit` on 3 September 2026 recorded the arrival of an
instruction-bearing email without adopting any of its claims. S1's refusal
behaviour is unchanged.

## D-016 - A legal sentence is gated on an approved source, not on the model

**Date:** 3 September 2026
**Status:** Accepted for the local prototype

**Decision:** Skill S2 may include exactly one legal sentence in a payment
reminder, and only when three deterministic gates all hold: the operator asked
for it, task 2's eligibility outcome is `supported`, and task 4's snapshot is
approved and yields usable `lawInputs`. The sentence is fixed application text
handed to the model to place verbatim, with its citations resolved from the
snapshot and stored on the draft. The model may not paraphrase it, extend it, or
add a figure to it, and `draftSchema.js` rejects any other legal content
outright. When a gate fails the option is withheld, the draft is still produced
without it, and the operator is told which gate failed.

**Reason:** A reminder that mentions statutory interest is making a statement
about the law, and SKILLS.md §7.6 requires such a statement to rest on an
approved source or be a refusal. Leaving the wording to the model would make
every draft a fresh chance to overstate a general rule as an applied
entitlement, which §5 forbids. Withholding silently would be worse than
refusing: the operator asked for something and would not know they did not get
it.

**Consequence:** While the committed snapshot was unapproved the option was
always withheld and reminders were purely factual. It was approved on
3 September 2026, so the sentence is now available; removing the approval
withholds it again. Approving the
snapshot is a human act that edits the file and requires a service restart;
nothing in the application can approve it. The one permitted sentence lives in
`web/server/ai/draftReminder.js` and changing it is a documentation-gated
change, not a prompt tweak.

## D-017 - The mandatory evidence limitations are code, not prompt

**Date:** 3 September 2026
**Status:** Accepted

**Decision:** The four limitation clauses SKILLS.md §S3 makes mandatory on a
paid or overdue explanation are held as fixed text in
`web/shared/statusLimitations.js` and appended by the service after validation.
They are never requested from the model, and the model's own situation-specific
caveats are listed separately from them in the interface.

**Reason:** A clause the model is merely asked to include is a clause it can
omit, and the omission would be invisible — an explanation missing the
"testnet, no legal standing" line still reads as complete. Acceptance check 5 in
SKILLS.md §9 then becomes something checked per response rather than guaranteed.
Holding the clauses in code inverts that: the check is true by construction, and
the model is left only the job it does well.

**Consequence:** Every status carries at least the testnet clause, and both
finalised outcomes carry all four; nine fixtures assert this and that each
clause reads as a limitation rather than a reassurance. Changing the clauses is
a change to a reviewed module with tests, not a prompt edit. The same table
supplies the label and meaning the interface already shows, so narration cannot
drift from the chip beside it.

## D-018 - Solicitor-review routing is a server-side delivery block that reads no chain

**Date:** 3 September 2026
**Status:** Accepted

**Decision:** `web/shared/escalation.js` decides whether a case may be handled
automatically, and `authorizeDraftSend` evaluates it before the approval check.
A case with any `professional_review` reason, an incomplete questionnaire, or an
`operator_action` escalation cannot obtain a send authorization; the refusal is
recorded as a `send_blocked` audit event carrying the route and every reason
code that fired. The reason catalogue is imported from `eligibility.js` rather
than restated. The module reads no clock and no chain, and a test asserts that.

**Reason:** Task 2 routes for the operator's benefit and recomputes in the
browser, which is the right place for a panel and the wrong place for a control
— a block a caller can skip is not a block. Making it server-side also decides
the harder question correctly: every `professional_review` reason is either
answer-driven or derived from the case's own stored invoice total, so the gate
reaches the same verdict when Coston2 is unreachable. A delivery block that
fails open during an RPC outage would be worthless.

Checking escalation *before* approval is deliberate. Both orders refuse, so
safety is unaffected, but approval-first would walk an operator through
approving a draft that can never be delivered and only then tell them the case
needs an adviser.

**Consequence:** An unanswered questionnaire blocks delivery, because an
unanswered dispute question is not a "no" — silence is not consent. Two existing
Task 7 tests were updated to save in-scope answers first, since they exercise
the approval gate and should not be blocked for an unrelated reason. The case
detail read now returns the server's own verdict as `delivery`, and the draft
panel states it above the drafting controls, so the interface never derives a
second opinion about routing. `ELIGIBILITY_HIGH_VALUE_MINOR_UNITS` configures
the threshold for the service; the browser's `VITE_` form is accepted as a
fallback so the panel and the gate cannot diverge.

## D-019 - No delivery transport is connected, by choice

**Date:** 3 September 2026
**Status:** Accepted for the event scope

**Decision:** LatePay Shield connects no email, SMS, or other delivery
transport. `authorizeDraftSend` remains the final step: it checks escalation
routing and exact-version approval, records the decision in the append-only
audit trail, and returns `transport: "not_connected"` with `sent: false`. The
interface says that no message was sent.

**Reason:** This is a hackathon prototype, not a product. Sending a real message
is outside the boundary `docs/project-context.md` sets, and any third-party
sandbox would carry invoice numbers, party names and reminder text off the
operator's machine — which the privacy rules in `docs/ai/SKILLS.md` §1 and the
loopback-only service exist to prevent. Nothing in the demo needs a delivered
message: what the product claims is that a reminder cannot leave without a human
approving that exact version and a routing check passing, and the audit trail
demonstrates precisely that.

**Consequence:** Task 7's control slice — versioned drafts, exact-version
approve/reject, the append-only audit trail, local-LLM drafts entering
unapproved, and task 8's escalation block — is complete and is the whole of what
ships. Task 7's fourth written completion condition, a sandboxed delivery
integration recording attempted, delivered and failed outcomes without duplicate
sends, is **deliberately not met** and is recorded as out of scope rather than
as outstanding work. Anyone connecting a transport later must add those
delivery-result audit events and a duplicate-send guard, and must not weaken the
`sent: false` default until a delivery is genuinely attempted.

## D-020 - The law refresh detects change; it never reads a legal value

**Date:** 3 September 2026
**Status:** Accepted

**Decision:** `npm run law:refresh` fetches each allowlisted source, digests the
bytes, and reports whether the content changed since the last check, naming the
facts that cite a changed source. It does **not** parse a statutory rate, a
compensation band, or any other legal value out of a page. It writes a proposal
to `data/uk-law/snapshot.proposed.json` and never modifies the live snapshot,
and any content change clears `approvedBy`/`approvedAt` in that proposal.

**Reason:** Scraping a figure out of HTML and feeding it to the calculator would
put an unverified number behind every downstream statement — the exact failure
SKILLS.md §7 exists to prevent, and the reason the snapshot's figures were
checked against the source text by a person in the first place. What a refresh
can do safely is tell the operator *when that check needs redoing*, which is the
whole practical value: nobody notices a Bank Rate page changing on their own.

Writing a proposal rather than the live file is the plainest reading of §7.5's
"nothing auto-merges" — a process with no write path to the approved snapshot
cannot accidentally acquire one. Clearing approval on any change follows from
the same logic: if the source moved, the human-verified figure behind it is no
longer known to match it.

**Consequence:** `law:refresh` is a change *detector*, not an updater, and the
documentation says so rather than implying the snapshot maintains itself. A
first run records baseline digests, which must be committed or later runs have
nothing to compare against — a defect found by running it, since the first
implementation computed those digests and discarded them. A failed source keeps
its previous values and does not advance `fetchedAt`, so a partial refresh never
passes stale data off as freshly checked. The allowlist is enforced before the
request is made, on the URL actually landed on after redirects, and again when
folding results in; `isAllowedSourceUrl` is exported from `lawSnapshot.js` so
there is one copy of that rule.

## D-021 - The approved legal sentence is appended by code, not placed by the model

**Date:** 3 September 2026
**Status:** Accepted

**Decision:** When all three gates pass — the operator asked, task 2 reports
`supported`, and task 4's snapshot is approved — the application appends the
approved statutory-interest sentence to the reminder body itself. The model is
told nothing about statutory interest, is forbidden any legal content, and must
always return `mentionsStatutoryInterest: false`; the validator rejects a reply
that contains legal wording or claims to have placed it. The caller sets the
flag and attaches the citations only when it appends the sentence.

**Reason:** The first implementation handed the sentence to the model to place
verbatim. Measured against `mlx-community/Qwen3-8B-4bit` on 3 September 2026,
that failed on the first attempt every time and, after the approval unlocked the
path, 3 times in 3 including the retry. The failure was safe — the validator
caught the paraphrase and the operator was warned — but the feature simply did
not work. This is the same lesson as D-017: a sentence that must be exact
belongs in code, not in a prompt. Appending it makes the wording exact by
construction and drops the whole class of paraphrase failure.

**Consequence:** With the mention requested the sentence now appears verbatim
on every run, on a single model call with no retry. The model's job narrows to
the factual reminder, which it does well. The validator's rule simplifies from
"legal content unless a sentence was supplied" to "no legal content, ever",
which is easier to reason about and harder to get wrong.

A related defect was fixed in the same pass and is worth recording, because it
was only reachable once the snapshot was approved: when the model omitted the
sentence, the stored draft still carried its citations. A draft would then cite
sources for a statement it never made, and a later human approval would inherit
that claim. Citations now follow the body — a purely factual reminder carries
none, and `basis.snapshotVersion` is recorded only when a legal statement
actually rested on it.

## D-022 - The non-payment threshold was corrected, and the contract redeployed

**Date:** 3 September 2026
**Status:** Accepted

**Decision:** `recordVerifiedNonPayment` now pins the attestation request to
`expectedDrops` rather than `expectedDrops - 1`, and
`scripts/prepare-nonpayment-request.js` builds the request to match.
`LatePayShield` was redeployed to Coston2 at
`0x1863Ee87a6C66c8a37F481B55c3acEcF3C506dfa`, replacing
`0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1`.

**Reason:** `IXRPPaymentNonexistence` documents its search as strictly greater
than the requested amount, and the original bound followed that documentation.
The live verifier was then measured to match at or above it instead — probing
agreement 2's window, which contained a payment of exactly 2,000,000 drops, the
verifier refused 1,999,998 through 2,000,000 and accepted 2,000,001. Against
that behaviour `expectedDrops - 1` was one drop wider than intended: a payment
of exactly `expectedDrops - 1` also blocked an overdue verdict, so such an
agreement could be recorded as neither paid nor overdue with `markDisputed` its
only exit. Requesting `expectedDrops` closes that gap while still blocking on a
payment of exactly the expected amount, which is the property that matters.

**Consequence:** The old contract keeps its history. Agreements 1 to 15 on
`0x4A49...78B1`, including the paid evidence for agreements 2 and 4 and the
overdue evidence for agreement 3, remain valid **for that contract** and are
still reproducible against it; they are not evidence about the new deployment
and must never be presented as such. The new contract started at
`nextAgreementId` 1 with zero verifier override, confirmed by public readback.

Fresh evidence therefore had to be earned on the new deployment, and the overdue
branch was the necessary proof: it is the only path the change touches, so
without a live overdue run the corrected threshold would have been an untested
contract change. `.env`, `web/src/lib/network.js` and the documentation now
point at the new address.

**Cost, recorded honestly:** this was done the day before the event at the
owner's explicit instruction, after a recommendation to defer it was raised and
declined. Every identifier in the demo changed as a result.

## Entry format

New entries contain an ID, title, date, status, decision, reason, and consequence. Include an official source and check date when a decision depends on time-sensitive event, network, or sponsor information.
