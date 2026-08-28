# Testing, Verification, CI, and Demo

**Last verified locally:** 28 August 2026 on Windows with Node `24.19.0`
**Remote baseline:** `main` commit `2efb083`

## Verification levels

1. Reproducible live testnet result with inspectable identifiers.
2. Reproducible recorded testnet result with the same real identifiers.
3. Local deterministic test using a clearly identified mock.
4. UI fixture or simulation.
5. Planned behavior without an implementation artifact.

The product, docs, and pitch must identify the actual level.

## Local baseline

- Solidity compilation: 123 files compiled successfully for Paris EVM.
- Default Hardhat suite: 54 passing executions.
- Chain-ID-114 verifier guard: 4 passing executions.
- Total: 58 passing test executions.
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

### FDC proof serialization

`test/fdc-proof.test.js` runs offline against the committed round-`1437032` proof and
covers decoding the DA response into the contract's `Proof` struct, byte-exact
re-encoding, leaf sensitivity to a single altered field, agreement of the response's
`receivingAddressHash` with `standardAddressHash()`, and encoding a
`recordVerifiedPayment` call without reshaping the struct.

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
| FDC payment proof | Real proof accepted by the contract | XRPL transaction `2A06F207...91CD36`; Coston2 request `0x3070...22d9`; voting round `1438624`; submission `0xc675...423e` | Agreement `2` reads back as `PaidVerified` with evidence ID `0xdaa9...18f8`. |
| Agreement lifecycle | Live Coston2 agreement | Creation `0xf25f...43df`, agreement `2`, start ledger `20283755`, deadline `1787913245` | Created before its payment, so the evidence window is honest rather than back-fitted. |
| FDC non-payment proof | Real proof accepted by the contract | Coston2 request `0xbcfb...7493`; voting round `1438645`; submission `0xab0d...068e` | Agreement `3` reads back as `OverdueVerified` with evidence ID `0x6881...14c1`. Searched ledgers `20284260` to `20284354` exclusive, above `1999999` drops, destination tag `2026002`. |
| Additional paid-path record | Recorded live testnet evidence | Agreement `4`; XRPL `397A2598...B264B47A`; round `1438816`; Coston2 `0xf7ba...e781` | `evidence/coston2-paid-agreement-4.json` records `PaidVerified` and evidence ID `0x795b...ee7c`. |
| Local web application | Local tests and production build | `web/` (`npm test`, `npm run build`) | React UI and loopback API compile and focused payment tests pass. The specific browser-triggered FDC job has not been independently recorded as a complete GUI run. |
| FTSO | Optional/planned | None | Not implemented. |

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

2. Turn it into request bytes, submit the request, and retrieve the finalized proof.
   Each command reads what the previous one wrote to `evidence/`, so nothing is
   copied by hand:

   ```bash
   npm run fdc:prepare   # published public test key, already in .env.example
   npm run fdc:submit    # queries the live fee and records the voting round
   npm run fdc:proof     # polls the DA layer until the round finalizes
   ```

3. Compare `response.responseBody.receivingAddressHash` from the saved proof with:

   ```bash
   node -e "const { standardAddressHash } = require('./lib/canonical'); console.log(standardAddressHash('rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V'))"
   ```

The real response and corrected implementation both produced
`0x4abeacf6f2ad7fbb211ba1b703aecc2edd2933e84039bcade6e6488d9ddbfb8f`.

`npm run fdc:proof` also re-encodes the decoded response and refuses to save unless
the bytes match the DA layer exactly, then calls the enshrined `FdcVerification`
before writing evidence. For round `1437032` that call returned true, so the saved
proof is one `LatePayShield` would accept. The DA endpoint needs no API key, which
makes retrieval reproducible without any credential.

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

### 3. Verify the real paid path — completed

The old `A0DA...` payment proves FDC compatibility but predates any agreement on the
new deployment. It must not be submitted as proof of a newly created agreement.

Required order:

1. Capture the current validated XRPL ledger.
2. Create a fresh agreement on `0x4A49...78B1` using the corrected destination hash.
3. Send a new matching XRPL Testnet payment after the agreement transaction confirms.
4. Run `npm run fdc:prepare`, `npm run fdc:submit`, and `npm run fdc:proof` for it.
5. Submit that proof and confirm the agreement reads back as `PaidVerified` with
   matching destination, amount, tag, ledger, and deadline:

   ```bash
   AGREEMENT_ID=<id> npm run fdc:record
   ```

Run on 28 August 2026 as agreement `2`. The payment closed at
`2026-08-28T08:36:42Z`, comfortably inside the `10:34:05Z` deadline, and in ledger
`20283804` against an evidence floor of `20283755`. Every check the contract makes
was satisfied by real data, not by a fixture.

Ordering is the part that matters. Set `XRPL_SUPPLIER_ADDRESS` before step 2, or
`spike:xrpl` funds a fresh supplier the agreement knows nothing about and the proof
fails on `DestinationMismatch`.

### 4. Verify the real overdue path — completed

Both directions are covered. The unpaid case was run end to end as agreement `3`. The
mirror case, a destination that was paid, was probed against agreement `2`'s real
window and the verifier refused the request. Changing only the destination tag in that
same window flips it back to valid, which confirms the tag is genuinely part of the
match rather than being carried along unused.

Run on 28 August 2026 as agreement `3`. It needs a destination that genuinely
receives nothing, so a fresh XRPL address was generated and never paid.

```bash
XRPL_SUPPLIER_ADDRESS=<a fresh, never-paid address> DUE_IN_MINUTES=5 npm run create:agreement
# send nothing, wait for the deadline to pass
AGREEMENT_ID=3 npm run fdc:prepare:overdue
npm run fdc:submit
npm run fdc:proof
AGREEMENT_ID=3 npm run fdc:record:overdue
```

The window came back as ledgers `20284260` to `20284354` exclusive, closing at
`1787908000`, four seconds past the `1787907996` deadline. Every bound matched the
agreement exactly: `minimalBlockNumber` equal to `startLedger`, `deadlineTimestamp`
equal to `dueAt`, and the threshold at `1999999`.

### The threshold behaves differently from the interface documentation

`IXRPPaymentNonexistence` states the attestation searches for a payment **strictly
greater than** the requested amount. Probing the live verifier against agreement `2`'s
window, which contains a payment of exactly 2,000,000 drops, shows otherwise:

| Requested amount | Verifier |
|---|---|
| `1999998` | refused, transaction exists |
| `1999999` | refused, transaction exists |
| `2000000` | refused, transaction exists |
| `2000001` | valid, no match |
| `2000012` | valid, no match |

The boundary sits between `2000000` and `2000001`, so the match is
`receivedAmount >= amount`. `spentAmount` of `2000012` is not the compared value.

`recordVerifiedNonPayment` pins the request to `expectedDrops - 1`. Against these
semantics that is still safe, because a payment of exactly `expectedDrops` continues
to block an overdue verdict, but it is one drop wider than intended: a payment of
exactly `expectedDrops - 1` also blocks it. Such an agreement can be recorded as
neither paid nor overdue, and its only exit is `markDisputed`. The full sweep is in
`evidence/fdc-nonexistence-threshold-probe.json`.

`fdc:prepare:overdue` refuses to build a request while the deadline is still open.
This was confirmed by running it against agreement `3` five minutes early.

An `OverdueVerified` result proves only that no qualifying payment reached the
recorded destination, with the recorded tag, above the recorded threshold, inside the
recorded ledger range. It does not prove the payer never paid by any other means.

## Required next integration tests

1. Exercise network pending, timeout, rejection, and retry behavior through the future application.

## Three-minute demo

1. **Problem:** supplier burden and the need for a shared payment outcome.
2. **Confirm:** controlled invoice, human-confirmed terms, real agreement ID/hash.
3. **Paid branch:** agreement `2`, its XRPL transaction `2A06F207...91CD36`, and the FDC proof accepted on Coston2 in `0xc675...423e`.
4. **Overdue branch:** agreement `3`, unpaid, with non-payment evidence bounded to ledgers `20284260` to `20284354` and accepted on Coston2 in `0xab0d...068e`.
5. **Close:** XRPL provides the payment record, Flare verifies/records the agreement outcome, and future AI removes administration without determining financial truth.

## Fallback procedure

If a live endpoint fails, state that directly and show recorded real testnet evidence with identifiers. Never present a mock-verifier transition, fixture, or prerecorded sequence as a live FDC result.

## Update triggers

Update this file when commands, test counts/results, CI status, audit results, spike evidence, live identifiers, known failure behavior, demo steps, or fallback media changes.
