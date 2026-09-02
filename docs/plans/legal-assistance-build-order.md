# Legal-assistance build order

**Date:** 2 September 2026  
**Status:** Active sequence; tasks 1-3 complete  
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
4. **Approved UK-law source library — Not started.** Add a versioned local
   snapshot whose facts resolve to approved primary-source citations. Validate
   its schema, age and internal citation references. Disable legal information
   and calculations when required sources are missing or stale.
5. **Fact extraction and evidence timeline — Not started.** Extend the local LLM
   to propose grounded case facts and chronological events. Require source quotes
   and explicit user confirmation before anything persists.
6. **Grounded explanations and reminder drafts — Not started.** Generate
   explanations only from case facts, deterministic outputs and the approved
   source snapshot. Reminders remain editable drafts and may not claim that
   non-payment, entitlement or enforceability has been legally established.
7. **Approval, audit and sending controls — Not started.** Record the draft,
   edits, approving user, source version and send decision. Nothing is sent until
   a human approves the exact final content.
8. **Solicitor-review routing — Not started.** Route disputes, insolvency,
   consumer matters, cross-border matters, high-value cases and contemplated or
   active court proceedings away from automated handling.
9. **Controlled source updates and regression tests — Not started.** Fetch only
   allowlisted authoritative sources, validate and diff proposed changes, require
   human review, version approved snapshots, and run legal-answer, calculator,
   refusal, escalation, injection and citation-integrity regression fixtures.

## Next task

Task 4: create the approved UK-law source library with versioning and
citations. It supplies the `lawInputs` this calculator's `calculate()` takes —
the margin, the reference rates, the compensation bands and the day-count
basis — and legal information and calculation stay disabled while the
snapshot is missing, invalid or stale.
