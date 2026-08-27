# Issue Board

**Last updated:** 27 August 2026

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
| Real paid-path verification | In progress | Address-hash compatibility is proven and a real DA proof now passes the enshrined verifier. A fresh agreement, post-creation XRPL payment, new FDC proof, and `PaidVerified` contract result remain. `fdc:record` is written but has never been run against a live agreement. |
| Real overdue-path verification | Not started | Requires a separate short-lived agreement and `XRPPaymentNonexistence` proof. |
| Live/recorded demo using real identifiers | Not started | Build only after the paid or overdue proof is accepted by `LatePayShield`. |

## Tolga — application and AI

| Task | Status | Completion evidence |
|---|---|---|
| Frontend, API/application layer, persistence, wallet UI, and evidence screen | Not started | No application artifact yet. |
| AI extraction and mandatory human-confirmation flow | Not started | No extraction schema or confirmation UI yet. |
| FTSO conversion | Not started | Optional after the core evidence flow. |

## Immediate order

1. Create a fresh agreement before its matching XRPL payment.
2. Run `fdc:prepare` → `fdc:submit` → `fdc:proof` → `fdc:record` against it and retain the public transaction.
3. Implement the separate non-payment proof path.
4. Start the evidence-focused frontend against the real proof shape and deployed address.

`fdc:prepare` and `fdc:proof` are proven end to end and need no private credential.
Everything from `fdc:submit` onward needs a funded throwaway `COSTON2_PRIVATE_KEY`,
which is not in the repository, so submission has not been re-run.

No issue evidence may contain a Coston2 private key, XRPL seed, recovery phrase,
verifier key other than the published public test key, or full `.env` content.
