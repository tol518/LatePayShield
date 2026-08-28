# Decision Log

Record durable product, architecture, security, data, and delivery decisions. Append new entries; supersede old decisions explicitly rather than rewriting history.

## D-001 - LatePay Shield is the locked concept

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** Build a verifiable payment-agreement prototype for small suppliers.

**Reason:** The late-payment problem is immediately understandable and gives XRPL settlement plus Flare evidence/state meaningful responsibilities within a two-person scope.

**Consequence:** Prioritize one evidence-backed paid/overdue workflow over a broad invoice platform.

## D-002 - Testnets and literal evidence claims

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** Use XRPL Testnet and Flare Coston2 only. Call a capability verified only when a real inspectable artifact supports the exact outcome.

**Reason:** Truthful testnet evidence is safer and more credible than unsupported production, legal, or decentralization claims.

**Consequence:** Pending, mismatch, failure, mock, and recorded-fallback boundaries are first-class behavior.

## D-003 - AI is administrative assistance

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** AI may extract candidate terms and draft explanations, but a human confirms terms and network evidence establishes payment outcomes.

**Consequence:** The core lifecycle must work without AI.

## D-004 - Route project context by task

**Date:** 24 August 2026
**Status:** Accepted

**Decision:** Keep root agent instructions minimal and store durable context in focused documents loaded only as needed.

**Reason:** The original setup duplicated instructions and forced every session to load mixed product, architecture, status, and testing context.

**Consequence:** Material changes update the owning document and current status when applicable.

## D-005 - One canonicalization implementation

**Date:** 25 August 2026
**Status:** Accepted

**Decision:** `lib/canonical.js` exclusively owns version-1 field normalization, ordering, serialization, and invoice hashing.

**Reason:** Independent implementations can produce different on-chain commitments for the same displayed invoice.

**Consequence:** Future frontend/backend code imports the module and shares its fixtures; semantic changes require an explicit version decision.

## D-006 - FDC proof is the intended authority

**Date:** 25 August 2026
**Status:** Accepted, live integration unverified

**Decision:** Paid/non-payment outcome calls are permissionless. The contract verifies FDC proof data rather than trusting a team-controlled outcome caller.

**Reason:** Caller allowlisting would move payment truth back to the application operator.

**Consequence:** The production/testnet contract resolves Flare's enshrined verifier. Local verifier injection is restricted to chain ID `31337`.

## D-007 - Destination tag is the current invoice discriminator

**Date:** 25 August 2026
**Status:** Accepted for the current contract

**Decision:** Contract matching uses destination hash, minimum amount, destination tag, ledger lower bound, and deadline. XRPL memo/reference remains evidence/display metadata and is not contract-verified.

**Reason:** The implemented FDC response/request checks do not inspect the memo.

**Consequence:** Product copy must not claim memo/reference verification. Changing this requires a new evidence design and contract/data review.

## D-008 - The browser never addresses the model

**Date:** 28 August 2026
**Status:** Accepted

**Decision:** The local model is reached only by `web/server`, over an OpenAI-compatible HTTP endpoint configured in the ignored root `.env`. The browser calls same-origin `/api/ai/*`, and every reply is schema-validated in the service before it reaches the UI.

**Reason:** A direct browser call would put unvalidated model output on screen, which is the failure `docs/ai/SKILLS.md` §0 exists to prevent. It would also publish the model host to every client bundle and make CORS, mixed content, and private-network reachability into frontend problems.

**Consequence:** Swapping the model or its runner is a `.env` change. Any future skill adds a route and a validator in `web/server/ai/`, never a fetch from a component.

## Entry format

New entries contain an ID, title, date, status, decision, reason, and consequence. Include an official source and check date when a decision depends on time-sensitive event, network, or sponsor information.
