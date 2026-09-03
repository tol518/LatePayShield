import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS,
  QUESTIONS,
  assess,
} from '../../shared/eligibility.js';
import {
  addCaseCommunication,
  createCase,
  fetchCase,
  fetchCases,
  saveCaseEligibility,
} from '../lib/casePack.js';
import { fetchAssistantAvailability } from '../lib/aiAssistant.js';
import { formatDate, formatDrops, shortenId } from '../lib/format.js';
import { xrplTxUrl } from '../lib/network.js';
import { CheckCircle, Clock, Document, InfoCircle, Progress, Warning } from './Icons.jsx';
import DraftApprovalPanel from './DraftApprovalPanel.jsx';
import TimelineSuggestions from './TimelineSuggestions.jsx';
import StatusExplanation from './StatusExplanation.jsx';
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

const OUTCOME_PRESENTATION = {
  supported: {
    chip: 'chip--positive',
    title: 'Inside the supported scope',
    detail: 'The answers and the case facts raise nothing that has to leave the automated path. This is a routing result, not legal advice.',
  },
  needs_information: {
    chip: 'chip--attention',
    title: 'More information needed',
    detail: 'The questionnaire cannot be completed from what the case file records. Nothing downstream may rely on it yet.',
  },
  escalate: {
    chip: 'chip--danger',
    title: 'Leaves the automated path',
    detail: 'This case stops here. LatePay Shield is scoped to source-grounded information and drafting support, not case handling, and takes no position on this case.',
  },
};

const ROUTE_COPY = {
  professional_review: 'Needs a qualified adviser.',
  operator_action: 'An operator can resolve this in the case file.',
};

// Configured per workspace at build time; a routing threshold, not a legal one.
const HIGH_VALUE_THRESHOLD = Number(
  import.meta.env.VITE_ELIGIBILITY_HIGH_VALUE_MINOR_UNITS ?? DEFAULT_HIGH_VALUE_THRESHOLD_MINOR_UNITS,
);

export default function CasePack({ registryState, registeredDraft }) {
  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [communication, setCommunication] = useState(emptyCommunication);
  const [communicationError, setCommunicationError] = useState('');
  // The suggestion panel is absent unless the operator's own model is
  // configured and reachable. A failed health read is a disabled feature, not
  // an error state (SKILLS.md §1, D-003).
  const [assistant, setAssistant] = useState({ aiEnabled: false, aiReady: false });

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
    let active = true;
    fetchAssistantAvailability()
      .then((health) => { if (active) setAssistant(health); })
      .catch(() => { if (active) setAssistant({ aiEnabled: false, aiReady: false }); });
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

  function updateSelectedCase(updated) {
    setSelectedCase(updated);
    setCases((current) => current.map((item) => item.id === updated.id ? updated : item));
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
                      {agreement.reference} · {agreement.uiStatus.replaceAll('_', ' ').toLowerCase()}
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
            onEligibilitySaved={updateSelectedCase}
            onCaseUpdate={updateSelectedCase}
            assistant={assistant}
            saving={saving}
          />
        ) : null}
      </div>
    </section>
  );
}

function CaseDetail({
  caseFile, agreement, communication, communicationError,
  onCommunicationChange, onCommunicationSubmit, onEligibilitySaved, onCaseUpdate, assistant, saving,
}) {
  const assistantReady = Boolean(assistant?.aiReady);

  /* Task 2's outcome is recomputed here from the stored answers and the live
   * agreement, never read from storage (D-011). The reminder route uses it only
   * to narrow what it will permit. */
  const eligibility = useMemo(() => assess(caseFile.eligibility?.answers ?? {}, {
    invoiceDueDate: caseFile.invoiceDueDate,
    agreementDueAt: agreement?.dueAt ?? null,
    invoiceAmountMinorUnits: caseFile.invoiceAmountMinorUnits,
    highValueThresholdMinorUnits: HIGH_VALUE_THRESHOLD,
  }), [caseFile, agreement]);

  /* Bounded, non-identifying context for S3. The service drops anything
   * identifier-shaped, and nothing here is an identifier by construction. */
  const explanationFacts = useMemo(() => {
    const facts = [];
    if (agreement?.dueAt) {
      facts.push({ name: 'agreement deadline', value: new Date(agreement.dueAt * 1000).toISOString().slice(0, 10) });
    }
    if (caseFile.invoiceDueDate) facts.push({ name: 'invoice due date', value: caseFile.invoiceDueDate });
    if (caseFile.paymentTermsText) facts.push({ name: 'agreed payment terms', value: caseFile.paymentTermsText });
    return facts;
  }, [caseFile, agreement]);

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

      <StatusExplanation
        status={agreement?.uiStatus ?? null}
        facts={explanationFacts}
        assistantReady={assistantReady}
      />

      <EligibilityQuestionnaire
        caseFile={caseFile}
        agreement={agreement}
        onSaved={onEligibilitySaved}
      />

      <DraftApprovalPanel
        caseFile={caseFile}
        onCaseUpdate={onCaseUpdate}
        assistantReady={assistantReady}
        eligibilityOutcome={eligibility.outcome}
      />

      <TimelineSuggestions
        caseFile={caseFile}
        assistantReady={assistantReady}
        maxDocumentBytes={assistant?.aiMaxDocumentBytes}
        onCaseUpdate={onCaseUpdate}
      />

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
                <div>
                  <p>{item.summary}</p>
                  {/* Provenance stays visible: a confirmed suggestion is never
                      presented as though a person wrote it. */}
                  {item.authorType === 'local_llm' ? (
                    <p className="communication-provenance">
                      <Document />
                      Confirmed from a local-assistant suggestion. Quoted from the document:
                      <q>{item.sourceQuote}</q>
                    </p>
                  ) : null}
                </div>
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

function answersEqual(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function EligibilityQuestionnaire({ caseFile, agreement, onSaved }) {
  const savedAnswers = caseFile.eligibility?.answers ?? {};
  const [answers, setAnswers] = useState(savedAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset only when the operator moves to a different case. caseFile is
  // otherwise replaced with a fresh object whenever anything on this case is
  // saved (a communication note, for instance), and that must not clobber
  // eligibility answers the operator hasn't saved yet.
  useEffect(() => {
    setAnswers(caseFile.eligibility?.answers ?? {});
    setError('');
  }, [caseFile.id]);

  const isDirty = !answersEqual(answers, savedAnswers);

  const assessment = useMemo(() => assess(answers, {
    invoiceAmountMinorUnits: caseFile.invoiceAmountMinorUnits,
    invoiceCurrency: caseFile.invoiceCurrency,
    invoiceDueDate: caseFile.invoiceDueDate,
    agreementDueAtSeconds: agreement?.dueAt,
    highValueThresholdMinorUnits: HIGH_VALUE_THRESHOLD,
  }), [answers, caseFile, agreement]);

  const presentation = OUTCOME_PRESENTATION[assessment.outcome];

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await saveCaseEligibility(caseFile.id, answers));
    } catch (saveError) {
      setError(saveError?.message ?? 'The eligibility answers could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card case-eligibility" onSubmit={save}>
      <div className="case-detail__head">
        <span>
          <strong>Eligibility and escalation</strong>
          <small>Deterministic routing. The local AI takes no part in it.</small>
        </span>
        <span className={`chip ${presentation.chip}`}>{presentation.title}</span>
      </div>

      <div className="eligibility-questions" role="group" aria-label="Eligibility questions">
        {QUESTIONS.map((question) => (
          <div className="eligibility-question" key={question.id}>
            <span id={`eligibility-${question.id}`}>{question.prompt}</span>
            <span className="eligibility-question__answers" role="radiogroup" aria-labelledby={`eligibility-${question.id}`}>
              {['yes', 'no', 'unknown'].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={question.id}
                    value={value}
                    checked={answers[question.id] === value}
                    onChange={() => {
                      setAnswers((current) => ({ ...current, [question.id]: value }));
                      setError('');
                    }}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className={`state-panel${assessment.outcome === 'escalate' ? ' state-panel--danger' : ''}`} aria-live="polite">
        <strong>{presentation.title}</strong>
        <p>{presentation.detail}</p>
        <p>{assessment.answeredCount} of {assessment.requiredCount} questions answered.</p>
        {assessment.reasons.length > 0 ? (
          <ul className="eligibility-outcome__reasons">
            {assessment.reasons.map((item) => (
              <li key={item.code}>
                <strong>{item.summary}</strong>
                <span>{ROUTE_COPY[item.route]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {isDirty ? (
        <p className="assistant-note assistant-note--attention">
          <InfoCircle />This outcome is based on answers that are not saved yet.
        </p>
      ) : null}

      {error ? <div className="form-error" role="alert"><Warning /><p>{error}</p></div> : null}

      <div className="form-actions">
        <button className="btn btn--quiet" type="submit" disabled={saving}>
          {saving ? <Progress className="is-spinning" /> : <CheckCircle />}
          {saving ? 'Saving answers…' : 'Save eligibility answers'}
        </button>
        {caseFile.eligibility ? (
          <p className="field__help">
            {isDirty
              ? `Last saved ${new Date(caseFile.eligibility.assessedAt).toLocaleString('en-GB')}, before these answers changed.`
              : `Answers saved ${new Date(caseFile.eligibility.assessedAt).toLocaleString('en-GB')}. The outcome is recalculated from the current rules and a live agreement read every time this case is opened.`}
          </p>
        ) : null}
      </div>
    </form>
  );
}
