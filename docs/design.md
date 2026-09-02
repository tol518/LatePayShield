# Product and Experience Design

**Current status:** The local testnet UI implements preparation, MetaMask
registration, live agreement reads, Xaman/manual payment submission, XRPL
matching, FDC job progress, optional local AI invoice extraction, and local
case-file persistence. Authentication, multi-user storage, and a production
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

- Status and plain-language meaning.
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
