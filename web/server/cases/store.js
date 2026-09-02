import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_OPERATOR_ID } from '../access.js';

const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../../data/cases.sqlite', import.meta.url));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const CHANNELS = new Set(['email', 'letter', 'phone', 'meeting', 'note']);
const DIRECTIONS = new Set(['inbound', 'outbound', 'internal']);

export class CaseInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaseInputError';
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
  };
}

function mapCase(row, communications = undefined) {
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
  };
  if (communications) result.communications = communications;
  return result;
}

export class CaseStore {
  constructor({ databasePath = DEFAULT_DATABASE_PATH } = {}) {
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
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS case_communications_case_date
        ON case_communications(case_id, occurred_at DESC);
    `);
    this.#addOwnerColumn();
    this.database.exec('CREATE INDEX IF NOT EXISTS case_files_owner ON case_files(owner_id, updated_at DESC)');
  }

  // A database written before ownership existed keeps its rows, assigned to the
  // default local operator, rather than becoming unreadable.
  #addOwnerColumn() {
    const columns = this.database.prepare('PRAGMA table_info(case_files)').all();
    if (columns.some((column) => column.name === 'owner_id')) return;
    this.database.exec(`ALTER TABLE case_files ADD COLUMN owner_id TEXT NOT NULL DEFAULT '${DEFAULT_OPERATOR_ID}'`);
  }

  close() {
    this.database.close();
  }

  listCases(ownerId) {
    const owner = requiredOwnerId(ownerId);
    const rows = this.database.prepare(`
      SELECT case_files.*, COUNT(case_communications.id) AS communication_count
      FROM case_files
      LEFT JOIN case_communications ON case_communications.case_id = case_files.id
      WHERE case_files.owner_id = ?
      GROUP BY case_files.id
      ORDER BY case_files.updated_at DESC
    `).all(owner);
    return rows.map((row) => mapCase(row));
  }

  getCase(id, ownerId) {
    const owner = requiredOwnerId(ownerId);
    const row = this.database.prepare(`
      SELECT case_files.*, COUNT(case_communications.id) AS communication_count
      FROM case_files
      LEFT JOIN case_communications ON case_communications.case_id = case_files.id
      WHERE case_files.id = ? AND case_files.owner_id = ?
      GROUP BY case_files.id
    `).get(id, owner);
    if (!row) return null;
    const communications = this.database.prepare(`
      SELECT * FROM case_communications WHERE case_id = ? ORDER BY occurred_at DESC, created_at DESC
    `).all(id).map(mapCommunication);
    return mapCase(row, communications);
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
        id, case_id, occurred_at, channel, direction, subject, summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, caseId, value.occurredAt, value.channel, value.direction, value.subject, value.summary, now);
    this.database.prepare('UPDATE case_files SET updated_at = ? WHERE id = ? AND owner_id = ?').run(now, caseId, owner);
    return this.getCase(caseId, owner);
  }
}
