# LatePay Shield Project Context

**Concept:** Locked
**Team:** Two people with limited crypto experience
**Build window:** 24 August to 4 September 2026
**Event:** UK Parliament Hackathon with EasyA, 4 September 2026

## Product definition

LatePay Shield turns confirmed invoice terms into a verifiable payment agreement. A qualifying XRPL Testnet payment can support a paid outcome, while an explicitly bounded FDC non-payment proof can support an overdue outcome.

The product is **verifiable payment compliance**, not an AI debt collector.

### Anchor story

Maya, a fictional freelance designer, confirms a £2,000 invoice agreement for Acme Ltd. The agreement records the required XRPL destination, destination tag, minimum amount, evidence-window start, and deadline. LatePay Shield presents only the strongest outcome supported by the implemented evidence.

The current contract does not verify invoice memo text. Its on-chain payment discriminator is the destination tag. Do not describe the memo/reference as an FDC-verified matching field unless the implementation changes.

## Product principles

1. Explain the supplier's late-payment problem before explaining blockchain.
2. Build one reliable vertical slice, not a complete accounts-receivable platform.
3. AI suggests; a human confirms; deterministic rules and network evidence establish payment truth.
4. A pending or failed verification is not a verified outcome.
5. Keep invoice documents, personal data, and secrets off-chain.
6. Use testnets only and never fake network, transaction, contract, FDC, or FTSO evidence.
7. Describe current implementation separately from the target product.

## Technology responsibilities

| Technology | Responsibility |
|---|---|
| XRPL Testnet | Payment rail and independently inspectable transaction. |
| Flare Coston2 | Intended deployment network for the agreement state machine and FDC proof verification. |
| Flare Data Connector | Proof authority for XRPL payment or precisely bounded non-payment. Real proof acquisition is not implemented yet. |
| FTSO | Optional future price evidence; it must not block the core workflow. |
| AI | Optional future extraction and administrative assistance. It cannot establish payment truth or authorize funds. |

Blockchain earns its place only when the demo proves a trust property beyond “our application database says so.”

## MVP boundary

### Required

- One controlled invoice/form and mandatory human confirmation.
- Stable canonical terms and a deterministic hash.
- A real Flare Coston2 agreement ID from the guarded contract.
- A real XRPL Testnet payment with an inspectable destination, amount, destination tag, memo, and transaction hash.
- A paid outcome labelled verified only after a real FDC payment proof passes the contract.
- An overdue outcome that remains pending unless a real FDC non-payment proof passes the contract.
- An evidence screen showing real identifiers, the matching fields, and disclosed limitations.
- A rehearsed 2-3 minute demo with evidence-backed fallback media.

### Optional after the core works

- AI invoice extraction and a copyable reminder.
- FTSO conversion snapshot.
- Transparent, configurable, non-binding interest calculation.
- User-owned testnet wallet connection or QR payment link.

### Out of scope

- Mainnet, real money, custody, or server-held private keys.
- Automated collection, debt enforcement, credit scoring, blacklists, or dispute adjudication.
- Legal, AML/KYC, compliance, financial-advice, security-audit, or production-readiness claims.
- Full accounting integrations, bridges, FAssets/FXRP, DEX functionality, or issued currencies.
- Multiple currencies/invoices, partial payment accounting, payment plans, or real identity verification.

## Claims policy

Use precise language such as “prototype,” “testnet,” “minimum qualifying payment,” “technical payment evidence,” and “defined ledger/time window.”

Never imply that the MVP:

- proves a payer did not use any possible payment method;
- is automatically enforceable or performs debt collection;
- is production-secure, compliant, or audited;
- uses real FDC or FTSO evidence unless the shown result has a reproducible artifact;
- gives AI authority over agreement terms, verification, or funds;
- verifies an XRPL memo/reference when the current contract does not inspect it.

## Event assumptions

The event date and public description were checked during planning. Sponsor tracks, judging criteria, prizes, pre-building rules, required networks, and pitch duration remain assumptions until rechecked against current official event material. Record consequential checks in `docs/decisions.md` with source and date.

## Definition of presentation-ready

- Both teammates can explain the problem and architecture without jargon.
- A real Coston2 deployment and real XRPL Testnet transaction support the shown agreement.
- Any displayed final paid/overdue state is backed by a real FDC proof accepted by the deployed contract.
- Pending, mismatch, failed verification, and network failure remain visibly distinct.
- No secret or sensitive content appears in source, logs, screenshots, video, or on-chain data.
- The live flow and evidence-backed fallback have been rehearsed.
