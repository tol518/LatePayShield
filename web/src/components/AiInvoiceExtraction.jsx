import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Document, InfoCircle, Person, Progress, Warning } from './Icons.jsx';
import {
  fetchAssistantAvailability,
  fieldLabel,
  formatMinorUnits,
  requestExtraction,
  toFormSuggestions,
} from '../lib/aiAssistant.js';
import { toCaseDraft } from '../lib/casePack.js';

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
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

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
      setResult(await requestExtraction({
        invoiceText,
        file: invoiceFile,
        maxDocumentBytes: availability.aiMaxDocumentBytes,
      }));
      setPhase('done');
    } catch (extractionError) {
      setError(extractionError?.message ?? 'The assistant could not read this document.');
      setPhase('idle');
    }
  }

  function applySuggestions() {
    const suggestions = toFormSuggestions(result);
    onSuggest?.({ ...suggestions, caseDraft: toCaseDraft(result) });
    // Wait for React to put the suggested values into the agreement form before
    // moving the user to the next step in the journey.
    window.requestAnimationFrame(() => {
      document.getElementById('prepare')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function selectFile(event) {
    setInvoiceFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError('');
  }

  function clearFile() {
    setInvoiceFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function dropFile(event) {
    event.preventDefault();
    if (busy) return;
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    if (!nextFile) return;
    setInvoiceFile(nextFile);
    setResult(null);
    setError('');
  }

  // Nothing is rendered until availability is known, and nothing is rendered at
  // all when the assistant is switched off: an absent optional feature should
  // not advertise itself as a missing one.
  if (!availability?.aiEnabled) return null;

  const busy = phase === 'working';
  const extraction = result?.skill === 'extraction' ? result : null;
  const refusal = result?.skill === 'refusal' ? result : null;

  return (
    <section className="section section--assistant" id="assistant">
      <div className="shell">
        <div className="creator-layout assistant-layout">
          <form className="card assistant-form" onSubmit={suggest}>
            <div className="assistant-form__head">
              <p className="eyebrow">Start here</p>
              <h2>Create a protected agreement</h2>
              <p>Upload your invoice. Your local AI will suggest the key terms for you to review.</p>
            </div>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              id="assistant-file"
              name="invoiceFile"
              type="file"
              accept=".pdf,.xml,.ubl,application/pdf,application/xml,text/xml,application/ubl+xml"
              onChange={selectFile}
              aria-describedby="assistant-file-help"
              disabled={busy}
            />
            <label
              className="upload-zone"
              htmlFor="assistant-file"
              onDragOver={(event) => event.preventDefault()}
              onDrop={dropFile}
            >
              <span className="upload-zone__icon"><Document /></span>
              <span className="upload-zone__copy">
                <strong>{invoiceFile ? invoiceFile.name : 'Drag and drop your invoice here'}</strong>
                <span>{invoiceFile ? 'Choose a different file' : 'or choose a file to upload'}</span>
                <small id="assistant-file-help">
                  PDF, XML, UBL · Up to {availability.aiMaxDocumentBytes
                    ? Math.floor(availability.aiMaxDocumentBytes / 1024 / 1024)
                    : 10} MB
                  {availability.aiMaxPdfPages ? ` · ${availability.aiMaxPdfPages} searchable PDF pages` : ''}
                </small>
              </span>
            </label>
            {invoiceFile ? (
              <div className="assistant-file__selection">
                <span><Document /> {invoiceFile.name}</span>
                <button className="btn btn--quiet" type="button" onClick={clearFile} disabled={busy}>Remove</button>
              </div>
            ) : null}

            <details className="assistant-paste">
              <summary>Or paste invoice text</summary>
              <label htmlFor="assistant-invoice">Invoice text</label>
              <textarea
                id="assistant-invoice"
                name="invoiceText"
                rows={8}
                value={invoiceText}
                onChange={(event) => setInvoiceText(event.target.value)}
                placeholder="Paste the invoice text here."
                aria-describedby="assistant-invoice-help"
                disabled={busy}
                required={!invoiceFile}
              />
              <p className="field__help" id="assistant-invoice-help">
                Held for this request only. Up to {availability.aiMaxInvoiceCharacters
                  ? availability.aiMaxInvoiceCharacters.toLocaleString('en-GB')
                  : '25,000'} characters.
              </p>
            </details>

            <div className="privacy-panel">
              <ShieldPrivacy />
              <span><strong>Private local AI</strong>Your invoice is processed by a model running on our own machines so your data is not shared with third parties and remains private.</span>
            </div>

            <div className="form-actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={busy || !availability.aiReady || (!invoiceFile && invoiceText.trim().length < 20)}
              >
                {busy ? <Progress className="is-spinning" /> : <Document />}
                {busy ? 'Reading the document…' : 'Review invoice'}
              </button>
            </div>

            {!availability.aiReady && availability.aiUnavailableReason ? (
              <p className="assistant-note"><InfoCircle /> {availability.aiUnavailableReason} You can still enter terms manually below.</p>
            ) : (
              <p className="assistant-note">
                <InfoCircle /> Suggestions are never final. You confirm every value before an agreement is recorded.
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
    <div className="agreement-preview">
      <div className="agreement-preview__title"><span><Document /></span><h2>Agreement preview</h2></div>
      {busy ? (
        <div className="agreement-preview__reading">
          <span className="chip chip--primary"><Progress className="is-spinning" />Reading invoice</span>
          <h3>The local model is extracting terms</h3>
          <p>Your document stays on your computers while this runs.</p>
        </div>
      ) : (
        <>
          <div className="preview-stat"><strong>—</strong><span>Amount and currency</span></div>
          <div className="preview-row"><ClockIcon /><span><strong>Not set</strong><small>Payment due date</small></span></div>
          <div className="preview-row"><Progress /><span><strong>Awaiting confirmation</strong><small>No agreement created yet</small></span></div>
          <div className="preview-trust"><Person /><span><strong>Human confirmation is authoritative</strong><small>You review and confirm all terms before an agreement is created.</small></span></div>
        </>
      )}
    </div>
  );
}

function ShieldPrivacy() {
  return <CheckCircle />;
}

function ClockIcon() {
  return <InfoCircle />;
}

function ExtractionResult({ extraction, onApply }) {
  const { count, notes } = toFormSuggestions(extraction);
  const grounded = Object.entries(extraction.fields).filter(([, field]) => field.value !== null);
  const reference = grounded.filter(([name]) => REFERENCE_FIELDS.includes(name));
  const total = formatMinorUnits(extraction.fields.amountMinorUnits?.value, extraction.fields.currency?.value);

  return (
    <div>
      <span className="chip chip--testnet"><Person />Proposed, not confirmed</span>
      <h3>{grounded.length} value{grounded.length === 1 ? '' : 's'} quoted from the document</h3>
      {extraction.document ? (
        <p className="assistant-note"><Document /> Read {extraction.document.name} as {extraction.document.format}.</p>
      ) : null}
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
