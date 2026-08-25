# Testing, Verification, CI, and Demo

**Last verified locally:** 25 August 2026 on Windows with Node `24.19.0`
**Remote baseline:** `main` commit `e459042`

## Verification levels

1. Reproducible live testnet result with inspectable identifiers.
2. Reproducible recorded testnet result with the same real identifiers.
3. Local deterministic test using a clearly identified mock.
4. UI fixture or simulation.
5. Planned behavior without an implementation artifact.

The product, docs, and pitch must identify the actual level.

## Local baseline

- Solidity compilation: 123 files compiled successfully for Paris EVM.
- Default Hardhat suite: 46 passing executions.
- Chain-ID-114 verifier guard: 4 passing executions.
- Total: 50 passing test executions.
- Runtime dependency audit: `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities.

The committed `npm run check` script is not currently cross-platform: `HARDHAT_CHAIN_ID=114 ...` fails in Windows `cmd.exe`. The equivalent Windows commands are documented in `README.md`. This is a command defect even though the underlying four guard executions pass when the variable is set through PowerShell.

`npm ci` reports vulnerabilities in the larger development dependency graph. Do not convert the clean runtime audit into a claim that the full dependency tree has zero vulnerabilities. Dependabot's current Hardhat/toolbox major-version PRs fail CI and should not be merged blindly.

## Test inventory

### Canonicalization

- deterministic output and input-key-order independence;
- numeric/string equivalence and whitespace trimming;
- hash changes for every authoritative field;
- fixed serialization order;
- missing/empty field rejection;
- amount, destination-tag, timestamp, and currency bounds.

### Agreement contract

- creation, initial state, event data, and invalid terms;
- paid proof success, overpayment, permissionless submission, and evidence storage;
- wrong verifier result, destination, amount, tag, ledger window, transaction status, timing, duplicate, and unknown agreement;
- non-payment proof timing, amount-threshold trap, ledger/deadline window, destination/tag, and verifier rejection;
- incompatible final transitions;
- supplier-only disputes and duplicate-dispute rejection.

### Verifier override guard

- zero override resolves the enshrined path;
- local chain ID `31337` permits the test seam;
- chain ID `114` rejects a non-zero override for any deployer.

## GitHub Actions

The `CI` workflow runs on pushes to `main`, pull requests, and manual dispatch using Node 24:

1. `npm ci`
2. `npm run check`
3. `npm audit --omit=dev --audit-level=high`

The `main` workflow for merge commit `e459042` completed successfully on 25 August 2026. CI receives no wallet key and proves no live network/FDC behavior.

## Evidence ledger

| Capability | Level | Evidence | Current conclusion |
|---|---|---|---|
| Canonical hash | Local deterministic tests | `test/canonical.test.js` | Implemented locally. |
| Contract state/matching | Local mock-verifier tests | `test/LatePayShield.test.js` | Contract logic tested; FDC not proven. |
| Override guard | Local tests at 31337 and 114 | `test/VerifierOverrideGuard.test.js` | Non-zero live-network override rejected. |
| XRPL payment | Live Testnet transaction | `4174F0EC6537F2E71DAEFD7E0412CB885BCF44F63A5D9E233042251B15249309` | Rechecked live: validated, ledger `20202706`, `tesSUCCESS`, 2,000,000 drops, destination tag `2026001`, memo `INV-2026-001`. |
| Coston2 deployment | Planned | None | Not deployed. |
| FDC payment proof | Planned | None | Not implemented. |
| FDC non-payment proof | Planned | None | Not implemented. |
| FTSO | Optional/planned | None | Not implemented. |
| Frontend | Planned | None | Not implemented. |

## Required next integration tests

1. Obtain a real `XRPPayment` attestation for the committed transaction.
2. Compare its `receivingAddressHash` against `standardAddressHash()`.
3. Submit the real proof to a deployed Coston2 agreement and retain contract/proof identifiers.
4. Define a safe ledger range and obtain `XRPPaymentNonexistence` evidence.
5. Confirm the `expectedDrops - 1` threshold using the real verifier response.
6. Exercise network pending, timeout, rejection, and retry behavior through the future application.

## Three-minute demo

1. **Problem:** supplier burden and the need for a shared payment outcome.
2. **Confirm:** controlled invoice, human-confirmed terms, real agreement ID/hash.
3. **Paid branch:** real XRPL transaction and, once available, real FDC proof accepted on Coston2.
4. **Overdue branch:** precisely bounded non-payment evidence; otherwise remain visibly pending.
5. **Close:** XRPL provides the payment record, Flare verifies/records the agreement outcome, and future AI removes administration without determining financial truth.

## Fallback procedure

If a live endpoint fails, state that directly and show recorded real testnet evidence with identifiers. Never present a mock-verifier transition, fixture, or prerecorded sequence as a live FDC result.

## Update triggers

Update this file when commands, test counts/results, CI status, audit results, spike evidence, live identifiers, known failure behavior, demo steps, or fallback media changes.
