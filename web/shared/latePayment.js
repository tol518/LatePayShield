/*
 * Deterministic late-payment figures for the supported UK business-to-business
 * scope.
 *
 * No legal value lives here. The margin, the reference rates, the compensation
 * bands and the day-count basis all arrive as inputs, so an approved source and
 * a copy in code can never drift apart, because there is no copy. Nothing here
 * concludes that a sum is owed; every figure is an illustration.
 *
 * This module is imported unchanged by the local service and by the browser
 * bundle, so it stays free of platform APIs and never reads a clock.
 */

// How old law inputs may be before the interest rate is too perishable to
// state. This is the repository's own currency policy rather than a fact about
// the law, which is why it may live in code while the legal values may not.
export const STALE_AFTER_DAYS = 90;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHOLE_MINOR_UNITS = /^\d+$/;
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
// Percentages are held as integers scaled by four decimal places so that a
// base rate and a margin add exactly.
const PERCENT_SCALE = 10_000n;
const PERCENT_DECIMALS = 4;
const DAY_MS = 86_400_000;

export const REASONS = Object.freeze({
  not_eligible: {
    status: 'unavailable',
    summary: 'The eligibility questionnaire has not reached a supported outcome, so no figures are produced.',
  },
  law_inputs_missing: {
    status: 'unavailable',
    summary: 'No approved law inputs were supplied, so no figures are produced.',
  },
  law_inputs_invalid: {
    status: 'unavailable',
    summary: 'The supplied law inputs could not be read, so no figures are produced.',
  },
  no_reference_period: {
    status: 'unavailable',
    summary: 'No supplied reference period covers the date the debt became late, so no interest figure can be produced.',
  },
  currency_not_gbp: {
    status: 'unavailable',
    summary: 'The debt is not in sterling, so it cannot be measured against sterling rates and bands.',
  },
  debt_amount_unusable: {
    status: 'unavailable',
    summary: 'The debt is not recorded as a whole, positive number of minor units.',
  },
  dates_unusable: {
    status: 'unavailable',
    summary: 'The due date or the as-at date is not a real calendar date.',
  },
  law_inputs_stale: {
    status: 'calculated',
    summary: 'The law inputs are older than the freshness limit, so the statutory interest figure is withheld.',
  },
  not_yet_late: {
    status: 'calculated',
    summary: 'The as-at date is on or before the due date, so there are no late-payment figures to illustrate yet.',
  },
});
Object.values(REASONS).forEach(Object.freeze);

/** Midnight UTC of a calendar date, or null when the text is not one. */
function parseDate(value) {
  const match = ISO_DATE.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls a date like 2026-02-30 forward into March instead of
  // rejecting it, so the round trip is what actually validates the day.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.getTime();
}

function daysBetween(fromMs, toMs) {
  return Math.round((toMs - fromMs) / DAY_MS);
}

/** A percentage as an integer scaled by PERCENT_SCALE, or null. */
function parsePercent(value) {
  const text = String(value ?? '').trim();
  if (!PERCENT.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * PERCENT_SCALE + BigInt(fraction.padEnd(PERCENT_DECIMALS, '0'));
}

function formatPercent(scaled) {
  const whole = scaled / PERCENT_SCALE;
  const fraction = String(scaled % PERCENT_SCALE).padStart(PERCENT_DECIMALS, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** Every supplied law value read and checked, or null if any of it is unusable. */
function readLawInputs(lawInputs) {
  if (!lawInputs || typeof lawInputs !== 'object' || Array.isArray(lawInputs)) return null;

  const asOf = parseDate(lawInputs.asOf);
  const margin = parsePercent(lawInputs.marginPercent);
  // Only a genuine number is accepted here: Number() would also coerce a
  // boolean, an array, or a numeric string, and dayCountBasis is a divisor, so
  // a coerced value would silently scale the interest by whatever factor
  // slipped through.
  const dayCount = typeof lawInputs.dayCountBasis === 'number' ? lawInputs.dayCountBasis : NaN;
  if (asOf === null || margin === null) return null;
  if (!Number.isInteger(dayCount) || dayCount <= 0) return null;

  if (!Array.isArray(lawInputs.referencePeriods) || lawInputs.referencePeriods.length === 0) return null;
  const periods = [];
  for (const period of lawInputs.referencePeriods) {
    const start = parseDate(period?.start);
    const end = parseDate(period?.end);
    const baseRate = parsePercent(period?.baseRatePercent);
    if (start === null || end === null || baseRate === null || end < start) return null;
    periods.push({ start, end, baseRate, startDate: String(period.start).trim(), endDate: String(period.end).trim() });
  }
  // An overlap would let .find() silently pick whichever period was listed
  // first, so two periods claiming the same date are refused rather than
  // resolved by list order.
  for (let i = 1; i < periods.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (periods[i].start <= periods[j].end && periods[j].start <= periods[i].end) return null;
    }
  }

  if (!Array.isArray(lawInputs.compensationBands) || lawInputs.compensationBands.length === 0) return null;
  const bands = [];
  for (const band of lawInputs.compensationBands) {
    const amount = String(band?.amountMinorUnits ?? '').trim();
    if (!WHOLE_MINOR_UNITS.test(amount)) return null;
    const upTo = band?.upToMinorUnits;
    if (upTo === null || upTo === undefined) {
      bands.push({ upTo: null, amount });
      continue;
    }
    const text = String(upTo).trim();
    if (!WHOLE_MINOR_UNITS.test(text)) return null;
    bands.push({ upTo: BigInt(text), amount });
  }
  // Without an open top band a large debt would silently fall through to no
  // compensation at all, which is worse than refusing to read the inputs.
  if (bands.at(-1).upTo !== null) return null;
  // Bands are searched with .find(), so an out-of-order list would let the
  // first listed match win instead of the smallest one that fits.
  for (let i = 1; i < bands.length; i += 1) {
    const previous = bands[i - 1].upTo;
    const current = bands[i].upTo;
    if (previous === null) return null;
    if (current !== null && current <= previous) return null;
  }

  return { asOf, asOfDate: String(lawInputs.asOf).trim(), margin, dayCount, periods, bands };
}

/**
 * Whether a lawInputs object is one the calculator can actually use.
 *
 * This is the same read `calculate` performs internally, exposed so a caller
 * checking a candidate snapshot never has to keep a second copy of these
 * rules in step with this module's.
 */
export function isUsableLawInputs(lawInputs) {
  return readLawInputs(lawInputs) !== null;
}

function interestMinorUnits(debt, rateScaled, days, dayCount) {
  const numerator = debt * rateScaled * BigInt(days);
  const denominator = PERCENT_SCALE * 100n * BigInt(dayCount);
  // Rounded half up once, here. Rounding each day and summing would drift.
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Every result carries the same keys, so no caller can read a stray figure. */
function result(fields) {
  const reasons = fields.reasons ?? [];
  // The catalogue already says which reasons are refusals; deriving status
  // from it here means a reason's status can never drift from what a result
  // actually reports.
  const status = reasons.some((entry) => REASONS[entry.code].status === 'unavailable')
    ? 'unavailable'
    : 'calculated';
  return {
    status,
    reasons,
    dueDate: null,
    asAtDate: null,
    daysLate: null,
    debtMinorUnits: null,
    currency: null,
    interest: null,
    fixedCompensationMinorUnits: null,
    additionalMinorUnits: null,
    lawAsOf: null,
    illustrative: true,
    ...fields,
  };
}

/**
 * Illustrate the late-payment position of one debt at one date.
 *
 * The caller supplies the as-at date, so the same inputs always produce the
 * same figures and nothing here depends on when it runs.
 */
export function calculate(caseFacts, lawInputs) {
  const reasons = [];
  const add = (code) => reasons.push({ code, summary: REASONS[code].summary });

  const dueMs = parseDate(caseFacts?.dueDate);
  const asAtMs = parseDate(caseFacts?.asAtDate);
  // Only a string is accepted: a Number large enough to lose precision would
  // otherwise pass String() and the digits check while already being wrong.
  const debtRaw = caseFacts?.debtMinorUnits;
  const debtText = typeof debtRaw === 'string' ? debtRaw.trim() : '';
  const debtUsable = typeof debtRaw === 'string' && WHOLE_MINOR_UNITS.test(debtText) && BigInt(debtText) > 0n;
  const currency = String(caseFacts?.currency ?? '').trim().toUpperCase();
  const law = lawInputs === undefined || lawInputs === null ? undefined : readLawInputs(lawInputs);

  const echo = {
    dueDate: dueMs === null ? null : String(caseFacts.dueDate).trim(),
    asAtDate: asAtMs === null ? null : String(caseFacts.asAtDate).trim(),
    daysLate: dueMs === null || asAtMs === null ? null : Math.max(0, daysBetween(dueMs, asAtMs)),
    debtMinorUnits: debtUsable ? debtText : null,
    currency: currency === 'GBP' ? currency : null,
    lawAsOf: law ? law.asOfDate : null,
  };

  if (caseFacts?.eligibilityOutcome !== 'supported') add('not_eligible');
  if (dueMs === null || asAtMs === null) add('dates_unusable');
  if (!debtUsable) add('debt_amount_unusable');
  if (currency !== 'GBP') add('currency_not_gbp');
  if (law === undefined) add('law_inputs_missing');
  else if (law === null) add('law_inputs_invalid');

  if (reasons.length > 0) return result({ ...echo, reasons });

  if (echo.daysLate === 0) {
    add('not_yet_late');
    return result({ ...echo, reasons, additionalMinorUnits: '0' });
  }

  // The debt becomes late the day after it fell due, and that date decides
  // which reference period governs the whole accrual.
  const lateFromMs = dueMs + DAY_MS;
  const period = law.periods.find((entry) => lateFromMs >= entry.start && lateFromMs <= entry.end);
  if (!period) {
    add('no_reference_period');
    return result({ ...echo, reasons });
  }

  const debt = BigInt(debtText);
  const band = law.bands.find((entry) => entry.upTo === null || debt <= entry.upTo);

  if (daysBetween(law.asOf, asAtMs) > STALE_AFTER_DAYS) {
    add('law_inputs_stale');
    // additionalMinorUnits is interest plus fixed compensation everywhere
    // else, so leaving it as the fixed amount alone here would read as if the
    // withheld interest were zero. Null says plainly that a figure is missing.
    return result({
      ...echo,
      reasons,
      fixedCompensationMinorUnits: band.amount,
      additionalMinorUnits: null,
    });
  }

  const rateScaled = period.baseRate + law.margin;
  const amount = interestMinorUnits(debt, rateScaled, echo.daysLate, law.dayCount);
  return result({
    ...echo,
    reasons,
    interest: {
      ratePercent: formatPercent(rateScaled),
      baseRatePercent: formatPercent(period.baseRate),
      marginPercent: formatPercent(law.margin),
      referencePeriod: { start: period.startDate, end: period.endDate },
      dayCountBasis: law.dayCount,
      amountMinorUnits: String(amount),
    },
    fixedCompensationMinorUnits: band.amount,
    additionalMinorUnits: String(amount + BigInt(band.amount)),
  });
}
