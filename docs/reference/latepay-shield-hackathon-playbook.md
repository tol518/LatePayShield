# LatePay Shield - Hackathon Project Playbook

> **Historical planning reference:** This document predates the merged protocol implementation. Use `docs/project-status.md`, `docs/architecture.md`, and `docs/data-and-contracts.md` for current truth. Where this playbook differs, the implemented code and focused current documents take precedence.

**Status:** Locked-in concept
**Team:** Two people with limited crypto experience
**Build window:** 24 August to 4 September 2026
**Target environment:** XRPL Testnet and Flare Coston2 testnet
**Working principle:** Build one reliable, understandable proof of late-payment verification. Do not try to build a complete accounts-receivable product, lending protocol, legal product, or cross-chain bridge.

---

## 1. The concept in one sentence

LatePay Shield helps a small supplier turn an invoice into a verifiable payment agreement: it records the agreed payment terms, verifies a matching XRPL payment when one occurs, and can create evidence that a qualifying payment did **not** occur before the deadline.

The important idea is not “AI that chases invoices.” It is **verifiable payment compliance**. A supplier should not have to rely only on a payer's statement, a bank screenshot, or a manually maintained spreadsheet to establish whether an agreed payment arrived on time.

## 2. The problem we are solving

Late payment harms cash flow, particularly for freelancers and small businesses dealing with larger customers. After a deadline passes, the supplier commonly has to:

- chase accounts-payable teams;
- establish the original payment terms;
- check whether an incoming payment is genuinely linked to the invoice;
- calculate the overdue amount or interest;
- assemble evidence for a dispute or collection process.

Existing invoice tools can send reminders, but they normally depend on one party's database and manual reconciliation. LatePay Shield explores a narrower, more enforceable question:

> Can both parties use a payment agreement whose outcome is independently verifiable from the payment network?

That framing works well for an AI, blockchain, and government-technology audience. It is about SME resilience, payment accountability, and a useful application of trusted external data - not speculative trading.

### The user story to anchor every decision

Maya, a freelance designer, issues a £2,000 invoice to Acme Ltd, due on 30 September. She converts it into a LatePay Shield agreement and confirms the exact XRPL destination and invoice reference. Acme either pays the matching amount before the deadline, or it does not. LatePay Shield shows a clear, evidence-backed status in either case.

For the hackathon demo, use a much shorter deadline such as two minutes. Do not pretend the testnet workflow is a legally binding collection process.

## 3. Why blockchain is justified

The answer to “why blockchain?” must be concrete:

- **XRPL** provides the payment event and transaction record.
- **Flare** provides a smart-contract environment that can react to verified data from another chain.
- **Flare Data Connector (FDC)** is the reason this is more than a database integration: it is intended to let the app obtain cryptographically verifiable evidence of an external-chain event, including an eligible matching payment or its nonexistence in a defined period.
- **A smart contract** makes the agreement state and the state transitions inspectable and rule-driven.
- **AI** assists with administration, but it does not decide financial truth or move money without a human.

The product must never claim that “on-chain” makes an invoice automatically legally enforceable. The prototype proves a technical payment-evidence workflow. Legal enforceability, identity verification, payment terms, and collections remain real-world matters outside the MVP.

## 4. The product experience

### Core workflow

```text
Supplier uploads invoice or enters terms
                |
                v
AI extracts candidate fields; supplier confirms every field
                |
                v
Agreement is created on Flare and shown in the dashboard
                |
                v
Payer sends a matching XRPL Testnet payment with the agreed reference
                |
                +--> Matching payment verified --> PAID_VERIFIED
                |
                +--> Deadline passes, qualifying payment absent --> OVERDUE_VERIFIED
                                                       |
                                                       v
                                     Evidence card and calculated late-payment figure
```

### Product states

| State | Meaning | How it is reached |
|---|---|---|
| `DRAFT` | Terms are being prepared and are not authoritative. | Supplier is editing extracted fields. |
| `ACTIVE` | The agreement has been created and is awaiting a matching payment or the deadline. | Terms are confirmed and registered. |
| `PAYMENT_SUBMITTED` | The app has a candidate XRPL transaction or proof request. | User supplies transaction data or starts verification. |
| `PAID_VERIFIED` | A matching payment has been verified. | Verification result is accepted by the contract. |
| `OVERDUE_PENDING` | The due time has passed; the app is preparing/awaiting non-payment verification. | Current time is after deadline. |
| `OVERDUE_VERIFIED` | No qualifying payment was verified in the defined window. | A valid nonexistence verification is accepted. |
| `DISPUTED` | A person flags that the agreement requires review. | Explicit human action only. |

For the MVP, `DISPUTED` is an informational UI state. It must not attempt dispute resolution.

## 5. Architecture and responsibilities

### System map

```text
Browser (Next.js)
  - invoice form/upload
  - human confirmation screen
  - agreement dashboard and demo mode
          |
          v
Application service (TypeScript API routes or small Node service)
  - stores non-sensitive display data
  - requests AI extraction
  - talks to XRPL Testnet through xrpl.js
  - prepares/polls Flare verification requests
          |                         |
          v                         v
Flare Coston2                  XRPL Testnet
  - LatePayShield contract       - payment settlement record
  - agreement state              - destination and reference/memo
  - verification result entry    - transaction hash
  - deterministic calculation
          ^
          |
Flare verification path
  - FDC evidence for qualifying XRPL payment or defined non-payment window
  - FTSO price data only if using an XRP-denominated settlement calculation
```

### What belongs where

| Area | Responsibility | Keep it out of scope |
|---|---|---|
| Frontend | Create and view agreements; make state visible; require human confirmation. | Custody, signing private keys on a server, legal advice. |
| Backend | Coordinates API calls, temporary display data, AI extraction, and testnet requests. | Being the source of truth for whether payment happened. |
| XRPL | A real Testnet payment transaction with a destination and invoice-specific reference. | Complex DEX, bridges, issued currencies, production custody. |
| Flare smart contract | Stores minimal agreement commitments; accepts a verified outcome; enforces allowed state transitions. | Parsing PDFs, secret storage, unbounded invoice text. |
| FDC | Verifies the external XRPL claim where supported by the current SDK and testnet path. | A vague “oracle” claim without an implemented proof. |
| FTSO | Supplies an auditable price feed if an XRP-to-GBP calculation is demonstrated. | The main dependency of the MVP. |
| AI | Extracts suggested invoice terms and drafts a neutral reminder/evidence summary. | Automatically deciding correctness, legal status, or fund release. |

### Flare, XRPL, and AI in plain English

**XRPL:** The payment rail. The payer sends test XRP to the agreed test address, with a unique reference that lets the system distinguish this invoice from any other payment.

**Flare:** The rules and verification layer. A Solidity contract stores the agreement's fingerprint and the final verified outcome.

**FDC:** The cross-chain evidence layer. The technical spike must prove the exact current flow before it is made central to the app. If it cannot be completed reliably, the MVP still shows the XRPL transaction live and labels FDC verification as a clearly marked simulated/queued step only if the judges permit that distinction.

**FTSO:** Optional conversion evidence. It can demonstrate how an XRP-denominated payment maps to a GBP invoice value. Do not block the main demo on it; the simpler first demo is a fixed test-XRP amount.

**AI:** The document assistant. It turns an invoice into a prefilled form, explains the agreement in plain language, and drafts a reminder. The human confirms the terms before any agreement is registered.

## 6. MVP scope and non-goals

### Must-have MVP

1. A polished screen to create one agreement from a form or a simple sample invoice.
2. AI extraction that returns suggested amount, currency, due date, payer name, and invoice number - followed by mandatory human confirmation.
3. A Flare Coston2 contract deployment that creates and displays an agreement identifier.
4. An XRPL Testnet payment whose amount, recipient, and invoice reference can be inspected.
5. A successful-path status: `PAID_VERIFIED` after a matching payment.
6. An overdue-path status: a clearly evidenced overdue result, ideally FDC-backed nonexistence verification.
7. An evidence view containing agreement ID, invoice hash, expected payment details, deadline, status, and transaction/proof identifiers.
8. A rehearsed 2-3 minute pitch and a backup video/screenshots.

### Strong but optional

- FTSO-based XRP/GBP conversion snapshot.
- AI-generated reminder email that the user copies rather than sends automatically.
- A simple late-interest calculation with the rate shown as a configurable demonstration parameter.
- Wallet connect for user-owned Testnet wallets.
- QR payment link for the payer.

### Explicitly out of scope

- Real money, mainnet deployments, custodial wallets, or storing private keys.
- Automated collection, debt enforcement, credit scoring, or reputational blacklists.
- Claims of legal compliance, legal enforceability, AML/KYC certification, or credit advice.
- Full accounting-package integrations.
- FAssets/FXRP as a required dependency.
- Multiple currencies, multiple invoices, partial-payment reconciliation, payment plans, or real identity verification.

## 7. Data model ideas

Design the model so a hash and minimal financial commitments can live on-chain while the human-readable invoice stays private.

### Agreement

| Field | Example | Storage | Reason |
|---|---|---|---|
| `agreementId` | `LPS-0001` / contract-generated ID | On-chain and app DB | Stable link across screens. |
| `invoiceHash` | SHA-256 or keccak256 of canonical terms/document | On-chain | Detects later changes without publishing the invoice. |
| `supplierAddress` | Flare/Testnet address | On-chain | Agreement participant. |
| `payerLabel` | `Acme Ltd` | Off-chain | Human-readable, not a verified identity. |
| `xrplDestination` | XRPL Testnet address | On-chain if needed; display off-chain | Expected payment destination. |
| `destinationTag` | Numeric tag, if used | On-chain | Extra payment matching discriminator. |
| `invoiceReference` | `INV-2026-001` | Hash on-chain; display off-chain | Included in XRPL memo/reference. |
| `expectedDrops` | Test-XRP amount in drops | On-chain | Exact atomic comparison. |
| `dueAt` | Unix timestamp | On-chain | Determines deadline. |
| `status` | enum | On-chain | Authoritative lifecycle. |
| `xrplTxHash` | Transaction hash | On-chain after verification | Paid-path evidence. |
| `verificationId` | FDC request/proof ID | On-chain or event/log | Links outcome to evidence. |
| `termsVersion` | `1` | On-chain | Makes updates explicit. |

### Canonical invoice terms before hashing

Hash a stable JSON object with normalized keys and values, for example:

```json
{
  "invoiceNumber": "INV-2026-001",
  "supplierName": "Maya Design Studio",
  "payerName": "Acme Ltd",
  "currency": "XRP_TESTNET",
  "amountDrops": "2000000",
  "xrplDestination": "r...",
  "destinationTag": "2026001",
  "dueAt": 1788264000
}
```

Do not hash raw PDF bytes as the only source of truth. PDFs can change their internal metadata without changing their visible content. For the hackathon, use confirmed canonical fields and optionally retain the original file locally for display.

## 8. Smart contract responsibilities

The contract should be deliberately small. Its job is to preserve state and reject invalid transitions, not to reproduce an accounts-receivable system.

### Suggested contract interface

```solidity
enum AgreementStatus {
    Active,
    PaidVerified,
    OverdueVerified,
    Disputed
}

struct Agreement {
    bytes32 invoiceHash;
    address supplier;
    bytes32 xrplDestinationHash;
    bytes32 paymentReferenceHash;
    uint64 expectedDrops;
    uint64 dueAt;
    AgreementStatus status;
    bytes32 evidenceId;
    bytes32 xrplTxHash;
}

function createAgreement(
    bytes32 invoiceHash,
    bytes32 xrplDestinationHash,
    bytes32 paymentReferenceHash,
    uint64 expectedDrops,
    uint64 dueAt
) external returns (uint256 agreementId);

function recordVerifiedPayment(
    uint256 agreementId,
    bytes32 xrplTxHash,
    bytes32 evidenceId
) external;

function recordVerifiedNonPayment(
    uint256 agreementId,
    bytes32 evidenceId
) external;

function markDisputed(uint256 agreementId) external;
```

### Contract rules

- Only an `Active` agreement can become `PaidVerified` or `OverdueVerified`.
- A payment must not be recorded after `OverdueVerified` without a deliberately designed dispute/reconciliation path. For the MVP, flag it as disputed instead.
- The caller allowed to submit a verification result must be tightly limited. For a prototype, this can be a named verifier address controlled by the team; explain this limitation honestly. The technical stretch is to connect that role to the official FDC verification flow.
- Contract events must expose only the identifiers needed for the dashboard. Never put invoice text, email addresses, or an uploaded document on-chain.
- Interest is a display calculation first. Do not use a contract to move or seize funds.

## 9. User journeys

### Journey A: create an agreement

1. Supplier chooses a prepared demo invoice or uploads a simple PDF/image.
2. AI proposes fields in an editable form.
3. Supplier checks the amount, due date, XRPL destination, and invoice reference.
4. Supplier clicks **Create payment agreement**.
5. The app hashes the confirmed canonical terms, submits the contract transaction, and displays the agreement as `ACTIVE`.
6. The app shows the payer exactly how to pay: test-XRP amount, test address, and unique reference.

**Success criterion:** A judge can see the agreement ID, the immutable term hash, and the exact payment instructions without needing to understand code.

### Journey B: payment arrives

1. Payer uses a funded XRPL Testnet wallet to send the expected amount with the correct reference.
2. The app detects or receives the transaction hash.
3. The verification path checks recipient, amount, reference, and timeframe.
4. The contract records `PAID_VERIFIED` and emits an event.
5. The dashboard displays the green outcome with the XRPL transaction hash and verification/evidence ID.

**Success criterion:** The transaction can be independently opened in an XRPL Testnet explorer and the dashboard status agrees with it.

### Journey C: deadline passes without payment

1. The agreement becomes eligible for overdue verification when the demo deadline passes.
2. The app starts the non-payment verification request for the explicitly defined payment window.
3. Once evidence is available, the contract records `OVERDUE_VERIFIED`.
4. The dashboard shows an evidence card and a non-binding calculated late-payment figure/reminder draft.

**Success criterion:** The app makes clear that the conclusion refers only to the specified XRPL destination, amount, reference, and ledger/time range - not to every possible way Acme might have paid.

## 10. Technical spikes: prove the risky parts first

Do these before investing heavily in UI. Each spike must end with a short written result: works, fails, or needs a fallback.

| Priority | Spike | Definition of done | Fallback if it fails |
|---|---|---|---|
| P0 | XRPL Testnet payment | Send test XRP, include a unique memo/reference, retrieve transaction hash, and inspect it in an explorer. | Use transaction hash input and a pre-sent transaction. |
| P0 | Flare Coston2 deploy | Deploy a minimal contract and call `createAgreement`; read its event. | Use only the contract agreement path until network issue clears. |
| P0 | Contract-to-frontend | Browser reads a real agreement and transaction status. | Seed a known contract address/agreement ID in demo mode. |
| P1 | FDC payment evidence | Follow current official FDC examples to obtain a proof/result for a known XRPL Testnet payment. | Show real XRPL evidence plus a clearly labelled “FDC integration pending” branch; do not falsely call it verified by FDC. |
| P1 | FDC non-payment evidence | Verify the exact currently supported `XRPPaymentNonexistence` request and timing requirements. | Use a pre-recorded successful evidence package only if it is real and reproducible; otherwise demo payment verification and explain non-payment as the next integration. |
| P2 | FTSO price read | Read a live/supported testnet price feed and save the timestamp/value. | Use fixed test-XRP settlement, omit GBP conversion. |
| P2 | AI extraction | Extract fields from one controlled sample invoice and require confirmation. | Prefill a regular form from the sample JSON. |

### The kill rule

If an FDC spike is not producing credible, reproducible evidence by the end of **27 August**, do not let it consume the whole project. Complete a polished XRPL + Flare agreement/payment demo, keep the data connector integration visible as an honest work-in-progress, and spend time on the story, UX, and fallback media.

## 11. Learning roadmap

You do not need a general crypto education. Learn only what maps to your demo.

### Essential concepts, in order

1. **Wallet and private key:** A wallet controls an address; never put a private key in source control, screenshots, or a frontend bundle.
2. **Testnet and faucets:** Test money and test networks are for development. Verify which faucet/network is current before demo day.
3. **Transactions:** A signed network instruction; learn transaction hash, confirmation/finality, and explorer lookup.
4. **XRPL payment details:** Address, amount in drops, destination tag, memo/reference, Testnet wallet funding, and `xrpl.js` payment submission.
5. **EVM and Solidity:** Contract address, gas, events, mappings, enums, access control, and state transitions.
6. **Flare Coston2 tooling:** RPC configuration, deployment, contract verification if available, and test tokens for gas.
7. **FDC:** The current official flow, terminology, proof/result lifecycle, and the exact data needed to verify payment/non-payment.
8. **FTSO:** Only enough to read and present a price, if it earns its place in the story.
9. **Threat model:** Private keys, incorrect payment matching, duplicate submission, wrong network, stale prices, and unverified AI output.

### Best learning method

Each topic must produce a tiny artifact: one test transaction, one contract test, one FDC response, or one screen. Watching tutorials without producing an artifact is not progress this week.

## 12. Implementation order

### Phase 1: foundation and proof - first

1. Read official event rules and confirm what can be prepared before the event versus what must be built there.
2. Create a shared repository, task board, secret-management approach, and one environment checklist.
3. Get XRPL Testnet wallets funded and make a test payment with a unique reference.
4. Deploy the smallest Flare contract possible, create an agreement, and read it back.
5. Run the FDC payment and non-payment spikes.

### Phase 2: vertical slice - second

6. Define the canonical agreement payload and hash it consistently in frontend/backend/contract tests.
7. Implement agreement creation end to end: confirmed form -> hash -> contract transaction -> dashboard card.
8. Implement real XRPL payment submission/detection for the controlled demo wallet.
9. Wire the paid outcome into the contract only after the verification boundary is understood.

### Phase 3: demo quality - third

10. Add the overdue journey, first as a local test and then through the strongest real verification path available.
11. Add AI extraction for the single controlled sample invoice and confirmation UI.
12. Build the evidence view, error messages, and a demo-mode reset.
13. Capture backup video, screenshots, and transaction/proof links.

### Phase 4: pitch hardening - last

14. Rehearse an end-to-end demo with slow or unavailable network conditions.
15. Remove anything that weakens credibility, such as unverified claims, stand-in payment statuses, or features that cannot be explained in one sentence.

## 13. Testing strategy

### Contract tests

Test these exact behaviors locally before Coston2 deployment:

- `createAgreement` records the expected fields and emits an event.
- A new agreement starts as `Active`.
- Only the authorized verifier can record an outcome.
- A successful payment outcome changes `Active` to `PaidVerified`.
- A non-payment outcome after the deadline changes `Active` to `OverdueVerified`.
- An agreement cannot be moved from `PaidVerified` to `OverdueVerified`.
- A duplicate or invalid status transition reverts.
- `markDisputed` is restricted to the intended participant/role.

### Application tests

- The confirmed canonical JSON generates the same hash in every component that uses it.
- AI-extracted fields are editable and never registered before confirmation.
- Incorrect amount, wrong destination, wrong tag/reference, and late payment show non-matching states rather than a false “paid.”
- Network failures show an honest pending/error state and retain the transaction/proof identifier for retry.
- Demo data cannot accidentally point at mainnet.

### End-to-end rehearsal cases

| Case | Expected outcome |
|---|---|
| Exact payment before deadline | `PAID_VERIFIED`. |
| Correct amount, wrong reference | Not matched; explain why. |
| Wrong amount, correct reference | Not matched; explain why. |
| Payment after deadline | Not silently counted as on-time; flag for review/dispute. |
| No payment by deadline | `OVERDUE_VERIFIED` only with credible non-payment evidence; otherwise `OVERDUE_PENDING`. |
| FDC/RPC unavailable | Dashboard remains truthful, offers retry, and demo switches to recorded evidence. |
| AI extracts a wrong date | Human can edit it before agreement creation. |

## 14. Demo plan

### The three-minute narrative

**0:00-0:25 - Problem**
“A small supplier can do everything right and still spend weeks proving an invoice was not paid. LatePay Shield makes payment compliance independently verifiable.”

**0:25-0:55 - Create**
Show the sample invoice and AI-extracted terms. Deliberately point to the human confirmation step: “AI suggests; the supplier confirms.” Create the agreement and show its Flare ID/hash.

**0:55-1:40 - Pay**
Send or reveal the prepared XRPL Testnet payment. Show its unique reference and live transaction identifier. Switch to the status `PAID_VERIFIED` and reveal the evidence card.

**1:40-2:20 - Overdue branch**
Switch to a second, pre-prepared agreement where no matching payment exists in the defined window. Explain precisely what the non-payment evidence proves. Show the overdue outcome and non-binding interest/reminder card.

**2:20-3:00 - Why this architecture**
“XRPL settles. Flare verifies external-chain evidence and stores the agreement outcome. AI removes admin friction but cannot decide whether payment happened.” End with the SME/policy impact.

### Demo assets to prepare

- One clean sample invoice with harmless fictional names.
- Two prepared agreements: paid and unpaid.
- Funded XRPL Testnet and Coston2 wallets, with seed phrases never shown.
- QR code/payment details only if the flow is already reliable.
- XRPL transaction explorer link and Flare contract explorer link/bookmark.
- 60-90 second screen recording of the happy path.
- Screenshots of each key state and a one-page architecture diagram.
- A local “demo mode” that loads known IDs but visually labels any recorded material as a backup.

### If the live demo breaks

Say the truth plainly: “The Testnet endpoint is currently unavailable, so I will show the recorded testnet transaction and the evidence we captured.” Then show real identifiers and screenshots/video. Never simulate a transaction while implying it occurred live.

## 15. Pitch and judging considerations

### The story

Start with the human and economic cost of late payment. Introduce the practical gap: after a deadline, the party with less power still carries the burden of proving what did or did not happen. Then show the technical answer in a sentence: **an invoice becomes a minimal agreement whose outcome is independently verifiable against the payment rail.**

### Lines worth rehearsing

- “We are not putting invoices on a blockchain; we are making the outcome of a specific payment agreement verifiable.”
- “AI extracts and explains. People confirm. The payment network and verification layer establish the objective fact.”
- “Our MVP is deliberately small: one invoice, one defined payment route, two truthful outcomes.”
- “This is payment-evidence infrastructure, not an automated debt collector or a claim of legal adjudication.”

### Questions judges may ask

| Question | Answer direction |
|---|---|
| Why not use a normal database? | A database can track an invoice, but cannot independently prove an external XRPL payment/non-payment claim to a counterparty in the same way. |
| What does FDC add? | It is the bridge from an external XRPL fact to a Flare contract outcome; show the actual evidence path you implemented. |
| Is this legally binding? | Not in the prototype. It is technical evidence infrastructure and would need legal, identity, and contractual work for production. |
| What if the payer uses a different reference? | The payment intentionally does not auto-match; it becomes a review case. Exact matching prevents false positives. |
| Why AI? | It removes invoice-administration friction, but a human validates terms and AI is never the payment verifier. |
| What is next? | Accounting integration, consented identity, standardized evidence exports, and legally reviewed agreement templates - only after proving this core workflow. |

## 16. Risks and fallback options

| Risk | Prevention | Honest fallback |
|---|---|---|
| FDC flow is too complex or changes | Spike it first from current official documentation. | Do not fake FDC. Deliver real XRPL + Flare lifecycle and present FDC as the next verified integration. |
| Nonexistence verification timing is not demo-friendly | Use a pre-prepared expired agreement and confirm network requirements early. | Demo paid verification live; use a recorded, real overdue evidence case if reproducible. |
| Testnet faucet/RPC is unavailable | Fund wallets early; save addresses, hashes, and backup endpoints. | Recorded testnet proof with visible identifiers. |
| Blockchain scope grows uncontrollably | Keep contract small and only one payment format. | Cut FTSO, QR code, wallet connect, and AI upload before cutting the core lifecycle. |
| AI gives incorrect values | Mandatory review screen, constrained schema, and a controlled demo invoice. | Use a manually entered form. |
| Privacy concerns | Hash canonical terms; keep invoice text/files off-chain. | Demo with fictional data only. |
| Legal overclaim | Use precise language in UI and pitch. | Remove the interest/enforcement language if it looks like legal advice. |
| One teammate gets blocked | Pair on P0 spikes; keep a clear interface contract between frontend and blockchain work. | Reallocate both people to the working vertical slice. |

## 17. Two-person division of work

Work together for all P0 spikes, then split by boundary. Do not create a situation where only one person can run the demo.

### Shared responsibilities

- Read the official hackathon rules and sponsor documentation.
- Make the first XRPL Testnet payment.
- Deploy the first contract together.
- Decide the exact demo script and rehearse it daily from 31 August.
- Maintain a shared demo checklist, secret checklist, and fallback folder.

### Teammate A - protocol and verification lead

- XRPL Testnet wallet, payment, memo/reference, and transaction lookup.
- Solidity contract, local tests, Coston2 deployment, events, and access controls.
- FDC/FTSO technical spikes and evidence identifiers.
- Technical explanation for judges.

### Teammate B - product and application lead

- Next.js dashboard, design system, agreement form, and state visualization.
- AI extraction schema, confirmation flow, display database/state, and error handling.
- Demo mode, backup media, pitch deck/visuals, and product narrative.
- User-facing explanation of evidence.

### Integration contract between both people

Agree this early and write it in the README:

- the exact canonical agreement JSON;
- the hash function and encoding;
- contract address and ABI location;
- agreement ID/event format;
- API payloads for `create`, `get status`, `submit payment candidate`, and `get evidence`;
- all enum names and what the UI must show for each;
- testnet configuration values kept in `.env.example`, never real secrets.

## 18. Day-by-day roadmap

The goal is to arrive at Parliament with a rehearsed application. Treat 4 September as presentation and polish time, not the start of development.

| Date | Primary outcome | Concrete tasks | End-of-day check |
|---|---|---|---|
| **24 Aug, Mon** | Shared understanding and setup | Confirm official rules; create repo/board; choose exact MVP; create wallets; list testnet endpoints and faucets; draft canonical agreement fields. | Both can explain LatePay Shield in 30 seconds and access the repo without sharing secrets. |
| **25 Aug, Tue** | XRPL proof | Fund XRPL Testnet wallets; send a payment with unique memo/reference; retrieve and save hash/explorer link; sketch contract states. | A real Testnet payment is visible and its matching data is documented. |
| **26 Aug, Wed** | Flare proof | Configure Coston2; deploy minimal agreement contract; write local contract tests; create/read one agreement; begin FDC payment spike. | Contract address, event, and agreement ID are shown in a minimal script or console. |
| **27 Aug, Thu** | Risk decision | Complete FDC payment/non-payment experiments; document exact supported request path and timing; make the FDC kill/go decision; create static UI wireframe. | FDC is either credibly on-track or reduced to an explicitly honest fallback. |
| **28 Aug, Fri** | First vertical slice | Build confirmed agreement form; canonicalize/hash terms; call `createAgreement`; show an `ACTIVE` dashboard card. | Form -> Flare agreement -> dashboard works on testnet. |
| **29 Aug, Sat** | Paid path | Integrate `xrpl.js` transaction reading/submission; match expected amount, recipient, and reference; wire verified paid state; test failures. | Happy path is demonstrated end to end at least twice. |
| **30 Aug, Sun** | Overdue path | Implement deadline handling and strongest available non-payment evidence path; add overdue/evidence UI; add interest calculation only if basic path is solid. | Paid and overdue screens are understandable without a developer explaining them. |
| **31 Aug, Mon** | AI and polish | Add constrained AI extraction for controlled sample invoice; human confirmation; privacy copy; UX/loading/error states. | AI can be removed without breaking the core payment lifecycle. |
| **1 Sep, Tue** | Test and harden | Contract/unit/application tests; run all demo cases; create demo mode; record backup video; capture explorer links/screenshots. | Every failure case produces a truthful state, and backup assets are complete. |
| **2 Sep, Wed** | Pitch and mentor review | Write 3-minute script; build minimal slides; rehearse 3 times; ask a non-crypto friend to explain the product back to you. | The story is clear in under one minute and every technical claim can be demonstrated. |
| **3 Sep, Thu** | Freeze and rehearse | Freeze features; replenish testnet funds; validate links/endpoints; rehearse live and offline demos; pack charging/network contingencies. | No untested changes remain; both teammates can operate the demo alone. |
| **4 Sep, Fri** | Present confidently | Run a short pre-event smoke test; use mentor feedback only for small, safe changes; deliver the planned narrative; use backup assets if needed. | The team shows a working, truthful, narrow prototype and explains the next step credibly. |

## 19. Definition of ready

LatePay Shield is ready to present when all of these are true:

- Both teammates can describe the problem, product, and architecture without jargon.
- A real XRPL Testnet transaction exists with an invoice-specific matching reference.
- A real Flare Coston2 contract records at least one agreement and outcome.
- The dashboard has a truthful state for paid, overdue pending, overdue verified, mismatch, and network failure.
- Any claim about FDC or FTSO is backed by an implemented artifact or is clearly labelled as future work.
- No private keys or sensitive document contents appear in the repo, deck, video, or blockchain data.
- The live demo has been rehearsed, and a recorded fallback contains real testnet identifiers.
- The pitch never claims legal enforcement, automated debt collection, or AI financial authority beyond what the prototype actually proves.

## 20. First actions after reading this document

1. Read the official event rules together and write down what work may be done before the event.
2. Create two XRPL Testnet wallets, send one tiny test payment, and save its transaction hash.
3. Deploy the smallest possible agreement contract to Coston2.
4. Attempt the FDC payment proof before building the polished dashboard.
5. Keep the MVP locked: **one invoice, one payment route, one paid outcome, one overdue outcome, and an honest evidence screen.**

---

## Source context and verification notes

This playbook is based on the team's uploaded hackathon notes and the prior planning discussion that selected LatePay Shield from the original Autonomous Invoice Collection idea. The notes identify Flare and XRPL Commons as relevant sponsors/themes and emphasize AI, payments, cross-chain interoperability, trusted data/oracles, a polished demo, and a concise pitch.

Before implementing sponsor-specific calls, verify the current official Flare and XRPL documentation, Testnet availability, FDC attestation support and timing, FTSO feed availability, wallet tooling, and the event's pre-build rules. Sponsor SDKs and Testnet behavior can change; this document intentionally treats unverified integration details as spikes rather than promises.
