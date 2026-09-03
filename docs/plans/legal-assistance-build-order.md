# Legal-assistance build order

**Date:** 2 September 2026  
**Status:** All nine tasks complete for the event scope; no delivery transport by choice (D-019)  
**Owner:** Tolga — application and AI

## Delivery constraint

Tasks 1–4 are the foundation. Do not start a legal-advice-style chat experience
before all four work and have test evidence. The intended product boundary is a
source-grounded UK late-payment information and drafting assistant with human
approval and professional escalation. It is not a lawyer replacement and does
not autonomously decide entitlement, strategy, enforceability or court action.

## Ordered tasks

1. **Case-pack model — Done.** Store the invoice, terms, original due date,
   parties and communications locally, and join them by agreement ID to fresh
   XRPL/FDC evidence. Only human-confirmed facts persist. Existing verification:
   SQLite store and validation tests, extraction/registration handoff tests,
   production build, and browser checks of case persistence, evidence display
   and timeline notes.
2. **Eligibility questionnaire and escalation rules — Done.** `web/shared/eligibility.js`
   implements the eight questions and the derived high-value and due-date-versus-deadline
   checks in deterministic code, with no model involvement. Answers persist in
   `case_eligibility`; the outcome is recomputed from those answers plus a live
   Coston2 read on every case open and is never stored. 13 fixture tests, 2 store
   tests, and 1 route test pass, and a browser check covered the unanswered,
   supported, and dispute-escalation states plus persistence across a reload and
   the mismatch banner.
3. **Deterministic late-payment calculator — Done.** `web/shared/latePayment.js`
   computes dates, interest and fixed compensation in code, with every legal
   value — margin, reference rates, compensation bands, day-count basis —
   arriving as a `lawInputs` argument rather than living in code. Money is
   `BigInt` minor units rounded half up once at the end, dates are `YYYY-MM-DD`
   differenced in UTC, and the reference rate is fixed by the period covering
   the date the debt became late. 77 of 77 `npm --prefix web test` executions
   pass, the 15 new fixtures plus the 62 that already passed. The calculator
   produces no figures until task 4 supplies approved law inputs. The LLM may
   explain supplied figures but cannot calculate or change them.
4. **Approved UK-law source library — Done.** `data/uk-law/snapshot.json` and
   `web/shared/lawSnapshot.js` add a versioned, committed snapshot whose facts
   and one convention resolve to allowlisted primary-source citations, plus a
   pure validator and the bridge into the calculator's `lawInputs`. The
   snapshot ships unapproved (`approvedBy`/`approvedAt` both `null`), so legal
   information and calculation stay disabled until a person approves it. 93 of
   93 `npm --prefix web test` executions pass.
5. **Fact extraction and evidence timeline — Done.** Skill S6
   (`web/server/ai/timelinePrompts.js`, `timelineSchema.js`,
   `extractTimeline.js`) proposes dated case events from correspondence the
   operator supplies, each carrying a verbatim quote. Proposals are browser
   state only; a per-event confirmation stores one row with its quote, the
   document's SHA-256 fingerprint, the model name and the confirming operator
   (D-014). The validator rejects any response whose event asserts a
   payment status, an identifier, an applied legal conclusion, or an amount the
   document does not contain. 38 new executions take `npm --prefix web test` to
   137 of 137. An instruction-bearing document is recorded as a fact rather than
   refused, and never obeyed (D-015). Browser QA is complete and found two
   render-only defects, both fixed: an unsized warning icon and a duplicated
   untrusted-content warning.
6. **Grounded explanations and reminder drafts — Done.** Skill S3
   (`explanationPrompts.js`, `explanationSchema.js`, `explain.js`) narrates one
   status read from the contract and writes nothing; a reply reporting any other
   status is rejected, and the four mandatory limitation clauses are fixed code
   appended after validation rather than requested from the model (D-017).
   Skill S2 (`draftPrompts.js`, `draftSchema.js`, `draftReminder.js`) drafts a
   reminder from confirmed case facts plus the deterministic task 3 figures and
   stores it through the task 7 gate as an unapproved `local_llm` draft with its
   citations. A legal statement requires the operator to ask, task 2 to report
   `supported`, and task 4's snapshot to be approved; otherwise it is withheld
   with the reason shown (D-016). 38 new executions take
   `npm --prefix web test` to 175 of 175. No rendered browser run of either
   panel yet.
7. **Approval, audit and sending controls — Not started.** Record the draft,
   edits, approving user, source version and send decision. Nothing is sent until
   a human approves the exact final content.
8. **Solicitor-review routing — Done.** `web/shared/escalation.js` decides
   whether a case may be handled automatically, and the send gate evaluates it
   before the approval check, so an approved draft on an escalated case is still
   refused. Every named category blocks delivery, as does an incomplete
   questionnaire; each refusal is audited with the route and all reason codes.
   The module imports task 2's reasons rather than restating them and reads no
   clock and no chain, so the block holds during an RPC outage (D-018). 28 new
   executions take `npm --prefix web test` to 203 of 203. No rendered browser
   run yet.
9. **Controlled source updates and regression tests — Done.**
   `npm run law:refresh` enforces the 28-day cadence, fetches only allowlisted
   sources, digests each, and reports content changes naming the facts that need
   re-verifying. It detects change rather than parsing legal values out of a
   page, writes a proposal rather than the live snapshot, and clears approval in
   that proposal on any change (D-020). The regression families are covered:
   citation integrity, legal answer and refusal in
   `web/shared/lawSourceRegression.test.js`, calculator in
   `latePayment.test.js`, escalation in `escalation.test.js`, and injection in
   the per-skill schema tests. 27 new executions take
   `npm --prefix web test` to 238 of 238.

## Next task

None in this sequence. All nine tasks are complete for the event scope.

What remains is verification and judgement, not construction:

1. Rendered browser runs of the task 6 and task 8 surfaces. Three render-only
   defects have been found that way and none by a test.
2. The prepared live or recorded demo flow through the UI with the real Coston2
   and FDC identifiers.
3. Approving `data/uk-law/snapshot.json`, whenever the owner chooses. Until a
   person sets `approvedBy` and `approvedAt`, the calculator produces no figures,
   S4 and S5 stay disabled, and S2's statutory-interest sentence stays
   withheld — the designed behaviour, not a defect.

Deliberately not built: a delivery transport (D-019), and S4 and S5 themselves,
which need the approved snapshot before they can say anything.
