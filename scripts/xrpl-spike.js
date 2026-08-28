"use strict";

/**
 * P0 spike — XRPL Testnet payment.
 *
 * Funds two throwaway Testnet wallets from the faucet, sends a payment carrying an
 * invoice-specific destination tag and memo, and writes the real identifiers to
 * evidence/. Those identifiers are what the FDC XRPPayment attestation is requested
 * against, so this must succeed before the FDC spike is meaningful.
 *
 * Testnet only. Seeds printed here control no real value, but do not commit them.
 */

const fs = require("fs");
const path = require("path");
const xrpl = require("xrpl");
require("dotenv").config();

const WSS = process.env.XRPL_WSS_URL || "wss://s.altnet.rippletest.net:51233";
const INVOICE_REFERENCE = process.env.INVOICE_REFERENCE || "INV-2026-001";
const DESTINATION_TAG = Number(process.env.DESTINATION_TAG || 2026001);
const AMOUNT_DROPS = process.env.AMOUNT_DROPS || "2000000"; // 2 test XRP
const SUPPLIER_ADDRESS = process.env.XRPL_SUPPLIER_ADDRESS;

async function main() {
  if (!WSS.includes("altnet") && !WSS.includes("testnet")) {
    throw new Error(`Refusing to run against a non-testnet endpoint: ${WSS}`);
  }

  const client = new xrpl.Client(WSS);
  await client.connect();
  console.log(`Connected: ${WSS}`);

  try {
    // An agreement has to exist before the payment that satisfies it, so the
    // destination must be known in advance. A fresh supplier is only funded
    // when no existing one is named.
    let destination = SUPPLIER_ADDRESS;
    if (destination) {
      if (!xrpl.isValidAddress(destination)) {
        throw new Error(`XRPL_SUPPLIER_ADDRESS is not a valid XRPL address: ${destination}`);
      }
      console.log(`Paying existing supplier: ${destination}`);
    } else {
      console.log("Funding supplier wallet from faucet…");
      const { wallet: supplier } = await client.fundWallet();
      destination = supplier.address;
    }
    console.log("Funding payer wallet from faucet…");
    const { wallet: payer } = await client.fundWallet();

    console.log(`\nSupplier (destination): ${destination}`);
    console.log(`Payer    (source):      ${payer.address}`);

    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: payer.address,
      Destination: destination,
      Amount: AMOUNT_DROPS,
      DestinationTag: DESTINATION_TAG,
      Memos: [
        {
          Memo: {
            MemoData: Buffer.from(INVOICE_REFERENCE, "utf8")
              .toString("hex")
              .toUpperCase(),
          },
        },
      ],
    });

    const result = await client.submitAndWait(payer.sign(prepared).tx_blob);
    const meta = result.result.meta;
    const code = typeof meta === "string" ? meta : meta.TransactionResult;

    if (code !== "tesSUCCESS") {
      throw new Error(`Payment failed on ledger with result ${code}`);
    }

    const txHash = result.result.hash;
    const ledgerIndex = result.result.ledger_index;

    const evidence = {
      capturedAt: new Date().toISOString(),
      network: "xrpl-testnet",
      endpoint: WSS,
      txHash,
      ledgerIndex,
      transactionResult: code,
      sourceAddress: payer.address,
      destinationAddress: destination,
      amountDrops: AMOUNT_DROPS,
      destinationTag: DESTINATION_TAG,
      invoiceReference: INVOICE_REFERENCE,
      memoDataHex: Buffer.from(INVOICE_REFERENCE, "utf8").toString("hex").toUpperCase(),
      explorer: `https://testnet.xrpl.org/transactions/${txHash}`,
    };

    const outPath = path.join(__dirname, "..", "evidence", `xrpl-payment-${txHash}.json`);
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");

    console.log(`\n✅ tesSUCCESS`);
    console.log(`   tx hash:      ${txHash}`);
    console.log(`   ledger index: ${ledgerIndex}`);
    console.log(`   explorer:     ${evidence.explorer}`);
    console.log(`\nSaved: ${outPath}`);
    console.log(
      `\nNext: request an FDC XRPPayment attestation (type 0x08, source testXRP)\n` +
        `for transactionId ${txHash}, then confirm the returned receivingAddressHash\n` +
        `matches standardAddressHash("${destination}") from lib/canonical.js.`
    );
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exitCode = 1;
});
