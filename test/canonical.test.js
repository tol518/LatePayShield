const { expect } = require("chai");
const {
  canonicalizeTerms,
  serializeTerms,
  invoiceHash,
  standardAddressHash,
  FIELD_ORDER,
} = require("../lib/canonical");

const TERMS = {
  invoiceNumber: "INV-2026-001",
  supplierName: "Maya Design Studio",
  payerName: "Acme Ltd",
  currency: "XRP_TESTNET",
  amountDrops: "2000000",
  xrplDestination: "rL87oovGUyW2npNaW8iLEeqP3NkyzaxqSb",
  destinationTag: 2026001,
  dueAt: 1788264000,
};

describe("canonical terms", function () {
  it("is deterministic across repeated calls", function () {
    expect(invoiceHash(TERMS)).to.equal(invoiceHash({ ...TERMS }));
  });

  it("ignores input key order", function () {
    const shuffled = Object.fromEntries(Object.entries(TERMS).reverse());
    expect(invoiceHash(shuffled)).to.equal(invoiceHash(TERMS));
  });

  it("treats numeric and string numbers identically", function () {
    expect(
      invoiceHash({ ...TERMS, amountDrops: 2000000, destinationTag: "2026001" })
    ).to.equal(invoiceHash(TERMS));
  });

  it("trims incidental whitespace", function () {
    expect(invoiceHash({ ...TERMS, payerName: "  Acme Ltd  " })).to.equal(
      invoiceHash(TERMS)
    );
  });

  it("changes the hash when any authoritative term changes", function () {
    const base = invoiceHash(TERMS);
    for (const [k, v] of [
      ["amountDrops", "2000001"],
      ["dueAt", 1788264001],
      ["destinationTag", 2026002],
      ["xrplDestination", "rHpttqgPHF6v5oNSTfDgNt7UQARWqW7pck"],
      ["invoiceNumber", "INV-2026-002"],
    ]) {
      expect(invoiceHash({ ...TERMS, [k]: v }), `${k} must affect the hash`).to.not.equal(base);
    }
  });

  it("serializes in the fixed field order", function () {
    const keys = Object.keys(JSON.parse(serializeTerms(canonicalizeTerms(TERMS))));
    expect(keys).to.deep.equal(FIELD_ORDER);
  });

  it("rejects a missing field rather than hashing a partial invoice", function () {
    const { amountDrops, ...partial } = TERMS;
    expect(() => invoiceHash(partial)).to.throw(/missing fields.*amountDrops/);
  });

  it("rejects empty authoritative text fields", function () {
    expect(() => invoiceHash({ ...TERMS, invoiceNumber: "  " })).to.throw(
      /empty fields.*invoiceNumber/
    );
  });

  it("rejects non-positive or unsafe amounts", function () {
    expect(() => invoiceHash({ ...TERMS, amountDrops: 0 })).to.throw(/amountDrops.*between/);
    expect(() => invoiceHash({ ...TERMS, amountDrops: -1 })).to.throw(/amountDrops.*between/);
    expect(() => invoiceHash({ ...TERMS, amountDrops: Number.MAX_SAFE_INTEGER + 1 })).to.throw(
      /amountDrops.*safe integer/
    );
  });

  it("restricts destination tags to XRPL's uint32 range", function () {
    expect(() => invoiceHash({ ...TERMS, destinationTag: -1 })).to.throw(
      /destinationTag.*between/
    );
    expect(() => invoiceHash({ ...TERMS, destinationTag: 2n ** 32n })).to.throw(
      /destinationTag.*between/
    );
  });

  it("restricts dueAt to the contract's positive uint64 range", function () {
    expect(() => invoiceHash({ ...TERMS, dueAt: 0 })).to.throw(/dueAt.*between/);
    expect(() => invoiceHash({ ...TERMS, dueAt: 2n ** 64n })).to.throw(/dueAt.*between/);
  });

  it("refuses any currency other than XRP_TESTNET", function () {
    expect(() => invoiceHash({ ...TERMS, currency: "XRP" })).to.throw(/testnet only/);
  });
});

describe("FDC standard XRPL address hash", function () {
  it("matches the real XRPPayment attestation response", function () {
    expect(standardAddressHash("rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V")).to.equal(
      "0x4abeacf6f2ad7fbb211ba1b703aecc2edd2933e84039bcade6e6488d9ddbfb8f"
    );
  });

  it("trims incidental whitespace before hashing", function () {
    expect(standardAddressHash("  rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V  ")).to.equal(
      standardAddressHash("rUCR23Ys3TWFMqdNDzFehUjyxj8ZfUYo9V")
    );
  });
});
