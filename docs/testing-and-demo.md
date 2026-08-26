# Testing, Verification, CI, and Demo

**Last verified locally:** 26 August 2026 on macOS with Node `24.19.0`
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
- Default Hardhat suite: 48 passing executions.
- Chain-ID-114 verifier guard: 4 passing executions.
- Total: 52 passing test executions.
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
- real FDC `receivingAddressHash` fixture and whitespace-equivalent address hashing.

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
| Coston2 deployment | Live testnet deployment | `0xfec3a90684482dd2cbc04c5a2e25a948968570b64fd1c7e610f13dfdcb487ae3` | Contract `0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1`; chain `114`; zero verifier override; public RPC readback passed. |
| FDC payment proof | Real Coston2 request and DA response | XRPL transaction `A0DA3E67...ADF3565`; Coston2 request `68503B0C...6BC99F`; voting round `1437032` | `receivingAddressHash` matched the corrected local hash. Proof submission to `LatePayShield` remains pending. |
| FDC non-payment proof | Planned | None | Not implemented. |
| FTSO | Optional/planned | None | Not implemented. |
| Frontend | Planned | None | Not implemented. |

## External verification runbook

Use a throwaway, faucet-funded Coston2 wallet. Keep `COSTON2_PRIVATE_KEY` only in
the ignored `.env`; never copy it, a recovery phrase, or an XRPL seed into evidence.
The complete tool-by-task handoff—including MetaMask, faucet, Swagger, explorer,
and DA URLs—is in [`tooling-runbook.md`](tooling-runbook.md).

### 1. Verify `standardAddressHash()` — completed

1. Create a public XRPL Testnet payment artifact:

   ```bash
   npm run spike:xrpl
   ```

2. In the XRP verifier Swagger, prepare `XRPPayment` using the transaction hash and
   the published test API key. Put the returned public `abiEncodedRequest` in
   `FDC_ABI_ENCODED_REQUEST`.
3. Query the fee and submit the request to Coston2:

   ```bash
   npm run fdc:submit
   ```

4. After its voting round finalizes, retrieve the DA proof using the same request
   bytes and round ID. Compare `response.responseBody.receivingAddressHash` with:

   ```bash
   node -e "const { standardAddressHash } = require('./lib/canonical'); console.log(standardAddressHash('rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V'))"
   ```

The real response and corrected implementation both produced
`0x4abeacf6f2ad7fbb211ba1b703aecc2edd2933e84039bcade6e6488d9ddbfb8f`.

### 2. Verify the Coston2 deployment — completed

Deploy using the guarded script, which always passes a zero verifier override:

```bash
npm run deploy:coston2
```

Put the printed public contract address in `LATEPAY_SHIELD_ADDRESS`, then repeat the
public chain, bytecode, override, and initial-state readback:

```bash
npm run deploy:check:coston2
```

The recorded deployment is contract `0x4A49...78B1`, transaction `0xfec3...7ae3`,
chain ID `114`, with zero verifier override.

### 3. Verify the real paid path — pending

The old `A0DA...` payment proves FDC compatibility but predates any agreement on the
new deployment. It must not be submitted as proof of a newly created agreement.

Required order:

1. Capture the current validated XRPL ledger.
2. Create a fresh agreement on `0x4A49...78B1` using the corrected destination hash.
3. Send a new matching XRPL Testnet payment after the agreement transaction confirms.
4. Prepare its `XRPPayment`, run `npm run fdc:submit`, and retrieve the finalized DA proof.
5. Submit that proof to `recordVerifiedPayment` and confirm the agreement reads back as
   `PaidVerified` with matching destination, amount, tag, ledger, and deadline.

Agreement creation, DA retrieval, and proof submission commands are not implemented
yet; this is the remaining integration work, not a completed verification claim.

## Required next integration tests

1. Submit the real `XRPPayment` proof to a deployed Coston2 agreement and retain contract/proof identifiers.
2. Define a safe ledger range and obtain `XRPPaymentNonexistence` evidence.
3. Confirm the `expectedDrops - 1` threshold using the real verifier response.
4. Exercise network pending, timeout, rejection, and retry behavior through the future application.

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
