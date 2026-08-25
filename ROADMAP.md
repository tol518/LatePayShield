# LatePay Shield delivery pipeline

This roadmap turns the unfinished prototype into one evidence-backed vertical slice. Work
moves through the phases in order because each phase removes a risk that later UI work
would otherwise hide. Optional features wait until the real verification path works.

## Engineering workflow

1. Create a short-lived branch from `main`: `feat/...`, `fix/...`, `test/...`, or `docs/...`.
2. Keep each pull request focused on one verifiable outcome.
3. Run `npm run check` locally and complete the pull-request safety checklist.
4. Require the GitHub CI check before merging to `main`.
5. Merge only when tests, README status, and evidence claims agree.
6. Deploy to Coston2 manually from a reviewed commit. Never expose deployment or wallet
   secrets to pull-request workflows.

`main` should always be demoable at its documented level. A green CI run proves local
compilation and tests only; it does not prove that XRPL, Coston2, or FDC is available.

## Phase 0 — protocol foundation

Current code state: implemented and locally checked. The first hosted GitHub Actions run
remains pending until these files are pushed.

- Canonical terms and deterministic invoice hash
- Minimal agreement state machine and guarded local FDC mock
- Coston2-only Hardhat configuration
- Real XRPL Testnet payment artifact
- CI, dependency updates, review checklist, and public-repository safeguards

Exit gate: `npm run check` passes and no staged secret, mainnet target, or dishonest
verification path exists.

## Phase 1 — prove FDC payment evidence

This is the current priority and the largest technical risk.

- Request a real `XRPPayment` attestation for the committed XRPL Testnet transaction
- Confirm the actual standard-address-hash encoding against the returned response
- Record the verifier request, voting round, Merkle proof, and reproducible instructions
- Submit the real proof to a Coston2 deployment
- Add an integration test or replay fixture that exercises the exact returned shape

Exit gate: a reviewer can reproduce `PAID_VERIFIED` from public testnet identifiers without
trusting a team-controlled verifier. If this cannot be achieved, keep FDC marked pending.

## Phase 2 — prove the overdue path

- Define and record the XRPL start ledger at agreement creation
- Request a real `XRPPaymentNonexistence` attestation for an explicit ledger/time window
- Verify exact-payment threshold behavior (`expectedDrops - 1`)
- Exercise deadline, exact payment, late payment, and endpoint-failure cases
- Preserve `OVERDUE_PENDING` until a real non-payment proof succeeds

Exit gate: the evidence artifact clearly states what address, amount, destination tag, and
ledger range were searched, without claiming universal non-payment.

## Phase 3 — build the application vertical slice

- Create the supplier agreement form and mandatory human confirmation screen
- Import `lib/canonical.js`; do not reimplement canonicalization in the UI or API
- Create and read a real Coston2 agreement
- Submit or inspect an XRPL Testnet payment
- Coordinate FDC requests and display honest pending, mismatch, and retryable-error states
- Add an evidence screen with agreement, transaction, proof, and explorer identifiers

Exit gate: one end-to-end paid flow works using real testnet data, and a failed network call
cannot produce a verified-looking state.

## Phase 4 — resilience and demo readiness

- Add integration tests for unavailable XRPL, Flare, verifier, and DA-layer endpoints
- Add a prepared real-evidence fallback for live network failures
- Check accessibility, responsive layout, empty states, and error recovery
- Rehearse the two-to-three-minute narrative and verify all public claims
- Re-check current event rules and current official network details before demo day

Exit gate: both teammates can run the demo from a clean checkout and explain every trust
boundary and remaining limitation.

## Phase 5 — post-hackathon hardening

Only start this phase if the prototype continues beyond the event.

- Threat model and independent smart-contract review
- Key management, environment protection, monitoring, and incident response
- Stable persistence and migration strategy
- Broader integration, browser, and contract invariant testing
- Privacy, legal, and regulatory review before considering real users or value

This phase does not authorize mainnet or production claims. Those require a separate,
explicit readiness decision.

## Backlog rule

FTSO conversion, AI extraction, reminder generation, wallet connection, QR payments, and
visual polish stay behind Phases 1–3. Pull them forward only when they directly help prove
the core agreement-to-evidence flow and do not weaken its truthfulness.
