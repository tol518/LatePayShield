# Data and Contract Boundaries

**Current status:** Canonicalization and the local agreement contract are implemented and tested. Real Coston2 deployment and FDC proof compatibility are not verified.

## Canonical terms

`lib/canonical.js` is the sole implementation. It returns fields in this exact order:

```json
{
  "termsVersion": 1,
  "invoiceNumber": "INV-2026-001",
  "supplierName": "Maya Design Studio",
  "payerName": "Acme Ltd",
  "currency": "XRP_TESTNET",
  "amountDrops": "2000000",
  "xrplDestination": "r...",
  "destinationTag": "2026001",
  "dueAt": "1788264000"
}
```

### Normalization rules

- `termsVersion` is forced to numeric `1`; caller input cannot select another version.
- `invoiceNumber`, `supplierName`, `payerName`, and `xrplDestination` are stringified, trimmed, and required to be non-empty.
- `currency` must equal `XRP_TESTNET`.
- `amountDrops` is an integer string in `[1, 2^64 - 1]`.
- `destinationTag` is an integer string in `[0, 2^32 - 1]`.
- `dueAt` is a positive integer string within `uint64`.
- Unsafe JavaScript numeric integers are rejected before `BigInt` conversion.
- Unknown input fields are excluded from serialization.

The hash is:

```text
invoiceHash = keccak256(UTF8(JSON.stringify(canonicalObject)))
```

`JSON.stringify` has no whitespace and the object is rebuilt in the fixed field order. Any semantic change to these rules requires a terms-version decision, shared fixtures, and coordinated migration.

## Address hash limitation

`standardAddressHash(xrplAddress)` currently returns:

```text
keccak256(abi.encode(string(trimmedAddress)))
```

This encoding is inferred, not verified. It must be compared with `receivingAddressHash` from a real `XRPPayment` attestation before destination matching is claimed to work on FDC.

## Agreement storage

Each `Agreement` contains:

| Field | Solidity type | Meaning |
|---|---|---|
| `invoiceHash` | `bytes32` | Commitment to canonical confirmed terms. |
| `supplier` | `address` | EVM caller that created the agreement. |
| `xrplDestinationHash` | `bytes32` | Provisional FDC-format destination commitment. |
| `destinationTag` | `uint256` | Required XRPL destination tag. |
| `expectedDrops` | `uint64` | Minimum accepted payment amount. |
| `startLedger` | `uint64` | Creator-claimed lower evidence bound. |
| `dueAt` | `uint64` | Unix deadline. |
| `status` | `Status` | Authoritative on-chain state. |
| `evidenceId` | `bytes32` | `keccak256(abi.encode(proof.data))` for a finalized outcome. |
| `xrplTxHash` | `bytes32` | FDC request transaction ID for a paid outcome. |

Invoice text, names, documents, email addresses, wallet seeds, and private keys stay off-chain.

## Status ownership

| Contract status | Value | UI status |
|---|---:|---|
| `None` | 0 | No agreement |
| `Active` | 1 | `ACTIVE`; derive `OVERDUE_PENDING` after the deadline |
| `PaidVerified` | 2 | `PAID_VERIFIED` |
| `OverdueVerified` | 3 | `OVERDUE_VERIFIED` |
| `Disputed` | 4 | `DISPUTED` |

`DRAFT` and `PAYMENT_SUBMITTED` are UI-only. `OVERDUE_PENDING` is also UI-only and carries no proof.

## Creation rules

`createAgreement` rejects:

- zero invoice hash;
- zero destination hash;
- zero expected amount;
- zero start ledger;
- deadline at or before the current EVM timestamp.

The caller becomes the supplier and the initial status is `Active`.

## Paid-proof rules

`recordVerifiedPayment` is permissionless but finalizes only when all checks pass:

1. Agreement exists and is active.
2. `IFdcVerification.verifyXRPPayment(proof)` returns true.
3. XRPL response status is success (`0`).
4. Receiving address hash equals the agreement value.
5. Received amount is positive and **at least** `expectedDrops`; overpayment is accepted.
6. Destination tag is present and equal.
7. Payment ledger is not before `startLedger`.
8. Payment timestamp is not after `dueAt`.

The current contract does not inspect the XRPL memo or `invoiceNumber`. The committed payment evidence contains `INV-2026-001`, but that reference is not an on-chain/FDC matching condition.

## Non-payment-proof rules

`recordVerifiedNonPayment` requires an active agreement and an EVM time after `dueAt`, then verifies the FDC proof and pins its request body:

- `amount == expectedDrops - 1`, because the attestation search is strictly greater than the requested amount;
- destination address hash equals the agreement value;
- destination-tag checking is enabled and the tag matches;
- minimal ledger is no later than the creator-supplied `startLedger`;
- request deadline is at least the agreement deadline.

The outcome proves only that no qualifying payment matching those conditions appeared in the proof's ledger/time window.

## Dispute behavior

Only the recorded supplier may call `markDisputed`. It can move active or finalized agreements into `Disputed`; the MVP does not resolve or reverse disputes. Calling it twice fails.

## Verifier boundary

- On local chain ID `31337`, tests may inject `MockFdcVerification`.
- On any other chain, a non-zero override reverts with `VerifierOverrideNotAllowed`.
- With a zero override, the contract resolves Flare's enshrined verifier through `ContractRegistry`.
- Outcome functions are permissionless because the verified proof is intended to be the authority.

Local mock tests prove contract checks and transitions, not live FDC compatibility.

## Events

- `AgreementCreated`
- `PaymentVerified`
- `NonPaymentVerified`
- `Disputed`

Future application types must be generated from the actual ABI and must preserve enum/event semantics rather than restating them independently.

## Update triggers

Update this file whenever canonical fields/order/normalization, hash/address encoding, storage, statuses, transitions, matching conditions, ABI, events, evidence ID semantics, or verifier trust changes.
