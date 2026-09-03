import test from 'node:test';
import assert from 'node:assert/strict';
import { DEADLINE_CHECKS, checkDeadlineAgainstDueDate, deadlineDate } from './deadlineCheck.js';

test('warns when the deadline precedes the invoice due date', () => {
  // The case worth stopping for: a non-payment proof could be accepted while
  // the payer is still inside the terms they were given.
  const result = checkDeadlineAgainstDueDate({
    invoiceDueDate: '2026-09-29',
    deadlineLocal: '2026-09-15T23:59',
  });
  assert.equal(result.code, 'deadline_before_due_date');
  assert.equal(result.severity, 'attention');
  assert.equal(result.invoiceDueDate, '2026-09-29');
  assert.equal(result.deadlineDate, '2026-09-15');
  assert.match(result.message, /still inside the payment terms/);
});

test('notes, more quietly, when the deadline follows the invoice due date', () => {
  const result = checkDeadlineAgainstDueDate({
    invoiceDueDate: '2026-09-15',
    deadlineLocal: '2026-09-29T23:59',
  });
  assert.equal(result.code, 'deadline_after_due_date');
  assert.equal(result.severity, 'info');
  assert.match(result.message, /allowed/);
});

test('says nothing when the two dates agree', () => {
  assert.equal(checkDeadlineAgainstDueDate({
    invoiceDueDate: '2026-09-29',
    deadlineLocal: '2026-09-29T23:59',
  }), null);
  // Any time of day on the same date is still the same date.
  assert.equal(checkDeadlineAgainstDueDate({
    invoiceDueDate: '2026-09-29',
    deadlineLocal: '2026-09-29T00:00',
  }), null);
});

test('says nothing when either date is unknown', () => {
  // There is nothing truthful to say about a comparison that cannot be made,
  // and a warning with a blank in it would be worse than silence.
  for (const input of [
    { invoiceDueDate: '', deadlineLocal: '2026-09-15T23:59' },
    { invoiceDueDate: null, deadlineLocal: '2026-09-15T23:59' },
    { invoiceDueDate: undefined, deadlineLocal: '2026-09-15T23:59' },
    { invoiceDueDate: 'net 30', deadlineLocal: '2026-09-15T23:59' },
    { invoiceDueDate: '2026-09-29', deadlineLocal: '' },
    { invoiceDueDate: '2026-09-29', deadlineLocal: null },
    { invoiceDueDate: '2026-09-29', deadlineLocal: 'tomorrow' },
    {},
    undefined,
  ]) {
    assert.equal(checkDeadlineAgainstDueDate(input), null, JSON.stringify(input));
  }
});

test('a date that does not exist is treated as unknown, not as earlier', () => {
  assert.equal(deadlineDate('2026-02-30T12:00'), null);
  assert.equal(deadlineDate('2026-13-01T12:00'), null);
  assert.equal(checkDeadlineAgainstDueDate({
    invoiceDueDate: '2026-09-29',
    deadlineLocal: '2026-02-30T12:00',
  }), null);
});

test('extracts the date part of a datetime-local value', () => {
  assert.equal(deadlineDate('2026-09-29T23:59'), '2026-09-29');
  assert.equal(deadlineDate('2026-09-29T23:59:30'), '2026-09-29');
  assert.equal(deadlineDate('2026-09-29'), '2026-09-29');
  assert.equal(deadlineDate('2026-09'), null);
});

test('the comparison holds across month and year boundaries', () => {
  assert.equal(checkDeadlineAgainstDueDate({
    invoiceDueDate: '2027-01-02',
    deadlineLocal: '2026-12-31T23:59',
  }).code, 'deadline_before_due_date');
  assert.equal(checkDeadlineAgainstDueDate({
    invoiceDueDate: '2026-12-31',
    deadlineLocal: '2027-01-02T23:59',
  }).code, 'deadline_after_due_date');
});

test('neither message states a legal position or claims a breach', () => {
  for (const [code, entry] of Object.entries(DEADLINE_CHECKS)) {
    assert.doesNotMatch(entry.message, /entitled|enforceable|liable|breach|unlawful|invalid/i, code);
  }
});
