import type { WorkBook } from 'xlsx';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'edital', label: 'Edital ou documento com regras do concurso' },
  { value: 'resultado-inicial', label: 'Lista de resultado inicial' },
  { value: 'resultado-etapa', label: 'Lista de resultado de etapa' },
  { value: 'recurso-retificado', label: 'Resultado de recurso ou resultado retificado' },
  { value: 'convocacao-matricula', label: 'Lista de convocação ou matrícula' },
  { value: 'historico-classificacao', label: 'Lista histórica de classificação' },
  { value: 'outro', label: 'Outro documento' },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPE_OPTIONS)[number]['value'];
export type CompetitionId = 'EPCAR' | 'AFA';
export type CsvDelimiterChoice = 'auto' | ';' | ',' | '\t' | '|';
export type CellValue = string | number | boolean | Date | null;

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface SpreadsheetSheet {
  name: string;
  rows: CellValue[][];
}

export interface PdfExtraction {
  kind: 'pdf';
  pageCount: number;
  pages: PdfPageText[];
  pagesWithoutText: number[];
}

export interface SpreadsheetExtraction {
  kind: 'spreadsheet';
  sheets: SpreadsheetSheet[];
}

export interface CsvExtraction {
  kind: 'csv';
  rows: string[][];
  delimiter: string;
  delimiterAmbiguous: boolean;
  encoding: string;
}

export type ExtractedContent = PdfExtraction | SpreadsheetExtraction | CsvExtraction;

export interface MetadataHints {
  competitionCandidates: CompetitionId[];
  editionCandidates: string[];
  documentTypeSuggestion: DocumentType | null;
  signalSources: string[];
}

export interface LocalReadResult {
  format: 'PDF' | 'Excel XLSX' | 'Excel XLS' | 'CSV';
  extracted: ExtractedContent;
  checksum: string | null;
  warnings: string[];
  metadata: MetadataHints;
}

export class LocalFileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalFileReadError';
  }
}

const DELIMITER_CANDIDATES = [';', ',', '\t', '|'] as const;

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function findPdfHeader(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  return prefix.includes('%PDF-');
}

function getContainerFormat(bytes: Uint8Array): 'pdf' | 'zip' | 'ole' | 'text' {
  if (findPdfHeader(bytes)) return 'pdf';
  if (
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return 'zip';
  }
  if (startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  return 'text';
}

function validateFileContainer(extension: string, bytes: Uint8Array): string | null {
  const container = getContainerFormat(bytes);

  if (extension === 'pdf') {
    return container === 'pdf'
      ? null
      : 'O arquivo tem extensão PDF, mas o conteúdo não parece ser um PDF válido.';
  }

  if (extension === 'csv') {
    if (container === 'pdf' || container === 'zip' || container === 'ole') {
      return 'O arquivo tem extensão CSV, mas o conteúdo parece ser outro formato.';
    }
    const isUtf16 = startsWithBytes(bytes, [0xff, 0xfe]) || startsWithBytes(bytes, [0xfe, 0xff]);
    if (!isUtf16 && bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0)) {
      return 'O arquivo parece conter dados binários, não texto CSV.';
    }
    return null;
  }

  if (extension === 'xls' || extension === 'xlsx') {
    return container === 'zip' || container === 'ole'
      ? null
      : 'O arquivo tem extensão de planilha, mas não foi reconhecido como XLS/XLSX.';
  }

  return 'Formato não aceito. Selecione um arquivo PDF, XLS, XLSX ou CSV.';
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectMetadata(fileName: string, sampleText: string): MetadataHints {
  const normalizedName = normalizeForSearch(fileName);
  const normalizedText = normalizeForSearch(sampleText.slice(0, 80_000));
  const combined = `${normalizedName}\n${normalizedText}`;
  const competitionCandidates: CompetitionId[] = [];
  const signalSources: string[] = [];
  const epcarPattern = /\b(?:epcar|ea\s*cpcar)\b|escola preparatoria de cadetes do ar/i;
  const afaPattern = /\bafa\b|academia da forca aerea/i;

  if (epcarPattern.test(combined)) competitionCandidates.push('EPCAR');
  if (afaPattern.test(combined)) competitionCandidates.push('AFA');
  if (epcarPattern.test(normalizedName) || afaPattern.test(normalizedName)) signalSources.push('nome do arquivo');
  if (epcarPattern.test(normalizedText) || afaPattern.test(normalizedText)) signalSources.push('conteúdo extraído');

  const editions = new Set<string>();
  const hasEditionContext = /epcar|cpcar|\bafa\b|edital|resultado|concurso|classificacao|convocacao|matricula|prova/i.test(normalizedName);
  if (hasEditionContext) {
    for (const match of normalizedName.matchAll(/\b(?:19|20)\d{2}\b/g)) editions.add(match[0]);
  }

  const lines = normalizedText.split(/\r?\n/);
  const editionAnchor = /edital|concurso.{0,25}admiss|exame.{0,25}admiss|processo seletivo|epcar|cpcar|\bafa\b|academia da forca aerea|escola preparatoria|resultado.{0,25}(?:inicial|final|etapa)/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (!editionAnchor.test(lines[index])) continue;
    const context = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join(' ');
    for (const match of context.matchAll(/\b(?:19|20)\d{2}\b/g)) editions.add(match[0]);
  }

  if (editions.size > 0 && /\b(?:19|20)\d{2}\b/.test(normalizedName)) signalSources.push('nome do arquivo');
  if (editions.size > 0 && lines.some((line) => editionAnchor.test(line))) signalSources.push('conteúdo extraído');

  const typeSource = normalizeForSearch(`${fileName}\n${sampleText.slice(0, 20_000)}`);
  let documentTypeSuggestion: DocumentType | null = null;
  if (/(resultado.{0,35}(?:recurso|retific)|recurso.{0,35}resultado|retificacao|retificado|apos recurso)/i.test(typeSource)) {
    documentTypeSuggestion = 'recurso-retificado';
  } else if (/\b(edital|instrucao especifica|regulamento do concurso)\b/i.test(typeSource)) {
    documentTypeSuggestion = 'edital';
  } else if (/(convocacao|matricula|incorporacao)/i.test(typeSource)) {
    documentTypeSuggestion = 'convocacao-matricula';
  } else if (/(historico.{0,30}classificacao|classificacao.{0,30}historica)/i.test(typeSource)) {
    documentTypeSuggestion = 'historico-classificacao';
  } else if (
    /(inspsau|tacf|eap|concentracao intermediaria|provas escritas)/i.test(typeSource)
    && /(resultado|apto|inapto|incapaz|ausente)/i.test(typeSource)
  ) {
    documentTypeSuggestion = 'resultado-etapa';
  } else if (
    /(resultado|classificacao)/i.test(typeSource)
    && /(resultado inicial|classificacao geral|lista de classificados|resultado final)/i.test(typeSource)
  ) {
    documentTypeSuggestion = 'resultado-inicial';
  }

  return {
    competitionCandidates,
    editionCandidates: [...editions].sort(),
    documentTypeSuggestion,
    signalSources: [...new Set(signalSources)],
  };
}

function makeSampleText(extracted: ExtractedContent): string {
  if (extracted.kind === 'pdf') {
    return extracted.pages.slice(0, 5).map((page) => page.text).join('\n');
  }

  if (extracted.kind === 'csv') {
    return extracted.rows.slice(0, 40).map((row) => row.join(' ')).join('\n');
  }

  return extracted.sheets
    .map((sheet) => sheet.rows.slice(0, 20).map((row) => row.map(String).join(' ')).join('\n'))
    .join('\n');
}

function decodeCsv(bytes: Uint8Array): { text: string; encoding: string; warning?: string } {
  if (startsWithBytes(bytes, [0xff, 0xfe])) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16 LE' };
  }
  if (startsWithBytes(bytes, [0xfe, 0xff])) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16 BE' };
  }

  const utf8Bytes = startsWithBytes(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(utf8Bytes),
      encoding: startsWithBytes(bytes, [0xef, 0xbb, 0xbf]) ? 'UTF-8 com BOM' : 'UTF-8',
    };
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(bytes),
      encoding: 'Windows-1252',
      warning: 'O arquivo não está em UTF-8 válido; a leitura tentou Windows-1252. Confira acentos e caracteres especiais.',
    };
  }
}

function parseCsvInternal(text: string, delimiter: string, allowUnclosedQuote: boolean): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let insideQuotes = false;
  let endedOnNewline = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (insideQuotes) {
        insideQuotes = false;
      } else if (field.length === 0) {
        insideQuotes = true;
      } else {
        field += character;
      }
      endedOnNewline = false;
      continue;
    }

    if (!insideQuotes && character === delimiter) {
      row.push(field);
      field = '';
      endedOnNewline = false;
      continue;
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      endedOnNewline = true;
      continue;
    }

    field += character;
    endedOnNewline = false;
  }

  if (insideQuotes && !allowUnclosedQuote) {
    throw new LocalFileReadError('O CSV contém uma aspa sem fechamento. Verifique o arquivo ou escolha o delimitador correto.');
  }
  if (!endedOnNewline || row.length > 0 || field.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string, delimiter: string): string[][] {
  return parseCsvInternal(text, delimiter, false);
}

export function detectCsvDelimiter(text: string): { delimiter: string; ambiguous: boolean } {
  const sample = text.slice(0, 100_000);
  const scores = DELIMITER_CANDIDATES.map((delimiter) => {
    const rows = parseCsvInternal(sample, delimiter, true).filter((row) => row.some((cell) => cell.trim() !== ''));
    if (rows.length === 0) return { delimiter, score: 0, uniformity: 0, width: 1 };
    const widths = rows.map((row) => row.length);
    const widthCounts = new Map<number, number>();
    for (const width of widths) widthCounts.set(width, (widthCounts.get(width) ?? 0) + 1);
    const uniformRows = Math.max(...widthCounts.values());
    const width = Math.max(...widths);
    const uniformity = uniformRows / rows.length;
    return { delimiter, score: width > 1 ? (width - 1) * uniformity : 0, uniformity, width };
  }).sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];
  const ambiguous = best.score === 0
    || best.uniformity < 0.7
    || second.score >= best.score * 0.9;
  return { delimiter: best.score > 0 ? best.delimiter : ';', ambiguous };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
}

async function checksum(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const stableBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(stableBuffer).set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', stableBuffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function assertNonEmptyCsv(rows: string[][]): void {
  if (rows.length === 0 || !rows.some((row) => row.some((cell) => cell.trim() !== ''))) {
    throw new LocalFileReadError('O arquivo CSV está vazio ou não contém dados legíveis.');
  }
}

function parseCsvBytes(bytes: Uint8Array): { extracted: CsvExtraction; warning?: string } {
  const decoded = decodeCsv(bytes);
  const detected = detectCsvDelimiter(decoded.text);
  const rows = parseCsv(decoded.text, detected.delimiter);
  assertNonEmptyCsv(rows);
  return {
    extracted: {
      kind: 'csv',
      rows,
      delimiter: detected.delimiter,
      delimiterAmbiguous: detected.ambiguous,
      encoding: decoded.encoding,
    },
    warning: decoded.warning,
  };
}

async function parsePdf(
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
  onProgress: (message: string) => void,
): Promise<PdfExtraction> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const cancel = () => { void task.destroy(); };
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    const document = await task.promise;
    if (document.numPages < 1) throw new LocalFileReadError('O PDF não contém páginas.');
    const pages: PdfPageText[] = [];
    const pagesWithoutText: number[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      assertNotAborted(signal);
      onProgress(`PDF: lendo página ${pageNumber} de ${document.numPages}`);
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          const value = item as { str?: unknown; hasEOL?: boolean };
          if (typeof value.str !== 'string') return '';
          return `${value.str}${value.hasEOL ? '\n' : ' '}`;
        })
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      if (!text) pagesWithoutText.push(pageNumber);
      pages.push({ pageNumber, text });
      page.cleanup();
    }

    return { kind: 'pdf', pageCount: pages.length, pages, pagesWithoutText };
  } finally {
    signal?.removeEventListener('abort', cancel);
    try {
      await task.destroy();
    } catch {
      // The task may already have been destroyed by cancellation.
    }
  }
}

async function parseSpreadsheet(bytes: Uint8Array): Promise<SpreadsheetExtraction> {
  const XLSX = await import('xlsx');
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true });
  } catch {
    throw new LocalFileReadError('Não foi possível abrir a planilha. O arquivo pode estar corrompido ou protegido.');
  }

  if (workbook.SheetNames.length === 0) {
    throw new LocalFileReadError('A planilha não contém abas legíveis.');
  }

  const sheets: SpreadsheetSheet[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: true,
    }) as CellValue[][];
    return { name, rows };
  });

  if (!sheets.some((sheet) => sheet.rows.some((row) => row.some((cell) => cell !== '' && cell !== null)))) {
    throw new LocalFileReadError('A planilha não contém células com dados.');
  }
  return { kind: 'spreadsheet', sheets };
}

export async function readLocalFile(
  file: File,
  signal?: AbortSignal,
  onProgress: (message: string) => void = () => undefined,
): Promise<LocalReadResult> {
  const extension = getExtension(file.name);
  if (!['pdf', 'xls', 'xlsx', 'csv'].includes(extension)) {
    throw new LocalFileReadError('Formato não aceito. Selecione um arquivo PDF, XLS, XLSX ou CSV.');
  }
  if (file.size === 0) throw new LocalFileReadError('O arquivo está vazio.');
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new LocalFileReadError('O arquivo excede o limite de 25 MB por arquivo.');
  }

  assertNotAborted(signal);
  onProgress('Lendo arquivo no navegador…');
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertNotAborted(signal);
  const validationError = validateFileContainer(extension, bytes);
  if (validationError) throw new LocalFileReadError(validationError);

  const warnings: string[] = [];
  const container = getContainerFormat(bytes);
  if ((extension === 'xls' && container === 'zip') || (extension === 'xlsx' && container === 'ole')) {
    warnings.push('A extensão e a assinatura do arquivo indicam variantes diferentes de Excel. A leitura foi tentada, mas confira os dados.');
  }

  const fileChecksum = await checksum(bytes);
  let extracted: ExtractedContent;

  if (extension === 'pdf') {
    extracted = await parsePdf(bytes, signal, onProgress);
  } else if (extension === 'csv') {
    const parsed = parseCsvBytes(bytes);
    extracted = parsed.extracted;
    if (parsed.warning) warnings.push(parsed.warning);
    if (parsed.extracted.delimiterAmbiguous) {
      warnings.push('O separador do CSV não pôde ser identificado com segurança. Confira ou escolha o delimitador na pré-visualização.');
    }
  } else {
    onProgress('Lendo planilhas localmente…');
    extracted = await parseSpreadsheet(bytes);
  }

  const sampleText = makeSampleText(extracted);
  return {
    format: extension === 'pdf' ? 'PDF' : extension === 'csv' ? 'CSV' : extension === 'xls' ? 'Excel XLS' : 'Excel XLSX',
    extracted,
    checksum: fileChecksum,
    warnings,
    metadata: detectMetadata(file.name, sampleText),
  };
}

export async function reparseCsvFile(
  file: File,
  choice: CsvDelimiterChoice,
): Promise<CsvExtraction> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validationError = validateFileContainer('csv', bytes);
  if (validationError) throw new LocalFileReadError(validationError);
  const decoded = decodeCsv(bytes);
  const detected = choice === 'auto' ? detectCsvDelimiter(decoded.text) : { delimiter: choice, ambiguous: false };
  const rows = parseCsv(decoded.text, detected.delimiter);
  assertNonEmptyCsv(rows);
  return {
    kind: 'csv',
    rows,
    delimiter: detected.delimiter,
    delimiterAmbiguous: detected.ambiguous,
    encoding: decoded.encoding,
  };
}

export function formatCell(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('pt-BR');
  }
  return String(value);
}

