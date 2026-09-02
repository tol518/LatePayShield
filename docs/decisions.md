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

## D-009 - Case facts persist only after human confirmation

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Use a local SQLite case file keyed to one Coston2 agreement. Store
human-confirmed structured invoice facts, bounded source quotes, a source
fingerprint, and human-entered communication notes. Do not persist raw invoice
text or uploaded bytes in the first slice.

**Reason:** Case administration needs continuity across restarts, while model
output and browser state must not become payment or legal truth. The existing
contract is already the authority for agreement outcomes.

**Consequence:** The local LLM may prefill an unconfirmed case draft, but only an
explicit confirmation can write it. The UI joins the saved agreement ID to a
fresh Coston2 read for status and XRPL/FDC evidence. Document storage,
encryption, authentication, and multi-user access remain later work.

## D-010 - The local web service authenticates an operator instead of trusting reachability

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Gate every `/api/` route of `web/server/index.js` on an operator
token presented in `X-LatePay-Operator-Token`, and scope every case read and
write to the `owner_id` of the authenticated operator. Apply a network policy to
every request, the served page included: in a loopback deployment the peer, the
`Host` header, and any `Origin` header must be canonical loopback values, so a
cross-origin write is refused on the header alone whatever its `Content-Type`.
Refuse to bind a non-loopback `XAMAN_SERVER_HOST` unless
`WEB_AUTHENTICATED_DEPLOYMENT=true`, `WEB_OPERATOR_TOKENS`, and
`WEB_ALLOWED_ORIGINS` are all configured.

**Reason:** The case routes previously treated network reachability as
permission, so any client that could reach the port could read invoice, party,
and communication data or forge a case
([`security/missing-case-api-access-control.md`](security/missing-case-api-access-control.md)).
Locking the bind to loopback lowers exposure but is not an authorization
decision, and a browser page from another origin does not need to reach the port
itself to make the operator's browser do it.

**Consequence:** In a loopback deployment the service generates one token per run
and serves it in its own page as a meta tag, which only same-origin code can
read; `npm run dev` shares one token between the service and the Vite dev
server. A non-loopback deployment configures tokens explicitly and never puts
one in the page. Case rows written before ownership existed are migrated to
`local-operator`. Multi-user identity, sessions, and encryption at rest remain
later work: one token means one operator, not a user account system.

## D-011 - The eligibility outcome is computed at read time, never stored

**Date:** 2 September 2026
**Status:** Accepted for the local prototype

**Decision:** Persist only the operator's eligibility answers, in
`case_eligibility`, and compute the outcome in the browser from
`web/shared/eligibility.js` on every read, combining those answers with a live
Coston2 agreement read.

**Reason:** The invoice-due-date versus contract-deadline rule needs the
agreement's on-chain `dueAt`, which only the live registry read holds; the local
service never reads the chain, and copying a chain value into the case database
would make that database a second source of truth for an agreement term. An
outcome is also a function of the current rules, not a fact the operator
asserted: storing one would let a later rules change leave rows claiming an
outcome that those rules no longer produce, and task 3's calculator gates on
that outcome.

**Consequence:** The service validates and stores answers and returns no
outcome, because it cannot compute one. The same pure module and the same
fixtures cover the rules wherever they run. Recomputing costs nothing at this
size. A per-answer audit history is deliberately absent until task 7 defines
what an audit record must contain.

## D-012 - Legal values are calculator inputs, never constants in code

**Date:** 2 September 2026
**Status:** Accepted

**Decision:** `web/shared/latePayment.js` embeds no legal value. The margin over
base rate, the reference rates, the fixed-compensation bands and the day-count
basis all arrive as a `lawInputs` argument, and the module refuses to produce a
figure when they are missing, unreadable, or older than the freshness limit.
`STALE_AFTER_DAYS` is the sole number held in code, because it is this
repository's own currency policy rather than a fact about the law.

**Reason:** The approved UK-law source library is a later task, and this
repository does not state a legal fact without an inspectable source. Taking the
values as inputs let the calculator and its fixtures be built and tested first.
It also removes a defect class permanently: an approved source value and a copy
in code cannot drift apart when there is no copy.

**Consequence:** The calculator produces nothing until an approved source
supplies its inputs, which is the intended behaviour rather than a gap. The
fixture suite supplies its own law values, and no figure in it is an approved
legal value. Every result carries `lawAsOf` and `illustrative: true`, so no
consumer can render a figure without its date or present one as settled.

## Entry format

New entries contain an ID, title, date, status, decision, reason, and consequence. Include an official source and check date when a decision depends on time-sensitive event, network, or sponsor information.
