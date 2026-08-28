import StatusChip from './StatusChip.jsx';

/* Illustration of the dashboard hierarchy for the opening page.
   Identifiers are placeholders — see EXAMPLE_AGREEMENT in ../lib/exampleAgreement.js. */
export default function AgreementPreviewCard({ agreement }) {
  return (
    <aside className="card" aria-label="Example agreement">
      <p className="card__title">Example agreement</p>

      <div className="preview__head">
        <span className="preview__id">{agreement.reference}</span>
        <span className="preview__due">Due {agreement.dueDate}</span>
      </div>

      <div className="preview__status">
        <StatusChip status={agreement.status} />
        <p className="preview__amount">{agreement.minimumAmount} minimum qualifying payment</p>
        <p className="preview__party">{agreement.counterparty}</p>
      </div>

      <hr className="divider" />

      <dl className="kv">
        <dt>Destination</dt>
        <dd className="mono">{agreement.destination}</dd>
        <dt>Destination tag</dt>
        <dd className="mono">{agreement.destinationTag}</dd>
        <dt>Evidence window</dt>
        <dd>{agreement.evidenceWindow}</dd>
      </dl>

      <hr className="divider" />

      <dl className="kv">
        <dt>Agreement ID</dt>
        <dd className="mono">{agreement.agreementId}</dd>
        <dt>Terms hash</dt>
        <dd className="mono">{agreement.termsHash}</dd>
      </dl>

      <p className="preview__foot">
        Illustration of the dashboard layout. These identifiers are placeholders, not recorded
        testnet evidence.
      </p>
    </aside>
  );
}
