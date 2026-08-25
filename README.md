# LatePay Shield

LatePay Shield turns confirmed invoice terms into a testnet payment agreement. XRPL supplies the payment record; a Flare Coston2 contract is designed to accept paid or overdue outcomes only when the corresponding FDC proof passes its matching rules.

**Prototype only:** testnets, no custody, no money movement, not legally binding, and not audited.

## Current milestone

| Capability | Current evidence |
|---|---|
| Canonical invoice hashing | Implemented in `lib/canonical.js`; local fixtures pass. |
| Agreement state machine | Implemented in `contracts/LatePayShield.sol`; local mock-verifier tests pass. |
| Verifier override guard | Local tests confirm a non-zero override is rejected at Coston2 chain ID `114`. |
| XRPL Testnet payment | Validated transaction `4174F0EC...249309`, ledger `20202706`, `tesSUCCESS`. |
| CI | Latest `main` workflow passed on 25 August 2026. |
| Coston2 deployment | Not completed. |
| Real FDC payment/non-payment proof | Not completed; this remains the main technical risk. |
| Frontend | Not started. |

See [`docs/project-status.md`](docs/project-status.md) for the complete verified, unverified, and blocked boundary.

## Setup

Requires Node.js 24 and npm.

```bash
npm ci
```

On macOS/Linux and in CI:

```bash
npm run check
```

The current `test:override-guard` package script uses POSIX environment syntax and therefore fails in Windows `cmd.exe`. Until that script is made cross-platform, the equivalent PowerShell baseline is:

```powershell
npm run compile
npx hardhat test
$env:HARDHAT_CHAIN_ID = "114"
npx hardhat test test/VerifierOverrideGuard.test.js
```

Never create `.env` from real-money wallets. If a network spike needs local values, copy `.env.example` and use throwaway faucet-funded testnet accounts only.

## Commands

| Command | Purpose |
|---|---|
| `npm run compile` | Compile Solidity `0.8.25` for the Paris EVM target. |
| `npm test` | Run the default suite, then the verifier guard; currently POSIX-shell only because of the second step. |
| `npm run check` | Compile and run `npm test`; this is the GitHub Actions gate. |
| `npm run test:override-guard` | Re-run the guard at chain ID `114`; currently POSIX-shell only. |
| `npm run spike:xrpl` | Fund throwaway XRPL Testnet wallets, send a payment, and write non-secret evidence JSON. |
| `npm run deploy:coston2` | Deploy with the enshrined verifier; requires a funded throwaway Coston2 key. |

## Documentation map

| Document | Owns |
|---|---|
| [`docs/project-context.md`](docs/project-context.md) | Product scope, MVP, claims, and event constraints. |
| [`docs/architecture.md`](docs/architecture.md) | Implemented components, networks, dependencies, and target data flow. |
| [`docs/design.md`](docs/design.md) | User journey, product states, evidence UX, and visual direction. |
| [`docs/data-and-contracts.md`](docs/data-and-contracts.md) | Exact canonicalization, contract behavior, transitions, and matching semantics. |
| [`docs/testing-and-demo.md`](docs/testing-and-demo.md) | Test matrix, CI, evidence ledger, demo, and fallback procedure. |
| [`docs/project-status.md`](docs/project-status.md) | Current truth, blockers, known issues, and next priorities. |
| [`docs/decisions.md`](docs/decisions.md) | Durable decisions and rationale. |
| [`docs/reference/`](docs/reference/) | Detailed historical planning material; not automatically authoritative. |

## Public-repository safety

`.env`, key/seed files, dependencies, build output, and coverage are ignored. The committed `evidence/` directory is intentionally public and may contain only non-secret testnet identifiers. Treat anything already pushed as permanently public; rotate an exposed secret rather than merely deleting it.
