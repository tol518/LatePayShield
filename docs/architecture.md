# Architecture

**Current status:** Protocol foundation implemented locally; XRPL payment spike completed; Coston2 deployment, FDC proof acquisition, application layer, and frontend are not implemented.

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
```

No web application, API, database, wallet UI, or AI integration exists yet.

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

The application stack remains open. The earlier Next.js/TypeScript/Tailwind suggestion is not an implemented decision.

## Networks

| Network/service | Current configuration |
|---|---|
| Flare Coston2 | RPC `https://coston2-api.flare.network/ext/C/rpc`, chain ID `114` |
| XRPL Testnet | WebSocket `wss://s.altnet.rippletest.net:51233` |
| FDC verifier | `https://fdc-verifiers-testnet.flare.network`; API-key requirement not confirmed |
| FDC DA layer | Base URL not configured or confirmed |

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

The live proof-acquisition path between XRPL and these contract calls does not exist yet. Local tests inject `MockFdcVerification` only on Hardhat chain ID `31337`.

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

### Future application layer

The future application must handle human confirmation, agreement creation, proof requests/polling, contract transactions, evidence presentation, and truthful errors. It must not become the source of truth for verified outcomes.

## Trust boundaries

- Invoice input and future AI output are untrusted until human confirmation.
- Browser/database state is not payment proof.
- `standardAddressHash()` is unverified until compared with a real FDC response.
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
