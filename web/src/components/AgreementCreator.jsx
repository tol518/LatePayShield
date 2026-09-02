import { useEffect, useState } from 'react';
import { parseUnits } from 'ethers';
import { canonicalizeTerms, invoiceHash, standardAddressHash } from '@latepay/canonical';
import { CheckCircle, Document, InfoCircle, Progress, Warning } from './Icons.jsx';
import { COSTON2, txUrl } from '../lib/network.js';
import { formatDrops, shortenId } from '../lib/format.js';
import { walletErrorMessage } from '../lib/walletErrors.js';
import PaymentJourney from './PaymentJourney.jsx';
import { savePaymentDestination } from '../lib/paymentInstructions.js';
import { buildPayerLink } from '../lib/payerLink.js';
import { toRegisteredCaseDraft } from '../lib/casePack.js';
import {
  createXamanWalletConnection,
  fetchXamanWalletConnectionStatus,
  fetchXrplAgreementDefaults,
} from '../lib/xamanPayment.js';

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
  const [xrplDefaultsPhase, setXrplDefaultsPhase] = useState('loading');
  const [xrplSetupError, setXrplSetupError] = useState('');
  const [xamanConnection, setXamanConnection] = useState(null);
  const [xamanConnectionPhase, setXamanConnectionPhase] = useState('idle');

  useEffect(() => {
    let cancelled = false;

    fetchXrplAgreementDefaults()
      .then((defaults) => {
        if (cancelled) return;
        setForm((current) => ({
          ...current,
          destinationTag: current.destinationTag || String(defaults.destinationTag),
          startLedger: current.startLedger || String(defaults.startLedger),
        }));
        setXrplDefaultsPhase('ready');
      })
      .catch((defaultsError) => {
        if (cancelled) return;
        setXrplDefaultsPhase('error');
        setXrplSetupError(defaultsError?.message ?? 'Automatic XRPL payment details could not be prepared.');
      });

    return () => { cancelled = true; };
  }, []);

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

  async function connectXamanWallet() {
    setXamanConnectionPhase('creating');
    setXrplSetupError('');
    try {
      const connection = await createXamanWalletConnection();
      setXamanConnection(connection);
      setXamanConnectionPhase('waiting');
    } catch (connectionError) {
      setXrplSetupError(connectionError?.message ?? 'The Xaman wallet request could not be created.');
      setXamanConnectionPhase('error');
    }
  }

  useEffect(() => {
    if (!xamanConnection?.id || ['signed', 'expired', 'cancelled'].includes(xamanConnectionPhase)) {
      return undefined;
    }
    let cancelled = false;

    async function refreshConnection() {
      try {
        const status = await fetchXamanWalletConnectionStatus(xamanConnection.id);
        if (cancelled) return;
        setXamanConnection(status);
        const nextPhase = status.status === 'waiting' && status.opened ? 'opened' : status.status;
        setXamanConnectionPhase(nextPhase);
        if (status.status === 'signed') {
          if (!status.account) throw new Error('Xaman approved the request but did not return an XRPL address.');
          setForm((current) => ({ ...current, xrplDestination: status.account }));
          setReview(null);
          setConfirmed(false);
          setResult(null);
          setError('');
          setPhase('editing');
        }
      } catch (connectionError) {
        if (!cancelled) {
          setXrplSetupError(connectionError?.message ?? 'The Xaman wallet status could not be read.');
          setXamanConnectionPhase('error');
        }
      }
    }

    void refreshConnection();
    const timer = window.setInterval(refreshConnection, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [xamanConnection?.id, xamanConnectionPhase]);

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
      onCreated?.({
        ...created,
        caseDraft: toRegisteredCaseDraft({
          agreementId: created.agreementId,
          review,
          caseDraft: suggestions?.caseDraft,
          agreementDeadlineDate: form.dueAtLocal.slice(0, 10),
        }),
      });
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
              <XrplWalletSetup
                connection={xamanConnection}
                connectionPhase={xamanConnectionPhase}
                defaultsPhase={xrplDefaultsPhase}
                error={xrplSetupError}
                onConnect={connectXamanWallet}
              />
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

function XrplWalletSetup({ connection, connectionPhase, defaultsPhase, error, onConnect }) {
  const awaitingApproval = connection && !['signed', 'expired', 'cancelled', 'error'].includes(connectionPhase);

  return (
    <div className="xaman-panel xrpl-wallet-setup" aria-live="polite">
      <div className="xaman-panel__head">
        <div>
          <strong>Supplier payment wallet</strong>
          <p>Connect Xaman to fill the public receiving address. LatePay Shield never receives your secret.</p>
        </div>
        <span className="chip chip--testnet">Testnet</span>
      </div>

      {defaultsPhase === 'loading' ? (
        <p className="xaman-status"><Progress className="is-spinning" />Preparing ledger and payment tag…</p>
      ) : null}
      {defaultsPhase === 'ready' ? (
        <p className="xaman-status xaman-status--signed"><CheckCircle />Ledger and destination tag generated automatically.</p>
      ) : null}

      {!connection && (
        <button className="btn btn--primary xaman-pay-button" type="button" onClick={onConnect} disabled={connectionPhase === 'creating'}>
          {connectionPhase === 'creating' ? <Progress className="is-spinning" /> : <CheckCircle />}
          {connectionPhase === 'creating' ? 'Preparing Xaman…' : 'Connect supplier Xaman wallet'}
        </button>
      )}

      {awaitingApproval ? (
        <div className="xaman-request">
          <img src={connection.qrPng} alt="QR code for this Xaman wallet connection" />
          <div>
            <p className="xaman-status">
              <Progress className="is-spinning" />
              {connectionPhase === 'opened' ? 'Connection opened in Xaman…' : 'Waiting for wallet approval…'}
            </p>
            <a className="btn btn--quiet" href={connection.deepLink} target="_blank" rel="noreferrer">Open Xaman</a>
            <p className="xaman-expiry">Request expires {new Date(connection.expiresAt).toLocaleTimeString('en-GB')}.</p>
          </div>
        </div>
      ) : null}

      {connectionPhase === 'signed' ? (
        <p className="xaman-status xaman-status--signed">
          <CheckCircle />Receiving address connected: <span className="mono">{shortenId(connection.account, 8, 6)}</span>
        </p>
      ) : null}

      {['expired', 'cancelled', 'error'].includes(connectionPhase) ? (
        <button className="btn btn--quiet xaman-pay-button" type="button" onClick={onConnect}>Create a new Xaman request</button>
      ) : null}
      {error ? <div className="form-error" role="alert"><Warning /><p>{error}</p></div> : null}
    </div>
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
            {phase === 'connecting' ? <Progress className="is-spinning" /> : <CheckCircle />}
            {phase === 'connecting' ? 'Connecting wallet…' : 'Connect Coston2 wallet'}
          </button>
        ) : (
          <button className="btn btn--primary" type="button" onClick={onCreate} disabled={!confirmed || busy}>
            {phase === 'submitting' ? <Progress className="is-spinning" /> : <CheckCircle />}
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
      <PayerHandoff
        agreementId={result.agreementId}
        destination={review.canonical.xrplDestination}
        review={review}
      />
      <a className="btn btn--quiet" href="#cases"><Document />Review linked case file</a>
    </div>
  );
}

/* The point where the supplier stops and the payer starts.
 *
 * Paying is the *other* party's act, so the default ending for this screen is a
 * link to send, not a QR to scan. Offering the QR inline invited the supplier
 * to pay their own invoice with the Xaman account they had just connected as
 * the receiving address, which XRPL rejects as temREDUNDANT — see
 * docs/xaman-payment-task-handoff.md. Paying from here is still reachable,
 * because a one-operator demo needs it, but it is now a labelled detour rather
 * than the path of least resistance. */
function PayerHandoff({ agreementId, destination, review }) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(buildPayerLink(agreementId, destination, window.location.href));
  }, [agreementId, destination]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the link stays selectable either way.
      setCopied(false);
    }
  }

  return (
    <div className="payer-handoff">
      <div className="payment-step">
        <div className="payment-step__head"><span>1</span><h4>Send this to your payer</h4></div>
        <p className="payment-step__copy">
          Your payer opens this link, confirms the terms, and pays from their own wallet. The link
          carries the receiving address because the contract stores only its hash — it is checked
          against that hash before it can be used, so a tampered link cannot redirect a payment.
        </p>
        <div className="payer-handoff__link">
          <input
            className="transaction-input mono"
            aria-label="Payment link for your payer"
            value={link}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <button className="btn btn--primary" type="button" onClick={copyLink} disabled={!link}>
            <CheckCircle />{copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>

      <details className="payer-handoff__demo">
        <summary>Pay it yourself, as a test payer</summary>
        <p className="assistant-note assistant-note--attention">
          <Warning />
          Demo shortcut. You are acting as the payer now, not the supplier. In Xaman, sign with a
          different funded Testnet account from the receiving address{' '}
          <span className="mono">{shortenId(destination)}</span> — XRPL rejects a payment from an
          account to itself.
        </p>
        <PaymentJourney agreementId={agreementId} review={review} />
      </details>
    </div>
  );
}
