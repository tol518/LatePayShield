import { useEffect, useState } from 'react';
import { CheckCircle, Document, InfoCircle, Person, Progress, Warning } from './Icons.jsx';
import {
  fetchAssistantAvailability,
  fieldLabel,
  formatMinorUnits,
  requestExtraction,
  toFormSuggestions,
} from '../lib/aiAssistant.js';

/* Optional first step of the prepare journey.
 *
 * docs/design.md step 2 asks for AI-extracted values presented as *editable
 * suggestions*, and D-003 makes the manual path authoritative. So this panel:
 *
 *   - is absent, not broken, when the local model is off;
 *   - shows the quote behind every suggestion, so a value can be checked
 *     against the document without re-reading it;
 *   - fills only descriptive fields, never the payment criteria;
 *   - never blocks the form. Everything below it works with this collapsed.
 */

const REFERENCE_FIELDS = ['currency', 'amountMinorUnits', 'paymentTermsText'];

export default function AiInvoiceExtraction({ onSuggest }) {
  const [availability, setAvailability] = useState(null);
  const [invoiceText, setInvoiceText] = useState('');
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchAssistantAvailability()
      .then((health) => { if (active) setAvailability(health); })
      .catch(() => { if (active) setAvailability({ aiEnabled: false, aiReady: false }); });
    return () => { active = false; };
  }, []);

  async function suggest(event) {
    event.preventDefault();
    setPhase('working');
    setError('');
    setResult(null);
    try {
      setResult(await requestExtraction(invoiceText));
      setPhase('done');
    } catch (extractionError) {
      setError(extractionError?.message ?? 'The assistant could not read this document.');
      setPhase('idle');
    }
  }

  function applySuggestions() {
    const suggestions = toFormSuggestions(result);
    onSuggest?.(suggestions);
  }

  // Nothing is rendered until availability is known, and nothing is rendered at
  // all when the assistant is switched off: an absent optional feature should
  // not advertise itself as a missing one.
  if (!availability?.aiEnabled) return null;

  const busy = phase === 'working';
  const extraction = result?.skill === 'extraction' ? result : null;
  const refusal = result?.skill === 'refusal' ? result : null;

  return (
    <section className="section" id="assistant">
      <div className="shell">
        <div className="section__head">
          <p className="eyebrow">Optional — local assistant</p>
          <h2>Read terms from an invoice</h2>
          <p>
            A language model running on the operator's own machine proposes the descriptive
            terms it can quote from a document. It never sets the payment criteria, never
            converts currency, and never confirms anything. You review every value in the
            form below.
          </p>
        </div>

        <div className="creator-layout">
          <form className="card assistant-form" onSubmit={suggest}>
            <label htmlFor="assistant-invoice">Invoice text</label>
            <textarea
              id="assistant-invoice"
              name="invoiceText"
              rows={14}
              value={invoiceText}
              onChange={(event) => setInvoiceText(event.target.value)}
              placeholder="Paste the invoice text here."
              aria-describedby="assistant-invoice-help"
              disabled={busy}
              required
            />
            <p className="field__help" id="assistant-invoice-help">
              Held for this request only. It is never written to evidence, committed, or sent on-chain.
              {availability.aiMaxInvoiceCharacters
                ? ` Up to ${availability.aiMaxInvoiceCharacters.toLocaleString('en-GB')} characters.`
                : null}
            </p>

            <div className="form-actions">
              <button className="btn btn--primary" type="submit" disabled={busy || !availability.aiReady}>
                {busy ? <Progress /> : <Document />}
                {busy ? 'Reading the document…' : 'Suggest terms'}
              </button>
            </div>

            {!availability.aiReady && availability.aiUnavailableReason ? (
              <p className="assistant-note"><InfoCircle /> {availability.aiUnavailableReason}</p>
            ) : (
              <p className="assistant-note">
                <InfoCircle /> A local model takes up to a minute to answer. If it is unavailable, fill the
                form in directly — nothing here is required.
              </p>
            )}
          </form>

          <aside className="card assistant-result" aria-live="polite">
            {!result && !error && <AssistantIdle busy={busy} />}
            {extraction && <ExtractionResult extraction={extraction} onApply={applySuggestions} />}
            {refusal && <RefusalResult refusal={refusal} />}

            {error && (
              <div className="form-error" role="alert">
                <Warning />
                <p>{error} Enter the terms manually in the form below.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function AssistantIdle({ busy }) {
  return (
    <div className="commitment__empty">
      <span className="chip chip--neutral">{busy ? <Progress /> : <Document />}{busy ? 'Reading' : 'No suggestions yet'}</span>
      <h3>{busy ? 'The local model is reading the document' : 'Suggestions appear here'}</h3>
      <p>
        {busy
          ? 'Nothing is submitted anywhere while this runs. The document stays on this machine and the operator’s model host.'
          : 'Every suggestion arrives with the exact words from the document that support it, and stays editable in the agreement form.'}
      </p>
    </div>
  );
}

function ExtractionResult({ extraction, onApply }) {
  const { count, notes } = toFormSuggestions(extraction);
  const grounded = Object.entries(extraction.fields).filter(([, field]) => field.value !== null);
  const reference = grounded.filter(([name]) => REFERENCE_FIELDS.includes(name));
  const total = formatMinorUnits(extraction.fields.amountMinorUnits?.value, extraction.fields.currency?.value);

  return (
    <div>
      <span className="chip chip--testnet"><Person />Proposed — not confirmed</span>
      <h3>{grounded.length} value{grounded.length === 1 ? '' : 's'} quoted from the document</h3>
      <p className="commitment__message">
        Model confidence: {extraction.confidence}. Confidence is the model's own estimate, not a check
        against anything. Read each quote before you accept a value.
      </p>

      <ul className="suggestion-list">
        {grounded.map(([name, field]) => (
          <li className="suggestion" key={name}>
            <div className="suggestion__head">
              <span className="suggestion__label">{fieldLabel(name)}</span>
              <span className={`suggestion__confidence suggestion__confidence--${field.confidence}`}>
                {field.confidence} confidence
              </span>
            </div>
            <p className="suggestion__value">
              {name === 'amountMinorUnits' && total ? total : field.value}
            </p>
            <p className="suggestion__quote">“{field.sourceQuote}”</p>
          </li>
        ))}
      </ul>

      {reference.length > 0 && (
        <p className="assistant-note">
          <InfoCircle /> The invoice total and payment terms are shown for reference. They are not
          applied to the form: the contract stores XRP drops and this prototype does not convert currency.
        </p>
      )}

      <div className="form-actions">
        <button className="btn btn--primary" type="button" onClick={onApply} disabled={count === 0}>
          <CheckCircle /> Fill {count} form field{count === 1 ? '' : 's'}
        </button>
      </div>

      {notes.map((note) => (
        <p className="assistant-note" key={note}><InfoCircle /> {note}</p>
      ))}

      {extraction.warnings.map((warning) => (
        <p className="assistant-note assistant-note--attention" key={warning}><Warning /> {warning}</p>
      ))}

      <p className="commitment__note">
        The XRPL destination, destination tag, XRP amount, and evidence-window start ledger are yours
        to supply. The assistant is not permitted to propose them.
      </p>
    </div>
  );
}

function RefusalResult({ refusal }) {
  return (
    <div>
      <span className="chip chip--attention"><Warning />Declined</span>
      <h3>The assistant declined this document</h3>
      <p className="commitment__message">{refusal.explanation}</p>
      {refusal.offer ? <p className="assistant-note"><InfoCircle /> {refusal.offer}</p> : null}
      {refusal.warnings.map((warning) => (
        <p className="assistant-note assistant-note--attention" key={warning}><Warning /> {warning}</p>
      ))}
      <p className="commitment__note">
        A refusal is a working outcome, not a failure. The agreement form below is unaffected.
      </p>
    </div>
  );
}
