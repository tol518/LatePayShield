import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;

const PDF_TYPES = new Set(['application/pdf']);
const XML_TYPES = new Set([
  'application/xml',
  'text/xml',
  'application/ubl+xml',
]);
const XML_EXTENSIONS = new Set(['.xml', '.ubl']);
const MAX_XML_NODES = 50_000;

export class DocumentInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiInputError';
  }
}

function extensionOf(name) {
  const match = String(name ?? '').trim().toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? '';
}

function decodeBase64(value) {
  const encoded = String(value ?? '').replace(/\s/g, '');
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new DocumentInputError('The uploaded document could not be decoded. Choose the file again.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0) throw new DocumentInputError('The uploaded document is empty.');
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentInputError(`The uploaded document is too large. Choose a file no larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`);
  }
  return bytes;
}

function cleanExtractedText(value) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  let document;
  try {
    document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new DocumentInputError(`The PDF has too many pages. Choose a document with at most ${MAX_PDF_PAGES} pages.`);
    }

    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      const cleaned = cleanExtractedText(pageText);
      if (cleaned) pages.push(cleaned);
      page.cleanup();
    }

    const text = cleanExtractedText(pages.join('\n\n'));
    if (!text) {
      throw new DocumentInputError('No selectable text was found in this PDF. Use a searchable PDF or paste the invoice text.');
    }
    return text;
  } catch (error) {
    if (error?.name === 'AiInputError') throw error;
    if (error?.name === 'PasswordException') {
      throw new DocumentInputError('Password-protected PDFs are not supported. Remove the password or paste the invoice text.');
    }
    throw new DocumentInputError('The PDF could not be read. Check that it is a valid, searchable PDF.');
  } finally {
    if (document?.cleanup) await document.cleanup();
    await loadingTask.destroy();
  }
}

function flattenXml(value, path = [], output = [], state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > MAX_XML_NODES) {
    throw new DocumentInputError('The XML document is too complex to process safely.');
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenXml(entry, value.length > 1 ? [...path, String(index + 1)] : path, output, state));
    return output;
  }

  if (value !== null && typeof value === 'object') {
    const text = value['#text'];
    if (text !== undefined && String(text).trim()) output.push(`${path.join('.')}: ${String(text).trim()}`);

    for (const [key, child] of Object.entries(value)) {
      if (key === '#text') continue;
      if (key.startsWith('@_')) {
        output.push(`${path.join('.')} @${key.slice(2)}: ${String(child).trim()}`);
      } else {
        flattenXml(child, [...path, key], output, state);
      }
    }
    return output;
  }

  if (value !== undefined && value !== null && String(value).trim()) {
    output.push(`${path.join('.')}: ${String(value).trim()}`);
  }
  return output;
}

function extractXmlText(bytes) {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new DocumentInputError('XML documents with DTD or entity declarations are not supported.');
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new DocumentInputError('The XML or UBL document is not well formed.');

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
    trimValues: true,
  });
  const parsed = parser.parse(xml);
  const text = cleanExtractedText(flattenXml(parsed).join('\n'));
  if (!text) throw new DocumentInputError('No invoice text was found in the XML or UBL document.');
  const rootName = Object.keys(parsed).find((key) => !key.startsWith('?')) ?? '';
  const isUbl = /^(Invoice|CreditNote)$/.test(rootName)
    && /urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(xml);
  return { text, isUbl };
}

/**
 * Convert one explicitly uploaded, bounded invoice document into the same text
 * boundary used by pasted invoices. Files remain in memory for this request.
 */
export async function extractDocumentText(input) {
  if (!input || typeof input !== 'object') throw new DocumentInputError('Choose a PDF, XML, or UBL invoice.');
  const name = String(input.name ?? '').trim().slice(0, 180);
  const type = String(input.type ?? '').trim().toLowerCase().split(';')[0];
  const extension = extensionOf(name);
  const bytes = decodeBase64(input.dataBase64);

  const looksLikePdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPdf = extension === '.pdf' || PDF_TYPES.has(type);
  const isXml = XML_EXTENSIONS.has(extension) || XML_TYPES.has(type);

  if (isPdf) {
    if (!looksLikePdf) throw new DocumentInputError('The selected file is not a valid PDF.');
    return { text: await extractPdfText(bytes), name: name || 'invoice.pdf', format: 'PDF', size: bytes.length };
  }

  if (isXml) {
    if (looksLikePdf) throw new DocumentInputError('The document type does not match its contents.');
    let extracted;
    try {
      extracted = extractXmlText(bytes);
    } catch (error) {
      if (error?.name === 'AiInputError') throw error;
      throw new DocumentInputError('The XML or UBL document must use UTF-8 text.');
    }
    const ublRoot = extension === '.ubl' || type === 'application/ubl+xml' || extracted.isUbl;
    return {
      text: extracted.text,
      name: name || (ublRoot ? 'invoice.ubl' : 'invoice.xml'),
      format: ublRoot ? 'UBL' : 'XML',
      size: bytes.length,
    };
  }

  throw new DocumentInputError('Unsupported document type. Choose a PDF, XML, or UBL file.');
}
