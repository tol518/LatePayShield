# LatePay Shield UI Language

**Status:** Design direction for the planned frontend. This document does not describe an implemented interface.

## The product feeling

LatePay Shield should feel like **calm, dependable payment administration with an evidence layer**. It must not resemble a crypto exchange, a trading terminal, or a blockchain explorer.

The user should understand within 20 seconds:

1. what payment agreement exists;
2. what payment is required;
3. the agreement's current status and next action; and
4. what the available evidence does and does not prove.

Use familiar invoice and payment language first. Introduce XRPL, Flare, FDC, hashes, and ledgers only where they help the user inspect or verify a claim.

## Design principles

### Evidence first, technology second

The interface must lead with the user's agreement, payment criteria, status, and next action. Technical identifiers are supporting evidence, not the main content.

### Calm over dramatic

Use a restrained, spacious financial-product aesthetic. There should be no neon gradients, token prices, candlestick charts, animated network graphics, or decorative blockchain motifs.

### Clear rather than clever

Prefer plain, specific labels such as **Awaiting payment** and **Payment verified**. Avoid vague labels such as **Processing**, **Confirmed**, or **Secure** unless the screen explains exactly what is happening.

### Truthful states are part of the experience

Pending, mismatch, proof rejection, service failure, local mock data, and recorded testnet evidence must look and read differently from a verified contract outcome.

### Human confirmation is authoritative

AI may propose values, but a person confirms the amount, deadline, XRPL destination, destination tag, and evidence-window start. Suggested values always remain visibly editable until confirmation.

## Visual foundation

### Colour roles

Use semantic colours consistently. Colour supports meaning; it must never be the only signal.

| Role | Suggested character | Use |
|---|---|---|
| Canvas | Warm white or very light cool grey | Page background |
| Surface | White with a subtle neutral border | Cards, forms, tables |
| Ink | Deep navy or charcoal | Primary text and headings |
| Muted | Slate grey | Supporting text, labels, metadata |
| Primary | Confident medium blue | Main actions, links, active states |
| Positive | Reserved green | Contract-verified payment outcome only |
| Attention | Amber | Deadline passed, review required, caution |
| Danger | Red | Rejected proof, operational failure, destructive actions |
| Testnet | Blue-grey / indigo label | Persistent environment indicator |

Never use green for a payment that is merely submitted, detected, or awaiting verification.

### Typography

Use an accessible sans-serif interface typeface such as Inter, Geist, or system UI fonts.

- **Page title:** 28–32 px, semibold; describes the user task or agreement.
- **Section title:** 18–20 px, semibold; names a clear group of information.
- **Body:** 15–16 px, regular, with generous line height.
- **Labels and metadata:** 12–14 px, medium; never rely on tiny text for critical information.
- **Identifiers:** a monospace font at 13–14 px, with copy controls and truncation only when the full value is available on demand.

Use sentence case, not all caps, except for short technical labels such as `XRPL` and `FDC`.

### Spacing and shape

Build on an 8 px spacing scale: 8, 16, 24, 32, 40, and 48 px. Favour open layouts with one primary action per screen.

- Cards: 10–12 px corner radius, soft border, minimal or no shadow.
- Buttons and inputs: 8 px radius, minimum 44 px height.
- Desktop content width: roughly 1120–1200 px.
- Reading/detail columns: cap at roughly 680–760 px.

## Layout language

### Persistent environment context

Every product screen must show a persistent label such as:

> XRPL Testnet · Prototype

It should be visible without scrolling, preferably in the top bar. Do not hide the fact that this is testnet software in a footer or tooltip.

### The agreement dashboard

The dashboard is the primary record view. Its information hierarchy should be:

1. Agreement name or number and current status.
2. Minimum qualifying amount and deadline.
3. Plain-language meaning and the next valid action.
4. Agreement terms: destination, destination tag, evidence-window start.
5. Evidence and technical identifiers: agreement ID, terms hash, transaction/proof/ledger IDs.
6. Limitations and supporting links.

Suggested structure:

```text
Agreement #001                                  XRPL Testnet · Prototype

[Status icon] Awaiting payment                  Due 04 September 2026
£2,000 minimum qualifying payment               Acme Ltd

Next step
Share the payment instructions with Acme.       [View payment instructions]

Agreement terms                                 Evidence
Destination       r...9x                        Agreement ID   0x...78B1
Destination tag   1042                          Terms hash     0x...2f9a
Evidence window   25 Aug – 04 Sep               [View evidence]
```

### Cards, tables, and timelines

- Use cards to group a clear subject: **Current status**, **Next step**, **Agreement terms**, or **Evidence**.
- Use two-column key-value layouts for terms and identifiers.
- Use a short vertical timeline for the agreement journey: Draft → Awaiting payment → Checking payment → Verified result.
- Use an evidence checklist for matching criteria. Each row needs an icon, a label, a result, and an optional explanation.
- Avoid putting raw JSON in the default view. Put it behind an optional technical-details disclosure when needed.

## Core components

### Status chips

Every status must include an icon and text. Do not use a coloured dot alone.

| Status | Visual treatment | Supporting copy |
|---|---|---|
| Draft | Neutral chip, document icon | Terms are editable and not registered. |
| Awaiting payment | Blue chip, clock icon | Agreement recorded; no final outcome yet. |
| Checking payment | Blue/indigo chip, progress icon | A candidate payment or proof is being checked. |
| Payment verified | Green chip, check icon | Contract accepted payment evidence matching the implemented rules. |
| Deadline passed — verification pending | Amber chip, alert-clock icon | Deadline has passed; this is not yet a non-payment result. |
| No qualifying payment found in the defined window | Green or neutral-success chip, check icon | Contract accepted the relevant non-payment proof. |
| Needs human review | Amber chip, person/review icon | The MVP does not adjudicate this disagreement. |
| Operational failure | Red chip, warning icon | A service or proof request failed; this is not proof of non-payment. |

### Buttons and actions

- One filled primary button per view: for example, **Review agreement**, **Register agreement**, **View payment instructions**, or **Submit proof**.
- Secondary actions use an outline or quiet button: **Copy address**, **Open explorer**, **Download evidence**.
- Destructive actions need a clear confirmation state.
- Disable unavailable actions with an explanation, not only a disabled appearance.

### Inputs and confirmation

- Group fields by user intent: invoice terms, payment criteria, and evidence window.
- Mark AI output as **Suggested** beside each proposed value.
- Make authoritative values editable before registration.
- Before registration, show a readable confirmation panel that lists exactly what will be locked.
- Explain destination tags at the field: “A number used to identify this agreement’s payment.”

### Copyable identifiers

All addresses, hashes, IDs, destination tags, and transaction hashes must be copyable through an adjacent visible control. A successful copy should produce brief feedback such as “Copied”.

Show shortened identifiers in dense views (`0x1863…6dfa`) but preserve access to the complete value. Explorer links must appear only for real identifiers.

## Screen-specific guidance

### Agreement preparation

Use a simple stepper:

1. Invoice details
2. Payment criteria
3. Review and confirm
4. Agreement recorded

Show the user a short explanation at the start: “Record the payment criteria you want this prototype to check.” Do not imply the agreement is legally binding.

### Payment instructions

This screen should be task-focused and easy to use on mobile. Place the exact required values in a clear order:

1. XRPL Testnet destination
2. Minimum amount
3. Destination tag
4. Memo/reference, marked as useful evidence only

Explain the verification boundary directly:

> The current contract checks the destination, minimum amount, destination tag, and defined window. It does not verify the memo/reference.

Add QR code support only after the plain text, copy controls, and manual payment flow work correctly.

### Evidence view

Lead with the result and verification level, then show the matching criteria.

Use two explicit sections:

- **What this evidence supports**
- **What this evidence does not establish**

For example, a verified non-payment result must say “No qualifying payment found in this defined window,” never “The customer did not pay.”

## Responsive and accessible behaviour

- Mobile is a first-class payment-instructions experience; stack desktop columns into a single readable flow.
- Preserve status text, icons, and descriptions at every screen size.
- Use visible keyboard focus states with sufficient contrast.
- Meet WCAG AA contrast for text and interactive elements.
- Label all controls; do not use placeholder text as the only label.
- Make error messages programmatically associated with the affected field.
- Avoid hover-only explanations; important help text should be visible or reachable with keyboard and touch.
- Do not rely on colour, animation, or sound to convey verification state.

## Voice and microcopy

Use direct, calm, non-legal language.

| Prefer | Avoid |
|---|---|
| Payment verified | Payment guaranteed |
| Checking payment evidence | Verifying on-chain magic |
| No qualifying payment found in the defined window | The customer did not pay |
| Testnet prototype | Production-ready platform |
| Suggested value — review before confirming | AI-approved terms |
| Needs human review | Dispute resolved |

## Reference products

Use these as interaction and hierarchy references, not visual templates to copy:

- [Wise Business Invoices](https://wise.com/p/business/invoice): straightforward payment and invoice language.
- [Stripe Invoicing](https://stripe.com/invoicing): structured billing workflows and status hierarchy.
- [Stripe invoice lifecycle](https://docs.stripe.com/invoicing/overview?dashboard-or-api=api&locale=en-GB): clear state transitions and actions tied to each state.

## Do not do this

- Do not make a pending proof look successful.
- Do not label mock or recorded evidence as live verification.
- Do not hide the testnet/prototype context.
- Do not present blockchain terminology before the payment task requires it.
- Do not claim collection, legal enforceability, compliance, or universal proof of non-payment.
- Do not use generic crypto-neon or exchange-dashboard visual patterns.

## Ownership and updates

Update this document when the visual system, component rules, responsive patterns, or interface copy conventions change. Update [`design.md`](design.md) when screen responsibilities, journeys, states, or verification-language boundaries change.
