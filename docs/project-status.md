# Project Status

**Last updated:** 25 August 2026
**Phase:** Protocol foundation and FDC technical-risk spike
**Current base:** Remote `main` commit `e459042`

This file records current truth. Target behavior belongs in the other documents.

## Working and verified

- Repository contains a Node 24/Hardhat protocol foundation and locked dependency manifest.
- `lib/canonical.js` implements deterministic version-1 terms and hashing; 12 local test executions pass.
- `LatePayShield.sol` implements agreement creation, paid/non-payment proof matching, dispute state, and a guarded local verifier seam.
- Contract and guard suites total 38 local test executions; combined with canonicalization, all 50 executions pass when run with platform-correct environment syntax.
- Solidity `0.8.25` compilation succeeds for 123 files with Paris EVM target.
- XRPL Testnet transaction `4174F0EC...249309` was rechecked live as validated, `tesSUCCESS`, ledger `20202706`, delivered amount 2,000,000 drops, and destination tag `2026001`.
- GitHub Actions passed on `main` commit `e459042` on 25 August 2026.
- Runtime-only high-severity npm audit reports 0 vulnerabilities.
- `.env`, key/seed extensions, dependencies, build output, and coverage are ignored.

## Implemented but not externally verified

- `standardAddressHash()` is inferred and has not been compared with a real FDC `receivingAddressHash`.
- The contract compiles against Coston2 Flare interfaces but has not been deployed to Coston2.
- Paid and overdue contract paths are tested using `MockFdcVerification`; no real FDC proof has been submitted.
- The creator-supplied `startLedger` cannot be corroborated on-chain.

## Not implemented

- FDC verifier/DA-layer request, polling, proof acquisition, and submission workflow.
- Coston2 deployment and explorer verification.
- Frontend, API/application layer, persistence, wallet UI, and evidence screen.
- AI extraction/confirmation flow.
- FTSO conversion.
- Prepared live/recorded demo flow using real Coston2/FDC identifiers.

## Known issues

1. `npm run check` and `npm test` fail at the override-guard step in Windows `cmd.exe` because the package script uses POSIX environment assignment. The underlying guard tests pass with PowerShell syntax.
2. Full `npm ci` auditing reports vulnerabilities in transitive development tooling even though the runtime-only CI audit is clean. Current major Hardhat/toolbox Dependabot upgrades fail CI.
3. README's original “memo/reference matching” narrative exceeded the contract: the memo is captured in XRPL evidence but is not checked by `LatePayShield.sol`.
4. FDC API-key requirements and the DA-layer base URL are not confirmed.

## Next priorities

1. Request a real `XRPPayment` attestation for the committed XRPL transaction.
2. Validate or correct `standardAddressHash()` against the response.
3. Confirm FDC verifier authentication and DA-layer endpoints from current official documentation.
4. Fund a throwaway Coston2 deployer, deploy the contract with zero override, and retain explorer identifiers.
5. Submit a real paid proof, then design and test the non-payment ledger window.
6. Make the npm verification script cross-platform before relying on it as a universal local command.
7. Begin the smallest evidence-focused frontend only after the proof path is understood.

## Decision checkpoint

If reproducible FDC evidence is not available by the end of 27 August 2026, keep a real XRPL plus Flare agreement lifecycle, label FDC as pending, and do not show mock outcomes as verified.

## Update rules

Update this file after material progress, a disproven assumption, a new blocker, or a changed next priority. Move entries between sections rather than leaving stale claims. Put detailed evidence in `docs/testing-and-demo.md`.
