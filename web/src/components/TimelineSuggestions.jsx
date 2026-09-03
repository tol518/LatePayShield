/* S6 evidence timeline review.
 *
 * Three rules from docs/ai/SKILLS.md and docs/design.md shape this panel:
 *
 *   - Proposals are proposals. They live in this component's state, are
 *     labelled unconfirmed, and every field stays editable until the operator
 *     confirms that one event (D-014).
 *   - Each proposal shows the verbatim quote it was grounded in, so the
 *     reviewer checks the summary against the document rather than trusting it.
 *   - The manual timeline form beside this panel is the complete path. When the
 *     assistant is off or unreachable this panel is absent, not broken.
 */

import { useState } from 'react';
import { addCaseCommunication } from '../lib/casePack.js';
import {
  TIMELINE_CHANNELS,
  TIMELINE_DIRECTIONS,
  channelLabel,
  directionLabel,
  proposalProblem,
  requestTimeline,
  toConfirmationBody,
  toTimelineProposals,
} from '../lib/aiTimeline.js';
import { CheckCircle, Clock, Document, InfoCircle, Progress, Warning } from './Icons.jsx';

export default function TimelineSuggestions({ caseFile, assistantReady, maxDocumentBytes, onCaseUpdate }) {
  const [documentText, setDocumentText] = useState('');
  const [file, setFile] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [refusal, setRefusal] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // SKILLS.md §1 and D-003: the assistant is optional. With it switched off the
  // panel is simply not rendered, and the manual form is unaffected.
  if (!assistantReady) return null;

  function reset() {
    setError('');
    setNotice('');
  }

  async function askForSuggestions(submitEvent) {
    submitEvent.preventDefault();
    reset();
    setBusy(true);
    setProposals([]);
    setRefusal(null);
    setWarnings([]);
    try {
      const envelope = await requestTimeline({ documentText, file, maxDocumentBytes });
      if (envelope.skill === 'refusal') {
        // A refusal is a successful response (SKILLS.md §3.6), so it is shown
        // as the assistant's answer rather than as a failure.
        setRefusal(envelope);
        setWarnings(envelope.warnings ?? []);
        return;
      }
      setProposals(toTimelineProposals(envelope));
      setWarnings(envelope.warnings ?? []);
    } catch (requestError) {
      setError(requestError?.message ?? 'The assistant could not read that document. Add the entries manually.');
    } finally {
      setBusy(false);
    }
  }

  function editProposal(key, field, value) {
    reset();
    setProposals((current) => current.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  }

  function rejectProposal(key) {
    reset();
    setProposals((current) => current.filter((item) => item.key !== key));
    setNotice('Suggestion discarded. Nothing was saved.');
  }

  async function confirmProposal(proposal) {
    reset();
    const problem = proposalProblem(proposal);
    if (problem) {
      setError(problem);
      return;
    }
    setConfirmingKey(proposal.key);
    try {
      const updated = await addCaseCommunication(caseFile.id, toConfirmationBody(proposal));
      onCaseUpdate(updated);
      setProposals((current) => current.filter((item) => item.key !== proposal.key));
      setNotice('Event confirmed and added to the timeline with the quote it came from.');
    } catch (saveError) {
      setError(saveError?.message ?? 'That event could not be saved.');
    } finally {
      setConfirmingKey(null);
    }
  }

  return (
    <div className="card timeline-suggestions">
      <div className="case-detail__head">
        <span>
          <strong>Suggested timeline entries</strong>
          <small>Local assistant · proposals only, nothing is saved until you confirm each one</small>
        </span>
        <Clock />
      </div>

      <p className="case-source">
        <InfoCircle />
        Paste correspondence, or select a PDF, XML, or UBL file. The assistant proposes only dated
        events it can quote from that document. It cannot set payment status, an identifier, a legal
        position, or a calculated amount.
      </p>

      <form className="timeline-request" onSubmit={askForSuggestions}>
        <div className="field">
          <label htmlFor="timeline-text">Correspondence</label>
          <textarea
            id="timeline-text"
            rows={5}
            value={documentText}
            onChange={(changeEvent) => { setDocumentText(changeEvent.target.value); reset(); }}
            placeholder="Paste the email thread, letter, or call notes for this invoice."
            disabled={Boolean(file)}
          />
        </div>
        <div className="field">
          <label htmlFor="timeline-file">Or a document</label>
          <input
            id="timeline-file"
            type="file"
            accept=".pdf,.xml,.ubl"
            onChange={(changeEvent) => { setFile(changeEvent.target.files?.[0] ?? null); reset(); }}
          />
          {file ? (
            <p className="field-note">
              {file.name}
              <button type="button" className="btn btn--quiet" onClick={() => setFile(null)}>Remove</button>
            </p>
          ) : null}
        </div>
        <div className="timeline-request__actions">
          <button type="submit" className="btn btn--primary" disabled={busy || (!documentText.trim() && !file)}>
            {busy ? <><Progress />Reading the document…</> : 'Suggest timeline entries'}
          </button>
          <small>A local 8B model takes roughly 40 to 60 seconds. The rest of the page stays usable.</small>
        </div>
      </form>

      {error ? <p className="assistant-note assistant-note--attention"><Warning />{error}</p> : null}
      {notice ? <p className="case-source"><CheckCircle />{notice}</p> : null}

      {warnings.length > 0 ? (
        <ul className="timeline-warnings">
          {warnings.map((warning) => <li key={warning}><Warning />{warning}</li>)}
        </ul>
      ) : null}

      {refusal ? (
        <div className="timeline-refusal">
          <p><InfoCircle /><strong>The assistant declined.</strong> {refusal.explanation}</p>
          {refusal.offer ? <p className="field-note">{refusal.offer}</p> : null}
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <ol className="timeline-proposals">
          {proposals.map((proposal) => (
            <li key={proposal.key}>
              <div className="timeline-proposal__head">
                <span className="chip chip--neutral"><Document />Unconfirmed suggestion</span>
                <small>Model confidence: {proposal.confidence}</small>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`${proposal.key}-date`}>Date and time</label>
                  <input
                    id={`${proposal.key}-date`}
                    type="datetime-local"
                    value={proposal.occurredAtLocal}
                    onChange={(changeEvent) => editProposal(proposal.key, 'occurredAtLocal', changeEvent.target.value)}
                  />
                  {proposal.dateOnlyInSource ? (
                    <p className="field-note">The document gave a date only. Set the time if you know it.</p>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor={`${proposal.key}-channel`}>Channel</label>
                  <select
                    id={`${proposal.key}-channel`}
                    value={proposal.channel}
                    onChange={(changeEvent) => editProposal(proposal.key, 'channel', changeEvent.target.value)}
                  >
                    {TIMELINE_CHANNELS.map((channel) => (
                      <option key={channel} value={channel}>{channelLabel(channel)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${proposal.key}-direction`}>Direction</label>
                  <select
                    id={`${proposal.key}-direction`}
                    value={proposal.direction}
                    onChange={(changeEvent) => editProposal(proposal.key, 'direction', changeEvent.target.value)}
                  >
                    {TIMELINE_DIRECTIONS.map((direction) => (
                      <option key={direction} value={direction}>{directionLabel(direction)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${proposal.key}-subject`}>Subject</label>
                  <input
                    id={`${proposal.key}-subject`}
                    type="text"
                    value={proposal.subject}
                    onChange={(changeEvent) => editProposal(proposal.key, 'subject', changeEvent.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor={`${proposal.key}-summary`}>Summary</label>
                <textarea
                  id={`${proposal.key}-summary`}
                  rows={2}
                  value={proposal.summary}
                  onChange={(changeEvent) => editProposal(proposal.key, 'summary', changeEvent.target.value)}
                />
              </div>

              {/* The check that makes this reviewable: the operator compares the
                  summary against the document's own words. */}
              <blockquote className="timeline-proposal__quote">
                <small>Quoted from the document</small>
                {proposal.sourceQuote}
              </blockquote>

              <div className="timeline-proposal__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => confirmProposal(proposal)}
                  disabled={confirmingKey === proposal.key}
                >
                  {confirmingKey === proposal.key ? <><Progress />Saving…</> : 'Confirm this event'}
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => rejectProposal(proposal.key)}>
                  Discard
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
