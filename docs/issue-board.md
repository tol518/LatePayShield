# Issue Board

**Last updated:** 28 August 2026

This file owns task assignment and delivery status. Technical truth and verified
evidence remain in `project-status.md` and `testing-and-demo.md`.

## Completed — Tolga

| Task | Status | Completion evidence |
|---|---|---|
| Coston2 deployment and explorer verification | Done | Contract `0x4A49...78B1`, deployment transaction `0xfec3...7ae3`, chain `114`, zero verifier override, and public readback. |

## Mushaf — protocol and evidence

| Task | Status | Completion evidence |
|---|---|---|
| FDC verifier request, fee lookup, Coston2 submission, voting-round tracking, and DA proof acquisition | Done | `fdc:prepare`, `fdc:submit`, `fdc:proof`, and `fdc:record` cover the chain end to end and hand each step's output to the next through `evidence/`. `fdc:prepare` reproduces the historic request bytes exactly, and `fdc:proof` was run against real round `1437032` where the live `FdcVerification` at `0x9065...B933` returned true for the retrieved proof. |
| Real paid-path verification | Done | Agreement `2` created in `0xf25f...43df`, XRPL payment `2A06F207...91CD36` sent afterwards in ledger `20283804`, FDC request answered in round `1438624`, and `recordVerifiedPayment` accepted the proof in `0xc675...423e`. Public readback shows `PaidVerified` with evidence ID `0xdaa9...18f8`. |
| Real overdue-path verification | Not started | Requires a separate short-lived agreement and `XRPPaymentNonexistence` proof. |
| Live/recorded demo using real identifiers | Not started | Unblocked. Agreement `2` is a complete real paid lifecycle to build the demo around. |

## Tolga — application and AI

| Task | Status | Completion evidence |
|---|---|---|
| Frontend, API/application layer, persistence, wallet UI, and evidence screen | Not started | No application artifact yet. |
| AI extraction and mandatory human-confirmation flow | Not started | No extraction schema or confirmation UI yet. |
| FTSO conversion | Not started | Optional after the core evidence flow. |

## Immediate order

1. Implement the non-payment proof path against a short-lived agreement, using
   `DUE_IN_MINUTES` to force a deadline that passes during the run.
2. Start the evidence-focused frontend against agreement `2`, which is real
   end-to-end evidence rather than a fixture.
3. Prepare the demo around agreement `2`.

The paid chain runs unattended from `create:agreement` through `fdc:record`. Set
`XRPL_SUPPLIER_ADDRESS` before starting, or `spike:xrpl` will fund a supplier the
agreement knows nothing about.

No issue evidence may contain a Coston2 private key, XRPL seed, recovery phrase,
verifier key other than the published public test key, or full `.env` content.
