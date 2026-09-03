# LatePay Shield frontend

React + Vite. Kept as a separate npm package from the Hardhat root so the protocol
toolchain and the browser toolchain do not share a dependency tree.

## Run it

From this directory:

```bash
npm install
npm run dev      # UI http://localhost:5173 + local service http://localhost:8787
```

Or from the repository root, without changing directory:

```bash
npm --prefix web install
npm --prefix web run dev
```

`npm run build` writes a static bundle to `web/dist/` (git-ignored);
`npm start` serves that bundle and the Xaman API from one Node process.

### Operator access

The service authorizes every `/api/` request, case routes included, with an
operator token sent in `X-LatePay-Operator-Token`. Reaching the port is not
permission.

By default the service binds `127.0.0.1`, generates one token per run, and puts
it in the page it serves as a `latepay-operator-token` meta tag, so only
same-origin code in that page can read it. `npm run dev` generates one token and
passes it to both the service and the Vite dev server, so the proxied dev page
is authorized too. Running `npm run dev:ui` and `npm run dev:server` in separate
terminals gives them different tokens: set `WEB_OPERATOR_TOKENS` in the
repository-root `.env` for that, and for any token that should survive restarts.

```dotenv
# operatorId:token pairs, comma separated; at least 24 characters each.
WEB_OPERATOR_TOKENS=local-operator:paste-a-long-random-value-here

# Optional. Invoice totals at or above this many minor units route a case to
# professional review, which refuses the send hand-off. Defaults to 5000000
# (£50,000). The browser's VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS is accepted
# as a fallback so the panel and the gate cannot diverge.
ELIGIBILITY_HIGH_VALUE_MINOR_UNITS=5000000
```

Each operator owns the case files it creates and cannot read, list, or append to
another operator's case. Case rows written before ownership existed are migrated
to `local-operator`, so an existing local database keeps working.

Requests are also refused, before any route or body is read, when the peer, the
`Host` header, or the `Origin` header is not a loopback value. A cross-origin
`POST` is rejected on its `Origin` alone whatever its `Content-Type`, and a
simple cross-site form or `text/plain` post cannot set the token header either.

Serving the app anywhere other than loopback is deliberately harder: a
non-loopback `XAMAN_SERVER_HOST` makes the process exit before listening unless
all three of these are set.

```dotenv
XAMAN_SERVER_HOST=0.0.0.0
WEB_AUTHENTICATED_DEPLOYMENT=true
WEB_OPERATOR_TOKENS=operator-a:paste-a-long-random-value-here
WEB_ALLOWED_ORIGINS=https://cases.internal.example
```

In that mode the page never carries a token: distribute operator tokens out of
band and keep them out of Git, screenshots, and `VITE_` variables. This is one
shared-secret token per operator, not a user account system, and the case
database is still unencrypted at rest.

`npm run preview` serves the built bundle from Vite without the service, so it
carries no token and its API calls will be refused; use `npm start` instead.

The service creates an ignored local SQLite database at `web/data/cases.sqlite`
when the first case-file request is handled. It stores confirmed structured
facts, communication notes, versioned message drafts, and append-only draft
audit events, not raw invoice text or uploaded files. An approved draft may
pass the server-side send-authorization gate, but no delivery transport is
connected and the response remains `sent: false`. Set
`CASE_DATABASE_PATH` only when a different local database path is needed.

## Enable Pay with Xaman

Create a test application at [Xaman Developer Console](https://apps.xumm.dev),
then set the two server-only values in the repository-root `.env`:

```dotenv
XUMM_APIKEY=your-application-uuid
XUMM_APISECRET=your-application-secret-uuid
```

Restart `npm run dev`. The browser never receives these credentials. The
service creates a Testnet-only Payment payload, while Xaman keeps custody and
asks the payer to approve it. The manual transaction-hash field remains a
fallback.

### Xaman setup and test payment guide

This integration creates a **sign request** (also called a payload): LatePay
Shield proposes an XRPL Testnet payment, and the payer approves it in their own
Xaman wallet. The app never receives an XRPL seed or private key.

1. Install **Xaman** from your phone's normal app store and create or import a
   **test-only XRPL Testnet account**. Fund that account with Testnet XRP; do
   not use a real-money XRPL account for this prototype.
2. In Xaman, select an XRPL **Testnet** node/account before scanning a payment
   QR code. A Mainnet-connected wallet will correctly refuse this app's
   Testnet-only payload.
3. Go to the [Xaman Developer Console](https://apps.xumm.dev), sign in, and
   create an application for this local testnet prototype. The console provides
   an API key and API secret for that application.
4. Put those values only in the repository-root ignored `.env` file:

   ```dotenv
   XUMM_APIKEY=your-developer-console-api-key
   XUMM_APISECRET=your-developer-console-api-secret
   ```

   Do **not** place either value in `web/.env`, a `VITE_` variable, browser
   storage, a screenshot, or Git. Anyone holding the secret can create sign
   requests for the application.
5. Restart `npm run dev`, create/select an awaiting-payment agreement, choose
   **Pay with Xaman**, and scan the QR code with the same Testnet wallet. Check
   the destination, XRP amount, and destination tag in Xaman before approving.
6. Once Xaman signs and submits it, the UI receives the public transaction hash
   and checks that transaction against the agreement on XRPL Testnet. It does
   not call a payment verified until Coston2 later reads `PaidVerified`.

The server uses the SDK's payload subscription to receive the signed/cancelled
state, then exposes only the public request ID and transaction hash to the
browser. This follows Xaman's backend credential guidance and its payload
subscription flow: [credentials](https://docs.xaman.dev/concepts/authorization),
[payload creation](https://docs.xaman.dev/js-ts-sdk/sdk-syntax/xumm.payload/create),
and [subscription](https://docs.xaman.dev/js-ts-sdk/sdk-syntax/xumm.payload/createandsubscribe).

After an agreement is created, its public XRPL destination is saved only in
that browser so the live registry can show **Pay now** after a refresh. For an
older agreement, the registry asks for the original destination once and
checks its hash against the contract before saving it. No seed, API secret, or
invoice-party information is stored there.

## Enable GUI FDC verification

The protocol scripts are already testnet-proven. The web service can run that
same chain after the UI has independently checked a matching XRPL payment:
request preparation, Coston2 fee submission, DA proof retrieval, and contract
recording. It is deliberately opt-in because it uses the repository's existing
throwaway Coston2 signing configuration and pays a live testnet FDC fee.

Add this to the repository-root `.env`, alongside the existing FDC and Coston2
values required by the protocol scripts:

```dotenv
FDC_UI_AUTOMATION_ENABLED=true
```

Restart `npm run dev`. The service accepts one FDC job at a time because the
existing protocol scripts exchange their public intermediate files through the
root `evidence/` directory. The browser receives progress and public hashes,
never a private key, seed, or verifier setting. Keep the web service running
until the job completes; its job status is intentionally in memory for this
local testnet prototype.

## Enable the local AI assistant

Optional, and off by default. Four skills of [`../docs/ai/SKILLS.md`](../docs/ai/SKILLS.md)
are implemented. **S1** reads pasted invoice text or a searchable PDF, XML, or
UBL invoice and proposes the descriptive terms it can quote. **S6** reads
correspondence for a saved case and proposes the dated events it can quote,
which you confirm one at a time. **S3** explains the current agreement status in
plain language beside the status chip. **S2** drafts a payment reminder from the
confirmed case facts, saved unapproved into the same review gate as a reminder
you type yourself. Every form is complete without the assistant: keep it
switched off and nothing in the journey changes.

Uploads are parsed by the loopback service and held in memory for that request
only. Files are limited to 10 MB; PDFs are limited to 50 pages and must contain
selectable text. Run OCR on a scanned/image-only PDF before uploading it. XML
and UBL must be well-formed UTF-8; DTD and entity declarations are rejected.
After parsing, the existing 25,000-character S1 limit and every prompt/schema
guard still apply.

Run any OpenAI-compatible server on the machine hosting the model — MLX
(`mlx_lm.server`), Ollama, llama.cpp, or LM Studio all expose the required
`/v1/chat/completions` route — then add its address to the repository-root
`.env`:

```dotenv
AI_ASSISTANT_ENABLED=true
LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1
LOCAL_LLM_MODEL=mlx-community/Qwen3-8B-4bit
LOCAL_LLM_TIMEOUT_MS=180000
```

If the model runs on a different machine on your own private network, put that
machine's address in `LOCAL_LLM_BASE_URL`. Only `server/` ever contacts it, so
the address stays out of the browser bundle and the model needs no CORS
configuration, no public exposure, and no TLS certificate.

Restart `npm run dev`. What the service guarantees, from
[`../docs/ai/SKILLS.md`](../docs/ai/SKILLS.md):

- **Every reply is schema-validated before the browser sees it.** Reasoning is
  stripped, JSON is parsed, and a response that populates the XRPL destination,
  destination tag, XRP amount, or start ledger is rejected whole. One retry
  carries the validation error back to the model; a second failure means manual
  entry.
- **Every suggestion is quoted.** A value the model cannot support with a
  verbatim span of the pasted or locally extracted document text is dropped,
  with a warning naming it.
- **Nothing is confirmed.** Suggestions land in the same editable fields you
  would type into, and the agreement is registered only from what you confirm.
  Once registration succeeds, those values and the invoice-only facts pre-fill
  a linked case draft. The case is not saved until you confirm it separately.
- **No currency conversion.** The invoice total is shown for reference; the XRP
  amount is always yours to enter.
- **Document text is quoted material, not instruction.** A document that tries to
  direct the model produces a refusal.
- **A case that has left the automated path cannot hand a draft to a
  transport.** `shared/escalation.js` refuses the send authorization for a
  dispute, insolvency, a consumer or cross-border matter, court proceedings,
  terms over 60 days, a limitation risk, a high-value invoice, or an incomplete
  questionnaire — checked server-side before approval, so approving the wording
  does not clear the case. It reads no chain, so the block holds when Coston2 is
  unreachable.
- **An explanation is not evidence, and a generated reminder is not an approved
  one.** S3 narrates a status read from the contract and cannot report a
  different one; the always-applicable limitations beneath it are fixed
  application text, not model prose. S2's reminder is stored unapproved and
  needs the same human approval and send-gate check as anything you type. A
  reminder may mention statutory interest only when you ask for it, eligibility
  reports a supported outcome, and `data/uk-law/snapshot.json` has been approved
  by a person; otherwise the mention is withheld and the reason is shown.
- **A proposed timeline event is not a case record.** S6 proposals live in the
  browser only. Confirming one stores that single event with the quote it came
  from, the document's SHA-256 fingerprint, the model name, and your operator
  ID; discarding one writes nothing. There is no accept-all, and the case file
  always shows which entries were confirmed from a suggestion. An event may
  never carry a payment status, an identifier, a legal conclusion, or an amount
  the document does not contain — the whole reply is rejected if it tries.
- **Raw documents are not retained.** The text lives for the duration of the
  extraction request. If the user later confirms and saves a case, the case
  database keeps only the selected structured facts, grounded quotes, source
  metadata, and a SHA-256 fingerprint. The service log records model name,
  finish reason, token counts, and latency — never the document.

A local 8B model with thinking enabled took roughly 40 to 55 seconds per request
in testing. The button says so, and the rest of the page stays usable.

## Layout

| Path | Holds |
|---|---|
| `src/App.jsx` | Page composition: which sections appear, in what order. |
| `src/components/` | One file per section, plus shared `StatusChip` and `Icons`. |
| `src/components/AgreementCreator.jsx` | Human-confirmed terms form and wallet registration flow. |
| `src/lib/statuses.js` | Status labels, tones, and plain-language meanings. |
| `src/lib/wallet.js` | Browser-wallet connection and Coston2 `createAgreement` transaction. |
| `src/lib/xrplPayment.js` | Public XRPL Testnet transaction lookup and agreement-criteria checks. |
| `src/lib/apiRequest.js` | Same-origin API fetch that presents this operator's token. |
| `src/lib/xamanPayment.js` | Browser client for the same-origin Xaman payment API. |
| `src/lib/fdcPayment.js` | Browser client for the local, opt-in FDC job API. |
| `src/lib/aiAssistant.js` | Browser client for the local AI API, and suggestion-to-form mapping. |
| `src/components/AiInvoiceExtraction.jsx` | Optional upload-or-paste invoice panel and suggestion review. |
| `src/components/TimelineSuggestions.jsx` | Optional S6 panel: proposed case events, each quoted, editable, and confirmed one at a time. |
| `src/components/StatusExplanation.jsx` | Optional S3 panel: plain-language status narration beside the real status chip. |
| `shared/statusLimitations.js` | The mandatory evidence limitations, as code rather than prompt (D-017). |
| `src/components/CasePack.jsx` | Confirmed local case files, live agreement evidence, and communication notes. |
| `src/components/DraftApprovalPanel.jsx` | Versioned reminder drafts, human review controls, send-gate check, and visible audit trail. |
| `server/ai/` | PDF/XML/UBL parsers, model client, S1 and S6 prompts, and the schema validators that gate every reply. |
| `server/cases/` | Validated local SQLite case-file persistence, scoped to the owning operator. |
| `server/access.js` | Operator-token authorization, loopback/`Origin`/`Host` policy, and bind refusal. |
| `server/index.js` | Isolated Xaman service and testnet-only FDC job runner. |
| `src/lib/exampleAgreement.js` | Placeholder values for the layout illustration. |
| `src/styles/tokens.css` | Colour roles, spacing scale, type, radii. Change design values here. |
| `src/styles/app.css` | Component styles. |

## Rules this code follows

These come from [`../docs/ui-language.md`](../docs/ui-language.md) and are easy to
break by accident:

- **Green means contract-verified, nothing else.** `tone: 'positive'` in
  `statuses.js` belongs only to `PAID_VERIFIED` and `OVERDUE_VERIFIED`. A submitted
  or detected payment must not use it.
- **Status keys mirror `docs/design.md`.** Add a state there first, then here.
- **Every status carries an icon and text.** Colour is never the only signal.
- **Placeholder data must read as placeholder.** `exampleAgreement.js` values are
  invented; anything shown as real evidence has to come from `/evidence` and be
  labelled as recorded testnet data.
- **The testnet label stays visible without scrolling** — it lives in `TopBar`.
- **Canonical terms are shared.** Vite aliases `@latepay/canonical` directly to
  `../lib/canonical.js`; do not reproduce its field order or hashing in `web/`.
- **Reachability is not authorization.** Every `/api/` route resolves an
  authenticated operator first, and case reads and writes are scoped to that
  operator. New routes go through the same gate; new browser calls go through
  `src/lib/apiRequest.js` rather than a bare `fetch`.
- **Wallets sign in the browser.** Never add a private key or seed to a `VITE_`
  variable. The connected Coston2 address becomes the agreement supplier.
- **A detected XRPL payment is not final proof.** The payment journey shows a
  pending state until a read of the Coston2 contract returns `PaidVerified`.
- **FDC runs server-side.** The UI may start and observe the existing testnet
  command chain, but it cannot access the Coston2 key or FDC configuration.
- **The AI proposes; a human confirms.** No component fetches the model
  directly, and no model output reaches the UI without passing
  `server/ai/extractionSchema.js` or `server/ai/timelineSchema.js`. A proposed
  timeline event is browser state until an operator confirms that one event. New skills add a route and a validator there,
  never a fetch from a component.
