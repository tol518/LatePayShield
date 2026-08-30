import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocumentText, MAX_DOCUMENT_BYTES } from './documentText.js';

function uploaded(name, type, bytes) {
  return { name, type, dataBase64: Buffer.from(bytes).toString('base64') };
}

function simplePdf(lines) {
  const escaped = lines.map((line) => String(line).replace(/([\\()])/g, '\\$1'));
  const commands = ['BT', '/F1 12 Tf', '72 720 Td'];
  escaped.forEach((line, index) => {
    if (index > 0) commands.push('0 -20 Td');
    commands.push(`(${line}) Tj`);
  });
  commands.push('ET');
  const stream = `${commands.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

test('extracts selectable text from a PDF invoice', async () => {
  const document = await extractDocumentText(uploaded(
    'invoice.pdf',
    'application/pdf',
    simplePdf(['Invoice No. INV-PDF-1', 'Total GBP 100.00']),
  ));
  assert.equal(document.format, 'PDF');
  assert.match(document.text, /INV-PDF-1/);
  assert.match(document.text, /Total GBP 100\.00/);
});

test('flattens ordinary XML into grounded, readable text', async () => {
  const xml = '<invoice><number>INV-XML-2</number><supplier>Northwind Ltd</supplier><total currency="GBP">125.00</total></invoice>';
  const document = await extractDocumentText(uploaded('invoice.xml', 'application/xml', xml));
  assert.equal(document.format, 'XML');
  assert.match(document.text, /invoice\.number: INV-XML-2/);
  assert.match(document.text, /invoice\.total: 125\.00/);
  assert.match(document.text, /@currency: GBP/);
});

test('recognises a namespace-qualified UBL invoice and keeps monetary attributes', async () => {
  const ubl = `<?xml version="1.0" encoding="UTF-8"?>
    <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
      xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
      <cbc:ID>INV-UBL-3</cbc:ID>
      <cbc:DueDate>2026-09-30</cbc:DueDate>
      <cbc:PayableAmount currencyID="GBP">2000.00</cbc:PayableAmount>
    </Invoice>`;
  const document = await extractDocumentText(uploaded('invoice.ubl', 'application/ubl+xml', ubl));
  assert.equal(document.format, 'UBL');
  assert.match(document.text, /Invoice\.ID: INV-UBL-3/);
  assert.match(document.text, /Invoice\.PayableAmount: 2000\.00/);
  assert.match(document.text, /@currencyID: GBP/);
});

test('rejects active XML declarations, unsupported files, and oversized input', async () => {
  await assert.rejects(
    extractDocumentText(uploaded('invoice.xml', 'application/xml', '<!DOCTYPE invoice [<!ENTITY x "value">]><invoice>&x;</invoice>')),
    /DTD or entity declarations/,
  );
  await assert.rejects(
    extractDocumentText(uploaded('invoice.txt', 'text/plain', 'Invoice INV-4')),
    /Unsupported document type/,
  );
  await assert.rejects(
    extractDocumentText(uploaded('large.xml', 'application/xml', Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 32))),
    /too large/,
  );
});

test('rejects image-only or malformed PDFs with a useful fallback', async () => {
  await assert.rejects(
    extractDocumentText(uploaded('scan.pdf', 'application/pdf', '%PDF-not-a-real-document')),
    /valid, searchable PDF/,
  );
});
