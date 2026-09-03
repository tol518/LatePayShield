/*
 * The approved UK-law snapshot: what it must contain to be usable, and how it
 * becomes the values the late-payment calculator consumes.
 *
 * Retrieval and approval are separate. A value fetched from a primary source is
 * sourced; only a person setting the approval fields makes it approved, and an
 * unapproved snapshot yields nothing at all.
 *
 * Nothing here reads a file or a clock, so the same module serves the local
 * service and the browser bundle. Callers supply the parsed snapshot.
 */

import { isUsableLawInputs } from './latePayment.js';

export const SNAPSHOT_VERSION = 1;

export const ALLOWED_SOURCE_DOMAINS = Object.freeze([
  'legislation.gov.uk',
  'bankofengland.co.uk',
  'gov.uk',
  'justice.gov.uk',
]);

const REQUIRED_FACTS = Object.freeze([
  'statutory-interest-margin',
  'statutory-interest-reference-rate',
  'fixed-sum-compensation',
]);
const REQUIRED_CONVENTIONS = Object.freeze(['day-count-basis']);
const VOLATILITY = Object.freeze(['high', 'medium', 'low']);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
const WHOLE_MINOR_UNITS = /^\d+$/;

export const PROBLEMS = Object.freeze({
  snapshot_missing: 'No snapshot was supplied, so no legal values are available.',
  snapshot_malformed: 'The snapshot is not an object carrying the expected top-level lists.',
  unsupported_version: 'The snapshot is not a version this build knows how to read.',
  not_approved: 'The snapshot has not been approved by a person, so its values may not be used.',
  dates_unusable: 'The snapshot carries a timestamp or as-of value that is not a real date.',
  citation_unresolved: 'A fact cites a citation the snapshot does not define.',
  citation_source_not_allowlisted: 'A citation or source URL is not an https address on the approved-source allowlist.',
  fact_missing: 'A fact the calculator requires is absent from the snapshot.',
  fact_malformed: 'A required fact does not carry usable values.',
  convention_missing: 'A convention the calculator requires is absent from the snapshot.',
  convention_malformed: 'A required convention does not carry a usable value.',
  convention_has_citation: 'A convention carries a citation, so it is a sourced fact filed in the wrong place.',
});

/** Midnight UTC of a calendar date, or null when the text is not one. */
function parseDate(value) {
  const match = ISO_DATE.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls an impossible day forward, so the round trip is the check.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.getTime();
}

function parseInstant(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A host matches only as itself or as a subdomain, so a lookalike host that
 * merely contains an allowlisted domain is refused.
 */
/* Exported so the refresh script enforces the same allowlist at fetch time
 * that the validator enforces on the file. Two copies of this rule would be
 * one copy too many (task 9). */
export function isAllowedSourceUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ''));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function text(value) {
  return String(value ?? '').trim();
}

function readMargin(facts) {
  const value = text(facts.get('statutory-interest-margin')?.values?.marginPercent);
  return PERCENT.test(value) ? value : null;
}

function readPeriods(facts) {
  const periods = facts.get('statutory-interest-reference-rate')?.values?.referencePeriods;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const clean = [];
  for (const period of periods) {
    const start = text(period?.start);
    const end = text(period?.end);
    const baseRatePercent = text(period?.baseRatePercent);
    if (parseDate(start) === null || parseDate(end) === null || !PERCENT.test(baseRatePercent)) return null;
    clean.push({ start, end, baseRatePercent });
  }
  return clean;
}

function readBands(facts) {
  const bands = facts.get('fixed-sum-compensation')?.values?.bands;
  if (!Array.isArray(bands) || bands.length === 0) return null;
  const clean = [];
  for (const band of bands) {
    const amountMinorUnits = text(band?.amountMinorUnits);
    if (!WHOLE_MINOR_UNITS.test(amountMinorUnits)) return null;
    const upTo = band?.upToMinorUnits;
    if (upTo === null || upTo === undefined) {
      clean.push({ upToMinorUnits: null, amountMinorUnits });
      continue;
    }
    const upToMinorUnits = text(upTo);
    if (!WHOLE_MINOR_UNITS.test(upToMinorUnits)) return null;
    clean.push({ upToMinorUnits, amountMinorUnits });
  }
  return clean;
}

function readDayCount(conventions) {
  const value = Number(text(conventions.get('day-count-basis')?.value));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function indexById(entries) {
  return new Map(entries.map((entry) => [text(entry?.id), entry]));
}

/** Whether two or more entries share the same non-empty id. */
function hasDuplicateId(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const id = text(entry?.id);
    if (!id) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

/**
 * Check a snapshot end to end.
 *
 * One entry per problem code however many times it occurs: an operator fixing a
 * malformed file needs to know which kinds of thing are wrong, not how many.
 */
export function validateSnapshot(snapshot) {
  const problems = [];
  const add = (code) => {
    if (!problems.some((problem) => problem.code === code)) {
      problems.push({ code, summary: PROBLEMS[code] });
    }
  };
  const done = () => ({ usable: problems.length === 0, problems });

  if (snapshot === null || snapshot === undefined) {
    add('snapshot_missing');
    return done();
  }
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    add('snapshot_malformed');
    return done();
  }
  for (const key of ['sources', 'facts', 'conventions', 'citations']) {
    if (!Array.isArray(snapshot[key])) add('snapshot_malformed');
  }
  // Nothing below can be read from a snapshot missing its lists.
  if (problems.length > 0) return done();

  if (snapshot.snapshotVersion !== SNAPSHOT_VERSION) add('unsupported_version');
  if (parseInstant(snapshot.fetchedAt) === null || parseInstant(snapshot.nextRefreshDue) === null) {
    add('dates_unusable');
  }
  // A boolean or a number reads as a non-empty string once String() gets hold
  // of it, so only an actual string counts as a person's name here.
  const approvedByOk = typeof snapshot.approvedBy === 'string' && snapshot.approvedBy.trim().length > 0;
  if (!approvedByOk || parseInstant(snapshot.approvedAt) === null) add('not_approved');

  if (snapshot.sources.length === 0) add('snapshot_malformed');
  if (hasDuplicateId(snapshot.citations)) add('snapshot_malformed');
  if (hasDuplicateId(snapshot.facts)) add('snapshot_malformed');
  if (hasDuplicateId(snapshot.conventions)) add('snapshot_malformed');

  const citations = indexById(snapshot.citations);
  for (const citation of snapshot.citations) {
    if (!citation || typeof citation !== 'object' || !text(citation.id) || !text(citation.title)) {
      add('snapshot_malformed');
      continue;
    }
    if (!isAllowedSourceUrl(citation.url)) add('citation_source_not_allowlisted');
  }
  for (const source of snapshot.sources) {
    if (!source || typeof source !== 'object' || !isAllowedSourceUrl(source.url)) {
      add('citation_source_not_allowlisted');
      continue;
    }
    if (parseInstant(source.fetchedAt) === null) add('dates_unusable');
    if (source.status !== 'ok') add('snapshot_malformed');
  }

  const facts = indexById(snapshot.facts);
  for (const fact of snapshot.facts) {
    if (!fact || typeof fact !== 'object' || !text(fact.id)) {
      add('snapshot_malformed');
      continue;
    }
    if (!VOLATILITY.includes(fact.volatility) || !text(fact.statement)
      || !fact.values || typeof fact.values !== 'object' || Array.isArray(fact.values)) {
      add('fact_malformed');
    }
    if (parseDate(fact.asOf) === null) add('dates_unusable');
    if (!Array.isArray(fact.citationIds) || fact.citationIds.length === 0) add('fact_malformed');
    else for (const citationId of fact.citationIds) {
      if (!citations.has(text(citationId))) add('citation_unresolved');
    }
  }

  const conventions = indexById(snapshot.conventions);
  for (const convention of snapshot.conventions) {
    if (!convention || typeof convention !== 'object' || !text(convention.id) || !text(convention.statement)) {
      add('snapshot_malformed');
      continue;
    }
    if (Array.isArray(convention.citationIds) && convention.citationIds.length > 0) {
      add('convention_has_citation');
    }
  }

  for (const id of REQUIRED_FACTS) if (!facts.has(id)) add('fact_missing');
  for (const id of REQUIRED_CONVENTIONS) if (!conventions.has(id)) add('convention_missing');

  const margin = facts.has('statutory-interest-margin') ? readMargin(facts) : null;
  const periods = facts.has('statutory-interest-reference-rate') ? readPeriods(facts) : null;
  const bands = facts.has('fixed-sum-compensation') ? readBands(facts) : null;
  const dayCount = conventions.has('day-count-basis') ? readDayCount(conventions) : null;

  if (facts.has('statutory-interest-margin') && margin === null) add('fact_malformed');
  if (facts.has('statutory-interest-reference-rate') && periods === null) add('fact_malformed');
  if (facts.has('fixed-sum-compensation') && bands === null) add('fact_malformed');
  if (conventions.has('day-count-basis') && dayCount === null) add('convention_malformed');

  // Each field reads as individually well-shaped once it gets here, but the
  // calculator also rejects combinations no single field check can see: an
  // overlapping or backwards reference period, or bands out of order or
  // missing an open top band. Asking `calculate`'s own reader whether the
  // combination is usable is what keeps this file from ever drifting out of
  // step with what the calculator actually accepts.
  if (REQUIRED_FACTS.every((id) => facts.has(id)) && conventions.has('day-count-basis')
    && margin !== null && periods !== null && bands !== null && dayCount !== null) {
    const candidate = {
      asOf: REQUIRED_FACTS.map((id) => text(facts.get(id).asOf)).sort()[0],
      marginPercent: margin,
      dayCountBasis: dayCount,
      referencePeriods: periods,
      compensationBands: bands,
    };
    if (!isUsableLawInputs(candidate)) add('fact_malformed');
  }

  return done();
}

/**
 * The values the calculator consumes, or null when the snapshot may not be used.
 *
 * `asOf` is the oldest required fact's date: a snapshot is only as fresh as its
 * stalest fact, and the calculator's staleness gate should see that rather than
 * the newest one.
 */
export function toLawInputs(snapshot) {
  if (!validateSnapshot(snapshot).usable) return null;
  const facts = indexById(snapshot.facts);
  const conventions = indexById(snapshot.conventions);
  return {
    asOf: REQUIRED_FACTS.map((id) => text(facts.get(id).asOf)).sort()[0],
    marginPercent: readMargin(facts),
    dayCountBasis: readDayCount(conventions),
    referencePeriods: readPeriods(facts),
    compensationBands: readBands(facts),
  };
}
