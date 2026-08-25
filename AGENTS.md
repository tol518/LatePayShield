# LatePay Shield Agent Instructions

The user's current request takes priority. Inspect the current branch, diff, repository structure, and [`docs/project-status.md`](docs/project-status.md) before making changes. Preserve unrelated work.

## Read context as needed

| Task involves | Read |
|---|---|
| Setup, commands, or a human-facing project overview | [`README.md`](README.md) |
| Product scope, claims, event constraints, or priorities | [`docs/project-context.md`](docs/project-context.md) |
| Components, dependencies, networks, directories, or data flow | [`docs/architecture.md`](docs/architecture.md) |
| Screens, journeys, status presentation, copy, or accessibility | [`docs/design.md`](docs/design.md) |
| Canonical terms, hashes, contract behavior, events, or evidence matching | [`docs/data-and-contracts.md`](docs/data-and-contracts.md) |
| Tests, verification, CI, testnet evidence, demo operation, or fallback media | [`docs/testing-and-demo.md`](docs/testing-and-demo.md) |
| Why a durable choice was made | [`docs/decisions.md`](docs/decisions.md) |
| A dated implementation sequence | [`docs/plans/`](docs/plans/) |

## Non-negotiable guardrails

- Testnets only. Never expose, log, commit, or display private keys, wallet seeds, API keys, `.env` contents, or sensitive invoice data.
- Never describe payment, FDC, FTSO, contract, network, CI, or security evidence as verified unless a real inspectable artifact supports that exact claim.
- Never claim legal enforceability, universal proof of non-payment, automated collection, compliance, audit status, or production readiness.
- AI may propose or explain terms; a human confirms authoritative terms. AI is never the authority for payment truth.
- Prefer truthful pending, mismatch, and failure states over simulated success. Test seams and recorded evidence must be visibly distinguishable from live verification.
- Preserve canonical field order, encoding, hashes, enum values, ABI/event shapes, and evidence semantics across layers. Do not reimplement `lib/canonical.js`.
- Do not add a mainnet network or permit a verifier override outside local chain ID `31337`.
- Do not commit, amend, push, tag, or merge without explicit user approval for that specific action.

## Documentation sync gate

Update the owning document when a change materially alters current truth:

- architecture/dependencies/networks -> `docs/architecture.md`
- journey/state presentation/copy -> `docs/design.md`
- schema/hash/contract/event/evidence semantics -> `docs/data-and-contracts.md`
- tests/CI/verification/demo/fallback -> `docs/testing-and-demo.md`
- product boundary/claims -> `docs/project-context.md`
- verified progress/blocker/known issue/next priority -> `docs/project-status.md`
- durable decision/rationale -> append to `docs/decisions.md`

Update `README.md` only when human setup, commands, headline status, or the documentation map changes. Do not refresh unrelated dates. Before finishing, check links and report what changed, what was actually verified, and what remains planned, mocked, or blocked.
