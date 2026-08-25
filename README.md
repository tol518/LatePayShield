# LatePay Shield

Turns an invoice into a verifiable payment agreement. A supplier confirms terms, a payer
sends an XRPL Testnet payment, and a Flare Coston2 contract records the outcome — but only
when an FDC attestation proof backs it.

**Testnet prototype.** Not legally binding, not audited, holds no funds, moves no money.
See "Claims policy" in [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md).

## Setup

Requires Node 24 (`brew install node@24`).

```bash
npm install
cp .env.example .env       # fill in; .env is git-ignored and must stay that way
npm test
```

## Commands

| Command | What it does |
|---|---|
| `npm run check` | Local CI gate: compile and run the full test suite |
| `npm test` | Full suite: state machine, canonical hashing, verifier guard (50 test executions, no network) |
| `npm run test:override-guard` | Re-runs the guard test with chain id 114 to prove it rejects a fake verifier |
| `npm run compile` | Compile against the Flare periphery package |
| `npm run spike:xrpl` | P0 spike: real XRPL Testnet payment, writes `evidence/*.json` |
| `npm run deploy:coston2` | Deploy to Coston2 (needs `COSTON2_PRIVATE_KEY` + C2FLR) |

## Networks

| | |
|---|---|
| Flare Coston2 RPC | `https://coston2-api.flare.network/ext/C/rpc` (chain id **114**, C2FLR) |
| Coston2 explorer / faucet | [explorer](https://coston2-explorer.flare.network) · [faucet](https://faucet.flare.network/coston2) |
| XRPL Testnet | `wss://s.altnet.rippletest.net:51233` · [explorer](https://testnet.xrpl.org) |
| FDC verifier | `https://fdc-verifiers-testnet.flare.network` |

Verified against official Flare docs on 25 August 2026. Re-check before demo day.
Mainnet is deliberately absent from `hardhat.config.js` so demo data cannot target real funds.

## Development pipeline

GitHub Actions runs locked dependency installation, compilation, all tests, and a
high-severity runtime dependency audit for every pull request and push to `main`.
Dependabot checks npm packages weekly and GitHub Actions monthly.

Work should land through short-lived branches and focused pull requests. Coston2 deployment
remains manual: CI never receives wallet keys and a passing workflow is not presented as
network or FDC evidence.

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

## Status

| Step | State |
|---|---|
| Repo, Hardhat, Coston2 config | ✅ |
| CI workflow | ✅ configured; first successful GitHub run pending |
| Agreement contract + 50 local test executions | ✅ (mock verifier — proves the state machine, **not** FDC) |
| Canonical hashing shared module | ✅ |
| Real XRPL Testnet payment | ✅ see [`evidence/`](./evidence) |
| Coston2 deployment | ⬜ needs a funded key |
| FDC XRPPayment proof | ⬜ **the real risk** |
| FDC XRPPaymentNonexistence proof | ⬜ |
| Frontend | ⬜ |

## Known unverified assumptions

- **`standardAddressHash()`** in `lib/canonical.js` is inferred from the interface docs and
  has **not** been confirmed against a real attestation response. Confirm by requesting an
  `XRPPayment` attestation for the transaction in `evidence/` and checking that the returned
  `receivingAddressHash` matches. Until then, destination matching is unproven.
- The FDC verifier may require an API key; not yet obtained.
- DA Layer base URL not yet confirmed (`FDC_DA_LAYER_BASE_URL` is blank).
- `startLedger` is supplied by the creator and cannot be checked on-chain. It is a claim,
  corroborated off-chain against the agreement's creation block.

## Security

Testnets only. No mainnet network is configured. `.env` is git-ignored; wallet seeds are
never written to `evidence/`. No invoice text, names, or documents go on-chain — only
hashes and identifiers.
