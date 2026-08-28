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
| Frontend, local application layer, wallet UI, and evidence screen | In progress | `web/` provides MetaMask Coston2 agreement registration, live registry reads, Xaman/manual XRPL Testnet payment, matching checks, and a local opt-in FDC job runner. Job state is in memory; there is no durable or multi-user backend yet. |
| AI extraction and mandatory human-confirmation flow | In progress | Skill S1 of `docs/ai/SKILLS.md` is implemented behind `AI_ASSISTANT_ENABLED`: `web/server/ai/` holds the model client, the S1 prompt, and the schema validator that gates every reply, and `AiInvoiceExtraction.jsx` fills the agreement form with quoted, editable suggestions. The validator rejects a reply that populates `xrplDestination`, `destinationTag`, `amountDrops` or `startLedger`, or that claims no human confirmation is needed, and nulls any field whose quote is not a verbatim span of the pasted document; 11 unit executions cover it. A manual two-document run against a local `mlx-community/Qwen3-8B-4bit` endpoint returned a schema-valid extraction and refused an injection fixture. Remaining: a committed fixture suite for the `SKILLS.md` §9 checks, one demonstrated browser run, and skills S2 to S5. |
| FTSO conversion | Not started | Optional after the core evidence flow. |

## Immediate order

1. Start the evidence-focused frontend against agreements `2` and `3`, which are
   real recorded outcomes rather than fixtures.
2. Prepare the demo around both branches.
3. Commit AI fixtures covering `SKILLS.md` §9 checks 1, 3 and 9, so the injection
   refusal and the log-hygiene guarantee are regression-tested rather than
   manually observed.

Both chains run unattended from `create:agreement`. For the paid branch set
`XRPL_SUPPLIER_ADDRESS` first, or `spike:xrpl` funds a supplier the agreement knows
nothing about. For the overdue branch point it at an address that will never be paid
and use a short `DUE_IN_MINUTES`.

No issue evidence may contain a Coston2 private key, XRPL seed, recovery phrase,
verifier key other than the published public test key, full `.env` content, or the
address of an operator's private AI model host.
