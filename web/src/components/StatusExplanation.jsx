/* S3 status and evidence explanation.
 *
 * The status shown here always comes from a fresh Coston2 read made by the
 * caller. This panel narrates it; it never decides it, and the real status chip
 * stays visible beside it so a reader never has only the prose.
 *
 * The "what this does not establish" list is the more important half
 * (docs/ui-language.md, "Evidence view"). Its mandatory clauses are fixed
 * application text appended by the service, shown separately so they read as
 * the product's own statement rather than as something a model chose to say.
 */

import { useState } from 'react';
import { requestExplanation, splitLimitations } from '../lib/aiExplanation.js';
import { Check, CheckCircle, InfoCircle, Progress, Warning } from './Icons.jsx';
import StatusChip from './StatusChip.jsx';

export default function StatusExplanation({ status, facts = [], assistantReady = false }) {
  const [explanation, setExplanation] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The assistant is optional (D-003). With it off, the status chip and the
  // evidence panel already say everything; this card is simply absent.
  if (!assistantReady || !status) return null;

  async function explain() {
    setError('');
    setRefusal(null);
    setExplanation(null);
    setBusy(true);
    try {
      const result = await requestExplanation(status, facts);
      if (result.skill === 'refusal') setRefusal(result);
      else setExplanation(result);
    } catch (explainError) {
      setError(explainError?.message ?? 'The assistant could not explain this status. The evidence panel is unaffected.');
    } finally {
      setBusy(false);
    }
  }

  const { specific, mandatory } = splitLimitations(explanation);

  return (
    <div className="card status-explanation">
      <div className="case-detail__head">
        <span>
          <strong>What this status means</strong>
          <small>Local assistant · plain-language narration, not evidence</small>
        </span>
        <StatusChip status={status} />
      </div>

      {!explanation && !refusal ? (
        <p className="case-source">
          <InfoCircle />
          The contract decides the status; the assistant only puts it in ordinary words. It cannot
          change, soften, or promote it, and it cannot tell you what you are owed or what to do
          about it.
        </p>
      ) : null}

      <div className="status-explanation__actions">
        <button className="btn btn--primary" type="button" onClick={explain} disabled={busy}>
          {busy ? <Progress className="is-spinning" /> : <InfoCircle />}
          {busy ? 'Explaining…' : explanation || refusal ? 'Explain again' : 'Explain this status'}
        </button>
      </div>

      {error ? <p className="assistant-note assistant-note--attention"><Warning />{error}</p> : null}

      {refusal ? (
        <div className="timeline-refusal">
          <p><InfoCircle /><strong>The assistant declined.</strong> {refusal.explanation}</p>
          {refusal.offer ? <p className="field-note">{refusal.offer}</p> : null}
        </div>
      ) : null}

      {explanation ? (
        <div className="status-explanation__body">
          <p className="status-explanation__meaning">{explanation.plainMeaning}</p>

          {explanation.whatThisProves?.length > 0 ? (
            <section>
              <h4>What this supports</h4>
              <ul className="claim-list">
                {explanation.whatThisProves.map((claim) => (
                  <li key={claim}><Check />{claim}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Never empty: the validator rejects a reply that leaves it so, and
              the service appends the mandatory clauses on top. */}
          <section>
            <h4>What this does not establish</h4>
            {specific.length > 0 ? (
              <ul className="claim-list claim-list--excludes">
                {specific.map((clause) => (
                  <li key={clause}><InfoCircle />{clause}</li>
                ))}
              </ul>
            ) : null}
            {mandatory.length > 0 ? (
              <>
                <p className="field-note">These limits always apply and are set by the application, not by the assistant:</p>
                <ul className="claim-list claim-list--excludes">
                  {mandatory.map((clause) => (
                    <li key={clause}><InfoCircle />{clause}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          {explanation.nextAction ? (
            <p className="status-explanation__next">
              <CheckCircle /><span><strong>Next step</strong>{explanation.nextAction}</span>
            </p>
          ) : null}

          {explanation.warnings?.length > 0 ? (
            <ul className="timeline-warnings">
              {explanation.warnings.map((warning) => <li key={warning}><Warning />{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
