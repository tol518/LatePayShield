# Legal-assistance build order

**Date:** 2 September 2026  
**Status:** Active sequence; task 1 complete  
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
2. **Eligibility questionnaire and escalation rules — Not started.** Implement
   deterministic questions and routing for the supported UK business-to-business
   scope. Detect and surface an invoice-due-date versus contract-deadline
   mismatch. Unsupported or uncertain cases must escalate rather than be
   inferred by the model.
3. **Deterministic late-payment calculator — Not started.** Calculate dates,
   statutory-rate inputs, interest illustrations and fixed compensation in code.
   Add boundary, date, rounding, stale-rate and ineligible-case tests. The LLM
   may explain supplied figures but cannot calculate or change them.
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

Task 2: define the eligibility questionnaire schema, supported outcome codes,
mandatory escalation triggers and acceptance fixtures before adding any LLM
conversation around eligibility.
