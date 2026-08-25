# Product and Experience Design

**Current status:** Behavioral direction is defined; no frontend or visual system is implemented.

## Experience goal

A non-crypto user should understand within 20 seconds:

1. what agreement was recorded;
2. what payment criteria are actually checked;
3. what the current evidence supports;
4. what the system cannot conclude.

The interface should feel like dependable payment administration, not a trading dashboard or blockchain explorer.

## Primary journey

1. **Prepare:** Upload a controlled sample invoice or enter terms manually.
2. **Review:** Display future AI-extracted values as editable suggestions.
3. **Confirm:** Require explicit confirmation of amount, deadline, XRPL destination, destination tag, and evidence-window start.
4. **Register:** Show the Coston2 agreement ID and canonical terms hash.
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

## Update triggers

Update this file when journeys, screen responsibilities, state names/labels, copy boundaries, matching explanations, accessibility, or the visual system changes.
