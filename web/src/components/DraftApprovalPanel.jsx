import { useState } from 'react';
import {
  createCaseDraft,
  fetchCase,
  requestDraftSendAuthorization,
  reviewCaseDraft,
  updateCaseDraft,
} from '../lib/casePack.js';
import {
  DRAFT_TONES,
  requestReminderDraft,
  todayIsoDate,
} from '../lib/aiExplanation.js';
import { describeCodes } from '../../shared/escalation.js';
import { CheckCircle, Clock, Document, InfoCircle, Progress, Warning } from './Icons.jsx';

const EVENT_LABELS = {
  draft_created: 'Draft created',
  draft_updated: 'Draft edited',
  draft_approved: 'Draft approved',
  draft_rejected: 'Draft rejected',
  send_blocked: 'Send hand-off blocked',
  send_authorized: 'Send hand-off authorised',
};

function emptyDraft() {
  return { subject: '', body: '' };
}

function statusLabel(status) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Draft, not approved';
}

export default function DraftApprovalPanel({
  caseFile,
  onCaseUpdate,
  assistantReady = false,
  eligibilityOutcome = null,
}) {
  const [form, setForm] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tone, setTone] = useState('neutral');
  const [mentionInterest, setMentionInterest] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionWarnings, setSuggestionWarnings] = useState([]);
  const [refusal, setRefusal] = useState(null);

  /* S2. The result is stored by the service as an unapproved `local_llm` draft,
   * so it lands in the list below and goes through the same human approval and
   * send gate as anything typed here. Generation is not approval. */
  async function suggestReminder() {
    setError('');
    setNotice('');
    setRefusal(null);
    setSuggestionWarnings([]);
    setSuggesting(true);
    try {
      const payload = await requestReminderDraft(caseFile.id, {
        asAtDate: todayIsoDate(),
        tone,
        mentionStatutoryInterest: mentionInterest,
        eligibilityOutcome,
      });
      if (payload.refusal) {
        setRefusal(payload.refusal);
        setSuggestionWarnings(payload.refusal.warnings ?? []);
        return;
      }
      onCaseUpdate(payload.case);
      setSuggestionWarnings(payload.warnings ?? []);
      setNotice('A reminder was drafted and saved unapproved. Read it, edit it if needed, then approve the exact version.');
    } catch (suggestError) {
      setError(suggestError?.message ?? 'The assistant could not draft a reminder. Write one yourself below.');
    } finally {
      setSuggesting(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setNotice('');
  }

  function beginEdit(draft) {
    setEditingId(draft.id);
    setForm({ subject: draft.subject, body: draft.body });
    setError('');
    setNotice(draft.status === 'approved'
      ? 'Editing this message will remove its approval. The new version must be reviewed again.'
      : 'Editing creates a new draft version.');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyDraft());
    setError('');
    setNotice('');
  }

  async function saveDraft(event) {
    event.preventDefault();
    const editing = caseFile.drafts?.find((draft) => draft.id === editingId);
    setBusyId(editingId ?? 'new');
    setError('');
    setNotice('');
    try {
      const updated = editing
        ? await updateCaseDraft(caseFile.id, editing.id, {
          ...form,
          purpose: editing.purpose,
          citations: editing.citations,
          expectedVersion: editing.version,
        })
        : await createCaseDraft(caseFile.id, { ...form, purpose: 'payment_reminder', citations: [] });
      onCaseUpdate(updated);
      setEditingId(null);
      setForm(emptyDraft());
      setNotice(editing ? 'A new draft version was saved and now needs approval.' : 'Draft saved. It has not been approved or sent.');
    } catch (saveError) {
      setError(saveError?.message ?? 'The draft could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  async function review(draft, action) {
    setBusyId(draft.id);
    setError('');
    setNotice('');
    try {
      const updated = await reviewCaseDraft(caseFile.id, draft.id, {
        action,
        expectedVersion: draft.version,
      });
      onCaseUpdate(updated);
      setNotice(action === 'approve'
        ? `Version ${draft.version} approved. Later edits will invalidate this approval.`
        : `Version ${draft.version} rejected. It cannot be handed to a delivery service.`);
    } catch (reviewError) {
      setError(reviewError?.message ?? 'The review decision could not be saved.');
    } finally {
      setBusyId(null);
    }
  }

  async function checkSendGate(draft) {
    setBusyId(draft.id);
    setError('');
    setNotice('');
    try {
      const authorization = await requestDraftSendAuthorization(caseFile.id, draft.id, draft.version);
      const updated = await fetchCase(caseFile.id);
      onCaseUpdate(updated);
      setNotice(authorization.sent
        ? 'The approved draft was sent.'
        : 'Approval verified and the hand-off was audited. No message was sent because no delivery service is connected.');
    } catch (sendError) {
      // Reload so a server-recorded blocked attempt appears in the audit trail.
      try {
        onCaseUpdate(await fetchCase(caseFile.id));
      } catch {
        // Keep the original, more useful gate error when the refresh also fails.
      }
      setError(sendError?.message ?? 'The send gate refused this draft.');
    } finally {
      setBusyId(null);
    }
  }

  const drafts = caseFile.drafts ?? [];
  const delivery = caseFile.delivery ?? null;
  const reasons = describeCodes(delivery?.codes);

  return (
    <div className="card draft-approval">
      <div className="case-detail__head">
        <span><strong>Draft review and approval</strong><small>Human control before any delivery hand-off</small></span>
        <Document />
      </div>

      <p className="case-source draft-approval__intro">
        <InfoCircle />A local-LLM reminder goes through this same gate, saved unapproved. No email or messaging service is connected, so approval is checked and audited but nothing is sent.
      </p>

      {/* Task 8. Shown before the drafting and approval controls, so the operator
          learns the case has left the automated path before spending effort
          approving something that can never be handed over. The server enforces
          this independently; this is the same verdict, stated early. */}
      {delivery && !delivery.allowed ? (
        <div className={`delivery-block delivery-block--${delivery.route}`} role="status">
          <p className="delivery-block__head">
            <Warning />
            <strong>
              {delivery.route === 'professional_review'
                ? 'This case needs a qualified adviser'
                : 'This case file needs finishing'}
            </strong>
          </p>
          <p>{delivery.summary}</p>
          {reasons.length > 0 ? (
            <ul>
              {reasons.map((entry) => <li key={entry.code}>{entry.summary}</li>)}
            </ul>
          ) : null}
          <p className="field-note">
            You can still write and review a draft. The send hand-off is refused while this stands,
            and every refusal is recorded in the audit trail.
          </p>
        </div>
      ) : null}

      {assistantReady ? (
        <div className="draft-suggest">
          <div className="draft-suggest__controls">
            <div className="field">
              <label htmlFor="draft-tone">Tone</label>
              <select id="draft-tone" value={tone} onChange={(event) => setTone(event.target.value)}>
                {DRAFT_TONES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <label className="draft-suggest__opt" htmlFor="draft-mention-interest">
              <input
                id="draft-mention-interest"
                type="checkbox"
                checked={mentionInterest}
                onChange={(event) => setMentionInterest(event.target.checked)}
              />
              Mention that statutory interest may be available
            </label>
            <button className="btn btn--primary" type="button" onClick={suggestReminder} disabled={suggesting || busyId !== null}>
              {suggesting ? <Progress className="is-spinning" /> : <Document />}
              {suggesting ? 'Drafting…' : 'Suggest a reminder'}
            </button>
          </div>
          <p className="field-note">
            The assistant uses only the confirmed case facts and the deterministic figures. It cannot
            add a threat, a legal conclusion, or a figure of its own. A legal mention requires an
            approved UK-law snapshot; without one it is withheld and the reason is shown.
          </p>
        </div>
      ) : null}

      {refusal ? (
        <div className="timeline-refusal">
          <p><InfoCircle /><strong>The assistant declined.</strong> {refusal.explanation}</p>
          {refusal.offer ? <p className="field-note">{refusal.offer}</p> : null}
        </div>
      ) : null}

      {suggestionWarnings.length > 0 ? (
        <ul className="timeline-warnings">
          {suggestionWarnings.map((warning) => <li key={warning}><Warning />{warning}</li>)}
        </ul>
      ) : null}

      <form className="draft-form" onSubmit={saveDraft}>
        <div className="field">
          <label htmlFor="draft-subject">Reminder subject</label>
          <input id="draft-subject" name="subject" value={form.subject} onChange={updateField} maxLength="300" required />
        </div>
        <div className="field">
          <label htmlFor="draft-body">Reminder draft</label>
          <textarea id="draft-body" name="body" rows="5" value={form.body} onChange={updateField} maxLength="10000" required />
        </div>
        <div className="draft-actions">
          <button className="btn btn--primary" type="submit" disabled={busyId !== null}>
            {busyId === (editingId ?? 'new') ? <Progress className="is-spinning" /> : <CheckCircle />}
            {editingId ? 'Save new version' : 'Save unapproved draft'}
          </button>
          {editingId ? <button className="btn btn--quiet" type="button" onClick={cancelEdit}>Cancel edit</button> : null}
        </div>
      </form>

      {notice ? <p className="assistant-note" role="status"><InfoCircle />{notice}</p> : null}
      {error ? <div className="form-error" role="alert"><Warning /><p>{error}</p></div> : null}

      {drafts.length === 0 ? (
        <p className="case-empty"><InfoCircle />No reminder drafts recorded for this case.</p>
      ) : (
        <div className="draft-list">
          {drafts.map((draft) => (
            <article className="draft-item" key={draft.id}>
              <div className="draft-item__head">
                <span>
                  <strong>{draft.subject}</strong>
                  <small>Version {draft.version} · {draft.authorType === 'local_llm' ? 'Local-LLM draft' : 'Human draft'}</small>
                </span>
                <span className={`draft-status draft-status--${draft.status}`}>{statusLabel(draft.status)}</span>
              </div>
              <p className="draft-item__body">{draft.body}</p>
              {draft.citations?.length > 0 ? (
                <ul className="draft-citations">
                  {draft.citations.map((citation) => (
                    <li key={`${citation.sourceId}-${citation.sourceVersion}`}>
                      <Document />
                      <span>{citation.label}<small>{citation.sourceId} · {citation.sourceVersion}</small></span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="draft-actions">
                <button className="btn btn--quiet" type="button" onClick={() => beginEdit(draft)} disabled={busyId !== null}>Edit</button>
                <button className="btn btn--quiet" type="button" onClick={() => review(draft, 'approve')} disabled={busyId !== null || draft.status === 'approved'}>Approve version</button>
                <button className="btn btn--quiet" type="button" onClick={() => review(draft, 'reject')} disabled={busyId !== null || draft.status === 'rejected'}>Reject</button>
                <button className="btn btn--quiet" type="button" onClick={() => checkSendGate(draft)} disabled={busyId !== null}>Check send gate</button>
              </div>
              <details className="draft-audit">
                <summary>Audit trail ({draft.auditEvents?.length ?? 0})</summary>
                <ol>
                  {(draft.auditEvents ?? []).map((event) => (
                    <li key={event.id}>
                      <Clock />
                      <span><strong>{EVENT_LABELS[event.eventType] ?? event.eventType}</strong><small>Version {event.draftVersion} · {event.operatorId} · {new Date(event.createdAt).toLocaleString('en-GB')}</small></span>
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
