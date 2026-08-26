# Testnet Tooling Runbook

**Last verified:** 26 August 2026. This is the handoff page for a developer or
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
| Convert an XRPL transaction into an FDC request | XRP verifier Swagger | <https://fdc-verifiers-testnet.flare.network/verifier/xrp/api-doc> | Public `abiEncodedRequest`. Use **POST** `/verifier/xrp/XRPPayment/prepareRequest`—not the generic `/Payment` route. |
| Submit an FDC request and pay its live fee | Project Hardhat script + Coston2 RPC | `npm run fdc:submit` | Coston2 request transaction hash and calculated voting round. It queries the fee; do not guess it. |
| Inspect deployment and request transactions | Coston2 Explorer | <https://coston2-explorer.flare.network/> | Public transaction/contract URLs. The deployed LatePayShield contract is `0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1`. |
| Track FDC round finalization | Flare Systems Explorer | `https://coston2-systems-explorer.flare.network/voting-round/<ROUND>?tab=fdc` | The relevant finalized voting round. |
| Retrieve the finalized FDC proof/response | Coston2 DA Swagger | <https://ctn2-data-availability.flare.network/api-doc#/fdc/fdc_proof_by_request_round_create> | Proof data including `response.responseBody.receivingAddressHash`. |
| Confirm deployment has the expected live-network configuration | Project Hardhat script + public RPC | `npm run deploy:check:coston2` | Chain ID `114`, deployed bytecode, zero verifier override, and `nextAgreementId`. |

The Coston2 RPC used by the Hardhat configuration is
`https://coston2-api.flare.network/ext/C/rpc`. It is public infrastructure, not a
secret. Re-check the Flare network overview before a future demo because testnet
endpoints can change.

## Exact successful request pattern

In the XRP verifier Swagger, click **Authorize** and provide the published public
test API key when the UI requires it. Then use the returned transaction hash and a
public EVM address that will own the proof. `proofOwner` must be exactly 20 bytes:
`0x` followed by 40 hexadecimal characters.

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

Copy only the returned `abiEncodedRequest` into the ignored `.env` variable below.
It is **request data, not an address**, so it will be rejected if entered into a
wallet/faucet address field.

```dotenv
# Public request bytes are acceptable locally but do not need to be committed.
FDC_ABI_ENCODED_REQUEST=0x...

# Public deployed contract address; not secret.
LATEPAY_SHIELD_ADDRESS=0x4A49a77add9E7eeAD8813C3D51A9513EA60278B1

# Secret: never commit, print, or share this value.
COSTON2_PRIVATE_KEY=0x...
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
4. Use the **XRPPayment** Swagger endpoint to get `abiEncodedRequest`; put it in
   `FDC_ABI_ENCODED_REQUEST`.
5. Run `npm run fdc:submit`; retain the public Coston2 request transaction and its
   voting round. Wait for that round to finalize in Systems Explorer.
6. In DA Swagger retrieve the proof using the public request bytes and round. For
   the completed compatibility check, the returned `receivingAddressHash` was
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

- A `401 Unauthorized` from verifier Swagger means the required public test API key
  was not supplied through **Authorize**; it is not a problem with the XRPL hash.
- A `400` saying `proofOwner` is invalid means a placeholder or non-EVM address was
  used. Use the MetaMask public address, not an XRPL `r...` address.
- The verified-code ABI panel in the Coston2 explorer is read-only. It is not the
  place to edit an ABI. Use the project scripts for FDC requests; use the explorer
  only to inspect public transactions and contracts.
- The old XRPL payment `A0DA...ADF3565` proved the hash/FDC request path only. It
  predates any fresh agreement and cannot prove that agreement was paid.
- A real `PaidVerified` result still requires: create an agreement first, send a
  new matching XRPL payment afterward, obtain its new FDC proof, and submit that
  proof to `recordVerifiedPayment`.

## Public versus secret information

Safe to commit as evidence: testnet transaction hashes, voting rounds, contract
addresses, public wallet addresses, verified code, and explorer URLs. Never commit:
private keys, XRPL seeds, recovery phrases, passwords, bearer tokens, or the full
`.env` file. A deployment transaction hash is a public locator, not a credential.
