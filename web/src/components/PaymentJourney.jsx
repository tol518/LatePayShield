import { useEffect, useState } from 'react';
import { CheckCircle, InfoCircle, Progress, Warning } from './Icons.jsx';
import { formatDrops, formatDropsExact, shortenId } from '../lib/format.js';
import { fetchAgreement } from '../lib/registry.js';
import { addressUrl, CONTRACT_ADDRESS, xrplTxUrl } from '../lib/network.js';
import { fetchAndValidateXrplPayment } from '../lib/xrplPayment.js';
import { createXamanPayment, fetchXamanAvailability, fetchXamanPaymentStatus } from '../lib/xamanPayment.js';
import { fetchFdcPaymentVerification, startFdcPaymentVerification } from '../lib/fdcPayment.js';
import { getFdcVerificationJobId, saveFdcVerificationJobId, savePaymentTransactionHash } from '../lib/paymentInstructions.js';

const ZERO_HASH = `0x${'0'.repeat(64)}`;

function outcomeError(error) {
  return error?.shortMessage ?? error?.message ?? 'The verification status could not be read.';
}

export default function PaymentJourney({ agreementId, review, criteria: providedCriteria, initialTransactionHash = '' }) {
  const [transactionHash, setTransactionHash] = useState(initialTransactionHash);
  const [initialHashChecked, setInitialHashChecked] = useState(false);
  const [payment, setPayment] = useState(null);
  const [agreement, setAgreement] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [xamanPhase, setXamanPhase] = useState('checking');
  const [xamanRequest, setXamanRequest] = useState(null);
  const [xamanError, setXamanError] = useState('');
  const [fdcJob, setFdcJob] = useState(null);
  const [fdcJobId, setFdcJobId] = useState(() => getFdcVerificationJobId(agreementId));
  const [fdcError, setFdcError] = useState('');

  const criteria = providedCriteria ?? {
    destination: review.canonical.xrplDestination,
    destinationTag: review.destinationTag,
    expectedDrops: review.expectedDrops,
    startLedger: review.startLedger,
    dueAt: review.dueAt,
  };

  async function checkContractStatus({ quiet = false, paymentDetected = Boolean(payment) } = {}) {
    if (!quiet) {
      setPhase('checking-contract');
      setError('');
    }
    try {
      const current = await fetchAgreement(agreementId);
      setAgreement(current);
      setPhase(current.uiStatus === 'PAID_VERIFIED' ? 'paid-verified' : paymentDetected ? 'fdc-pending' : 'idle');
    } catch (statusError) {
      if (!quiet) {
        setError(outcomeError(statusError));
        setPhase(paymentDetected ? 'fdc-pending' : 'idle');
      }
    }
  }

  async function verifyPaymentHash(hash, { waitForValidation = false } = {}) {
    setPhase('checking-payment');
    setError('');
    setPayment(null);
    const attempts = waitForValidation ? 12 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const match = await fetchAndValidateXrplPayment(hash, criteria);
        savePaymentTransactionHash(agreementId, match.hash);
        setPayment(match);
        setPhase('fdc-pending');
        await checkContractStatus({ quiet: true, paymentDetected: true });
        return;
      } catch (paymentError) {
        const message = outcomeError(paymentError);
        const mayStillValidate = /not found|not validated/i.test(message);
        if (waitForValidation && mayStillValidate && attempt < attempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
          continue;
        }
        setError(message);
        setPhase('idle');
        return;
      }
    }
  }

  async function checkPayment(event) {
    event.preventDefault();
    await verifyPaymentHash(transactionHash);
  }

  async function startFdcVerification() {
    if (!payment?.hash) return;
    setFdcError('');
    try {
      const job = await startFdcPaymentVerification(agreementId, payment.hash);
      saveFdcVerificationJobId(agreementId, job.id);
      setFdcJobId(job.id);
      setFdcJob(job);
    } catch (jobError) {
      setFdcError(outcomeError(jobError));
    }
  }

  useEffect(() => {
    if (!initialTransactionHash || initialHashChecked) return;
    setInitialHashChecked(true);
    setTransactionHash(initialTransactionHash);
    verifyPaymentHash(initialTransactionHash);
  }, [initialHashChecked, initialTransactionHash]);

  useEffect(() => {
    if (!fdcJobId || ['completed', 'failed'].includes(fdcJob?.status)) return undefined;
    let cancelled = false;

    async function refreshFdcJob() {
      try {
        const job = await fetchFdcPaymentVerification(fdcJobId);
        if (!cancelled) setFdcJob(job);
      } catch (jobError) {
        if (!cancelled && !/not in this service session/i.test(outcomeError(jobError))) {
          setFdcError(outcomeError(jobError));
        }
      }
    }

    refreshFdcJob();
    const timer = window.setInterval(refreshFdcJob, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fdcJob?.status, fdcJobId]);

  async function startXamanPayment() {
    setXamanPhase('creating');
    setXamanError('');
    try {
      const created = await createXamanPayment(agreementId, criteria);
      setXamanRequest(created);
      setXamanPhase('waiting');
    } catch (requestError) {
      setXamanError(outcomeError(requestError));
      setXamanPhase('error');
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchXamanAvailability()
      .then((availability) => {
        if (!cancelled) setXamanPhase(availability.configured ? 'available' : 'unavailable');
      })
      .catch((availabilityError) => {
        if (!cancelled) {
          setXamanError(outcomeError(availabilityError));
          setXamanPhase('unavailable');
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!xamanRequest?.id || ['signed', 'expired', 'cancelled'].includes(xamanPhase)) return undefined;
    let cancelled = false;

    async function refreshXamanStatus() {
      try {
        const status = await fetchXamanPaymentStatus(xamanRequest.id);
        if (cancelled) return;
        setXamanRequest(status);
        setXamanPhase(status.status === 'waiting' && status.opened ? 'opened' : status.status);
        if (status.status === 'signed' && status.txid) {
          setTransactionHash(status.txid);
          savePaymentTransactionHash(agreementId, status.txid);
          await verifyPaymentHash(status.txid, { waitForValidation: true });
        }
      } catch (statusError) {
        if (!cancelled) {
          setXamanError(outcomeError(statusError));
          setXamanPhase('error');
        }
      }
    }

    refreshXamanStatus();
    const timer = window.setInterval(refreshXamanStatus, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [xamanRequest?.id, xamanPhase]);

  useEffect(() => {
    if (!payment || phase === 'paid-verified') return undefined;
    const timer = window.setInterval(() => checkContractStatus({ quiet: true }), 15_000);
    return () => window.clearInterval(timer);
  }, [payment, phase]);

  useEffect(() => {
    if (!fdcJob) return undefined;
    if (fdcJob.status === 'completed') {
      void checkContractStatus({ quiet: true, paymentDetected: true });
      return undefined;
    }
    if (!['queued', 'running'].includes(fdcJob.status)) return undefined;
    const timer = window.setInterval(() => checkContractStatus({ quiet: true, paymentDetected: true }), 5_000);
    return () => window.clearInterval(timer);
  }, [fdcJob]);

  const paidVerified = agreement?.uiStatus === 'PAID_VERIFIED';
  const displayedXrplHash = paidVerified && agreement.xrplTxHash !== ZERO_HASH
    ? agreement.xrplTxHash.replace(/^0x/, '')
    : payment?.hash;

  return (
    <div className="payment-journey">
      <div className="payment-step">
        <div className="payment-step__head"><span>1</span><h4>Make the XRPL Testnet payment</h4></div>
        <p className="payment-step__copy">
          Send from an XRPL Testnet wallet. Never paste an XRPL seed into this website.
        </p>
        <dl className="kv payment-instructions">
          <dt>Destination</dt><dd className="mono payment-value">{criteria.destination}</dd>
          <dt>Amount</dt><dd>{formatDrops(criteria.expectedDrops)}</dd>
          <dt>Exact amount</dt><dd className="mono">{formatDropsExact(criteria.expectedDrops)}</dd>
          <dt>Destination tag</dt><dd className="mono">{criteria.destinationTag}</dd>
          <dt>Deadline</dt><dd>{new Date(Number(criteria.dueAt) * 1000).toLocaleString('en-GB')}</dd>
        </dl>
        <div className="xaman-panel">
          <div className="xaman-panel__head">
            <div>
              <strong>Pay with Xaman</strong>
              <p>Approve the prepared Testnet payment in your non-custodial wallet.</p>
            </div>
            <span className="chip chip--testnet">Testnet</span>
          </div>

          {xamanPhase === 'checking' && <p className="xaman-status"><Progress />Checking wallet service…</p>}
          {xamanPhase === 'unavailable' && (
            <p className="xaman-status"><InfoCircle />Add server-side Xaman credentials to enable direct payment.</p>
          )}
          {['available', 'creating', 'error'].includes(xamanPhase) && !xamanRequest && (
            <button className="btn btn--primary xaman-pay-button" type="button" onClick={startXamanPayment} disabled={xamanPhase === 'creating'}>
              {xamanPhase === 'creating' ? <Progress /> : <CheckCircle />}
              {xamanPhase === 'creating' ? 'Preparing Xaman…' : 'Pay with Xaman'}
            </button>
          )}
          {xamanRequest && !['signed', 'expired', 'cancelled'].includes(xamanPhase) && (
            <div className="xaman-request">
              <img src={xamanRequest.qrPng} alt="QR code for this Xaman payment request" />
              <div>
                <p className="xaman-status">
                  <Progress />{xamanPhase === 'opened' ? 'Request opened in Xaman…' : 'Waiting for wallet approval…'}
                </p>
                <a className="btn btn--quiet" href={xamanRequest.deepLink} target="_blank" rel="noreferrer">Open Xaman</a>
                <p className="xaman-expiry">Request expires {new Date(xamanRequest.expiresAt).toLocaleTimeString('en-GB')}.</p>
              </div>
            </div>
          )}
          {xamanPhase === 'signed' && (
            <p className="xaman-status xaman-status--signed"><CheckCircle />Signed and submitted. Checking XRPL validation…</p>
          )}
          {['expired', 'cancelled'].includes(xamanPhase) && (
            <div>
              <p className="xaman-status"><Warning />The Xaman request {xamanPhase}.</p>
              <button className="btn btn--quiet" type="button" onClick={startXamanPayment}>Create a new request</button>
            </div>
          )}
          {xamanError && <div className="form-error" role="alert"><Warning /><p>{xamanError}</p></div>}
        </div>
      </div>

      <div className="payment-step">
        <div className="payment-step__head"><span>2</span><h4>Or verify an existing payment</h4></div>
        <form onSubmit={checkPayment}>
          <label className="transaction-field" htmlFor={`xrpl-hash-${agreementId}`}>
            XRPL transaction hash
          </label>
          <input
            className="transaction-input mono"
            id={`xrpl-hash-${agreementId}`}
            value={transactionHash}
            onChange={(event) => { setTransactionHash(event.target.value); setError(''); }}
            placeholder="64-character transaction hash"
            autoComplete="off"
            spellCheck="false"
            required
          />
          <div className="form-actions payment-actions">
            <button className="btn btn--primary" type="submit" disabled={phase === 'checking-payment'}>
              {phase === 'checking-payment' ? <Progress /> : <CheckCircle />}
              {phase === 'checking-payment' ? 'Checking XRPL…' : 'Check payment'}
            </button>
            {payment && !paidVerified && (
              <button className="btn btn--quiet" type="button" onClick={() => checkContractStatus()} disabled={phase === 'checking-contract'}>
                {phase === 'checking-contract' ? <Progress /> : <InfoCircle />}
                {phase === 'checking-contract' ? 'Reading Coston2…' : 'Check FDC status'}
              </button>
            )}
          </div>
        </form>
        {error && <div className="form-error" role="alert"><Warning /><p>{error}</p></div>}
      </div>

      <div className="payment-step" aria-live="polite">
        <div className="payment-step__head"><span>3</span><h4>FDC verification</h4></div>
        {!payment && !paidVerified && (
          <p className="payment-step__copy">Add the payment hash above to start checking this agreement.</p>
        )}
        {payment && !paidVerified && (
          <div className="verification-state verification-state--pending">
            <span className="chip chip--attention"><Progress />FDC verification pending</span>
            <p>
              XRPL Testnet confirms a matching payment. Start the testnet FDC workflow to request
              its proof and record the final result on Coston2.
            </p>
            <dl className="kv">
              <dt>XRPL transaction</dt><dd className="mono"><a href={xrplTxUrl(payment.hash)} target="_blank" rel="noreferrer">{shortenId(payment.hash, 10, 8)}</a></dd>
              <dt>Validated ledger</dt><dd className="mono">{payment.ledgerIndex.toLocaleString('en-GB')}</dd>
              <dt>Delivered</dt><dd>{formatDrops(payment.receivedDrops)}</dd>
            </dl>
            {!fdcJob && (
              <button className="btn btn--primary" type="button" onClick={startFdcVerification}>
                <CheckCircle />Start FDC verification
              </button>
            )}
            {fdcJob && (
              <div className={`fdc-job fdc-job--${fdcJob.status}`}>
                <p><strong>{fdcJob.status === 'completed' ? 'FDC job completed' : fdcJob.status === 'failed' ? 'FDC job failed' : 'FDC job in progress'}</strong></p>
                <p>{fdcJob.step}</p>
                {fdcJob.status === 'queued' && <p>This job will start when any earlier local FDC verification finishes.</p>}
                {fdcJob.status === 'running' && <p>FDC voting rounds can take a few minutes. Keep this page open or return later and check the agreement’s Coston2 status.</p>}
                {fdcJob.status === 'failed' && <p className="fdc-job__error">{fdcJob.error}</p>}
              </div>
            )}
            {fdcError && <div className="form-error" role="alert"><Warning /><p>{fdcError}</p></div>}
          </div>
        )}
        {paidVerified && (
          <div className="verification-state verification-state--verified">
            <span className="chip chip--positive"><CheckCircle />PaidVerified on Coston2</span>
            <p>The contract accepted an enshrined FDC proof for this agreement.</p>
            <dl className="kv">
              <dt>Agreement</dt><dd>#{String(agreement.id).padStart(3, '0')}</dd>
              <dt>XRPL transaction</dt><dd className="mono"><a href={xrplTxUrl(displayedXrplHash)} target="_blank" rel="noreferrer">{shortenId(displayedXrplHash, 10, 8)}</a></dd>
              <dt>Evidence ID</dt><dd className="mono" title={agreement.evidenceId}>{shortenId(agreement.evidenceId, 10, 8)}</dd>
              <dt>Contract</dt><dd><a href={addressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">View on Coston2</a></dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
