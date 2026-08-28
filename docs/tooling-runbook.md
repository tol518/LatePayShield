# Testnet Tooling Runbook

**Last verified:** 28 August 2026. This is the handoff page for a developer or
agent repeating the XRPL → FDC → Coston2 work. Use only throwaway testnet wallets.
Never paste a private key, seed phrase, recovery phrase, or `.env` file into a
Swagger form, chat, issue, commit, or evidence file.

## Tool-to-task map

| Task | Tool used | Link or command | What it produces / what to retain |
|---|---|---|---|
| Create a browser wallet and sign Coston2 transactions | MetaMask | <https://metamask.io/download/> | A public `0x...` account address. The private key stays in MetaMask or the ignored `.env`. |
| Add/select the correct Flare test network | MetaMask, **Flare Testnet Coston2** | <https://dev.flare.network/network/overview> | Network chain ID must be `114`; do not use a mainnet wallet. |
| Fund Coston2 gas | Flare faucet | <https://faucet.flare.network/coston2> | Test C2FLR for deployment and FDC request fees. Enter only the public `0x...` wallet address. |
| Send a reproducible XRPL Testnet payment | XRPL JavaScript client and project script | `npm run spike:xrpl` | Transaction hash, ledger index, addresses, amount, tag, and non-secret evidence JSON. The script uses `wss://s.altnet.rippletest.net:51233` and funds temporary wallets automatically. |
| Inspect the XRPL payment | XRPL Testnet Explorer | `https://testnet.xrpl.org/transactions/<XRPL_TX_HASH>` | Confirm `tesSUCCESS`, destination, amount, destination tag, and ledger. |
| Convert an XRPL transaction into an FDC request | Project script (Swagger only to explore) | `npm run fdc:prepare` | Public `abiEncodedRequest`, saved to `evidence/fdc-request-<XRPL_TX>.json`. It posts to `/verifier/xrp/XRPPayment/prepareRequest`—not the generic `/Payment` route—and needs `FDC_VERIFIER_API_KEY`. Swagger is at <https://fdc-verifiers-testnet.flare.network/verifier/xrp/api-doc>. |
| Submit an FDC request and pay its live fee | Project Hardhat script + Coston2 RPC | `npm run fdc:submit` | Coston2 request transaction hash and calculated voting round. It queries the fee; do not guess it. |
| Inspect deployment and request transactions | Coston2 Explorer | <https://coston2-explorer.flare.network/> | Public transaction/contract URLs. The deployed LatePayShield contract is `0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1`. |
| Track FDC round finalization | Flare Systems Explorer | `https://coston2-systems-explorer.flare.network/voting-round/<ROUND>?tab=fdc` | The relevant finalized voting round. |
| Retrieve the finalized FDC proof/response | Project Hardhat script + Coston2 DA layer | `npm run fdc:proof` | The Merkle proof and ABI-encoded response, saved to `evidence/fdc-proof-<ROUND>-<XRPL_TX>.json`. It polls until the round finalizes, re-encodes the response to confirm it is byte-identical, and calls the live `FdcVerification` before saving. No API key is required. Swagger is at <https://ctn2-data-availability.flare.network/api-doc#/fdc/fdc_proof_by_request_round_create>. |
| Create an agreement before the payment that satisfies it | Project Hardhat script | `npm run create:agreement` | The agreement ID and its committed terms, saved to `evidence/coston2-agreement-<id>.json`. It reads the current validated XRPL ledger as the evidence floor, so the matching payment must be sent afterwards. |
| Submit a finalized proof to the agreement contract | Project Hardhat script | `AGREEMENT_ID=<id> npm run fdc:record` | The public Coston2 transaction that moves an agreement to `PaidVerified`, saved to `evidence/coston2-paid-agreement-<id>.json`. |
| Assert an agreement went unpaid | Project script | `AGREEMENT_ID=<id> npm run fdc:prepare:overdue` | Request bytes for `XRPPaymentNonexistence`, with the search window taken from the agreement rather than chosen. It refuses while the deadline is still open. |
| Record verified non-payment | Project Hardhat script | `AGREEMENT_ID=<id> npm run fdc:record:overdue` | The public Coston2 transaction that moves an agreement to `OverdueVerified`, saved to `evidence/coston2-overdue-agreement-<id>.json`. |
| Confirm deployment has the expected live-network configuration | Project Hardhat script + public RPC | `npm run deploy:check:coston2` | Chain ID `114`, deployed bytecode, zero verifier override, and `nextAgreementId`. |

The Coston2 RPC used by the Hardhat configuration is
`https://coston2-api.flare.network/ext/C/rpc`. It is public infrastructure, not a
secret. Re-check the Flare network overview before a future demo because testnet
endpoints can change.

## The verifier API key

The XRP verifier rejects an unauthenticated request with `401 Unauthorized`, so a key
is mandatory. Flare publishes one for the testnet verifiers:

```
00000000-0000-0000-0000-000000000000
```

It is a published public test value, not a secret, so it is the default in
`.env.example` and `npm run fdc:prepare` works out of the box. The DA layer is
separate and needs no key at all.

## Exact successful request pattern

`npm run fdc:prepare` builds this request for you; the shape is recorded here because
Swagger is still the quickest way to explore a response by hand. Use the XRPL
transaction hash and a public EVM address that will own the proof. `proofOwner` must
be exactly 20 bytes: `0x` followed by 40 hexadecimal characters.

```json
{
  "attestationType": "0x5852505061796d656e7400000000000000000000000000000000000000000000",
  "sourceId": "0x7465737458525000000000000000000000000000000000000000000000000000",
  "requestBody": {
    "transactionId": "0x<64-hex-character-XRPL-transaction-hash>",
    "proofOwner": "0x<40-hex-character-public-Coston2-address>"
  }
}
```

The verifier is deterministic: the same transaction and `proofOwner` reproduce the
same `abiEncodedRequest` byte for byte, which was confirmed against the bytes still
in the `AttestationRequest` log of Coston2 transaction `0x6850...c99f`.

`abiEncodedRequest` is **request data, not an address**, so it will be rejected if
entered into a wallet or faucet address field. Setting it by hand is optional now
that `fdc:prepare` writes it to `evidence/` for the next command to read.

```dotenv
# Public deployed contract address; not secret.
LATEPAY_SHIELD_ADDRESS=0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1

# Published public test value; not a secret.
FDC_VERIFIER_API_KEY=00000000-0000-0000-0000-000000000000

# Secret: never commit, print, or share this value.
COSTON2_PRIVATE_KEY=0x...

# Optional. Only set these to override what the scripts pass between each other.
FDC_ABI_ENCODED_REQUEST=
FDC_VOTING_ROUND=
FDC_PROOF_OWNER=
```

`npm run fdc:submit` requires the private key only because it signs the Coston2
request transaction. A MetaMask public address alone cannot be used by Hardhat.
Exporting a **throwaway Coston2 testnet account** into the local ignored `.env` is
acceptable; never export a wallet that holds real funds.

## Reproducible sequence

1. Install dependencies and prove the local baseline:

   ```bash
   npm ci
   npm run check
   ```

2. In MetaMask select **Flare Testnet Coston2**, copy its public address, and fund
   it through the Coston2 faucet. Put only its throwaway private key in `.env` as
   `COSTON2_PRIVATE_KEY`.
3. Create an XRPL payment with `npm run spike:xrpl`; retain its public transaction
   hash and inspect it in the XRPL Testnet Explorer.
4. Run `npm run fdc:prepare` to get `abiEncodedRequest`. It defaults to the newest
   XRPL payment in `evidence/`; pass a transaction hash as an argument to override.
5. Run `npm run fdc:submit`; it picks up the prepared request, queries the live fee,
   and writes the Coston2 request transaction and voting round back to the same file.
6. Run `npm run fdc:proof`. It polls the DA layer until the round finalizes, then
   saves the proof. For the completed compatibility check, the returned
   `receivingAddressHash` was
   `0x4abeacf6f2ad7fbb211ba1b703aecc2edd2933e84039bcade6e6488d9ddbfb8f`.
7. Verify the project's matching logic locally:

   ```bash
   node -e "const { standardAddressHash } = require('./lib/canonical'); console.log(standardAddressHash('rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V'))"
   ```

   It must print the same hash. The correct formula is
   `keccak256(UTF-8(trimmed XRPL address))`; it is not ABI encoding of a Solidity
   string.
8. Deploy/read back the contract when needed:

   ```bash
   npm run deploy:coston2
   # Copy the printed public contract address into LATEPAY_SHIELD_ADDRESS.
   npm run deploy:check:coston2
   ```

## Avoid the previous dead ends

- A `401 Unauthorized` from the verifier means `FDC_VERIFIER_API_KEY` is missing or
  wrong; it is not a problem with the XRPL hash. In Swagger the same key goes in
  through **Authorize**.
- A `400` saying `proofOwner` is invalid means a placeholder or non-EVM address was
  used. Use the MetaMask public address, not an XRPL `r...` address.
- The verified-code ABI panel in the Coston2 explorer is read-only. It is not the
  place to edit an ABI. Use the project scripts for FDC requests; use the explorer
  only to inspect public transactions and contracts.
- The old XRPL payment `A0DA...ADF3565` proved the hash/FDC request path only. It
  predates any fresh agreement and cannot prove that agreement was paid.
- A real `PaidVerified` result needs the steps in that exact order:
  `create:agreement`, then `spike:xrpl`, then the proof commands, then
  `AGREEMENT_ID=<id> npm run fdc:record`. Set `XRPL_SUPPLIER_ADDRESS` before the
  first one, or `spike:xrpl` funds a new supplier the agreement knows nothing about
  and the proof fails on `DestinationMismatch`. This sequence produced agreement `2`
  on 28 August 2026.
- In PowerShell the last step is `$env:AGREEMENT_ID=2; npm run fdc:record`. The
  `VAR=value command` form is POSIX only and fails on Windows.
- The overdue branch needs a destination that genuinely receives nothing. Pointing it
  at an address that has already been paid makes the verifier refuse the request,
  correctly. Generate a fresh one with
  `node -e "console.log(require('xrpl').Wallet.generate().address)"` and never pay it.
- `npm run fdc:proof` serves both branches. It reads the attestation type out of the
  first 32 bytes of the request, so there is no flag to remember and no way to decode
  a proof with the wrong struct.
- An overdue request cannot be built before the deadline passes, because the
  attestation cannot close a window that is still open. This sequence produced
  agreement `3` on 28 August 2026.
- A proof that `verifyXRPPayment` accepts can still be rejected by `LatePayShield`.
  The verifier only attests that the response is in the round's Merkle tree; the
  agreement's destination, amount, tag, ledger window, and deadline are checked
  separately and each revert has its own named error.

## Public versus secret information

Safe to commit as evidence: testnet transaction hashes, voting rounds, contract
addresses, public wallet addresses, verified code, and explorer URLs. Never commit:
private keys, XRPL seeds, recovery phrases, passwords, bearer tokens, or the full
`.env` file. A deployment transaction hash is a public locator, not a credential.
