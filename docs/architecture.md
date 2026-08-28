# Architecture

**Current status:** Both FDC outcome branches have been accepted by fresh Coston2
agreements. A local React/Vite testnet application implements agreement creation,
XRPL payment guidance/Xaman payment requests, public XRPL matching, and opt-in FDC
job progress. It is not a durable or production application service.

## Implemented repository map

```text
contracts/
  LatePayShield.sol                 Agreement state machine and FDC proof checks
  test/MockFdcVerification.sol      Local-only verifier test seam
lib/
  canonical.js                      Sole canonical terms and hashing implementation
scripts/
  deploy.js                         Guarded Coston2 deployment
  xrpl-spike.js                     XRPL Testnet payment and evidence capture
test/
  canonical.test.js                 Serialization and validation fixtures
  LatePayShield.test.js             Contract state/matching tests with mock verifier
  VerifierOverrideGuard.test.js     Local-vs-live verifier override guard
evidence/
  xrpl-payment-*.json               Public non-secret testnet evidence
.github/
  workflows/ci.yml                  Node 24 compile/test/runtime-audit gate
  dependabot.yml                    Dependency update policy
web/
  src/                              React/Vite payment and evidence UI
  server/index.js                   Loopback-only Xaman and opt-in FDC job service
  vite.config.js                    Shared canonical-module alias and dev proxy
```

There is no database, durable job queue, authenticated multi-user backend, or AI
integration yet. The web service keeps Xaman sessions and FDC job progress in
memory and binds to `127.0.0.1` by default.

## Runtime and dependencies

| Area | Implemented choice |
|---|---|
| Runtime | Node.js 24 in CI; CommonJS modules |
| Contract tooling | Hardhat `2.29.1`, toolbox `5.0.0` |
| Solidity | `0.8.25`, optimizer enabled, Paris EVM target |
| Flare interfaces | `@flarenetwork/flare-periphery-contracts` `0.1.52` range |
| XRPL client | `xrpl` `5.1.0` range |
| EVM client/hash utilities | `ethers` `6.17.0` range |
| Configuration | `dotenv`; ignored local `.env` derived from `.env.example` |
| Web UI | React `19`, Vite `7`, and a CommonJS alias to `lib/canonical.js` |
| Xaman integration | Server-only `xumm-sdk`; credentials stay in the root ignored `.env` |

The earlier Next.js/TypeScript/Tailwind suggestion is not an implemented decision.

## Networks

| Network/service | Current configuration |
|---|---|
| Flare Coston2 | RPC `https://coston2-api.flare.network/ext/C/rpc`, chain ID `114` |
| XRPL Testnet | WebSocket `wss://s.altnet.rippletest.net:51233` |
| FDC verifier | `https://fdc-verifiers-testnet.flare.network`; requires `X-API-KEY`, published public test value |
| FDC DA layer | `https://ctn2-data-availability.flare.network` via the existing proof script |

Mainnet is deliberately absent from `hardhat.config.js`. The XRPL spike refuses endpoints that do not visibly identify as altnet/testnet.

## Current protocol flow

```text
Confirmed terms object
        |
        v
lib/canonical.js -> canonical JSON -> keccak256 invoiceHash
        |
        v
createAgreement(...) on LatePayShield
        |
        +---------------------------+
        |                           |
        v                           v
IXRPPayment proof            IXRPPaymentNonexistence proof
        |                           |
        v                           v
Contract validates proof and agreement-specific fields
        |                           |
        v                           v
PaidVerified                 OverdueVerified
```

The live proof-acquisition path is implemented in the root `fdc:*` scripts and
has completed both paid and overdue runs. The local web service may orchestrate
the paid chain only when `FDC_UI_AUTOMATION_ENABLED=true`; it invokes those
scripts unchanged, serializes jobs because they hand off through `evidence/`,
and never sends signing configuration to the browser. Local tests still inject
`MockFdcVerification` only on Hardhat chain ID `31337`.

## Component boundaries

### Canonicalization

`lib/canonical.js` owns field normalization, serialization order, numeric bounds, the invoice hash, and the provisional XRPL standard-address hash. Future frontend/backend code must import it rather than reproduce it.

### Agreement contract

`LatePayShield.sol` stores minimal commitments and state. It verifies submitted FDC proof structures, enforces agreement matching, emits evidence identifiers, and holds or moves no funds.

### FDC authority

On a live network the contract resolves `IFdcVerification` through Flare's `ContractRegistry`. Outcome functions are permissionless because proof verification, not caller identity, is intended to be authoritative.

### Local test seam

The constructor accepts a verifier override only at chain ID `31337`. A non-zero override reverts on chain ID `114`, preventing a Coston2 deployment from substituting a verifier that approves fabricated proofs.

### XRPL spike

`scripts/xrpl-spike.js` creates throwaway faucet-funded wallets, submits a Testnet payment, and stores public identifiers without seeds. It proves payment creation/retrieval, not FDC compatibility.

### Application layer

`web/` handles human confirmation, MetaMask agreement creation, public Coston2
reads, payment guidance, Xaman Testnet payment requests, public XRPL matching,
and truthful pending/failure states. Its optional FDC endpoint starts the
existing script chain only after the browser has matched a payment. The contract
remains the source of truth: the UI displays a final paid outcome only after a
fresh Coston2 read returns `PaidVerified`.

## Trust boundaries

- Invoice input and future AI output are untrusted until human confirmation.
- Browser/database state is not payment proof.
- `standardAddressHash()` uses `keccak256(UTF8(trimmedAddress))`, verified against a real FDC `XRPPayment` response.
- `startLedger` is supplied by the agreement creator and cannot be checked on-chain.
- The XRPL memo is recorded in evidence but is not checked by the current contract.
- Local mock-verifier tests prove state-machine behavior only.
- GitHub CI proves the checked-in local build/tests, not Coston2 deployment or FDC operation.

## Failure behavior required from future layers

| Failure | Required behavior |
|---|---|
| AI unavailable/invalid | Fall back to manual entry. |
| Wallet rejects transaction | Retain draft; never show success. |
| XRPL RPC unavailable | Retain identifiers; show retryable network failure. |
| Proof request pending | Remain pending and show request metadata. |
| Proof rejected or fields mismatch | Show verification failure/mismatch, not overdue or paid. |
| Flare write fails | Preserve last confirmed on-chain state and transaction error/hash. |

## Update triggers

Update this file when runtime versions, dependencies, networks, directories, component boundaries, trust boundaries, application stack, persistence, deployment, or cross-component data flow changes.
