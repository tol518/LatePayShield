# LatePay Shield frontend

React + Vite. Kept as a separate npm package from the Hardhat root so the protocol
toolchain and the browser toolchain do not share a dependency tree.

## Run it

From this directory:

```bash
npm install
npm run dev      # UI http://localhost:5173 + Xaman service http://localhost:8787
```

Or from the repository root, without changing directory:

```bash
npm --prefix web install
npm --prefix web run dev
```

`npm run build` writes a static bundle to `web/dist/` (git-ignored);
`npm start` serves that bundle and the Xaman API from one Node process.

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

## Layout

| Path | Holds |
|---|---|
| `src/App.jsx` | Page composition: which sections appear, in what order. |
| `src/components/` | One file per section, plus shared `StatusChip` and `Icons`. |
| `src/components/AgreementCreator.jsx` | Human-confirmed terms form and wallet registration flow. |
| `src/lib/statuses.js` | Status labels, tones, and plain-language meanings. |
| `src/lib/wallet.js` | Browser-wallet connection and Coston2 `createAgreement` transaction. |
| `src/lib/xrplPayment.js` | Public XRPL Testnet transaction lookup and agreement-criteria checks. |
| `src/lib/xamanPayment.js` | Browser client for the same-origin Xaman payment API. |
| `src/lib/fdcPayment.js` | Browser client for the local, opt-in FDC job API. |
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
- **Wallets sign in the browser.** Never add a private key or seed to a `VITE_`
  variable. The connected Coston2 address becomes the agreement supplier.
- **A detected XRPL payment is not final proof.** The payment journey shows a
  pending state until a read of the Coston2 contract returns `PaidVerified`.
- **FDC runs server-side.** The UI may start and observe the existing testnet
  command chain, but it cannot access the Coston2 key or FDC configuration.
