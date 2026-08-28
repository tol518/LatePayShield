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
| Real overdue-path verification | Done | Agreement `3` created in `0x73b1...1269` against a never-paid address, request answered in round `1438645`, and `recordVerifiedNonPayment` accepted the proof in `0xab0d...068e`. Public readback shows `OverdueVerified` with evidence ID `0x6881...14c1`. |
| Live/recorded demo using real identifiers | Not started | Unblocked. Agreements `2` and `3` are real evidence for the paid and overdue branches. |

## Tolga — application and AI

| Task | Status | Completion evidence |
|---|---|---|
| Frontend, API/application layer, persistence, wallet UI, and evidence screen | Not started | No application artifact yet. |
| AI extraction and mandatory human-confirmation flow | Not started | No extraction schema or confirmation UI yet. |
| FTSO conversion | Not started | Optional after the core evidence flow. |

## Immediate order

1. Start the evidence-focused frontend against agreements `2` and `3`, which are
   real recorded outcomes rather than fixtures.
2. Prepare the demo around both branches.

Both chains run unattended from `create:agreement`. For the paid branch set
`XRPL_SUPPLIER_ADDRESS` first, or `spike:xrpl` funds a supplier the agreement knows
nothing about. For the overdue branch point it at an address that will never be paid
and use a short `DUE_IN_MINUTES`.

No issue evidence may contain a Coston2 private key, XRPL seed, recovery phrase,
verifier key other than the published public test key, or full `.env` content.
