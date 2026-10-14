export interface PdfPageText {
  pageNumber: number;
  text: string;
  lines: PdfTextLine[];
}

export interface PdfTextLine {
  text: string;
  cells: string[];
}

export type PdfQualityLevel = 'consistent' | 'caution' | 'insufficient' | 'indeterminate';

export interface PdfQualityReport {
  level: PdfQualityLevel;
  pageTextCoverage: number;
  recognizedHeader: boolean;
  structuredRows: number;
  expectedFields: number | null;
  fieldCountConsistency: number | null;
  incompleteLines: number;
  possibleShiftedLines: number;
  reasons: string[];
}

export interface PdfExtraction {
  kind: 'pdf';
  pageCount: number;
  pages: PdfPageText[];
  pagesWithoutText: number[];
  quality: PdfQualityReport;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup(): unknown;
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
  destroy(): Promise<unknown>;
}

export interface PdfJsEngine {
  getDocument(options: {
    data: Uint8Array;
    useSystemFonts: boolean;
  }): PdfJsLoadingTask;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
}

interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hasEOL: boolean;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getHeaderCategories(text: string): Set<string> {
  const value = normalizeText(text);
  const categories = new Set<string>();
  if (/\b(nome|candidato|candidata|inscrito|participante)\b/.test(value)) categories.add('identity');
  if (/\b(inscricao|matricula|identificacao|codigo)\b/.test(value)) categories.add('identifier');
  if (/\b(nota|media|pontos|pontuacao)\b/.test(value)) categories.add('score');
  if (/\b(classificacao|posicao|situacao|resultado|ordem)\b/.test(value)) categories.add('result');
  return categories;
}

function isRecognizedHeader(line: PdfTextLine): boolean {
  return getHeaderCategories(line.text).size >= 2;
}

function makePdfLines(items: unknown[]): PdfTextLine[] {
  const positioned: PositionedTextItem[] = [];
  const unpositioned: Array<{ text: string; hasEOL: boolean }> = [];

  for (const item of items) {
    const value = item as {
      str?: unknown;
      hasEOL?: unknown;
      transform?: unknown;
      width?: unknown;
      height?: unknown;
    };
    if (typeof value.str !== 'string' || value.str.trim() === '') continue;
    const hasEOL = value.hasEOL === true;
    const transform = Array.isArray(value.transform) ? value.transform : null;
    if (
      transform
      && transform.length >= 6
      && transform.slice(0, 6).every((part) => typeof part === 'number' && Number.isFinite(part))
    ) {
      const a = transform[0] as number;
      const b = transform[1] as number;
      const c = transform[2] as number;
      const d = transform[3] as number;
      const fontSize = Math.max(
        1,
        Math.hypot(a, b),
        Math.hypot(c, d),
        typeof value.height === 'number' && Number.isFinite(value.height) ? value.height : 0,
      );
      positioned.push({
        text: value.str,
        x: transform[4] as number,
        y: transform[5] as number,
        width: typeof value.width === 'number' && Number.isFinite(value.width) ? value.width : 0,
        fontSize,
        hasEOL,
      });
    } else {
      unpositioned.push({ text: value.str, hasEOL });
    }
  }

  if (positioned.length === 0) {
    const lines: PdfTextLine[] = [];
    let current = '';
    for (const item of unpositioned) {
      current += `${current ? ' ' : ''}${item.text}`;
      if (item.hasEOL) {
        const text = current.trim();
        if (text) lines.push({ text, cells: [text] });
        current = '';
      }
    }
    if (current.trim()) lines.push({ text: current.trim(), cells: [current.trim()] });
    return lines;
  }

  const sorted = positioned.sort((left, right) => right.y - left.y || left.x - right.x);
  const groups: Array<{ y: number; items: PositionedTextItem[] }> = [];
  for (const item of sorted) {
    const current = groups.at(-1);
    const tolerance = Math.max(1.5, Math.min(5, item.fontSize * 0.35));
    if (current && Math.abs(current.y - item.y) <= tolerance) {
      current.items.push(item);
      current.y = current.items.reduce((total, entry) => total + entry.y, 0) / current.items.length;
    } else {
      groups.push({ y: item.y, items: [item] });
    }
  }

  const lines: PdfTextLine[] = groups.map((group) => {
    const rowItems = group.items.sort((left, right) => left.x - right.x);
    const cells: string[] = [];
    let lastItem: PositionedTextItem | undefined;
    for (const item of rowItems) {
      const gap = lastItem ? item.x - (lastItem.x + lastItem.width) : 0;
      const threshold = Math.max(4, item.fontSize * 1.1);
      if (cells.length === 0 || gap > threshold) {
        cells.push(item.text.trim());
      } else {
        cells[cells.length - 1] = `${cells[cells.length - 1]} ${item.text.trim()}`.trim();
      }
      lastItem = item;
    }
    return { text: cells.join('  '), cells };
  });

  if (unpositioned.length > 0) {
    let current = '';
    for (const item of unpositioned) {
      current += `${current ? ' ' : ''}${item.text}`;
      if (item.hasEOL) {
        if (current.trim()) lines.push({ text: current.trim(), cells: [current.trim()] });
        current = '';
      }
    }
    if (current.trim()) lines.push({ text: current.trim(), cells: [current.trim()] });
  }

  return lines;
}

export function assessPdfQuality(
  pages: PdfPageText[],
  pagesWithoutText: number[],
): PdfQualityReport {
  const pageCount = pages.length;
  const textPages = pageCount - pagesWithoutText.length;
  const pageTextCoverage = pageCount > 0 ? textPages / pageCount : 0;
  const allLines = pages.flatMap((page) => page.lines);
  const headers = allLines.filter(isRecognizedHeader);
  const dataLines = allLines.filter((line) => line.cells.length >= 2 && !isRecognizedHeader(line));
  const fieldCounts = new Map<number, number>();
  for (const line of dataLines) fieldCounts.set(line.cells.length, (fieldCounts.get(line.cells.length) ?? 0) + 1);
  const expectedFields = [...fieldCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;
  const expectedCount = expectedFields === null ? 0 : fieldCounts.get(expectedFields) ?? 0;
  const fieldCountConsistency = dataLines.length > 0 ? expectedCount / dataLines.length : null;
  const incompleteLines = expectedFields === null
    ? 0
    : dataLines.filter((line) => line.cells.length < expectedFields).length;
  const possibleShiftedLines = expectedFields === null
    ? 0
    : dataLines.filter((line) => line.cells.length > expectedFields).length;
  const textLength = pages.reduce((total, page) => total + page.text.trim().length, 0);
  const reasons: string[] = [];
  let level: PdfQualityLevel;

  if (textLength === 0 || (pageCount > 0 && pagesWithoutText.length === pageCount)) {
    level = 'insufficient';
    reasons.push('Não foi extraído texto selecionável; pode ser um PDF digitalizado.');
  } else if (textLength < 40) {
    level = 'insufficient';
    reasons.push('O texto extraído é curto demais para avaliar a estrutura da tabela.');
  } else {
    if (pagesWithoutText.length > 0) {
      reasons.push(`Há página(s) sem texto selecionável: ${pagesWithoutText.join(', ')}.`);
    }
    if (headers.length === 0) reasons.push('Não foi reconhecido um cabeçalho com campos identificáveis.');
    if (dataLines.length < 3) reasons.push('Há poucas linhas com separação espacial de campos para comparar.');
    if (incompleteLines > 0) reasons.push(`${incompleteLines} linha(s) têm menos campos que o padrão observado.`);
    if (possibleShiftedLines > 0) reasons.push(`${possibleShiftedLines} linha(s) têm campos além do padrão observado.`);

    const layoutLooksInconsistent = dataLines.length >= 3
      && ((fieldCountConsistency ?? 0) < 0.85 || incompleteLines > 0 || possibleShiftedLines > 0);
    if (pagesWithoutText.length > 0 || layoutLooksInconsistent) {
      level = 'caution';
    } else if (headers.length > 0 && dataLines.length >= 3 && (fieldCountConsistency ?? 0) >= 0.85) {
      level = 'consistent';
      reasons.push('Cabeçalho, linhas e quantidades de campos parecem compatíveis; ainda é necessário conferir o documento.');
    } else {
      level = 'indeterminate';
    }
  }

  if (level === 'insufficient') {
    reasons.push('A conversão para planilha não recupera texto ou células que não foram extraídos.');
  } else if (level === 'caution' || level === 'indeterminate') {
    reasons.push('Prefira a planilha original XLS/XLSX, se disponível. Uma conversão automática ainda não é oferecida porque poderia apresentar campos inferidos como se fossem originais.');
  }

  return {
    level,
    pageTextCoverage,
    recognizedHeader: headers.length > 0,
    structuredRows: dataLines.length,
    expectedFields,
    fieldCountConsistency,
    incompleteLines,
    possibleShiftedLines,
    reasons,
  };
}

export async function extractPdfPages(
  bytes: Uint8Array,
  pdfjs: PdfJsEngine,
  signal?: AbortSignal,
  onProgress: (message: string) => void = () => undefined,
): Promise<PdfExtraction> {
  assertNotAborted(signal);
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const cancel = () => { void task.destroy(); };
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    const document = await task.promise;
    if (document.numPages < 1) throw new Error('O PDF não contém páginas.');
    const pages: PdfPageText[] = [];
    const pagesWithoutText: number[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      assertNotAborted(signal);
      onProgress(`PDF: lendo página ${pageNumber} de ${document.numPages}`);
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = makePdfLines(content.items);
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
      pages.push({ pageNumber, text, lines });
      page.cleanup();
    }

    return {
      kind: 'pdf',
      pageCount: pages.length,
      pages,
      pagesWithoutText,
      quality: assessPdfQuality(pages, pagesWithoutText),
    };
  } finally {
    signal?.removeEventListener('abort', cancel);
    try {
      await task.destroy();
    } catch {
      // The task may already have been destroyed by cancellation.
    }
  }
}
