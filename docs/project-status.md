# Project Status

**Last updated:** 26 August 2026
**Phase:** Protocol foundation and FDC technical-risk spike
**Current base:** Remote `main` commit `e459042`

This file records current truth. Target behavior belongs in the other documents.
Task assignment and progress tracking live in `issue-board.md`.
The exact external tools and URLs used to create this evidence are recorded in
[`tooling-runbook.md`](tooling-runbook.md).

## Working and verified

- Repository contains a Node 24/Hardhat protocol foundation and locked dependency manifest.
- `lib/canonical.js` implements deterministic version-1 terms and FDC address hashing; 14 local test executions pass.
- `LatePayShield.sol` implements agreement creation, paid/non-payment proof matching, dispute state, and a guarded local verifier seam.
- Contract and guard suites total 38 local test executions; combined with canonicalization, all 52 executions pass when run with platform-correct environment syntax.
- Solidity `0.8.25` compilation succeeds for 123 files with Paris EVM target.
- XRPL Testnet transaction `4174F0EC...249309` was rechecked live as validated, `tesSUCCESS`, ledger `20202706`, delivered amount 2,000,000 drops, and destination tag `2026001`.
- `standardAddressHash()` was corrected to `keccak256(UTF8(trimmedAddress))` and verified against an FDC `XRPPayment` response for XRPL Testnet transaction `A0DA3E67...ADF3565` (Coston2 request transaction `68503B0C...6BC99F`, voting round `1437032`).
- `LatePayShield` is deployed on Coston2 at `0x4A49...78B1` in transaction `0xfec3...7ae3`; public RPC readback confirms chain ID `114`, deployed bytecode, zero verifier override, and `nextAgreementId == 1`.
- GitHub Actions passed on `main` commit `e459042` on 25 August 2026.
- Runtime-only high-severity npm audit reports 0 vulnerabilities.
- `.env`, key/seed extensions, dependencies, build output, and coverage are ignored.

## Implemented but not externally verified

- Paid and overdue contract paths are tested using `MockFdcVerification`; no real FDC proof has been submitted to `LatePayShield`.
- The creator-supplied `startLedger` cannot be corroborated on-chain.

## Not implemented

- Automated DA-layer proof retrieval and submission of a real proof to `LatePayShield`.
- Frontend, API/application layer, persistence, wallet UI, and evidence screen.
- AI extraction/confirmation flow.
- FTSO conversion.
- Prepared live/recorded demo flow using real Coston2/FDC identifiers.

## Known issues

1. `npm run check` and `npm test` fail at the override-guard step in Windows `cmd.exe` because the package script uses POSIX environment assignment. The underlying guard tests pass with PowerShell syntax.
2. Full `npm ci` auditing reports vulnerabilities in transitive development tooling even though the runtime-only CI audit is clean. Current major Hardhat/toolbox Dependabot upgrades fail CI.
3. README's original “memo/reference matching” narrative exceeded the contract: the memo is captured in XRPL evidence but is not checked by `LatePayShield.sol`.

## Next priorities

1. Add automated DA-layer proof retrieval, then submit a fresh real `XRPPayment` proof to the deployed agreement contract.
2. Design and test the non-payment ledger window.
3. Make the npm verification script cross-platform before relying on it as a universal local command.
4. Begin the smallest evidence-focused frontend using the verified FDC proof shape.

## Decision checkpoint

If reproducible FDC evidence is not available by the end of 27 August 2026, keep a real XRPL plus Flare agreement lifecycle, label FDC as pending, and do not show mock outcomes as verified.

## Update rules

Update this file after material progress, a disproven assumption, a new blocker, or a changed next priority. Move entries between sections rather than leaving stale claims. Put detailed evidence in `docs/testing-and-demo.md`.
