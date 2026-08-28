import { useEffect, useState } from 'react';
import { parseUnits } from 'ethers';
import { canonicalizeTerms, invoiceHash, standardAddressHash } from '@latepay/canonical';
import { CheckCircle, Document, InfoCircle, Progress, Warning } from './Icons.jsx';
import { COSTON2, txUrl } from '../lib/network.js';
import { formatDrops, shortenId } from '../lib/format.js';
import { walletErrorMessage } from '../lib/walletErrors.js';
import PaymentJourney from './PaymentJourney.jsx';
import { savePaymentDestination } from '../lib/paymentInstructions.js';

function localDateTime(daysFromNow = 7) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function initialForm() {
  return {
    invoiceNumber: '',
    supplierName: '',
    payerName: '',
    amountXrp: '',
    xrplDestination: '',
    destinationTag: '',
    startLedger: '',
    dueAtLocal: localDateTime(),
  };
}

function buildReview(form) {
  const expectedDrops = parseUnits(form.amountXrp, 6);
  const dueAt = Math.floor(new Date(form.dueAtLocal).getTime() / 1000);
  const startLedger = BigInt(form.startLedger);
  if (!Number.isSafeInteger(dueAt) || dueAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('The payment deadline must be a valid future date and time.');
  }
  if (startLedger <= 0n || startLedger > (1n << 64n) - 1n) {
    throw new Error('The XRPL evidence-window start ledger must fit within an unsigned 64-bit integer.');
  }

  const canonical = canonicalizeTerms({
    invoiceNumber: form.invoiceNumber,
    supplierName: form.supplierName,
    payerName: form.payerName,
    currency: 'XRP_TESTNET',
    amountDrops: expectedDrops,
    xrplDestination: form.xrplDestination,
    destinationTag: form.destinationTag,
    dueAt,
  });

  return {
    canonical,
    invoiceHash: invoiceHash(canonical),
    xrplDestinationHash: standardAddressHash(canonical.xrplDestination),
    expectedDrops: canonical.amountDrops,
    destinationTag: canonical.destinationTag,
    startLedger: startLedger.toString(),
    dueAt: canonical.dueAt,
  };
}

export default function AgreementCreator({ onCreated, suggestions }) {
  const [form, setForm] = useState(initialForm);
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [phase, setPhase] = useState('editing');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  /* Suggested values arrive from the optional local assistant and land in the
   * same editable fields a user types into. They are merged, never applied as a
   * whole form, so a manually typed value is not overwritten by a blank
   * suggestion — and any pending review is discarded, because the terms the
   * user was about to confirm have changed. */
  useEffect(() => {
    if (!suggestions?.values || phase === 'created') return;
    setForm((current) => ({ ...current, ...suggestions.values }));
    setReview(null);
    setConfirmed(false);
    setError('');
    setPhase('editing');
  }, [suggestions]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setReview(null);
    setConfirmed(false);
    setResult(null);
    setError('');
    setPhase('editing');
  }

  function reviewTerms(event) {
    event.preventDefault();
    setError('');

    try {
      const nextReview = buildReview(form);
      setReview(nextReview);
      setPhase('review');
    } catch (reviewError) {
      setError(reviewError?.message ?? 'Review the agreement fields and try again.');
    }
  }

  async function connectWallet() {
    setPhase('connecting');
    setError('');
    try {
      const { connectCoston2Wallet } = await import('../lib/wallet.js');
      const connected = await connectCoston2Wallet();
      setWallet(connected);
      setPhase('review');
    } catch (walletError) {
      setError(walletErrorMessage(walletError));
      setPhase('review');
    }
  }

  async function createAgreement() {
    if (!review || !confirmed || !wallet) return;

    setPhase('submitting');
    setError('');
    try {
      const { registerAgreement } = await import('../lib/wallet.js');
      const created = await registerAgreement(wallet, review);
      savePaymentDestination(created.agreementId, review.canonical.xrplDestination);
      setResult(created);
      setPhase('created');
      onCreated?.(created);
    } catch (walletError) {
      setError(walletErrorMessage(walletError));
      setPhase('review');
    }
  }

  const busy = phase === 'connecting' || phase === 'submitting';

  return (
    <section className="section" id="prepare">
      <div className="shell">
        <div className="section__head">
          <p className="eyebrow">Create on Coston2</p>
          <h2>Prepare and register an agreement</h2>
          <p>
            Enter the payment criteria, review the exact commitment, then sign the registration
            with your browser wallet. This records terms only; it does not verify a payment.
          </p>
        </div>

        <div className="creator-layout">
          <form className="card agreement-form" onSubmit={reviewTerms}>
            <fieldset disabled={busy || phase === 'created'}>
              <legend>Confirmed invoice terms</legend>
              <div className="form-grid">
                <Field label="Invoice number" name="invoiceNumber" value={form.invoiceNumber} onChange={updateField} autoComplete="off" />
                <Field label="Supplier name" name="supplierName" value={form.supplierName} onChange={updateField} autoComplete="organization" />
                <Field label="Payer name" name="payerName" value={form.payerName} onChange={updateField} autoComplete="off" />
                <Field
                  label="Minimum amount (XRP)"
                  name="amountXrp"
                  value={form.amountXrp}
                  onChange={updateField}
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]{1,6})?"
                  help="Up to six decimal places; the contract stores XRP drops."
                />
              </div>
            </fieldset>

            <fieldset disabled={busy || phase === 'created'}>
              <legend>Payment criteria</legend>
              <div className="form-grid">
                <Field
                  className="field--wide"
                  label="XRPL Testnet destination"
                  name="xrplDestination"
                  value={form.xrplDestination}
                  onChange={updateField}
                  pattern="r[1-9A-HJ-NP-Za-km-z]{24,34}"
                  help="Use a classic XRPL Testnet r-address. Only its hash is stored on Coston2."
                />
                <Field
                  label="Destination tag"
                  name="destinationTag"
                  value={form.destinationTag}
                  onChange={updateField}
                  inputMode="numeric"
                  pattern="[0-9]+"
                  help="Identifies this agreement’s payment."
                />
                <Field
                  label="Evidence-window start ledger"
                  name="startLedger"
                  value={form.startLedger}
                  onChange={updateField}
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  help="Current validated XRPL Testnet ledger at registration. You are confirming this value."
                />
                <Field
                  className="field--wide"
                  label="Payment deadline"
                  name="dueAtLocal"
                  type="datetime-local"
                  value={form.dueAtLocal}
                  onChange={updateField}
                />
              </div>
            </fieldset>

            {suggestions?.count && phase !== 'created' ? (
              <p className="assistant-note">
                <InfoCircle /> {suggestions.count} field{suggestions.count === 1 ? '' : 's'} above were
                proposed by the local assistant and are unconfirmed. Edit anything that is wrong.
              </p>
            ) : null}

            <div className="form-actions">
              <button className="btn btn--primary" type="submit" disabled={busy || phase === 'created'}>
                <Document /> Review agreement
              </button>
            </div>
          </form>

          <aside className="card commitment" aria-live="polite">
            {!review && !result && <DraftState />}
            {review && !result && (
              <ReviewState
                review={review}
                wallet={wallet}
                confirmed={confirmed}
                setConfirmed={setConfirmed}
                busy={busy}
                phase={phase}
                onConnect={connectWallet}
                onCreate={createAgreement}
              />
            )}
            {result && <CreatedState result={result} review={review} wallet={wallet} />}

            {error && (
              <div className="form-error" role="alert">
                <Warning />
                <p>{error}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Field({ label, help, className = '', ...props }) {
  const id = `agreement-${props.name}`;
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={helpId} required {...props} />
      {help ? <p className="field__help" id={helpId}>{help}</p> : null}
    </div>
  );
}

function DraftState() {
  return (
    <div className="commitment__empty">
      <span className="chip chip--neutral"><Document />Draft</span>
      <h3>Nothing will be signed yet</h3>
      <p>Complete the editable fields and choose Review agreement to see the canonical commitment.</p>
    </div>
  );
}

function ReviewState({ review, wallet, confirmed, setConfirmed, busy, phase, onConnect, onCreate }) {
  return (
    <div>
      <span className="chip chip--testnet"><InfoCircle />Ready for human confirmation</span>
      <h3>Exact terms to register</h3>
      <dl className="kv commitment__terms">
        <dt>Invoice</dt><dd>{review.canonical.invoiceNumber}</dd>
        <dt>Minimum</dt><dd>{formatDrops(review.expectedDrops)}</dd>
        <dt>Destination</dt><dd className="mono">{shortenId(review.canonical.xrplDestination, 8, 6)}</dd>
        <dt>Destination tag</dt><dd className="mono">{review.destinationTag}</dd>
        <dt>Start ledger</dt><dd className="mono">{BigInt(review.startLedger).toLocaleString('en-GB')}</dd>
        <dt>Deadline</dt><dd>{new Date(Number(review.dueAt) * 1000).toLocaleString('en-GB')}</dd>
        <dt>Terms hash</dt><dd className="mono" title={review.invoiceHash}>{shortenId(review.invoiceHash, 10, 8)}</dd>
      </dl>

      <label className="confirm-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={busy}
        />
        <span>I reviewed these values and want my wallet to register this testnet agreement.</span>
      </label>

      {wallet ? (
        <p className="wallet-line">
          Signing wallet <span className="mono" title={wallet.address}>{shortenId(wallet.address)}</span>
          {' '}on {COSTON2.name}
        </p>
      ) : (
        <p className="wallet-line">No wallet connected. The signing address becomes the supplier on-chain.</p>
      )}

      <div className="form-actions">
        {!wallet ? (
          <button className="btn btn--primary" type="button" onClick={onConnect} disabled={!confirmed || busy}>
            {phase === 'connecting' ? <Progress /> : <CheckCircle />}
            {phase === 'connecting' ? 'Connecting wallet…' : 'Connect Coston2 wallet'}
          </button>
        ) : (
          <button className="btn btn--primary" type="button" onClick={onCreate} disabled={!confirmed || busy}>
            {phase === 'submitting' ? <Progress /> : <CheckCircle />}
            {phase === 'submitting' ? 'Waiting for confirmation…' : 'Register agreement'}
          </button>
        )}
      </div>
      <p className="commitment__note">Your wallet will show the contract transaction before anything is submitted.</p>
    </div>
  );
}

function CreatedState({ result, review, wallet }) {
  return (
    <div>
      <span className="chip chip--primary"><CheckCircle />Agreement recorded</span>
      <h3>Agreement #{String(result.agreementId).padStart(3, '0')} is awaiting payment</h3>
      <p className="commitment__message">
        Coston2 confirmed the agreement registration. This does not mean a payment has been verified.
      </p>
      <dl className="kv commitment__terms">
        <dt>Supplier wallet</dt><dd className="mono">{shortenId(wallet.address)}</dd>
        <dt>Terms hash</dt><dd className="mono" title={review.invoiceHash}>{shortenId(review.invoiceHash, 10, 8)}</dd>
        <dt>Transaction</dt>
        <dd className="mono"><a href={txUrl(result.transactionHash)} target="_blank" rel="noreferrer">{shortenId(result.transactionHash, 10, 8)}</a></dd>
      </dl>
      <PaymentJourney agreementId={result.agreementId} review={review} />
    </div>
  );
}
