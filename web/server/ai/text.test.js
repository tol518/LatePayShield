import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelReplyError, isGroundedQuote, parseJsonObject, stripThinking } from './text.js';

/* The exact reply shape that broke a live S6 run on 3 September 2026: a
 * four-event timeline in which the model duplicated one key line and dropped
 * its opening quote. `finish_reason` was `stop` and only 484 of 2048 tokens
 * were used, so this is a generation slip, not truncation. */
const DUPLICATED_KEY_REPLY = `{
  "skill": "timeline",
  "needs_human_confirmation": true,
  "events": [
    {
      "occurredAt": "2026-08-09",
      "channel": "letter",
      "direction": "outbound",
      "subject": null,
      subject": null,
      "summary": "A second reminder was posted by letter to the registered office."
    }
  ]
}`;

test('a duplicated key is refused, not repaired', () => {
  // SKILLS.md §0: an unparseable response is a failure, not a partial success.
  // Guessing which of the two lines the model meant is exactly what that
  // forbids, so this must throw rather than recover.
  assert.throws(() => parseJsonObject(DUPLICATED_KEY_REPLY), ModelReplyError);
});

test('a parse failure says where it failed, so the one retry is actionable', () => {
  try {
    parseJsonObject(DUPLICATED_KEY_REPLY);
    assert.fail('expected a rejection');
  } catch (error) {
    // The bug this replaces: the caller was told only "not valid JSON", so the
    // single retry SKILLS.md §8 allows had nothing to act on and reproduced the
    // same slip.
    assert.match(error.message, /line \d+, column \d+/);
    assert.match(error.detail, /Expected double-quoted property name/);
  }
});

test('the log-safe message never carries a snippet of the reply', () => {
  // V8's second message shape embeds the input, which for these skills is
  // document-derived text that must not reach a log (SKILLS.md §1).
  const snippetShape = '{"invoiceNumber": "INV-2026-014", "payerName": }';
  try {
    parseJsonObject(snippetShape);
    assert.fail('expected a rejection');
  } catch (error) {
    assert.doesNotMatch(error.message, /INV-2026-014/);
    assert.doesNotMatch(error.message, /payerName/);
    assert.equal(error.message, 'The model response was not valid JSON.');
    // The detail may quote it, because it only ever goes back to the model,
    // which already holds the document.
    assert.match(error.detail, /Unexpected token/);
  }
});

test('a position-only failure still reports its position', () => {
  try {
    parseJsonObject('{"a": 1,\n  "b": 2,\n  c": 3}');
    assert.fail('expected a rejection');
  } catch (error) {
    assert.match(error.message, /parse failed at (line \d+, column \d+|position \d+)/);
  }
});

test('an empty or non-object reply is refused with a stable message', () => {
  assert.throws(() => parseJsonObject(''), /returned an empty response/);
  assert.throws(() => parseJsonObject('<think>only reasoning</think>'), /returned an empty response/);
  assert.throws(() => parseJsonObject('[1, 2, 3]'), /was not a JSON object/);
  // No location to report, and nothing to brief a retry with.
  try {
    parseJsonObject('[1, 2, 3]');
  } catch (error) {
    assert.equal(error.detail, null);
  }
});

test('a well-formed reply still parses through fences and reasoning', () => {
  assert.deepEqual(parseJsonObject('{"skill":"timeline"}'), { skill: 'timeline' });
  assert.deepEqual(parseJsonObject('```json\n{"skill":"timeline"}\n```'), { skill: 'timeline' });
  assert.deepEqual(
    parseJsonObject('<think>deciding</think>\n{"skill":"timeline"}'),
    { skill: 'timeline' },
  );
  // A sentence either side of the object is recovered by slicing to the braces.
  assert.deepEqual(parseJsonObject('Here you go: {"skill":"timeline"} Hope that helps.'), { skill: 'timeline' });
});

test('reasoning is never returned as output', () => {
  assert.equal(stripThinking('<think>secret</think>{"a":1}'), '{"a":1}');
  assert.equal(stripThinking('<think>unclosed reasoning'), '');
  assert.doesNotMatch(stripThinking('<think>secret</think>{"a":1}'), /secret/);
});

test('quote grounding is whitespace- and case-insensitive but otherwise literal', () => {
  const source = 'Reminder sent   to accounts@contoso.example\non 14 July.';
  assert.equal(isGroundedQuote('reminder sent to accounts@contoso.example', source), true);
  assert.equal(isGroundedQuote('Reminder emailed to accounts@contoso.example', source), false);
  assert.equal(isGroundedQuote('', source), false);
});
