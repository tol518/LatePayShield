import { useState } from 'react';
import { standardAddressHash } from '@latepay/canonical';
import StatusChip from './StatusChip.jsx';
import { CheckCircle, Warning, Progress, InfoCircle } from './Icons.jsx';
import PaymentJourney from './PaymentJourney.jsx';
import { COSTON2, CONTRACT_ADDRESS, addressUrl, xrplTxUrl } from '../lib/network.js';
import { formatDrops, formatDate, shortenId } from '../lib/format.js';
import { getPaymentDestination, getPaymentTransactionHash, savePaymentDestination } from '../lib/paymentInstructions.js';
import { readPayerLink } from '../lib/payerLink.js';

/* The only section on this page reading live chain state. Everything above it
   is explanatory copy; everything here came from Coston2 at page load. */
export default function LiveRegistry({ state }) {
  const { phase, registry, agreements, error } = state;

  return (
    <section className="section" id="registry">
      <div className="shell">
        <div className="section__head">
          <p className="eyebrow">Live Coston2 records</p>
          <h2>Recent agreements</h2>
          <p>
            Current agreement status read from the deployed LatePay Shield contract when this page loaded.
          </p>
        </div>

        <div className="registry__body">
          {phase === 'loading' && <LoadingState />}
          {phase === 'failed' && <FailureState error={error} />}
          {phase === 'ready' && agreements.length === 0 && <EmptyState />}
          {phase === 'ready' && agreements.length > 0 && <AgreementTable agreements={agreements} />}
        </div>

        <details className="registry-tech">
          <summary>View contract and verifier details</summary>
          <div className="registry">
            <div className="card">
              <p className="card__title">Deployment</p>
              <dl className="kv">
                <dt>Network</dt>
                <dd>{COSTON2.name} · chain {COSTON2.chainId}</dd>
                <dt>Contract</dt>
                <dd className="mono">
                  <a href={addressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
                    {shortenId(CONTRACT_ADDRESS)}
                  </a>
                </dd>
                <dt>Latest block</dt>
                <dd className="mono">
                  {phase === 'ready' ? registry.blockNumber.toLocaleString('en-GB') : '—'}
                </dd>
                <dt>Agreements</dt>
                <dd className="mono">{phase === 'ready' ? registry.agreementCount : '—'}</dd>
              </dl>
            </div>

            <VerifierCard phase={phase} registry={registry} />
          </div>
        </details>
      </div>
    </section>
  );
}

/* A non-zero verifier override would mean outcomes came from a verifier the
   deployer chose. The constructor forbids it off the local chain, so reading
   zero is a positive confirmation, not just an absence. */
function VerifierCard({ phase, registry }) {
  return (
    <div className="card">
      <p className="card__title">Proof verifier</p>

      {phase === 'ready' && registry.verifierIsEnshrined && (
        <>
          <span className="chip chip--positive"><CheckCircle />Enshrined FDC verifier</span>
          <p className="registry__note">
            No verifier override is set, so payment outcomes can only come from Flare's enshrined
            Data Connector verification.
          </p>
        </>
      )}

      {phase === 'ready' && !registry.verifierIsEnshrined && (
        <>
          <span className="chip chip--danger"><Warning />Verifier override set</span>
          <p className="registry__note">
            This deployment points at{' '}
            <span className="mono">{shortenId(registry.verifierOverride)}</span> instead of the
            enshrined verifier. Outcomes from it must not be treated as verified.
          </p>
        </>
      )}

      {phase !== 'ready' && (
        <>
          <span className="chip chip--neutral"><Progress />Not read yet</span>
          <p className="registry__note">The verifier setting has not been read from the contract.</p>
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="state-panel">
      <span className="chip chip--testnet"><Progress className="is-spinning" />Reading the contract</span>
      <p>Fetching registry state from the {COSTON2.label} public RPC.</p>
    </div>
  );
}

/* A failed read is an operational condition, never an outcome. It must not be
   allowed to look like "no agreements" or like a non-payment result. */
function FailureState({ error }) {
  return (
    <div className="state-panel state-panel--danger">
      <span className="chip chip--danger"><Warning />Could not read the contract</span>
      <p>
        The {COSTON2.label} RPC did not answer, so the current registry state is unknown. This is a
        connection problem, not a statement about any agreement.
      </p>
      <p className="state-panel__detail mono">{error}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="state-panel">
      <span className="chip chip--neutral"><InfoCircle />No agreements registered</span>
      <p>
        The contract is deployed and reachable, and its registry is genuinely empty —{' '}
        <span className="mono">nextAgreementId</span> is 1. The first agreement recorded will
        appear here.
      </p>
    </div>
  );
}

function AgreementTable({ agreements }) {
  /* A payer following a supplier's link should land on that agreement's payment
   * panel already open, rather than having to find the row themselves. */
  const [payingAgreementId, setPayingAgreementId] = useState(
    () => readPayerLink(window.location.href)?.agreementId ?? null,
  );

  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="table__caption">Recent agreements</caption>
        <thead>
          <tr>
            <th scope="col">Agreement</th>
            <th scope="col">Status</th>
            <th scope="col">Minimum</th>
            <th scope="col">Tag</th>
            <th scope="col">Deadline</th>
            <th scope="col">Payment / evidence</th>
          </tr>
        </thead>
        <tbody>
          {agreements.map((agreement) => (
            <AgreementRow
              key={agreement.id}
              agreement={agreement}
              expanded={payingAgreementId === agreement.id}
              onTogglePay={() => setPayingAgreementId((current) => current === agreement.id ? null : agreement.id)}
            />
          ))}
        </tbody>
      </table>
      <p className="registry__note">
        The XRPL destination address is not shown because the contract stores only its hash. “Pay now”
        uses the destination saved in this browser; older agreements can safely add it once by matching
        its hash against the contract.
      </p>
    </div>
  );
}

function AgreementRow({ agreement, expanded, onTogglePay }) {
  return (
    <>
      <tr>
        <th scope="row">{agreement.reference}</th>
        <td><StatusChip status={agreement.uiStatus} /></td>
        <td className="mono">{formatDrops(agreement.expectedDrops)}</td>
        <td className="mono">{agreement.destinationTag}</td>
        <td>{formatDate(agreement.dueAt)}</td>
        <td><AgreementEvidence agreement={agreement} expanded={expanded} onTogglePay={onTogglePay} /></td>
      </tr>
      {expanded && (
        <tr className="table__detail-row">
          <td colSpan="6"><PaymentAction agreement={agreement} /></td>
        </tr>
      )}
    </>
  );
}

function AgreementEvidence({ agreement, expanded, onTogglePay }) {
  if (agreement.uiStatus === 'AWAITING_PAYMENT') {
    return (
      <button className="btn btn--quiet table__pay-button" type="button" onClick={onTogglePay} aria-expanded={expanded}>
        {expanded ? 'Close payment' : 'Pay now'}
      </button>
    );
  }

  if (agreement.uiStatus !== 'PAID_VERIFIED') return <span className="muted">—</span>;

  const xrplHash = agreement.xrplTxHash.replace(/^0x/, '');
  return (
    <span className="evidence-links">
      <a className="mono" href={xrplTxUrl(xrplHash)} target="_blank" rel="noreferrer" title={agreement.xrplTxHash}>
        XRPL {shortenId(xrplHash, 6, 4)}
      </a>
      <span className="mono" title={agreement.evidenceId}>Evidence {shortenId(agreement.evidenceId, 6, 4)}</span>
    </span>
  );
}

function PaymentAction({ agreement }) {
  const [destination, setDestination] = useState(() => getPaymentDestination(agreement.id));
  const transactionHash = getPaymentTransactionHash(agreement.id);
  /* A payer link carries the receiving address, but it is only a claim until it
   * matches the agreement's on-chain hash. Prefilling the existing field — and
   * leaving its verify step in place — means a tampered link is rejected by the
   * same check that catches a typo, and the payer still sees what they accept. */
  const [candidate, setCandidate] = useState(() => {
    const link = readPayerLink(window.location.href);
    return link?.agreementId === agreement.id ? link.destination : '';
  });
  const [error, setError] = useState('');

  function addDestination(event) {
    event.preventDefault();
    const value = candidate.trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value)) {
      setError('Enter the original classic XRPL Testnet r-address.');
      return;
    }
    if (standardAddressHash(value).toLowerCase() !== agreement.xrplDestinationHash.toLowerCase()) {
      setError('That r-address does not match the destination hash stored for this agreement.');
      return;
    }
    savePaymentDestination(agreement.id, value);
    setDestination(value);
    setError('');
  }

  if (destination) {
    return (
      <div className="registry-payment">
        <p className="registry-payment__intro">
          Payment controls for {agreement.reference}. The destination was saved only in this browser.
        </p>
        <PaymentJourney
          agreementId={agreement.id}
          initialTransactionHash={transactionHash}
          criteria={{
            destination,
            destinationTag: agreement.destinationTag,
            expectedDrops: agreement.expectedDrops,
            startLedger: agreement.startLedger,
            dueAt: agreement.dueAt,
          }}
        />
      </div>
    );
  }

  return (
    <div className="registry-payment">
      <p className="registry-payment__intro">
        This agreement is awaiting payment. The contract has the destination hash, not the plain
        XRPL address, so add the original address once to unlock payment in this browser.
      </p>
      <form className="registry-payment__form" onSubmit={addDestination}>
        <label htmlFor={`saved-destination-${agreement.id}`}>Original XRPL Testnet destination</label>
        <input
          className="transaction-input mono"
          id={`saved-destination-${agreement.id}`}
          value={candidate}
          onChange={(event) => { setCandidate(event.target.value); setError(''); }}
          placeholder="r…"
          autoComplete="off"
          spellCheck="false"
          required
        />
        <button className="btn btn--primary" type="submit">Verify address and pay now</button>
      </form>
      {error && <p className="registry-payment__error" role="alert">{error}</p>}
    </div>
  );
}
