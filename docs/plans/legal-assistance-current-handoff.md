# Legal-assistance current handoff

**Date:** 3 September 2026 (updated after tasks 1-5)  
**Purpose:** Give a new development session enough context to continue the
legal-assistance work without reconstructing the dependency order.

## Product goal and boundary

LatePay Shield is building a source-grounded UK late-payment information and
drafting assistant around a human-confirmed case pack and live testnet payment
evidence. The local LLM helps extract and organise evidence and later drafts
plain-language explanations and payment reminders. It is not a lawyer, does not
decide legal entitlement or payment truth, and cannot send a message or approve
its own work.

The governing rule is:

> The model proposes. A human confirms. Deterministic code and network evidence
> establish the relevant application facts.

## Accepted starting point

Foundation Tasks 1–4 are complete and integrated, and their code is present:
`web/shared/eligibility.js`, `web/shared/latePayment.js`,
`web/shared/lawSnapshot.js` and `data/uk-law/snapshot.json`.

1. The case-pack model.
2. The deterministic eligibility questionnaire and escalation rules.
3. The deterministic late-payment calculator.
4. The approved, versioned UK-law source library and citation validation.

The merge that brought Tasks 2–4 in was resolved on 3 September 2026. Ten files
conflicted between the Tasks 2–4 branch and the Task 7 control slice, including
`web/server/cases/store.js`, `web/server/index.js`, `web/src/components/CasePack.jsx`
and four status documents. Both sides' work was kept: the store carries both
`case_eligibility` and the draft/audit tables, `getCase` loads eligibility and
drafts, the case detail renders both panels, and the two duplicate
`eligibilitySaved`/`updateSelectedCase` callbacks became one. Two claims of
mine were dropped as superseded rather than merged, because Tasks 2–4 had made
them false: that `data/uk-law/snapshot.json` did not exist, and that Tasks 2–4
were not started.

**The snapshot is still unapproved.** `approvedBy` and `approvedAt` are `null`,
so `toLawInputs` returns `null` and the calculator produces no figures. Every
downstream legal-information and calculation feature stays disabled until a
person signs it off. That is the single gate in front of Task 6.

## Current implementation state

- Task 1's local SQLite case file stores human-confirmed invoice facts,
  parties, terms, due date, source metadata and communication notes. It links
  each case to live XRPL/FDC agreement evidence by Coston2 agreement ID.
- The existing invoice extraction path is local, optional and schema-validated.
  Raw uploaded or pasted invoice text is request-only and is not retained.
- Task 7 has a working control slice: versioned message drafts, exact-version
  approve/reject actions, an append-only audit trail, and a server-side send
  authorization gate. Editing an approved draft removes approval.
- Task 7 is not complete end to end. The local LLM does not yet create reminder
  drafts, and no real email or messaging transport records delivery results.
  Current authorization responses truthfully return `sent: false` and
  `transport: "not_connected"`.
- No production or mainnet claim is permitted. Payment evidence is testnet
  evidence and the assistant provides information and drafting support, not
  case-specific legal advice.

## Work required before completing Task 7

### Task 5 — fact extraction and evidence timeline — Done, 3 September 2026

Skill S6 is implemented and tested. Every condition this section set is met:

- each proposal carries a verbatim quote and the document's SHA-256 fingerprint;
- proposals are browser state, returned by `POST /api/ai/timelines`, which
  writes nothing;
- every field is editable, and Discard writes nothing;
- `web/server/ai/timelineSchema.js` rejects the whole response when an event's
  summary or subject asserts a payment status, writes an identifier, states an
  applied legal conclusion, or quotes an amount the document does not contain,
  and drops an event with no grounded quote, no usable date, an unstorable
  channel or direction, or a duplicate;
- a confirmed event stores `author_type`, the quote, the fingerprint, the model
  name, and the confirming operator and time (D-014).

The manual timeline form is unchanged and the panel is absent when the
assistant is off, both covered by tests.

Three things a later session should know.

**Prompt shape is load-bearing, and JSON mode is not.** The live model first
returned invalid JSON on a four-event document. A four-arm comparison on
3 September 2026 traced it to the requested shape rather than to the model or to
the host's known memory issue: listing `"subject": string|null` among the
repeated per-event keys made the model emit `"subject": null,` several times and
then duplicate the line with its opening quote missing. It reproduced 10 of 10
times at the identical byte offset — deterministic, so no retry can rescue it.
Asking for the key to be omitted rather than nulled fixes it, 3 of 3. Enabling
`response_format: {"type":"json_object"}` changed nothing (0 of 3), because the
operator's MLX server accepts that field and ignores it; it is still sent for
runners that honour it but must never be described as a safeguard. When adding
a skill, keep optional keys out of any repeated per-item block.

**The retry is only as good as its briefing.** A parse failure now reports its
line and column and hands the real error to the single retry SKILLS.md §8
allows, instead of a bare "not valid JSON" that gave the model nothing to act
on. Log-safe messages and retry detail are kept apart, because a V8 parse
message can embed a snippet of the document and §1 forbids logging that.

**S6 deliberately does not refuse an instruction-bearing document** the way S1
does — it records that such an email arrived and never obeys it (D-015).

**Browser QA is complete.** It exercised proposal, edit, confirm, discard,
reload, the injection fixture and the assistant-off path, and it found two
defects that no test and no live model run could reach, because neither renders
CSS: the warning and refusal icons set `flex: none` with no width, so an icon
expanded to fill the page, and the service's untrusted-content warning was shown
next to the model's duplicate of it. Both are fixed. Lesson for later panels:
`Icons.jsx` carries no intrinsic size, so every icon needs an explicit box.

### Task 6 — grounded explanations and reminder drafts — Done, 3 September 2026

Skills S3 and S2 are implemented and tested. S3 narrates a status read from the
contract and cannot report a different one; its four mandatory limitation
clauses are fixed code appended after validation rather than requested from the
model (D-017). S2 drafts from confirmed facts plus the deterministic task 3
figures and stores the result through the task 7 gate as an unapproved
`local_llm` draft with citations. A legal sentence needs three deterministic
gates — operator asked, eligibility `supported`, snapshot approved — and is
otherwise withheld with the reason stated (D-016).

Remaining for this task: a rendered browser run of both panels. The Task 5 pass
found two render-only defects, so this matters.

### Task 6 to Task 7 integration — Done, 3 September 2026

A validated S2 reminder is stored through the task 7 gate with
`authorType: "local_llm"`, its citations, and the snapshot version inside each
citation. Generation is not approval: the draft lands unapproved at version 1,
and the existing exact-version approval, edit-invalidates-approval, audit trail
and send gate apply to it unchanged.

## Task 7 completion conditions

Task 7 is complete only when:

1. Validated Task 6 drafts enter the existing approval workflow as unapproved.
2. A human approves the exact version handed to a transport.
3. Stale, rejected, edited or unapproved versions are blocked server-side.
4. A sandboxed delivery integration records attempted, delivered and failed
   outcomes without duplicate sends.
5. Tests prove both success and failure paths. A test must never send a real
   customer message.

Do not connect a production delivery provider merely to close the task. Start
with a sandbox/test transport and preserve the existing `sent: false` behavior
until delivery is genuinely attempted.

## Work after the Task 7 control flow

1. **Task 8 — solicitor-review routing. Done, 3 September 2026.**
   `web/shared/escalation.js` blocks the send hand-off for any
   `professional_review` reason, for an incomplete questionnaire, and for an
   `operator_action` escalation. It is evaluated in `authorizeDraftSend` before
   the approval check, so an approved draft on an escalated case is still
   refused; every refusal is audited with the route and all codes. It imports
   task 2's reason catalogue rather than restating it, and reads no clock and no
   chain so the block holds during an RPC outage (D-018). This was deliberately
   built before any transport exists, as this file required.
2. **Task 9 — controlled legal-source updates and regression tests. Done,
   3 September 2026.** `npm run law:refresh` enforces the cadence, fetches only
   allowlisted sources, and reports content changes naming the facts to
   re-verify. It detects change rather than parsing legal values, writes a
   proposal rather than the live snapshot, and clears approval in that proposal
   on any change (D-020). The regression families are covered across
   `lawSourceRegression.test.js`, `latePayment.test.js`, `escalation.test.js`
   and the per-skill schema tests.
3. **Release verification.** Run the complete checks, browser-test the confirmed
   timeline and approval journeys, review the security diff, and keep all
   README/status statements limited to evidence that was actually reproduced.

## Recommended continuation order

1. ~~Implement and test Task 5.~~ Done, 3 September 2026.
2. ~~Implement Task 6 using the completed deterministic foundations.~~ Done,
   3 September 2026. It correctly produces no legal figure or citation while the
   snapshot is unapproved.
3. ~~Connect Task 6 drafts to the existing Task 7 approval/audit gate.~~ Done.
4. ~~Implement Task 8 before enabling real delivery side effects.~~ Done,
   3 September 2026.
5. Finish Task 7 with a sandbox transport and delivery-result audit events. The
   escalation block is now in front of it, as required.
6. Implement Task 9 and run the release regression suite.

## Files a new session should read first

- `AGENTS.md`
- `docs/plans/legal-assistance-current-handoff.md` (this file)
- `docs/plans/legal-assistance-build-order.md`
- `docs/ai/SKILLS.md`
- `docs/project-status.md`
- `docs/issue-board.md`
- `docs/architecture.md`
- `docs/data-and-contracts.md`
- `web/server/ai/`
- `web/server/cases/store.js`
- `web/src/components/CasePack.jsx`
- `web/shared/eligibility.js`, `web/shared/latePayment.js`, `web/shared/lawSnapshot.js`

There is no next implementation task in this sequence. All nine are complete for
the event scope, and no delivery transport is connected by choice (D-019). What
remains is a rendered browser run of the task 6 and task 8 surfaces, the
prepared demo flow, and — whenever the owner chooses — approving
`data/uk-law/snapshot.json`. Do not build a legal-advice chat or a
real-message path as part of it, and do not present any legal figure while
`data/uk-law/snapshot.json` remains unapproved.
