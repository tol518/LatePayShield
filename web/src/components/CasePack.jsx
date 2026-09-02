import { useEffect, useMemo, useState } from 'react';
import { addCaseCommunication, createCase, fetchCase, fetchCases } from '../lib/casePack.js';
import { formatDate, formatDrops, shortenId } from '../lib/format.js';
import { xrplTxUrl } from '../lib/network.js';
import { CheckCircle, Clock, Document, InfoCircle, Progress, Warning } from './Icons.jsx';
import StatusChip from './StatusChip.jsx';

function todayLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function emptyCaseForm() {
  return {
    agreementId: '',
    invoiceNumber: '',
    supplierName: '',
    payerName: '',
    invoiceCurrency: '',
    invoiceAmountMinorUnits: '',
    invoiceDueDate: '',
    paymentTermsText: '',
    invoiceSourceName: '',
    invoiceSourceSha256: '',
    sourceQuotes: {},
    factsConfirmed: false,
  };
}

function emptyCommunication() {
  return {
    occurredAt: todayLocalDateTime(),
    channel: 'email',
    direction: 'outbound',
    subject: '',
    summary: '',
  };
}

export default function CasePack({ registryState, registeredDraft }) {
  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [communication, setCommunication] = useState(emptyCommunication);
  const [communicationError, setCommunicationError] = useState('');

  const agreements = registryState.agreements ?? [];
  const agreementById = useMemo(
    () => new Map(agreements.map((agreement) => [agreement.id, agreement])),
    [agreements],
  );

  useEffect(() => {
    let active = true;
    fetchCases()
      .then(async (nextCases) => {
        if (!active) return;
        setCases(nextCases);
        if (nextCases.length > 0) {
          const detail = await fetchCase(nextCases[0].id);
          if (active) setSelectedCase(detail);
        }
        if (active) setPhase('ready');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message ?? 'Saved case files could not be loaded.');
        setPhase('failed');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const draft = registeredDraft;
    if (!draft) return;
    setCaseForm({
      ...emptyCaseForm(),
      ...draft,
      sourceQuotes: draft.sourceQuotes ?? {},
      factsConfirmed: false,
    });
    setError('');
  }, [registeredDraft]);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    const linkedAgreement = name === 'agreementId' ? agreementById.get(Number(value)) : null;
    setCaseForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
      ...(linkedAgreement && !current.invoiceDueDate
        ? { invoiceDueDate: new Date(linkedAgreement.dueAt * 1000).toISOString().slice(0, 10) }
        : {}),
    }));
    setError('');
  }

  async function saveCase(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await createCase(caseForm);
      setCases((current) => [created, ...current]);
      setSelectedCase(created);
      setCaseForm(emptyCaseForm());
      setPhase('ready');
    } catch (saveError) {
      setError(saveError?.message ?? 'The case file could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function selectCase(id) {
    setError('');
    try {
      setSelectedCase(await fetchCase(id));
    } catch (loadError) {
      setError(loadError?.message ?? 'The case file could not be opened.');
    }
  }

  function updateCommunication(event) {
    const { name, value } = event.target;
    setCommunication((current) => ({ ...current, [name]: value }));
    setCommunicationError('');
  }

  async function saveCommunication(event) {
    event.preventDefault();
    if (!selectedCase) return;
    setSaving(true);
    setCommunicationError('');
    try {
      const updated = await addCaseCommunication(selectedCase.id, {
        ...communication,
        occurredAt: new Date(communication.occurredAt).toISOString(),
      });
      setSelectedCase(updated);
      setCases((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCommunication(emptyCommunication());
    } catch (saveError) {
      setCommunicationError(saveError?.message ?? 'The communication note could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section case-pack" id="cases">
      <div className="shell">
        <div className="section__head">
          <h2>Case files</h2>
          <p>Connect confirmed invoice facts and communication notes to live Coston2 agreement evidence.</p>
        </div>

        <div className="case-pack__layout">
          <form className="card case-form" onSubmit={saveCase}>
            <div className="case-form__head">
              <span className="case-form__icon"><Document /></span>
              <span><strong>Create a case file</strong><small>Saved locally; raw invoice text is not retained.</small></span>
            </div>

            {registeredDraft && caseForm.agreementId === registeredDraft.agreementId ? (
              <p className="assistant-note">
                <CheckCircle />Agreement #{registeredDraft.agreementId} is linked. Review the pre-filled invoice facts before saving.
              </p>
            ) : null}

            <div className="form-grid">
              <div className="field field--wide">
                <label htmlFor="case-agreement">Coston2 agreement</label>
                <select id="case-agreement" name="agreementId" value={caseForm.agreementId} onChange={updateField} required>
                  <option value="">Choose a live agreement</option>
                  {agreements.map((agreement) => (
                    <option value={agreement.id} key={agreement.id}>
                      {agreement.reference} — {agreement.uiStatus.replaceAll('_', ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
                <p className="field__help">
                  {registryState.phase === 'ready'
                    ? 'The agreement ID links this file to fresh public-chain evidence.'
                    : 'Waiting for the public Coston2 registry.'}
                </p>
              </div>
              <div className="field">
                <label htmlFor="case-invoice-number">Invoice number</label>
                <input id="case-invoice-number" name="invoiceNumber" value={caseForm.invoiceNumber} onChange={updateField} required />
              </div>
              <div className="field">
                <label htmlFor="case-due-date">Invoice due date</label>
                <input id="case-due-date" name="invoiceDueDate" type="date" value={caseForm.invoiceDueDate} onChange={updateField} required />
              </div>
              <div className="field">
                <label htmlFor="case-supplier">Supplier</label>
                <input id="case-supplier" name="supplierName" value={caseForm.supplierName} onChange={updateField} required />
              </div>
              <div className="field">
                <label htmlFor="case-payer">Payer</label>
                <input id="case-payer" name="payerName" value={caseForm.payerName} onChange={updateField} required />
              </div>
              <div className="field">
                <label htmlFor="case-currency">Invoice currency</label>
                <input id="case-currency" name="invoiceCurrency" maxLength="3" value={caseForm.invoiceCurrency} onChange={updateField} placeholder="GBP" />
              </div>
              <div className="field">
                <label htmlFor="case-total">Invoice total in minor units</label>
                <input id="case-total" name="invoiceAmountMinorUnits" inputMode="numeric" value={caseForm.invoiceAmountMinorUnits} onChange={updateField} placeholder="125000" />
              </div>
              <div className="field field--wide">
                <label htmlFor="case-terms">Payment terms</label>
                <textarea id="case-terms" name="paymentTermsText" rows="3" value={caseForm.paymentTermsText} onChange={updateField} placeholder="Confirmed payment terms from the invoice or contract." />
              </div>
            </div>

            {caseForm.invoiceSourceName ? (
              <p className="case-source"><InfoCircle />Source: {caseForm.invoiceSourceName}{caseForm.invoiceSourceSha256 ? ` · SHA-256 ${shortenId(caseForm.invoiceSourceSha256, 8, 6)}` : ''}</p>
            ) : null}

            <label className="confirm-check">
              <input name="factsConfirmed" type="checkbox" checked={caseForm.factsConfirmed} onChange={updateField} />
              <span>I checked these facts against the invoice. The local AI only suggested them.</span>
            </label>

            {error ? <div className="form-error" role="alert"><Warning /><p>{error}</p></div> : null}
            <div className="form-actions">
              <button className="btn btn--primary" type="submit" disabled={saving || !caseForm.factsConfirmed || registryState.phase !== 'ready'}>
                {saving ? <Progress className="is-spinning" /> : <CheckCircle />}
                {saving ? 'Saving case…' : 'Save confirmed case'}
              </button>
            </div>
          </form>

          <div className="card case-files" aria-live="polite">
            <div className="case-files__head">
              <span><strong>Saved case files</strong><small>Local prototype database</small></span>
              <span className="case-files__count">{cases.length}</span>
            </div>
            {phase === 'loading' ? <p className="case-empty"><Progress className="is-spinning" />Loading saved cases…</p> : null}
            {phase === 'failed' ? <p className="case-empty"><Warning />Case storage is unavailable.</p> : null}
            {phase === 'ready' && cases.length === 0 ? (
              <p className="case-empty"><InfoCircle />No case files yet. Confirm the form to create the first one.</p>
            ) : null}
            {cases.length > 0 ? (
              <div className="case-list" role="list">
                {cases.map((caseFile) => (
                  <button
                    className={`case-list__item${selectedCase?.id === caseFile.id ? ' is-selected' : ''}`}
                    type="button"
                    key={caseFile.id}
                    onClick={() => selectCase(caseFile.id)}
                  >
                    <span><strong>{caseFile.invoiceNumber}</strong><small>{caseFile.payerName}</small></span>
                    <span>#{caseFile.agreementId}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {selectedCase ? (
          <CaseDetail
            caseFile={selectedCase}
            agreement={agreementById.get(selectedCase.agreementId)}
            communication={communication}
            communicationError={communicationError}
            onCommunicationChange={updateCommunication}
            onCommunicationSubmit={saveCommunication}
            saving={saving}
          />
        ) : null}
      </div>
    </section>
  );
}

function CaseDetail({ caseFile, agreement, communication, communicationError, onCommunicationChange, onCommunicationSubmit, saving }) {
  return (
    <div className="case-detail">
      <div className="card case-summary">
        <div className="case-detail__head">
          <span><strong>{caseFile.invoiceNumber}</strong><small>{caseFile.supplierName} → {caseFile.payerName}</small></span>
          <span className="chip chip--neutral"><CheckCircle />Facts confirmed</span>
        </div>
        <dl className="kv case-summary__facts">
          <dt>Invoice due</dt><dd>{caseFile.invoiceDueDate}</dd>
          <dt>Invoice source</dt><dd>{caseFile.invoiceSourceName ?? 'Manual entry'}</dd>
          <dt>Agreement</dt><dd>#{caseFile.agreementId}</dd>
          <dt>Case notes</dt><dd>{caseFile.communicationCount}</dd>
        </dl>
        {caseFile.paymentTermsText ? <p className="case-terms"><strong>Payment terms</strong>{caseFile.paymentTermsText}</p> : null}
      </div>

      <div className="card case-evidence">
        <p className="card__title">Live agreement evidence</p>
        {agreement ? (
          <>
            <StatusChip status={agreement.uiStatus} />
            <dl className="kv case-summary__facts">
              <dt>Minimum</dt><dd className="mono">{formatDrops(agreement.expectedDrops)}</dd>
              <dt>Contract deadline</dt><dd>{formatDate(agreement.dueAt)}</dd>
              <dt>Destination tag</dt><dd className="mono">{agreement.destinationTag}</dd>
              <dt>Evidence ID</dt><dd className="mono" title={agreement.evidenceId}>{shortenId(agreement.evidenceId)}</dd>
            </dl>
            {agreement.uiStatus === 'PAID_VERIFIED' ? (
              <a className="case-evidence__link mono" href={xrplTxUrl(agreement.xrplTxHash.replace(/^0x/, ''))} target="_blank" rel="noreferrer">
                View XRPL payment {shortenId(agreement.xrplTxHash, 8, 6)}
              </a>
            ) : null}
            <p className="case-source"><InfoCircle />Read live from Coston2. The case database does not decide payment status.</p>
          </>
        ) : (
          <p className="case-empty"><Warning />The linked agreement could not be read from Coston2.</p>
        )}
      </div>

      <div className="card case-communications">
        <div className="case-detail__head">
          <span><strong>Communication timeline</strong><small>Human-entered case notes</small></span>
          <Clock />
        </div>
        {caseFile.communications?.length > 0 ? (
          <ol className="communication-list">
            {caseFile.communications.map((item) => (
              <li key={item.id}>
                <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('en-GB')}</time>
                <strong>{item.subject || `${item.direction} ${item.channel}`}</strong>
                <p>{item.summary}</p>
              </li>
            ))}
          </ol>
        ) : <p className="case-empty"><InfoCircle />No communication notes recorded.</p>}

        <form className="communication-form" onSubmit={onCommunicationSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="communication-date">Date and time</label>
              <input id="communication-date" name="occurredAt" type="datetime-local" value={communication.occurredAt} onChange={onCommunicationChange} required />
            </div>
            <div className="field">
              <label htmlFor="communication-channel">Channel</label>
              <select id="communication-channel" name="channel" value={communication.channel} onChange={onCommunicationChange}>
                <option value="email">Email</option><option value="letter">Letter</option><option value="phone">Phone</option><option value="meeting">Meeting</option><option value="note">Internal note</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="communication-direction">Direction</label>
              <select id="communication-direction" name="direction" value={communication.direction} onChange={onCommunicationChange}>
                <option value="outbound">Sent</option><option value="inbound">Received</option><option value="internal">Internal</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="communication-subject">Subject</label>
              <input id="communication-subject" name="subject" value={communication.subject} onChange={onCommunicationChange} />
            </div>
            <div className="field field--wide">
              <label htmlFor="communication-summary">Summary</label>
              <textarea id="communication-summary" name="summary" rows="3" value={communication.summary} onChange={onCommunicationChange} required placeholder="What was sent, received, or agreed?" />
              <p className="field__help">Save a concise note. Raw messages are not stored in this first slice.</p>
            </div>
          </div>
          {communicationError ? <div className="form-error" role="alert"><Warning /><p>{communicationError}</p></div> : null}
          <button className="btn btn--quiet" type="submit" disabled={saving}><CheckCircle />Add timeline note</button>
        </form>
      </div>
    </div>
  );
}
