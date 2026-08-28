import { Check, InfoCircle } from './Icons.jsx';

/* The two halves are always shown together. A result that states only what it
   supports overstates the evidence — see docs/ui-language.md, "Evidence view". */

const SUPPORTS = [
  'A payment reaching the agreed XRPL Testnet destination, at or above the minimum amount, carrying the agreed destination tag, inside the defined window.',
  'That no qualifying payment was found in that same defined window, when the corresponding non-payment proof is accepted.',
  'That the agreement terms were fixed before the outcome, recorded as a terms hash you can re-derive.',
];

const EXCLUDES = [
  'That a customer did not pay. A non-payment result speaks only about the destination, tag, amount, and window that were checked.',
  'The memo or reference on a payment. It is captured as supporting evidence but is not checked by the contract.',
  'Any legal obligation, debt enforceability, or collection outcome. This is a record, not a remedy.',
  'That payment happened off the XRPL Testnet — by bank transfer, card, or any other route.',
];

export default function EvidenceBoundaries() {
  return (
    <section className="section" id="evidence">
      <div className="shell">
        <div className="section__head">
          <h2>What the evidence covers</h2>
          <p>
            The value of a record is knowing its edges. Every result in LatePay Shield is presented
            with both halves of this, not just the reassuring one.
          </p>
        </div>

        <div className="boundaries">
          <div className="card card--supports">
            <h3>What this evidence supports</h3>
            <ul className="claim-list claim-list--supports">
              {SUPPORTS.map((claim) => (
                <li key={claim}><Check />{claim}</li>
              ))}
            </ul>
          </div>

          <div className="card card--excludes">
            <h3>What this evidence does not establish</h3>
            <ul className="claim-list claim-list--excludes">
              {EXCLUDES.map((claim) => (
                <li key={claim}><InfoCircle />{claim}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
