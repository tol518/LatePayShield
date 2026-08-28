export default function PrototypeNotice() {
  return (
    <section className="section">
      <div className="shell">
        <div className="notice">
          <h2>This is a testnet prototype</h2>
          <p>
            LatePay Shield runs against the XRPL Testnet and the Flare Coston2 test network.
            Payments use test assets with no monetary value, and the software is not a production
            payment or collections service.
          </p>
          <p>
            Recorded testnet evidence and locally mocked outcomes are labelled distinctly wherever
            they appear, and never presented as live verification.
          </p>
        </div>
      </div>
    </section>
  );
}
