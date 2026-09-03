# LatePay Shield

LatePay Shield turns confirmed invoice terms into a testnet payment agreement. XRPL supplies the payment record; a Flare Coston2 contract is designed to accept paid or overdue outcomes only when the corresponding FDC proof passes its matching rules.

**Prototype only:** testnets, no custody, no money movement, not legally binding, and not audited.

## Current milestone

| Capability | Current evidence |
|---|---|
| Canonical invoice hashing | Implemented in `lib/canonical.js`; local fixtures pass. |
| FDC XRPL address hash | Externally verified against a real `XRPPayment` response. |
| Agreement state machine | Implemented in `contracts/LatePayShield.sol`; local mock-verifier tests pass. |
| Verifier override guard | Local tests confirm a non-zero override is rejected at Coston2 chain ID `114`. |
| XRPL Testnet payment | Validated transaction `4174F0EC...249309`, ledger `20202706`, `tesSUCCESS`. |
| CI | Latest `main` workflow passed on 25 August 2026. |
| Coston2 deployment | Deployed at `0x1863...6dfa` (3 September 2026, corrected non-payment threshold); public readback passed. The superseded `0x4A49...78B1` keeps its own history. |
| Real FDC payment/non-payment proof | Both outcome branches have been accepted by the deployed Coston2 contract. |
| Frontend | Local React/Vite testnet UI implements agreement registration, Xaman payment, XRPL matching, and FDC-job progress. |
| AI assistant | Skill S1 (invoice term extraction) implemented behind an off-by-default flag; suggestions are quoted, editable, and never payment criteria. S2 to S5 are not implemented. |

See [`docs/project-status.md`](docs/project-status.md) for the complete verified, unverified, and blocked boundary.

## Setup

Requires Node.js 24 and npm.

```bash
npm ci
```

On any platform:

```bash
npm run check
```

This compiles and runs both suites — 58 passing executions. The override guard
needs `HARDHAT_CHAIN_ID=114`, which `scripts/run-override-guard.js` sets in Node
rather than in shell syntax, so one command works on macOS, Linux and Windows.
Verified on macOS; not yet confirmed on Windows.

Never create `.env` from real-money wallets. If a network spike needs local values, copy `.env.example` and use throwaway faucet-funded testnet accounts only.

### Local testnet UI

The browser application is a separate package so it does not share the Hardhat
dependency tree. It reads public chain state, asks MetaMask/Xaman to sign in
their respective wallets, and uses a loopback-only local service for server-side
Xaman requests and optional FDC job orchestration.

```bash
npm --prefix web install
npm run dev
```

See [`web/README.md`](web/README.md) for the testnet-only Xaman, opt-in FDC,
optional local AI, and operator-access configuration. The local service
authorizes every `/api/` request with an operator token and, by default,
accepts only loopback requests; `npm run dev` and `npm start` set that up for
you, and binding anything wider requires the explicit authenticated-deployment
settings in `.env.example`. The FDC job service uses the existing root scripts and local
throwaway Coston2 configuration; it is not a production backend or durable job
queue.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local UI and its loopback-only service from the repository root. |
| `npm run compile` | Compile Solidity `0.8.25` for the Paris EVM target. |
| `npm test` | Run the default suite, then the verifier guard. Cross-platform. |
| `npm run check` | Compile and run `npm test`; this is the GitHub Actions gate. |
| `npm run test:override-guard` | Re-run the guard at chain ID `114` via `scripts/run-override-guard.js`. |
| `npm run spike:xrpl` | Fund throwaway XRPL Testnet wallets, send a payment, and write non-secret evidence JSON. |
| `npm run deploy:coston2` | Deploy with the enshrined verifier; requires a funded throwaway Coston2 key. |
| `npm run deploy:check:coston2` | Read back deployed bytecode, chain, verifier override, and next agreement ID. |
| `npm run fdc:submit` | Query the FDC request fee and submit `FDC_ABI_ENCODED_REQUEST` on Coston2. |
| `npm run law:refresh` | Check whether any cited UK-law source has changed. Writes a proposal and a diff; never edits the committed snapshot. |

## Documentation map

| Document | Owns |
|---|---|
| [`docs/project-context.md`](docs/project-context.md) | Product scope, MVP, claims, and event constraints. |
| [`docs/architecture.md`](docs/architecture.md) | Implemented components, networks, dependencies, and target data flow. |
| [`docs/design.md`](docs/design.md) | User journey, product states, evidence UX, and visual direction. |
| [`docs/ui-language.md`](docs/ui-language.md) | Detailed UI language, visual roles, components, layout, and accessibility conventions. |
| [`docs/data-and-contracts.md`](docs/data-and-contracts.md) | Exact canonicalization, contract behavior, transitions, and matching semantics. |
| [`docs/testing-and-demo.md`](docs/testing-and-demo.md) | Test matrix, CI, evidence ledger, demo, and fallback procedure. |
| [`docs/tooling-runbook.md`](docs/tooling-runbook.md) | Exact testnet tools, URLs, inputs, outputs, and secret-handling rules for XRPL, FDC, and Coston2. |
| [`docs/project-status.md`](docs/project-status.md) | Current truth, blockers, known issues, and next priorities. |
| [`docs/issue-board.md`](docs/issue-board.md) | Task ownership, progress, and immediate execution order. |
| [`docs/decisions.md`](docs/decisions.md) | Durable decisions and rationale. |
| [`docs/ai/SKILLS.md`](docs/ai/SKILLS.md) | Local AI agent skills, output schemas, guardrails, and UK-law snapshot design. |
| [`docs/reference/`](docs/reference/) | Detailed historical planning material; not automatically authoritative. |

## Development pipeline

GitHub Actions runs locked dependency installation, compilation, all tests, and a
high-severity runtime dependency audit for every pull request and push to `main`.
Dependabot checks npm packages weekly and GitHub Actions monthly.

Work should land through short-lived branches and focused pull requests. Coston2 deployment
remains manual: CI never receives wallet keys and a passing workflow is not presented as
network or FDC evidence. The current sequence and its gates live in
[`docs/issue-board.md`](docs/issue-board.md) and
[`docs/plans/`](docs/plans/).

## Integration contract

Agreed boundary between the protocol side and the application side. Change it in one place
or the hashes diverge.

**Canonical terms.** [`lib/canonical.js`](./lib/canonical.js) is the only implementation.
Both frontend and backend import it — never reimplement serialization.
`invoiceHash = keccak256(utf8(JSON.stringify(canonical)))`, fixed field order, no whitespace,
all numbers as strings, `termsVersion: 1`.

```json
{"termsVersion":1,"invoiceNumber":"INV-2026-001","supplierName":"Maya Design Studio",
 "payerName":"Acme Ltd","currency":"XRP_TESTNET","amountDrops":"2000000",
 "xrplDestination":"r...","destinationTag":"2026001","dueAt":"1788264000"}
```

**Contract status enum** — [`contracts/LatePayShield.sol`](./contracts/LatePayShield.sol):

| On-chain | UI label | Meaning |
|---|---|---|
| `None` (0) | — | No such agreement |
| `Active` (1) | `ACTIVE` | Awaiting payment or deadline |
| `PaidVerified` (2) | `PAID_VERIFIED` | FDC-proved matching payment before the deadline |
| `OverdueVerified` (3) | `OVERDUE_VERIFIED` | FDC-proved absence of a qualifying payment |
| `Disputed` (4) | `DISPUTED` | Supplier flagged for human review; informational only |

`DRAFT`, `PAYMENT_SUBMITTED`, and `OVERDUE_PENDING` are **UI-only** and carry no evidence.
`OVERDUE_PENDING` is derived as `status == Active && now > dueAt`. It must never be
presented as a verified outcome.

**Events:** `AgreementCreated`, `PaymentVerified`, `NonPaymentVerified`, `Disputed`.

## How verification actually works

`ContractRegistry.getFdcVerification()` returns an `IFdcVerification` that inherits
`verifyXRPPayment()` and `verifyXRPPaymentNonexistence()`. The contract checks the Merkle
proof itself, so **no team-controlled verifier address is involved** — the proof is the
authority, not the caller. Both outcome functions are permissionless by design.

Attestation types (from the periphery package, both `@custom:supported XRP, testXRP`):

- `IXRPPayment` — id `0x08`. Request body is just `transactionId`.
- `IXRPPaymentNonexistence` — id `0x09`. Requires an explicit ledger range.

### Two correctness traps already handled

1. **Strictly-greater-than.** The nonexistence type searches for a payment *greater than*
   the requested `amount`. Requesting `expectedDrops` would ignore a payment of exactly
   `expectedDrops` and confirm a **false overdue**. The contract requires the request to
   encode `expectedDrops - 1`, and rejects anything else.
2. **Late payment.** A real payment arriving after `dueAt` reverts with `PaidAfterDeadline`
   rather than becoming `PAID_VERIFIED`. The supplier resolves it via `markDisputed`.

Non-matching proofs revert instead of producing a soft "unmatched" state, so a false
`PAID_VERIFIED` cannot be written.

### The test seam is not a backdoor

The constructor takes an `fdcVerificationOverride` so the state machine can be tested
without a live attestation round. Ungated, that would be a genuine backdoor — a deployment
pointed at a verifier that approves everything would emit `PaymentVerified` events
indistinguishable on-chain from real ones.

The constructor therefore **rejects any non-zero override unless `block.chainid` is 31337**,
the local test chain. On Coston2 the enshrined `FdcVerification` is the only verifier that
can be used, whatever the deployer intended. `npm run test:override-guard` re-runs the guard
under chain id 114 and asserts the deploy reverts with `VerifierOverrideNotAllowed`.

## Known unverified assumptions

- `startLedger` is supplied by the agreement creator and cannot be checked
  on-chain. It is a claim, corroborated off-chain against the agreement's
  creation block.
- `recordVerifiedNonPayment` pins its request to `expectedDrops - 1`, but the
  live verifier matches at or above the requested amount rather than strictly
  above it. The guard is still safe against a false overdue and is one drop
  wider than intended; see the known issues in
  [`docs/project-status.md`](docs/project-status.md).
- The browser-triggered FDC job has not been demonstrated as one uninterrupted
  recorded GUI run.

The address-hash formula, the Coston2 deployment, the verifier API key, the DA
layer endpoint, and both FDC outcome branches were open questions earlier in the
build and have since been settled against real testnet artifacts. The evidence
for each is recorded in
[`docs/testing-and-demo.md`](docs/testing-and-demo.md).

## Security

Testnets only. No mainnet network is configured. `.env` is git-ignored; wallet seeds are
never written to `evidence/`. No invoice text, names, or documents go on-chain — only
hashes and identifiers.
