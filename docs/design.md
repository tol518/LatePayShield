# Product and Experience Design

**Current status:** The local testnet UI implements preparation, MetaMask
registration, live agreement reads, Xaman/manual payment submission, XRPL
matching, FDC job progress, optional local AI invoice extraction, local
case-file persistence, and a deterministic eligibility questionnaire with no
model involvement. Authentication, multi-user storage, and a production
service are not implemented.

The detailed visual and component guidance lives in [`ui-language.md`](ui-language.md).

## Experience goal

A non-crypto user should understand within 20 seconds:

1. what agreement was recorded;
2. what payment criteria are actually checked;
3. what the current evidence supports;
4. what the system cannot conclude.

The interface should feel like dependable payment administration, not a trading dashboard or blockchain explorer.

## Primary journey

1. **Prepare:** Upload a searchable PDF, XML, or UBL invoice, paste invoice text, or enter terms manually. The optional assistant is absent from the page when it is switched off, and no journey step depends on it. The upload control states the 10 MB/50-page limits and explains that scanned PDFs need OCR first.
2. **Review:** Display AI-extracted values as editable suggestions, each shown with the verbatim quote from the document that supports it and the model's own confidence. Suggestions are labelled proposed and unconfirmed, and never include the XRPL destination, destination tag, XRP amount, or evidence-window start ledger. The invoice total and currency are reference-only: no currency is converted.
3. **Confirm:** Require explicit confirmation of amount, deadline, XRPL destination, destination tag, and evidence-window start.
4. **Register:** Show the Coston2 agreement ID and canonical terms hash, then
   pre-fill an unconfirmed local case draft from the same invoice and the exact
   agreement review. Require a separate human confirmation before saving it.
5. **Pay:** Present exact XRPL Testnet instructions; memo/reference is useful evidence but is not currently contract-verified.
6. **Verify:** Request and submit the relevant FDC proof without claiming success early.
7. **Resolve:** Present the contract-supported status and evidence limitations.

## State language

| State | User-facing label | Meaning |
|---|---|---|
| `DRAFT` | Draft | UI-only; terms are editable and not registered. |
| `ACTIVE` | Awaiting payment | On-chain agreement exists and has no final outcome. |
| `PAYMENT_SUBMITTED` | Checking payment | UI-only; candidate transaction/proof workflow exists. |
| `PAID_VERIFIED` | Payment verified | Contract accepted an FDC payment proof matching its implemented rules. |
| `OVERDUE_PENDING` | Deadline passed - verification pending | UI-only derivation: contract is active and deadline passed. |
| `OVERDUE_VERIFIED` | No qualifying payment found in the defined window | Contract accepted the corresponding FDC non-payment proof. |
| `DISPUTED` | Needs human review | Supplier flagged the agreement; the MVP does not adjudicate it. |

Mismatch, network failure, and proof failure are operational conditions, not successful agreement states.

## Required screens

### Agreement preparation and confirmation

- Mark extracted values as suggested.
- Accept one searchable PDF, XML, or UBL file without removing the paste-text path.
- Show the selected file name and detected format, with a clear remove action.
- Make every authoritative value editable.
- Show a persistent Testnet label.
- Explain the destination tag and creator-supplied evidence-window start.
- Separate human confirmation from extraction.

### Agreement dashboard

- Status and plain-language meaning, re-read from the contract on a timer rather
  than only at page load. When a refresh fails, keep the last good read visible
  and say plainly that it may be out of date; never blank it, and never let it
  pass as current.
- Minimum qualifying amount and deadline.
- Agreement ID and shortened terms hash.
- Next valid action.
- No success styling before the contract finalizes an outcome.

### Payment instructions

- XRPL Testnet destination, minimum amount, destination tag, and memo/reference.
- Explain that the current proof matching uses destination, amount threshold, tag, and window; memo is not contract-verified.
- Copy controls and optional QR only after the plain flow works.

### Evidence view

- Claim type and current verification level.
- Agreement, network, transaction, proof/evidence, ledger, and time-window identifiers.
- Field-by-field matching criteria.
- Human explanation of what the result proves and does not prove.
- Explorer links only for real identifiers.

### Case file

- Link one local case to one live Coston2 agreement ID.
- After a new registration, pre-fill the linked case draft from the invoice-only
  facts and the agreement values the user just confirmed. Keep the draft
  unsaved and unconfirmed until the user checks it.
- Store only facts the user explicitly confirms; AI extraction remains a draft.
- Show invoice source metadata and its SHA-256 fingerprint without retaining the
  raw invoice text in this first slice.
- Read payment status and XRPL/FDC identifiers live from Coston2 rather than
  treating database state as proof.
- Accept concise human-entered communication timeline notes. Do not send a
  message, infer a reply, or treat a model-written draft as a sent communication.
- Offer suggested timeline entries from correspondence the operator supplies,
  when the local assistant is switched on. Each suggestion is labelled an
  unconfirmed suggestion, shows the verbatim quote from the document that
  supports it, and keeps every field editable. Confirm and discard act on one
  event at a time; there is no accept-all. When the assistant is off the panel
  is absent and the manual form is unchanged.
- Show whether a stored timeline entry was typed by a person or confirmed from a
  suggestion, and keep the quote it was grounded in available beside it.
- Offer a plain-language explanation of the current status beside the status
  chip, never instead of it. Present what the evidence supports and what it does
  not establish as two sections, and mark the always-applicable limits as the
  application's own statement rather than the assistant's.
- Offer to draft a reminder from the confirmed case facts, with a tone choice
  and an opt-in for mentioning that statutory interest may be available. A
  generated reminder arrives as an unapproved draft in the same review list as a
  typed one and is labelled as local-LLM authored. When the legal mention cannot
  be included, say which condition was not met rather than quietly omitting it.
- Show the approved sources a draft cites, with the snapshot version, beside the
  draft they support.
- When a case has left the automated path, say so above the drafting and
  approval controls, not after them. Name the route — a qualified adviser, or an
  unfinished case file — and list every reason that fired. Drafting and review
  stay available; only the delivery hand-off is refused, and say that plainly.
  Never present an unfinished case file as a matter for a solicitor.
- Show outbound reminders as versioned drafts with an explicit `Draft`,
  `Approved`, or `Rejected` label. Editing an approved draft must visibly remove
  approval and require another review.
- Keep the audit trail inspectable beside the draft: creation, edits, review
  decisions, blocked send attempts, and authorised hand-offs all carry the exact
  draft version and time.
- Never label a send hand-off as delivery. Until a real delivery adapter exists,
  say that approval was checked and audited but no message was sent.

### Eligibility and escalation

A card in the case detail, immediately below the live agreement evidence card
and above the communication timeline, so the operator has the on-chain
deadline in view while answering. It renders `web/shared/eligibility.js`'s
eight questions and takes no input from, and gives no input to, the local
model.

- Each question is a three-way radio group — yes, no, unknown — with no
  preselected answer, so nothing can be accepted by accident.
- One save action persists the answer map only; the outcome itself is never
  saved (D-011).
- The outcome banner recomputes on every keystroke from the current answers,
  the case file's invoice facts, and the linked agreement's live `dueAt`, and
  has three states:
  - **Inside the supported scope** — "The answers and the case facts raise
    nothing that has to leave the automated path. This is a routing result,
    not legal advice."
  - **More information needed** — "The questionnaire cannot be completed from
    what the case file records. Nothing downstream may rely on it yet."
  - **Leaves the automated path** — "This case stops here. LatePay Shield is
    scoped to source-grounded information and drafting support, not case
    handling, and takes no position on this case."
- Every fired reason lists its fixed summary and its route's copy: "Needs a
  qualified adviser" for `professional_review`, "An operator can resolve this
  in the case file" for `operator_action`. A due-date-versus-deadline mismatch
  is a reason like any other, so it is always visible in the banner when it
  fires rather than folded into a generic message.
- A plain note appears whenever the banner reflects answers that differ from
  what was last saved, naming when the saved answers were last stored.
- No banner state, reason summary, or route copy states a legal position: an
  escalation never says a claim is barred, that terms are unenforceable, or
  that a debt is owed — only that the automated path stops and what kind of
  review or operator action follows.

## Truthful feedback

- **Pending:** state what is being checked and retain request/transaction metadata.
- **Mismatch:** name the exact field without declaring non-payment.
- **Failure:** distinguish an unavailable service or rejected proof from proof of absence.
- **Mock:** local mock outcomes must never be visually indistinguishable from live FDC outcomes.
- **Recorded fallback:** label recorded real testnet evidence as recorded.
- **Scope:** say “no qualifying payment in this defined window,” never “the company did not pay.”

## Accessibility and visual direction

- Never communicate status by color alone.
- Use persistent labels, icons, keyboard access, and visible focus.
- Keep identifiers copyable without requiring raw JSON inspection.
- Prefer ordinary payment language and explain blockchain terms at the point of use.
- Define typography, color roles, spacing, responsive behavior, and component states before frontend implementation.
- Avoid generic crypto neon, trading-terminal density, and decorative network imagery that competes with evidence.

## Implemented workspace layout

- Use a blue business-finance workspace with a persistent desktop sidebar and compact top bar.
- Lead with **Invoice protection** and the four-stage journey: Invoice → Confirm terms → Agreement → Evidence.
- Keep invoice upload, local-AI privacy, and human confirmation together in the dominant first workspace.
- Show recent live agreements immediately after invoice preparation; keep contract/verifier metadata in an optional disclosure.
- Collapse the sidebar into a compact branded top bar on narrow screens without hiding the Testnet label.
- Preserve ordinary payment language and make technical detail secondary throughout the layout.

## Update triggers

Update this file when journeys, screen responsibilities, state names/labels, copy boundaries, matching explanations, accessibility, or the visual system changes.
