# Project Status

**Last updated:** 30 August 2026
**Phase:** Both outcome branches proven end to end on testnet; local AI extraction wired into the UI
**Current base:** Remote `main` commit `2efb083`

This file records current truth. Target behavior belongs in the other documents.
Task assignment and progress tracking live in `issue-board.md`.
The exact external tools and URLs used to create this evidence are recorded in
[`tooling-runbook.md`](tooling-runbook.md).

## Working and verified

- The React interface now uses the selected blue business-finance workspace: persistent desktop navigation, an invoice-to-evidence progress path, a drag-and-drop PDF/XML/UBL preparation card, local-AI privacy messaging, a truthful agreement preview, and recent live Coston2 agreements. The rendered page was checked in Chrome at 1440 × 1024 and 390 × 844 with no application console warnings/errors or horizontal mobile overflow. The paste-text disclosure, input enablement, and sidebar anchor navigation were exercised; no wallet or model submission was made during this visual check.
- The agreement form now reads the current XRPL Testnet ledger, generates a destination tag, and creates a non-custodial Xaman `SignIn` QR/deep link for the supplier's public receiving address. The live browser check reached Xaman's waiting-for-approval state with both generated fields populated, no application console errors, and no horizontal overflow at 390 px. User approval inside Xaman remains intentionally outside website custody.
- Repository contains a Node 24/Hardhat protocol foundation and locked dependency manifest.
- `lib/canonical.js` implements deterministic version-1 terms and FDC address hashing; 14 local test executions pass.
- `LatePayShield.sol` implements agreement creation, paid/non-payment proof matching, dispute state, and a guarded local verifier seam.
- Contract and guard suites total 38 local test executions; combined with canonicalization and FDC proof serialization, all 58 executions pass when run with platform-correct environment syntax.
- Solidity `0.8.25` compilation succeeds for 123 files with Paris EVM target.
- XRPL Testnet transaction `4174F0EC...249309` was rechecked live as validated, `tesSUCCESS`, ledger `20202706`, delivered amount 2,000,000 drops, and destination tag `2026001`.
- `standardAddressHash()` was corrected to `keccak256(UTF8(trimmedAddress))` and verified against an FDC `XRPPayment` response for XRPL Testnet transaction `A0DA3E67...ADF3565` (Coston2 request transaction `68503B0C...6BC99F`, voting round `1437032`).
- `LatePayShield` is deployed on Coston2 at `0x4A49...78B1` in transaction `0xfec3...7ae3`; public RPC readback confirms chain ID `114`, deployed bytecode, and zero verifier override. `nextAgreementId` is now `5`.
- **A real XRPL payment has been verified on Coston2 through the Flare Data Connector.** Agreement `2` on `0x4A49...78B1` was created first in transaction `0xf25f...43df` with evidence floor ledger `20283755` and deadline `1787913245`. XRPL Testnet payment `2A06F207...91CD36` was sent afterwards in ledger `20283804`, `tesSUCCESS`, 2,000,000 drops, destination tag `2026001`. Its FDC request `0x3070...22d9` was answered in voting round `1438624`, and `recordVerifiedPayment` accepted the proof in transaction `0xc675...423e`, block `34585539`. Independent public RPC readback confirms status `PaidVerified`, XRPL transaction hash, and evidence ID `0xdaa9...18f8`.
- **A real non-payment has been verified on Coston2.** Agreement `3` was created in transaction `0x73b1...1269` against a freshly generated XRPL address that was never paid, with evidence floor ledger `20284260` and a five-minute deadline of `1787907996`. After the deadline the `XRPPaymentNonexistence` request `0xbcfb...7493` was answered in voting round `1438645`, and `recordVerifiedNonPayment` accepted the proof in transaction `0xab0d...068e`, block `34586348`. The searched range was ledgers `20284260` to `20284354` exclusive, above `1999999` drops, destination tag `2026002`. Public readback confirms `OverdueVerified` with evidence ID `0x6881...14c1`.
- **Agreement `4` is a further recorded paid-path result.** XRPL Testnet payment `397A2598...B264B47A` was recorded as `PaidVerified` in Coston2 transaction `0xf7ba...e781`, block `34593638`, using FDC voting round `1438816`; the evidence ID is `0x795b...ee7c` in `evidence/coston2-paid-agreement-4.json`.
- The mirror case holds: the live verifier refuses a non-payment request when a qualifying payment exists in the window, and the destination tag is genuinely part of the match. Changing the tag alone flips the same window from refused to valid.
- The live verifier matches `receivedAmount >= amount`, not `receivedAmount > amount` as `IXRPPaymentNonexistence` documents. For a payment that received exactly 2,000,000 drops the boundary sits between requested amounts `2000000` and `2000001`. The sweep is recorded in `evidence/fdc-nonexistence-threshold-probe.json`.
- The whole lifecycle ran from the committed commands with no manual step: `create:agreement`, `spike:xrpl`, `fdc:prepare`, `fdc:submit`, `fdc:proof`, `fdc:record` for the paid branch, and `create:agreement`, `fdc:prepare:overdue`, `fdc:submit`, `fdc:proof`, `fdc:record:overdue` for the overdue branch.
- The DA-layer proof for voting round `1437032` was retrieved by `npm run fdc:proof`, re-encoded byte-for-byte, and accepted by the enshrined `FdcVerification` at `0x906507E0B64bcD494Db73bd0459d1C667e14B933`, which returned true for `verifyXRPPayment`. The retrieved proof and its request bytes are committed under `evidence/`.
- The DA layer answers `proof-by-request-round-raw` without an API key, so proof retrieval is reproducible by anyone with no credentials.
- The Coston2 signer resolves to `0xBA09...3E0B` and is faucet funded well above the observed FDC request fee of 1000 wei.
- `npm run fdc:prepare` reproduces the request bytes still held in the `AttestationRequest` log of Coston2 transaction `0x6850...c99f` byte for byte. The XRP verifier does require a key and returns `401` without one; the published public test value `00000000-0000-0000-0000-000000000000` is accepted and is now the default in `.env.example`.
- GitHub Actions passed on `main` commit `e459042` on 25 August 2026.
- Runtime-only high-severity npm audit reports 0 vulnerabilities.
- `.env`, key/seed extensions, dependencies, build output, and coverage are ignored.

## Implemented but not externally verified

- The creator-supplied `startLedger` cannot be corroborated on-chain. For agreement `2` it was read from the live XRPL ledger immediately before creation, but the contract cannot check that.
- `web/` implements a local React/Vite testnet interface with MetaMask agreement creation, live registry reads, Xaman/manual payment paths, public XRPL matching, and opt-in FDC job orchestration. Its build and focused tests pass, but this specific browser-to-FDC job path has not yet been independently demonstrated as one uninterrupted GUI run. The job service is loopback-only and in-memory, not durable persistence.
- Skill S1 of `docs/ai/SKILLS.md` (invoice term extraction) is implemented in `web/server/ai/` behind `AI_ASSISTANT_ENABLED`, with a UI panel that accepts pasted text or a searchable PDF, XML, or UBL file and fills the agreement form with quoted, editable suggestions. Uploaded files stay in memory; limits are 10 MB, 50 searchable PDF pages, and 25,000 extracted characters. XML DTD/entity declarations and image-only PDFs are rejected. The web package's 19 focused test executions and production build pass, including five document-parser fixtures and 11 validator executions. A synthetic UBL invoice also returned the expected invoice number, due date, and currency through the live loopback API and configured `mlx-community/Qwen3-8B-4bit` model. The earlier clean-text and injection manual checks still stand, but there is still no committed model fixture suite or completed rendered browser run. S2 to S5 are not implemented.

## Not implemented

- AI skills S2 to S5 (reminder drafting, status explanation, UK-law information, interest illustration).
- `npm run law:refresh` and `data/uk-law/snapshot.json`, without which S4 and S5 must stay disabled.
- A committed AI fixture suite covering the acceptance checks in `docs/ai/SKILLS.md` §9.
- FTSO conversion.
- Durable/multi-user application persistence, authentication, and job recovery.
- Prepared live/recorded demo flow using the UI and real Coston2/FDC identifiers.

## Known issues

1. `npm run check` and `npm test` fail at the override-guard step in Windows `cmd.exe` because the package script uses POSIX environment assignment. The underlying guard tests pass with PowerShell syntax.
2. Full `npm ci` auditing reports vulnerabilities in transitive development tooling even though the runtime-only CI audit is clean. Current major Hardhat/toolbox Dependabot upgrades fail CI.
3. README's original “memo/reference matching” narrative exceeded the contract: the memo is captured in XRPL evidence but is not checked by `LatePayShield.sol`.
4. `recordVerifiedNonPayment` pins the request to `expectedDrops - 1` on the stated assumption that the attestation matches payments strictly greater than the requested amount. The live verifier matches at or above it instead. The guard is still safe, because a payment of exactly `expectedDrops` continues to block an overdue verdict, but it is one drop wider than intended: a payment of exactly `expectedDrops - 1` also blocks it, so such an agreement can be recorded as neither paid nor overdue and its only exit is `markDisputed`. Correcting it means requesting `expectedDrops` instead, which changes the contract and needs a redeploy.
5. The operator-hosted MLX generation worker exhausted Metal memory during a long invoice extraction. The endpoint remained reachable, but prompt-cache memory grew to 5.74 GB across 10 sequences and generation failed with `Insufficient Memory`. See [`ai/mlx-server-memory-diagnosis.md`](ai/mlx-server-memory-diagnosis.md) for recovery and the proposed operating limits. Until the Mac mini host is restarted and bounded, large AI extraction requests may time out or fail; manual entry remains available.

## Next priorities

1. Demonstrate one fresh paid agreement through the browser UI to `PaidVerified`, while retaining the public evidence package.
2. Commit an AI fixture suite so `docs/ai/SKILLS.md` §9 checks 1, 3, and 9 are regression-tested rather than manually observed.
3. Prepare the demo around agreements `2`, `3`, and `4`, which provide real evidence for both outcome branches and the current payment UI path.
4. Make the npm verification script cross-platform before relying on it as a universal local command.
5. Add durable, authenticated job handling before treating the local application service as anything beyond a prototype.

## Decision checkpoint

Resolved on 28 August 2026. The fallback is not needed: FDC evidence is reproducible and a full real lifecycle ends in `PaidVerified` on the deployed contract. The rule that mock outcomes must never be shown as verified still stands.

## Update rules

Update this file after material progress, a disproven assumption, a new blocker, or a changed next priority. Move entries between sections rather than leaving stale claims. Put detailed evidence in `docs/testing-and-demo.md`.
