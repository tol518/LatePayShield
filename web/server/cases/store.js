import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_OPERATOR_ID } from '../access.js';
import { answerProblem } from '../../shared/eligibility.js';
import { deliveryDecision } from '../../shared/escalation.js';

const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../../data/cases.sqlite', import.meta.url));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const CHANNELS = new Set(['email', 'letter', 'phone', 'meeting', 'note']);
const DIRECTIONS = new Set(['inbound', 'outbound', 'internal']);
const COMMUNICATION_AUTHORS = new Set(['human', 'local_llm']);
const DRAFT_PURPOSES = new Set(['payment_reminder']);
const DRAFT_AUTHORS = new Set(['human', 'local_llm']);
const REVIEW_ACTIONS = new Set(['approve', 'reject']);

export class CaseInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaseInputError';
  }
}

export class CaseStateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaseStateError';
  }
}

function requiredText(value, label, maxLength = 200) {
  const text = String(value ?? '').trim();
  if (!text) throw new CaseInputError(`${label} is required.`);
  if (text.length > maxLength) throw new CaseInputError(`${label} must be ${maxLength} characters or fewer.`);
  return text;
}

function optionalText(value, label, maxLength = 2_000) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw new CaseInputError(`${label} must be ${maxLength} characters or fewer.`);
  return text || null;
}

function validatedDate(value, label) {
  const date = requiredText(value, label, 10);
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new CaseInputError(`${label} must be a valid calendar date.`);
  }
  return date;
}

function validatedIsoInstant(value, label) {
  const text = requiredText(value, label, 40);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new CaseInputError(`${label} must be a valid date and time.`);
  return new Date(timestamp).toISOString();
}

function validateSourceQuotes(value) {
  if (value == null) return '{}';
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CaseInputError('Source quotes must be an object.');
  }

  const entries = Object.entries(value);
  if (entries.length > 12) throw new CaseInputError('Source quotes contain too many fields.');
  const clean = {};
  for (const [name, quote] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(name)) throw new CaseInputError('A source quote field name is invalid.');
    clean[name] = requiredText(quote, `Source quote ${name}`, 1_000);
  }
  const json = JSON.stringify(clean);
  if (json.length > 8_000) throw new CaseInputError('Source quotes are too large.');
  return json;
}

function validateCase(input) {
  if (input?.factsConfirmed !== true) {
    throw new CaseInputError('Confirm the case facts before saving them.');
  }
  const agreementId = Number(input.agreementId);
  if (!Number.isSafeInteger(agreementId) || agreementId <= 0) {
    throw new CaseInputError('A valid Coston2 agreement ID is required.');
  }

  const invoiceCurrency = optionalText(input.invoiceCurrency, 'Invoice currency', 3)?.toUpperCase() ?? null;
  if (invoiceCurrency && !CURRENCY.test(invoiceCurrency)) {
    throw new CaseInputError('Invoice currency must be a three-letter code.');
  }
  const invoiceAmountMinorUnits = optionalText(input.invoiceAmountMinorUnits, 'Invoice amount', 20);
  if (invoiceAmountMinorUnits && !/^\d+$/.test(invoiceAmountMinorUnits)) {
    throw new CaseInputError('Invoice amount must be whole minor units.');
  }
  const invoiceSourceSha256 = optionalText(input.invoiceSourceSha256, 'Invoice fingerprint', 64);
  if (invoiceSourceSha256 && !SHA256.test(invoiceSourceSha256)) {
    throw new CaseInputError('Invoice fingerprint must be a SHA-256 value.');
  }

  return {
    agreementId,
    invoiceNumber: requiredText(input.invoiceNumber, 'Invoice number'),
    supplierName: requiredText(input.supplierName, 'Supplier name'),
    payerName: requiredText(input.payerName, 'Payer name'),
    invoiceCurrency,
    invoiceAmountMinorUnits,
    invoiceDueDate: validatedDate(input.invoiceDueDate, 'Invoice due date'),
    paymentTermsText: optionalText(input.paymentTermsText, 'Payment terms'),
    invoiceSourceName: optionalText(input.invoiceSourceName, 'Invoice source name', 255),
    invoiceSourceSha256: invoiceSourceSha256?.toLowerCase() ?? null,
    sourceQuotesJson: validateSourceQuotes(input.sourceQuotes),
  };
}

/* A timeline entry the operator confirmed from a model proposal keeps the quote
 * it was grounded in, the fingerprint of the document it came from, and the
 * model that proposed it (D-014). A manually typed entry carries none of that
 * and is recorded as `human`, so the two are always distinguishable in the
 * case file. The confirming operator and time are recorded either way.
 */
function validateProvenance(input) {
  const authorType = requiredText(input.authorType ?? 'human', 'Timeline entry author', 20).toLowerCase();
  if (!COMMUNICATION_AUTHORS.has(authorType)) {
    throw new CaseInputError('Timeline entry author type is not supported.');
  }
  if (authorType === 'human') {
    return { authorType, sourceQuote: null, sourceSha256: null, modelName: null };
  }

  // A proposed entry without its grounding is not confirmable: the reviewer
  // would have nothing to check the summary against.
  const sourceQuote = requiredText(input.sourceQuote, 'Timeline entry source quote', 1_000);
  const sourceSha256 = requiredText(input.sourceSha256, 'Timeline entry source fingerprint', 64).toLowerCase();
  if (!SHA256.test(sourceSha256)) {
    throw new CaseInputError('Timeline entry source fingerprint must be a SHA-256 value.');
  }
  return {
    authorType,
    sourceQuote,
    sourceSha256,
    modelName: optionalText(input.modelName, 'Timeline entry model name', 200),
  };
}

function validateCommunication(input) {
  const channel = requiredText(input.channel, 'Communication channel', 20).toLowerCase();
  const direction = requiredText(input.direction, 'Communication direction', 20).toLowerCase();
  if (!CHANNELS.has(channel)) throw new CaseInputError('Communication channel is not supported.');
  if (!DIRECTIONS.has(direction)) throw new CaseInputError('Communication direction is not supported.');
  return {
    occurredAt: validatedIsoInstant(input.occurredAt, 'Communication date'),
    channel,
    direction,
    subject: optionalText(input.subject, 'Communication subject', 300),
    summary: requiredText(input.summary, 'Communication summary', 4_000),
    ...validateProvenance(input),
  };
}

function validatedVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new CaseInputError('A valid draft version is required. Reload the case and try again.');
  }
  return version;
}

function validateCitations(value) {
  if (value == null) return '[]';
  if (!Array.isArray(value) || value.length > 20) {
    throw new CaseInputError('Draft citations must be a list of no more than 20 sources.');
  }
  const citations = value.map((citation, index) => {
    if (!citation || typeof citation !== 'object' || Array.isArray(citation)) {
      throw new CaseInputError(`Draft citation ${index + 1} is invalid.`);
    }
    return {
      label: requiredText(citation.label, `Draft citation ${index + 1} label`, 300),
      sourceId: requiredText(citation.sourceId, `Draft citation ${index + 1} source ID`, 200),
      sourceVersion: requiredText(citation.sourceVersion, `Draft citation ${index + 1} source version`, 100),
    };
  });
  return JSON.stringify(citations);
}

function validateDraft(input, authorType = 'human') {
  const purpose = requiredText(input.purpose ?? 'payment_reminder', 'Draft purpose', 40).toLowerCase();
  if (!DRAFT_PURPOSES.has(purpose)) throw new CaseInputError('Draft purpose is not supported.');
  if (!DRAFT_AUTHORS.has(authorType)) throw new Error('Draft author type is not supported.');
  return {
    purpose,
    authorType,
    subject: requiredText(input.subject, 'Draft subject', 300),
    body: requiredText(input.body, 'Draft body', 10_000),
    citationsJson: validateCitations(input.citations),
  };
}

function validateReview(input) {
  const action = requiredText(input.action, 'Review action', 20).toLowerCase();
  if (!REVIEW_ACTIONS.has(action)) throw new CaseInputError('Review action must be approve or reject.');
  return {
    action,
    expectedVersion: validatedVersion(input.expectedVersion),
    note: optionalText(input.note, 'Review note', 1_000),
  };
}

function requiredOwnerId(ownerId) {
  const value = String(ownerId ?? '').trim();
  // A missing owner is a programming error, not user input: no caller may read
  // or write case rows without an authorization decision having been made.
  if (!value) throw new Error('An authorized operator ID is required for every case-file operation.');
  return value;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapCommunication(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    occurredAt: row.occurred_at,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    summary: row.summary,
    createdAt: row.created_at,
    // Provenance, so the case file can always show whether a person typed this
    // entry or confirmed a model proposal, and what that proposal was grounded
    // in. A row written before provenance existed reads as a human entry.
    authorType: row.author_type ?? 'human',
    sourceQuote: row.source_quote ?? null,
    sourceSha256: row.source_sha256 ?? null,
    modelName: row.model_name ?? null,
    confirmedBy: row.confirmed_by ?? null,
    confirmedAt: row.confirmed_at ?? null,
  };
}

function mapAuditEvent(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    draftId: row.draft_id,
    operatorId: row.operator_id,
    eventType: row.event_type,
    draftVersion: row.draft_version,
    details: parseJsonObject(row.details_json),
    createdAt: row.created_at,
  };
}

function mapDraft(row, auditEvents = undefined) {
  const result = {
    id: row.id,
    caseId: row.case_id,
    purpose: row.purpose,
    authorType: row.author_type,
    subject: row.subject,
    body: row.body,
    citations: JSON.parse(row.citations_json || '[]'),
    status: row.status,
    version: row.version,
    approvedVersion: row.approved_version,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (auditEvents) result.auditEvents = auditEvents;
  return result;
}

function mapCase(row, communications = undefined, drafts = undefined, eligibility = undefined) {
  const result = {
    id: row.id,
    ownerId: row.owner_id,
    agreementId: row.agreement_id,
    invoiceNumber: row.invoice_number,
    supplierName: row.supplier_name,
    payerName: row.payer_name,
    invoiceCurrency: row.invoice_currency,
    invoiceAmountMinorUnits: row.invoice_amount_minor_units,
    invoiceDueDate: row.invoice_due_date,
    paymentTermsText: row.payment_terms_text,
    invoiceSourceName: row.invoice_source_name,
    invoiceSourceSha256: row.invoice_source_sha256,
    sourceQuotes: parseJsonObject(row.source_quotes_json),
    factsConfirmedAt: row.facts_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    communicationCount: Number(row.communication_count ?? communications?.length ?? 0),
    draftCount: Number(row.draft_count ?? drafts?.length ?? 0),
  };
  if (communications) result.communications = communications;
  if (drafts) result.drafts = drafts;
  // Only the detail read carries eligibility, and it carries answers only: the
  // outcome is a function of the current rules and a live agreement read, so
  // storing one would let a rules change leave a stale verdict behind.
  if (communications) {
    result.eligibility = eligibility
      ? { answers: parseJsonObject(eligibility.answers_json), assessedAt: eligibility.assessed_at }
      : null;
  }
  return result;
}

export class CaseStore {
  constructor({ databasePath = DEFAULT_DATABASE_PATH, highValueThresholdMinorUnits = null } = {}) {
    // Held on the store so the delivery gate and the panel can be configured
    // from one value; an unusable one falls back to the documented default.
    this.highValueThresholdMinorUnits = highValueThresholdMinorUnits;
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON');
    if (databasePath !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS case_files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL DEFAULT '${DEFAULT_OPERATOR_ID}',
        agreement_id INTEGER NOT NULL UNIQUE,
        invoice_number TEXT NOT NULL,
        supplier_name TEXT NOT NULL,
        payer_name TEXT NOT NULL,
        invoice_currency TEXT,
        invoice_amount_minor_units TEXT,
        invoice_due_date TEXT NOT NULL,
        payment_terms_text TEXT,
        invoice_source_name TEXT,
        invoice_source_sha256 TEXT,
        source_quotes_json TEXT NOT NULL DEFAULT '{}',
        facts_confirmed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS case_communications (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES case_files(id) ON DELETE CASCADE,
        occurred_at TEXT NOT NULL,
        channel TEXT NOT NULL,
        direction TEXT NOT NULL,
        subject TEXT,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        author_type TEXT NOT NULL DEFAULT 'human',
        source_quote TEXT,
        source_sha256 TEXT,
        model_name TEXT,
        confirmed_by TEXT,
        confirmed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS case_communications_case_date
        ON case_communications(case_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS case_eligibility (
        case_id TEXT PRIMARY KEY REFERENCES case_files(id) ON DELETE CASCADE,
        answers_json TEXT NOT NULL,
        assessed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS case_message_drafts (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES case_files(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        author_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        citations_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        approved_version INTEGER,
        approved_at TEXT,
        rejected_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS case_draft_audit_events (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES case_files(id) ON DELETE CASCADE,
        draft_id TEXT NOT NULL REFERENCES case_message_drafts(id) ON DELETE CASCADE,
        operator_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        draft_version INTEGER NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS case_message_drafts_case_date
        ON case_message_drafts(case_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS case_draft_audit_date
        ON case_draft_audit_events(draft_id, created_at ASC);
    `);
    this.#addOwnerColumn();
    this.#addCommunicationProvenanceColumns();
    this.database.exec('CREATE INDEX IF NOT EXISTS case_files_owner ON case_files(owner_id, updated_at DESC)');
  }

  // A database written before ownership existed keeps its rows, assigned to the
  // default local operator, rather than becoming unreadable.
  #addOwnerColumn() {
    const columns = this.database.prepare('PRAGMA table_info(case_files)').all();
    if (columns.some((column) => column.name === 'owner_id')) return;
    this.database.exec(`ALTER TABLE case_files ADD COLUMN owner_id TEXT NOT NULL DEFAULT '${DEFAULT_OPERATOR_ID}'`);
  }

  // Likewise for timeline provenance: an existing note keeps its content and
  // reads as the human entry it was, rather than being lost or relabelled.
  #addCommunicationProvenanceColumns() {
    const existing = new Set(
      this.database.prepare('PRAGMA table_info(case_communications)').all().map((column) => column.name),
    );
    const additions = [
      ["author_type", "TEXT NOT NULL DEFAULT 'human'"],
      ['source_quote', 'TEXT'],
      ['source_sha256', 'TEXT'],
      ['model_name', 'TEXT'],
      ['confirmed_by', 'TEXT'],
      ['confirmed_at', 'TEXT'],
    ];
    for (const [name, definition] of additions) {
      if (!existing.has(name)) {
        this.database.exec(`ALTER TABLE case_communications ADD COLUMN ${name} ${definition}`);
      }
    }
  }

  close() {
    this.database.close();
  }

  listCases(ownerId) {
    const owner = requiredOwnerId(ownerId);
    const rows = this.database.prepare(`
      SELECT case_files.*,
        (SELECT COUNT(*) FROM case_communications WHERE case_id = case_files.id) AS communication_count,
        (SELECT COUNT(*) FROM case_message_drafts WHERE case_id = case_files.id) AS draft_count
      FROM case_files
      WHERE case_files.owner_id = ?
      ORDER BY case_files.updated_at DESC
    `).all(owner);
    return rows.map((row) => mapCase(row));
  }

  getCase(id, ownerId) {
    const owner = requiredOwnerId(ownerId);
    const row = this.database.prepare(`
      SELECT case_files.*,
        (SELECT COUNT(*) FROM case_communications WHERE case_id = case_files.id) AS communication_count,
        (SELECT COUNT(*) FROM case_message_drafts WHERE case_id = case_files.id) AS draft_count
      FROM case_files
      WHERE case_files.id = ? AND case_files.owner_id = ?
    `).get(id, owner);
    if (!row) return null;
    const communications = this.database.prepare(`
      SELECT * FROM case_communications WHERE case_id = ? ORDER BY occurred_at DESC, created_at DESC
    `).all(id).map(mapCommunication);
    const eligibility = this.database.prepare(
      'SELECT answers_json, assessed_at FROM case_eligibility WHERE case_id = ?',
    ).get(id);
    const auditRows = this.database.prepare(`
      SELECT * FROM case_draft_audit_events WHERE case_id = ? ORDER BY created_at ASC, rowid ASC
    `).all(id);
    const auditByDraft = new Map();
    for (const auditRow of auditRows) {
      const events = auditByDraft.get(auditRow.draft_id) ?? [];
      events.push(mapAuditEvent(auditRow));
      auditByDraft.set(auditRow.draft_id, events);
    }
    const drafts = this.database.prepare(`
      SELECT * FROM case_message_drafts WHERE case_id = ? ORDER BY updated_at DESC, rowid DESC
    `).all(id).map((draft) => mapDraft(draft, auditByDraft.get(draft.id) ?? []));
    return mapCase(row, communications, drafts, eligibility);
  }

  createCase(input, ownerId) {
    const owner = requiredOwnerId(ownerId);
    const value = validateCase(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      this.database.prepare(`
        INSERT INTO case_files (
          id, owner_id, agreement_id, invoice_number, supplier_name, payer_name,
          invoice_currency, invoice_amount_minor_units, invoice_due_date,
          payment_terms_text, invoice_source_name, invoice_source_sha256,
          source_quotes_json, facts_confirmed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, owner, value.agreementId, value.invoiceNumber, value.supplierName, value.payerName,
        value.invoiceCurrency, value.invoiceAmountMinorUnits, value.invoiceDueDate,
        value.paymentTermsText, value.invoiceSourceName, value.invoiceSourceSha256,
        value.sourceQuotesJson, now, now, now,
      );
    } catch (error) {
      if (String(error?.message).includes('UNIQUE constraint failed')) {
        throw new CaseInputError(`Agreement #${value.agreementId} already has a case file.`);
      }
      throw error;
    }
    return this.getCase(id, owner);
  }

  addCommunication(caseId, input, ownerId) {
    const owner = requiredOwnerId(ownerId);
    if (!this.getCase(caseId, owner)) return null;
    const value = validateCommunication(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO case_communications (
        id, case_id, occurred_at, channel, direction, subject, summary, created_at,
        author_type, source_quote, source_sha256, model_name, confirmed_by, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, caseId, value.occurredAt, value.channel, value.direction, value.subject, value.summary, now,
      // Every row records who confirmed it and when, whether it was typed or
      // accepted from a proposal. Confirmation is the write: there is no path
      // that stores an unconfirmed proposal.
      value.authorType, value.sourceQuote, value.sourceSha256, value.modelName, owner, now,
    );
    this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
    return this.getCase(caseId, owner);
  }

  saveEligibility(caseId, answers, ownerId) {
    const owner = requiredOwnerId(ownerId);
    if (!this.getCase(caseId, owner)) return null;
    const problem = answerProblem(answers);
    if (problem) throw new CaseInputError(problem);
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO case_eligibility (case_id, answers_json, assessed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE
        SET answers_json = excluded.answers_json, assessed_at = excluded.assessed_at
    `).run(caseId, JSON.stringify(answers), now);
    this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
    return this.getCase(caseId, owner);
  }

  #ownedCaseExists(caseId, ownerId) {
    return Boolean(this.database.prepare('SELECT 1 FROM case_files WHERE id = ? AND owner_id = ?').get(caseId, ownerId));
  }

  #ownedDraft(caseId, draftId, ownerId) {
    return this.database.prepare(`
      SELECT case_message_drafts.*
      FROM case_message_drafts
      JOIN case_files ON case_files.id = case_message_drafts.case_id
      WHERE case_message_drafts.id = ? AND case_message_drafts.case_id = ? AND case_files.owner_id = ?
    `).get(draftId, caseId, ownerId) ?? null;
  }

  #appendAudit({ caseId, draftId, ownerId, eventType, draftVersion, details = {}, createdAt }) {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO case_draft_audit_events (
        id, case_id, draft_id, operator_id, event_type, draft_version, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, caseId, draftId, ownerId, eventType, draftVersion, JSON.stringify(details), createdAt);
    return id;
  }

  createDraft(caseId, input, ownerId, { authorType = 'human' } = {}) {
    const owner = requiredOwnerId(ownerId);
    if (!this.#ownedCaseExists(caseId, owner)) return null;
    const value = validateDraft(input, authorType);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO case_message_drafts (
          id, case_id, purpose, author_type, subject, body, citations_json,
          status, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
      `).run(id, caseId, value.purpose, value.authorType, value.subject, value.body, value.citationsJson, now, now);
      this.#appendAudit({
        caseId, draftId: id, ownerId: owner, eventType: 'draft_created', draftVersion: 1,
        details: { authorType: value.authorType, purpose: value.purpose }, createdAt: now,
      });
      this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.getCase(caseId, owner);
  }

  updateDraft(caseId, draftId, input, ownerId) {
    const owner = requiredOwnerId(ownerId);
    const current = this.#ownedDraft(caseId, draftId, owner);
    if (!current) return null;
    const expectedVersion = validatedVersion(input.expectedVersion);
    if (current.version !== expectedVersion) {
      throw new CaseStateError('This draft changed after it was opened. Reload the case before editing it.');
    }
    const value = validateDraft({
      purpose: input.purpose ?? current.purpose,
      subject: input.subject ?? current.subject,
      body: input.body ?? current.body,
      citations: input.citations ?? JSON.parse(current.citations_json || '[]'),
    }, current.author_type);
    const nextVersion = current.version + 1;
    const now = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        UPDATE case_message_drafts
        SET purpose = ?, subject = ?, body = ?, citations_json = ?, status = 'draft',
            version = ?, approved_version = NULL, approved_at = NULL, rejected_at = NULL, updated_at = ?
        WHERE id = ? AND case_id = ?
      `).run(value.purpose, value.subject, value.body, value.citationsJson, nextVersion, now, draftId, caseId);
      this.#appendAudit({
        caseId, draftId, ownerId: owner, eventType: 'draft_updated', draftVersion: nextVersion,
        details: { approvalInvalidated: current.status === 'approved' }, createdAt: now,
      });
      this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.getCase(caseId, owner);
  }

  reviewDraft(caseId, draftId, input, ownerId) {
    const owner = requiredOwnerId(ownerId);
    const current = this.#ownedDraft(caseId, draftId, owner);
    if (!current) return null;
    const value = validateReview(input);
    if (current.version !== value.expectedVersion) {
      throw new CaseStateError('This draft changed after it was opened. Reload the case before reviewing it.');
    }
    const now = new Date().toISOString();
    const approved = value.action === 'approve';
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        UPDATE case_message_drafts
        SET status = ?, approved_version = ?, approved_at = ?, rejected_at = ?, updated_at = ?
        WHERE id = ? AND case_id = ?
      `).run(approved ? 'approved' : 'rejected', approved ? current.version : null,
        approved ? now : null, approved ? null : now, now, draftId, caseId);
      this.#appendAudit({
        caseId, draftId, ownerId: owner, eventType: approved ? 'draft_approved' : 'draft_rejected',
        draftVersion: current.version, details: value.note ? { note: value.note } : {}, createdAt: now,
      });
      this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.getCase(caseId, owner);
  }

  /* Task 8. Read the stored answers and the case's own facts, and decide
   * whether this case may be handled automatically at all. Deliberately
   * evaluated here rather than in the browser: a delivery block a caller can
   * skip is not a block. It reads no chain and no clock, so it reaches the same
   * verdict when Coston2 is unreachable. */
  #deliveryDecision(caseId) {
    const row = this.database.prepare(
      'SELECT answers_json FROM case_eligibility WHERE case_id = ?',
    ).get(caseId);
    const facts = this.database.prepare(
      'SELECT invoice_amount_minor_units, invoice_currency FROM case_files WHERE id = ?',
    ).get(caseId);
    return deliveryDecision(row ? parseJsonObject(row.answers_json) : null, {
      invoiceAmountMinorUnits: facts?.invoice_amount_minor_units,
      invoiceCurrency: facts?.invoice_currency,
      highValueThresholdMinorUnits: this.highValueThresholdMinorUnits,
    });
  }

  /** The current routing decision for a case, for display. */
  deliveryDecisionFor(caseId, ownerId) {
    const owner = requiredOwnerId(ownerId);
    if (!this.#ownedCaseExists(caseId, owner)) return null;
    return this.#deliveryDecision(caseId);
  }

  authorizeDraftSend(caseId, draftId, input, ownerId) {
    const owner = requiredOwnerId(ownerId);
    const current = this.#ownedDraft(caseId, draftId, owner);
    if (!current) return null;
    const expectedVersion = validatedVersion(input.expectedVersion);
    const now = new Date().toISOString();

    /* Escalation is checked before approval, because an approved draft on an
     * escalated case must still not reach a transport. Approving is a statement
     * about the wording; this is a statement about the case. */
    const routing = this.#deliveryDecision(caseId);
    if (!routing.allowed) {
      this.#appendAudit({
        caseId, draftId, ownerId: owner, eventType: 'send_blocked', draftVersion: current.version,
        details: { reason: 'escalation_required', route: routing.route, codes: routing.codes },
        createdAt: now,
      });
      throw new CaseStateError(routing.summary);
    }

    const currentApproval = current.status === 'approved' && current.approved_version === current.version;
    if (current.version !== expectedVersion || !currentApproval) {
      this.#appendAudit({
        caseId, draftId, ownerId: owner, eventType: 'send_blocked', draftVersion: current.version,
        details: { reason: current.version !== expectedVersion ? 'stale_version' : 'not_approved' }, createdAt: now,
      });
      throw new CaseStateError(current.version !== expectedVersion
        ? 'This draft changed after it was opened. Reload the case before requesting a send authorization.'
        : 'This exact draft version must be approved before it can be handed to a delivery service.');
    }
    const authorizationId = this.#appendAudit({
      caseId, draftId, ownerId: owner, eventType: 'send_authorized', draftVersion: current.version,
      details: { transport: 'not_connected' }, createdAt: now,
    });
    return {
      authorizationId,
      caseId,
      draftId,
      version: current.version,
      subject: current.subject,
      body: current.body,
      authorizedAt: now,
      transport: 'not_connected',
      sent: false,
    };
  }
}
