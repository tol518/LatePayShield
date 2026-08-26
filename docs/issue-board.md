# Issue Board

**Last updated:** 26 August 2026

This file owns task assignment and delivery status. Technical truth and verified
evidence remain in `project-status.md` and `testing-and-demo.md`.

## Completed — Tolga

| Task | Status | Completion evidence |
|---|---|---|
| Coston2 deployment and explorer verification | Done | Contract `0x4A49...78B1`, deployment transaction `0xfec3...7ae3`, chain `114`, zero verifier override, and public readback. |

## Mushaf — protocol and evidence

| Task | Status | Completion evidence |
|---|---|---|
| FDC verifier request, fee lookup, Coston2 submission, voting-round tracking, and DA proof acquisition | In progress | Real `XRPPayment` request `0x6850...c99f` and round `1437032` completed manually; submission command exists. Automated proof retrieval and contract submission remain. |
| Real paid-path verification | In progress | Address-hash compatibility is proven. A fresh agreement, post-creation XRPL payment, new FDC proof, and `PaidVerified` contract result remain. |
| Real overdue-path verification | Not started | Requires a separate short-lived agreement and `XRPPaymentNonexistence` proof. |
| Live/recorded demo using real identifiers | Not started | Build only after the paid or overdue proof is accepted by `LatePayShield`. |

## Tolga — application and AI

| Task | Status | Completion evidence |
|---|---|---|
| Frontend, API/application layer, persistence, wallet UI, and evidence screen | Not started | No application artifact yet. |
| AI extraction and mandatory human-confirmation flow | Not started | No extraction schema or confirmation UI yet. |
| FTSO conversion | Not started | Optional after the core evidence flow. |

## Immediate order

1. Automate DA proof retrieval and serialization.
2. Create a fresh agreement before its matching XRPL payment.
3. Submit the new proof to `recordVerifiedPayment` and retain the public transaction.
4. Implement the separate non-payment proof path.
5. Start the evidence-focused frontend against the real proof shape and deployed address.

No issue evidence may contain a Coston2 private key, XRPL seed, recovery phrase,
verifier key other than the published public test key, or full `.env` content.
