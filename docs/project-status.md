# Project Status

**Last updated:** 28 August 2026
**Phase:** Both outcome branches proven end to end on testnet
**Current base:** Remote `main` commit `2efb083`

This file records current truth. Target behavior belongs in the other documents.
Task assignment and progress tracking live in `issue-board.md`.
The exact external tools and URLs used to create this evidence are recorded in
[`tooling-runbook.md`](tooling-runbook.md).

## Working and verified

- Repository contains a Node 24/Hardhat protocol foundation and locked dependency manifest.
- `lib/canonical.js` implements deterministic version-1 terms and FDC address hashing; 14 local test executions pass.
- `LatePayShield.sol` implements agreement creation, paid/non-payment proof matching, dispute state, and a guarded local verifier seam.
- Contract and guard suites total 38 local test executions; combined with canonicalization and FDC proof serialization, all 58 executions pass when run with platform-correct environment syntax.
- Solidity `0.8.25` compilation succeeds for 123 files with Paris EVM target.
- XRPL Testnet transaction `4174F0EC...249309` was rechecked live as validated, `tesSUCCESS`, ledger `20202706`, delivered amount 2,000,000 drops, and destination tag `2026001`.
- `standardAddressHash()` was corrected to `keccak256(UTF8(trimmedAddress))` and verified against an FDC `XRPPayment` response for XRPL Testnet transaction `A0DA3E67...ADF3565` (Coston2 request transaction `68503B0C...6BC99F`, voting round `1437032`).
- `LatePayShield` is deployed on Coston2 at `0x4A49...78B1` in transaction `0xfec3...7ae3`; public RPC readback confirms chain ID `114`, deployed bytecode, and zero verifier override. `nextAgreementId` is now `4`.
- **A real XRPL payment has been verified on Coston2 through the Flare Data Connector.** Agreement `2` on `0x4A49...78B1` was created first in transaction `0xf25f...43df` with evidence floor ledger `20283755` and deadline `1787913245`. XRPL Testnet payment `2A06F207...91CD36` was sent afterwards in ledger `20283804`, `tesSUCCESS`, 2,000,000 drops, destination tag `2026001`. Its FDC request `0x3070...22d9` was answered in voting round `1438624`, and `recordVerifiedPayment` accepted the proof in transaction `0xc675...423e`, block `34585539`. Independent public RPC readback confirms status `PaidVerified`, XRPL transaction hash, and evidence ID `0xdaa9...18f8`.
- **A real non-payment has been verified on Coston2.** Agreement `3` was created in transaction `0x73b1...1269` against a freshly generated XRPL address that was never paid, with evidence floor ledger `20284260` and a five-minute deadline of `1787907996`. After the deadline the `XRPPaymentNonexistence` request `0xbcfb...7493` was answered in voting round `1438645`, and `recordVerifiedNonPayment` accepted the proof in transaction `0xab0d...068e`, block `34586348`. The searched range was ledgers `20284260` to `20284354` exclusive, above `1999999` drops, destination tag `2026002`. Public readback confirms `OverdueVerified` with evidence ID `0x6881...14c1`.
- The `expectedDrops - 1` threshold is confirmed against a real verifier response. The attestation searches for a payment strictly greater than the requested value, so the subtraction is what stops a payment of exactly the expected amount from producing a false overdue.
- The whole lifecycle ran from the committed commands with no manual step: `create:agreement`, `spike:xrpl`, `fdc:prepare`, `fdc:submit`, `fdc:proof`, `fdc:record` for the paid branch, and `create:agreement`, `fdc:prepare:overdue`, `fdc:submit`, `fdc:proof`, `fdc:record:overdue` for the overdue branch.
- The DA-layer proof for voting round `1437032` was retrieved by `npm run fdc:proof`, re-encoded byte-for-byte, and accepted by the enshrined `FdcVerification` at `0x906507E0B64bcD494Db73bd0459d1C667e14B933`, which returned true for `verifyXRPPayment`. The retrieved proof and its request bytes are committed under `evidence/`.
- The DA layer answers `proof-by-request-round-raw` without an API key, so proof retrieval is reproducible by anyone with no credentials.
- The Coston2 signer resolves to `0xBA09...3E0B` and is faucet funded well above the observed FDC request fee of 1000 wei.
- `npm run fdc:prepare` reproduces the request bytes still held in the `AttestationRequest` log of Coston2 transaction `0x6850...c99f` byte for byte. The XRP verifier does require a key and returns `401` without one; the published public test value `00000000-0000-0000-0000-000000000000` is accepted and is now the default in `.env.example`.
- GitHub Actions passed on `main` commit `e459042` on 25 August 2026.
- Runtime-only high-severity npm audit reports 0 vulnerabilities.
- `.env`, key/seed extensions, dependencies, build output, and coverage are ignored.

## Implemented but not externally verified

- Only the unpaid case of the non-payment path has been exercised. A destination that *was* paid should make the verifier refuse the request, and that has not been confirmed against the live verifier.
- The creator-supplied `startLedger` cannot be corroborated on-chain. For agreement `2` it was read from the live XRPL ledger immediately before creation, but the contract cannot check that.

## Not implemented

- Frontend, API/application layer, persistence, wallet UI, and evidence screen.
- AI extraction/confirmation flow.
- FTSO conversion.
- Prepared live/recorded demo flow using real Coston2/FDC identifiers.

## Known issues

1. `npm run check` and `npm test` fail at the override-guard step in Windows `cmd.exe` because the package script uses POSIX environment assignment. The underlying guard tests pass with PowerShell syntax.
2. Full `npm ci` auditing reports vulnerabilities in transitive development tooling even though the runtime-only CI audit is clean. Current major Hardhat/toolbox Dependabot upgrades fail CI.
3. README's original “memo/reference matching” narrative exceeded the contract: the memo is captured in XRPL evidence but is not checked by `LatePayShield.sol`.

## Next priorities

1. Prepare the demo around agreements `2` and `3`, which are real evidence for both branches.
2. Begin the evidence-focused frontend against the two recorded outcomes.
3. Make the npm verification script cross-platform before relying on it as a universal local command.
4. Begin the smallest evidence-focused frontend using the verified FDC proof shape.

## Decision checkpoint

Resolved on 28 August 2026. The fallback is not needed: FDC evidence is reproducible and a full real lifecycle ends in `PaidVerified` on the deployed contract. The rule that mock outcomes must never be shown as verified still stands.

## Update rules

Update this file after material progress, a disproven assumption, a new blocker, or a changed next priority. Move entries between sections rather than leaving stale claims. Put detailed evidence in `docs/testing-and-demo.md`.
