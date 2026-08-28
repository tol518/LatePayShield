import AgreementPreviewCard from './AgreementPreviewCard.jsx';
import { EXAMPLE_AGREEMENT } from '../lib/exampleAgreement.js';

export default function Hero() {
  return (
    <section className="hero">
      <div className="shell hero__grid">
        <div className="hero__copy">
          <p className="eyebrow">Payment agreements with an evidence layer</p>
          <h1>Record what payment is required, then keep evidence of what happened.</h1>
          <p className="hero__lede">
            LatePay Shield records the payment criteria for an invoice, gives your customer exact
            payment instructions, and keeps independently checkable evidence of the outcome —
            whether a qualifying payment arrived or none was found in the window you defined.
          </p>

          {/* One filled primary action per view. */}
          <div className="hero__actions">
            <a className="btn btn--primary" href="#prepare">Prepare an agreement</a>
            <a className="btn btn--quiet" href="#registry">View live contract state</a>
          </div>
          <p className="hero__note">
            No account needed to look around. Nothing is registered until you confirm the terms.
          </p>
        </div>

        <AgreementPreviewCard agreement={EXAMPLE_AGREEMENT} />
      </div>
    </section>
  );
}
