# Issue Board

**Last updated:** 2 September 2026

This file owns task assignment and delivery status. Technical truth and verified
evidence remain in `project-status.md` and `testing-and-demo.md`.

## Completed — Tolga

| Task | Status | Completion evidence |
|---|---|---|
| Coston2 deployment and explorer verification | Done | Contract `0x4A49...78B1`, deployment transaction `0xfec3...7ae3`, chain `114`, zero verifier override, and public readback. |

## Mushaf — protocol and evidence

| Task | Status | Completion evidence |
|---|---|---|
| FDC verifier request, fee lookup, Coston2 submission, voting-round tracking, and DA proof acquisition | Done | `fdc:prepare`, `fdc:submit`, `fdc:proof`, and `fdc:record` cover the chain end to end and hand each step's output to the next through `evidence/`. `fdc:prepare` reproduces the historic request bytes exactly, and `fdc:proof` was run against real round `1437032` where the live `FdcVerification` at `0x9065...B933` returned true for the retrieved proof. |
| Real paid-path verification | Done | Agreement `2` created in `0xf25f...43df`, XRPL payment `2A06F207...91CD36` sent afterwards in ledger `20283804`, FDC request answered in round `1438624`, and `recordVerifiedPayment` accepted the proof in `0xc675...423e`. Public readback shows `PaidVerified` with evidence ID `0xdaa9...18f8`. |
| Real overdue-path verification | Done | Agreement `3` created in `0x73b1...1269` against a never-paid address, request answered in round `1438645`, and `recordVerifiedNonPayment` accepted the proof in `0xab0d...068e`. Public readback shows `OverdueVerified` with evidence ID `0x6881...14c1`. |
| Live/recorded demo using real identifiers | Not started | Unblocked. Agreements `2` and `3` are real evidence for the paid and overdue branches. |

## Tolga — application and AI

| Task | Status | Completion evidence |
|---|---|---|
| 1. Case-pack model: invoice, terms, due date, parties, communications, and existing XRPL/FDC evidence | Done | The local SQLite model stores human-confirmed invoice facts, source metadata and communication notes, keyed one-to-one to a Coston2 agreement. The UI reads XRPL/FDC outcome evidence live through that agreement ID and pre-fills a linked, unconfirmed case draft after new registration. Store, validation, extraction-handoff, corrected-value and manual-entry tests pass; browser checks covered saving a case, live evidence display and adding a timeline note. |
| Frontend, local application layer, wallet UI, and evidence screen | In progress | `web/` provides MetaMask Coston2 agreement registration, live registry reads, Xaman/manual XRPL Testnet payment, matching checks, a local opt-in FDC job runner, and SQLite case files for confirmed invoice facts and communication notes linked to live Coston2 evidence. A successful new registration pre-fills an unconfirmed linked case draft from the same invoice and reviewed agreement. Case persistence is local-only and job state remains in memory. Every `/api/` route now requires an operator token, case reads and writes are scoped to the owning operator, cross-origin state changes and rebound hosts are refused, and a non-loopback bind exits unless explicitly configured as an authenticated deployment; multi-user identity and encryption at rest are still not implemented. |
| AI extraction and mandatory human-confirmation flow | In progress | Skill S1 of `docs/ai/SKILLS.md` is implemented behind `AI_ASSISTANT_ENABLED`: `web/server/ai/` holds the model client, the S1 prompt, and the schema validator that gates every reply, and `AiInvoiceExtraction.jsx` fills the agreement form with quoted, editable suggestions. The validator rejects a reply that populates `xrplDestination`, `destinationTag`, `amountDrops` or `startLedger`, or that claims no human confirmation is needed, and nulls any field whose quote is not a verbatim span of the pasted document; 11 unit executions cover it. A manual two-document run against a local `mlx-community/Qwen3-8B-4bit` endpoint returned a schema-valid extraction and refused an injection fixture. Remaining: a committed fixture suite for the `SKILLS.md` §9 checks, one demonstrated browser run, and skills S2 to S5. |
| FTSO conversion | Not started | Optional after the core evidence flow. |

## Legal-assistance build order

| Order | Task | Status | Dependency / completion rule |
|---:|---|---|---|
| 1 | Create the case-pack model: invoice, terms, due date, parties, communications, and existing XRPL/FDC evidence. | Done | Implemented and tested as described above. Operator-token authorization, per-operator case ownership, cross-origin write protection and bind refusal were added on 2 September 2026 (`docs/security/missing-case-api-access-control.md`, D-010). Multi-user identity and encryption at rest remain separate hardening work, not blockers for this local prototype task. |
| 2 | Build the eligibility questionnaire and escalation rules. | Done | `web/shared/eligibility.js` implements the eight questions and three derived and completeness checks, across fourteen reason codes on the `professional_review` and `operator_action` routes. Answers persist in `case_eligibility` (`case_id`, `answers_json`, `assessed_at`); no outcome is stored. `PUT /api/cases/:id/eligibility` saves them, scoped to the owning operator. The outcome is recomputed in the browser from the stored answers plus a live agreement read on every open, and a due-date-versus-deadline mismatch is always visible in the outcome banner. 13 fixture tests, 2 new store tests, and 1 new route test pass; a Chrome browser check exercised the unanswered, supported, and dispute-escalation states, persistence across a reload, and the mismatch banner, but never exercised the unreadable-agreement path. |
| 3 | Build and test the deterministic late-payment calculator. | Done | Implemented as the pure module `web/shared/latePayment.js`, exporting `calculate(caseFacts, lawInputs)`, `REASONS`, and `STALE_AFTER_DAYS`. Every legal value — the margin, the reference rates, the compensation bands, the day-count basis — is a `lawInputs` field; none is held in code. Money is whole minor units in `BigInt`, rounded half up exactly once at the end; dates are `YYYY-MM-DD` differenced in UTC; the reference rate is fixed by the single reference period covering the date the debt became late. Nine reason codes cover every refusal and every informational state. 77 of 77 `npm --prefix web test` executions pass, the 15 new fixtures in `web/shared/latePayment.test.js` plus the 62 that already passed. The calculator produces no figures until task 4 supplies approved law inputs, and no UI, route, or storage was built for it. |
| 4 | Create the approved UK-law source library with versioning and citations. | Done | `data/uk-law/snapshot.json` and `web/shared/lawSnapshot.js` implement a committed, versioned snapshot and its pure validator/bridge. Every fact and convention carries the primary source it was retrieved from, checked against four allowlisted citations and sources: section 5A and section 6 of the 1998 Act, article 4 of the 2002 rate-of-interest order, and the Bank of England Bank Rate page. Twelve problem codes cover every way the file can be unusable, and any one of them disables the whole snapshot — there is no partial-use state. The allowlist accepts only an `https` host equal to or a subdomain of `legislation.gov.uk`, `bankofengland.co.uk`, `gov.uk`, or `justice.gov.uk`. **The snapshot ships unapproved**: `approvedBy` and `approvedAt` are `null`, so `toLawInputs` returns `null` and the calculator reports `law_inputs_missing` until a person sets them. `npm --prefix web test` passes 94 of 94 executions, the 17 new fixtures in `web/shared/lawSnapshot.test.js` plus the 77 that already passed, including an end-to-end fixture that drives the calculator from the committed snapshot with approval injected into a copy. No `law:refresh` fetcher, allowlist enforcement at fetch time, or diff-and-review workflow was built (task 9), and no route or UI was built. |
| 5 | Extend the local LLM to extract facts and produce an evidence timeline, always user-confirmed. | Not started | Starts only after tasks 2–4 work. Model output remains a draft. |
| 6 | Add LLM source-grounded explanations and payment-reminder drafts. | Not started | Every legal statement cites an approved snapshot source; reminders are drafts only. |
| 7 | Add human approval, audit logs, and send only after approval. | Not started | No outbound communication may be sent directly by the model. |
| 8 | Add solicitor-review routing for disputes, insolvency, consumer, cross-border, high-value, and court cases. | Not started | These categories must leave the automated path and receive an explicit professional-review route. |
| 9 | Add the controlled legal-source update/review process and regression test suite. | Not started | Source changes are reviewed, versioned and tested before becoming available to the local model. |

Tasks 1–4 are the foundation. Do not start or present a “legal advice” chat
experience until all four work. Even then, the product provides source-grounded
information and drafting support with escalation—not a lawyer replacement or
autonomous legal advice.

The detailed sequence and acceptance gates live in
[`plans/legal-assistance-build-order.md`](plans/legal-assistance-build-order.md).

Both chains run unattended from `create:agreement`. For the paid branch set
`XRPL_SUPPLIER_ADDRESS` first, or `spike:xrpl` funds a supplier the agreement knows
nothing about. For the overdue branch point it at an address that will never be paid
and use a short `DUE_IN_MINUTES`.

No issue evidence may contain a Coston2 private key, XRPL seed, recovery phrase,
verifier key other than the published public test key, full `.env` content, or the
address of an operator's private AI model host.
