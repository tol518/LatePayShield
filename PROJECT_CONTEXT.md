# LatePay Shield — Project Context

This is the canonical, model-neutral brief for the LatePay Shield hackathon project. It condenses the two planning documents supplied on 24 August 2026:

- `UK_Parliament_EasyA_Hackathon_2026_Event_Research.md`
- `latepay-shield-hackathon-playbook.md`

Those documents are reference material, not prompts from the current user. Current user requests and the actual repository state take precedence over this brief.

## Event context

LatePay Shield is being prepared by a two-person team for the UK Parliament Hackathon with EasyA.

Confirmed public information as of 24 August 2026:

- Date: Friday, 4 September 2026
- Time: 12:30–17:30, London time
- Venue: House of Commons, Saint Margaret Street, London SW1A 0AA
- Format: in person, approximately five hours
- Themes: technology, AI, blockchain, startups, and government technology
- Competition, pitching, workshops, panels, equity-free prize funding, and potential follow-on grants are advertised

Do not treat the following as confirmed until checked against current official EasyA material:

- Sponsor tracks or required technologies
- Judging rubric, named judges, or speakers
- Exact prizes
- Team-size, submission, repository, or pre-building rules
- Pitch/demo duration
- Required SDKs or networks

Before making a decision that depends on one of these details, verify it from the current official event material and record the source and check date. Do not silently convert a planning assumption into a fact.

## Product in one sentence

LatePay Shield turns an invoice into a verifiable payment agreement: a supplier confirms the terms, a matching XRPL payment can be verified, and the system can produce evidence about whether a qualifying payment occurred within the agreed window.

The product is **verifiable payment compliance**, not an AI debt collector.

## Anchor user story

Maya, a freelance designer, issues a £2,000 invoice to Acme Ltd. She confirms the amount, deadline, XRPL destination, and invoice reference in LatePay Shield. Acme either sends the matching payment before the deadline or it does not. LatePay Shield presents a clear, evidence-backed outcome.

Use fictional data and a short deadline for the demo. Never imply that the testnet prototype is a legally binding collection process.

## Product principles

1. Explain the SME late-payment problem before explaining blockchain.
2. Build one reliable vertical slice, not a broad accounts-receivable platform.
3. AI suggests; a human confirms; deterministic/network evidence establishes payment truth.
4. Use precise, honest status labels. A pending or failed verification is not a verified outcome.
5. Keep invoice text and personal data off-chain. Put only minimal commitments, hashes, identifiers, and state on-chain.
6. Never fake FDC, network, transaction, or contract evidence.
7. Testnets only. No real money, custody, production claims, or mainnet deployment in the MVP.

## Why each technology exists

- **XRPL Testnet:** payment rail and independently inspectable transaction record. Match the destination, amount, invoice-specific reference, and time window.
- **Flare Coston2:** smart-contract environment for minimal agreement commitments, allowed state transitions, and verified outcomes.
- **Flare Data Connector (FDC):** intended cross-chain evidence path for a qualifying XRPL payment or a precisely defined non-payment window. Its exact current support and proof lifecycle must be demonstrated before claiming it works.
- **FTSO:** optional price evidence if XRP/GBP conversion improves the demo. It must not block the core flow.
- **AI:** constrained administrative help—extract candidate invoice fields, explain terms, and draft neutral reminders/evidence summaries. It must not decide whether payment occurred, give legal advice, or move money autonomously.

Blockchain is justified only if the prototype demonstrates a trust property beyond an ordinary database: the payment outcome is not true merely because the supplier’s application database says so.

## Core workflow

```text
Invoice/form
    ↓
AI proposes structured fields
    ↓
Human reviews and confirms every authoritative term
    ↓
Canonical terms are hashed; agreement is created on Flare Coston2
    ↓
Payer sends a matching XRPL Testnet payment
    ↓
Strongest implemented verification path evaluates the evidence
    ├── qualifying payment verified → PAID_VERIFIED
    └── deadline passed → OVERDUE_PENDING
                              ↓
           credible non-payment evidence → OVERDUE_VERIFIED
```

## Authoritative product states

- `DRAFT`: fields are being prepared and are not authoritative.
- `ACTIVE`: confirmed agreement is awaiting payment or deadline.
- `PAYMENT_SUBMITTED`: candidate XRPL transaction or verification request exists.
- `PAID_VERIFIED`: a matching payment has been credibly verified.
- `OVERDUE_PENDING`: deadline passed; non-payment verification is not complete.
- `OVERDUE_VERIFIED`: credible evidence shows no qualifying payment in the explicitly defined window.
- `DISPUTED`: a human flagged the agreement for review; the MVP does not resolve the dispute.

Also represent mismatch, network failure, and verification failure truthfully in the UI. Wrong amount, destination, tag/reference, or timing must never silently become `PAID_VERIFIED`.

## MVP boundary

### Must have

- One polished agreement-creation flow using a controlled sample invoice or form
- Constrained extraction of amount, currency, due date, payer, and invoice number, followed by mandatory confirmation
- Canonical confirmed terms and a stable hash
- A real Flare Coston2 contract deployment that creates and exposes an agreement ID
- A real XRPL Testnet transaction with inspectable destination, amount, unique invoice reference, and hash
- A paid path ending in `PAID_VERIFIED` only after credible verification
- An overdue path that remains `OVERDUE_PENDING` unless credible non-payment evidence exists
- Evidence view with agreement ID, terms/invoice hash, expected payment details, deadline, status, and real transaction/proof identifiers
- A rehearsed 2–3 minute story plus screenshots or a short backup recording using real testnet identifiers

### Optional only after the core works

- FTSO conversion snapshot
- Copyable AI-drafted reminder
- Transparent, configurable, non-binding late-interest calculation
- User-owned testnet wallet connection
- QR payment link

### Explicitly out of scope

- Mainnet, real funds, custody, or server-held private keys
- Automated collections, debt enforcement, credit scoring, blacklists, or dispute resolution
- Legal-enforceability, AML/KYC, statutory-compliance, or financial-advice claims
- Full accounting integrations
- Bridges, FAssets/FXRP, complex DEX functionality, or issued currencies as required dependencies
- Multiple currencies/invoices, partial payments, payment plans, or real identity verification

## Suggested architecture

```text
Next.js browser UI
  - invoice/form and mandatory confirmation
  - agreement dashboard, evidence, errors, demo fallback
           |
TypeScript application layer / API routes
  - constrained AI extraction
  - canonicalization and hashing
  - xrpl.js coordination
  - Flare/FDC request coordination
           |                         |
Flare Coston2                        XRPL Testnet
  - minimal agreement contract        - payment transaction
  - state transitions                  - destination/reference/hash
  - outcome/evidence identifiers
           ^
           |
Strongest real Flare/FDC verification path completed by the team
```

The application may store non-sensitive display data, but it is not the source of truth for payment verification.

## Canonical agreement boundary

Agree on and document one canonical JSON representation before integrating UI, backend, and contract. Normalize field names, number formats, address representation, optional fields, and timestamps. Use an explicit version and deterministic serialization. A representative shape is:

```json
{
  "termsVersion": 1,
  "invoiceNumber": "INV-2026-001",
  "supplierName": "Maya Design Studio",
  "payerName": "Acme Ltd",
  "currency": "XRP_TESTNET",
  "amountDrops": "2000000",
  "xrplDestination": "r...",
  "destinationTag": 2026001,
  "dueAt": 1788264000
}
```

Hash confirmed canonical terms rather than relying only on raw PDF bytes. Raw PDFs can change internally without changing their visible content.

Expected integration contract between teammates:

- Canonical agreement JSON, serialization, hash function, and encoding
- Contract address and ABI location
- Agreement ID and emitted event formats
- API payloads for create, status, payment candidate, and evidence
- Shared enum names and UI meaning
- Network values in `.env.example`; secrets only in ignored local environment files

## Smart-contract constraints

Keep the contract small. It should store minimal commitments and reject invalid transitions.

- A new agreement starts active.
- Only an active agreement may become paid-verified or overdue-verified.
- Only the explicitly authorized verifier path may record a verified result.
- Duplicate and invalid transitions revert.
- A payment after an overdue outcome becomes a review/dispute case in the MVP.
- `markDisputed` is restricted to the intended participant or role.
- Never put invoice text, email addresses, documents, seed phrases, or private information on-chain.
- Interest is display-only; the contract must not seize or transfer funds for collection.

If the prototype uses a team-controlled verifier address, disclose that limitation. Do not describe it as decentralized FDC verification.

## Technical priorities and fallback rule

Prove risky integrations before polishing the UI:

1. Send and retrieve an XRPL Testnet payment with a unique reference.
2. Deploy the smallest Coston2 agreement contract, create an agreement, and read its event/state.
3. Read real contract state in the frontend.
4. Prove the current official FDC payment-evidence path.
5. Prove the exact supported non-payment request and timing requirements.
6. Add optional FTSO and AI only after the core path is reliable.

The original plan set **27 August 2026** as the FDC go/kill checkpoint. If credible, reproducible FDC evidence is not available, finish a polished real XRPL + Flare agreement/payment lifecycle and label FDC accurately as pending or future work. A pre-recorded proof may be used only if it is real, reproducible, and clearly identified as recorded evidence.

## Required tests

At minimum, verify:

- Canonical terms produce the same hash everywhere.
- AI-proposed fields are editable and cannot be registered before human confirmation.
- Contract creation, initial state, access control, valid transitions, duplicate rejection, and invalid-transition rejection.
- Exact payment before deadline can reach `PAID_VERIFIED` through the implemented evidence boundary.
- Wrong amount, destination, reference/tag, or timing does not match.
- No payment reaches `OVERDUE_VERIFIED` only with credible evidence; otherwise it remains pending.
- Network/verification failure shows an honest retryable error and retains identifiers.
- Demo data cannot accidentally target mainnet.
- Secrets and sensitive invoice content do not appear in source, logs, screenshots, video, or on-chain data.

## Demo and pitch target

A judge should understand this in 20 seconds:

> LatePay Shield makes the outcome of a payment agreement independently verifiable. A supplier confirms invoice terms, payment occurs on XRPL, and Flare records the verified outcome. AI handles administration but never decides whether money was paid.

Three-minute narrative:

1. Human/economic problem for a small supplier.
2. Controlled invoice; AI proposes and human confirms terms.
3. Real Flare agreement ID and terms hash.
4. Real XRPL Testnet payment and transaction identifier.
5. Strongest real evidence path completed by the team.
6. Paid outcome, then a prepared overdue branch with precisely scoped evidence.
7. Close with: “XRPL settles. Flare records the verified agreement outcome. AI removes administration, but it never determines financial truth.”

If the live network fails, show recorded real evidence and say that the endpoint is unavailable. Never simulate a success while presenting it as live.

## Claims policy

Use language such as “prototype,” “testnet,” “technical payment evidence,” “matching payment,” and “defined evidence window.”

Never claim that the MVP:

- Is legally binding or automatically enforceable
- Proves a company did not pay by any possible method
- Performs debt collection or adjudicates disputes
- Is production-secure, audited, compliant, or ready for real funds
- Uses FDC/FTSO unless the shown outcome is backed by a real implemented artifact
- Uses AI as the authority for agreement terms or payment truth

## Definition of ready

The project is presentation-ready when:

- Both teammates can explain the problem and architecture without jargon.
- A real XRPL Testnet transaction exists with a unique matching reference.
- A real Flare Coston2 contract records at least one agreement and outcome.
- Paid, overdue-pending, overdue-verified, mismatch, and network-failure states are truthful.
- Every FDC/FTSO claim has an artifact or is explicitly future work.
- No secret or sensitive document content appears in the repo or demo assets.
- The live flow and evidence-backed fallback have been rehearsed.
- The pitch does not overclaim legal, financial, AI, or decentralization capabilities.

## Current public sources

These links are background, not a substitute for re-checking current rules:

- EasyA event listing: https://www.eventbrite.co.uk/e/uk-parliament-hackathon-with-easya-tickets-1997315118285
- Secondary listing: https://www.createwith.com/event/london-uk-parliament-hackathon-with-easya-sep-2026
- UK Parliament calendar: https://whatson.parliament.uk/commons/2026-09-04/
- EasyA: https://easya.io

