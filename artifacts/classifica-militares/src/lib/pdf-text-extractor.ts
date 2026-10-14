export interface PdfPageText {
  pageNumber: number;
  text: string;
  lines: PdfTextLine[];
}

export interface PdfTextLine {
  text: string;
  cells: string[];
  isHeader?: boolean;
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
  if (/\b(?:nome|candidato|candidata|inscrito|participante)\w*\b/.test(value)) categories.add('identity');
  if (/\b(?:inscri|matricul|identific|codig)\w*\b/.test(value)) categories.add('identifier');
  if (/\b(?:nota|media|pontos|pontuac|mf|gp|gm|gi|gr)\w*\b/.test(value)) categories.add('score');
  if (/\b(?:classific|clas|posic|situac|resultado|ordem)\w*\b/.test(value)) categories.add('result');
  return categories;
}

function isRecognizedHeader(line: PdfTextLine): boolean {
  return line.isHeader ?? getHeaderCategories(line.text).size >= 2;
}

function isHeaderFieldLabel(text: string): boolean {
  return /\b(?:nome|candidat\w*|inscri\w*|matricul\w*|identific\w*|codig\w*|classific\w*|clas|posic\w*|situac\w*|resultad\w*|ordem|mf|gp|gm|gi|gr|media|nota|pontos|pontuac\w*|disciplina|prova|portugues|matematica|fisica|ingles|fase|etapa|status)\b/i
    .test(normalizeText(text));
}

function extractHeaderLabels(text: string): string[] {
  const normalized = normalizeText(text);
  const labels = [
    'classificacao',
    'identificacao',
    'participante',
    'candidata',
    'candidato',
    'inscricao',
    'matricula',
    'situacao',
    'resultado',
    'pontuacao',
    'portugues',
    'matematica',
    'disciplina',
    'posicao',
    'pontos',
    'media',
    'nome',
    'mf',
    'gp',
    'gm',
    'gi',
    'gr',
    'nota',
    'ordem',
    'codigo',
    'prova',
    'fisica',
    'ingles',
    'etapa',
    'fase',
    'status',
  ].sort((left, right) => right.length - left.length);
  const matches: Array<{ start: number; end: number; label: string }> = [];
  let previousMatchEnd = -1;

  for (let index = 0; index < normalized.length;) {
    const match = labels.find((label) => {
      if (!normalized.startsWith(label, index)) return false;
      const previousCharacter = normalized[index - 1];
      const nextCharacter = normalized[index + label.length];
      const beginsAtBoundary = index === 0 || index === previousMatchEnd || !/[a-z0-9]/.test(previousCharacter ?? '');
      const endsAtBoundary = !/[a-z0-9]/.test(nextCharacter ?? '');
      const startsNextLabel = labels.some((nextLabel) => normalized.startsWith(nextLabel, index + label.length));
      return beginsAtBoundary && (endsAtBoundary || startsNextLabel);
    });
    if (!match) {
      index += 1;
      continue;
    }

    matches.push({ start: index, end: index + match.length, label: text.slice(index, index + match.length) });
    index += match.length;
    previousMatchEnd = index;
  }
  return matches.map((match) => match.label);
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
        if (text) lines.push({ text, cells: [text], isHeader: getHeaderCategories(text).size >= 2 });
        current = '';
      }
    }
    if (current.trim()) {
      const text = current.trim();
      lines.push({ text, cells: [text], isHeader: getHeaderCategories(text).size >= 2 });
    }
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

  const headerGroups = groups.map((group) => ({
    group,
    isHeader: getHeaderCategories(group.items.map((item) => item.text).join(' ')).size >= 2,
  }));
  const headerColumnStarts = headerGroups
    .filter(({ isHeader }) => isHeader)
    .flatMap(({ group }) => group.items
      .filter((item) => isHeaderFieldLabel(item.text))
      .map((item) => ({ x: item.x, fontSize: item.fontSize })));
  const dataGroups = headerGroups.filter(({ isHeader }) => !isHeader).map(({ group }) => group);
  const headerAnchors = headerColumnStarts.filter((anchor, index) => {
    const tolerance = Math.max(2.5, Math.min(5, anchor.fontSize * 0.35));
    const repeatedInRows = dataGroups.filter((group) => group.items.some((item) => Math.abs(item.x - anchor.x) <= tolerance)).length;
    const requiredRows = Math.min(2, dataGroups.length);
    return repeatedInRows >= requiredRows
      && !headerColumnStarts.slice(0, index).some((previous) => Math.abs(previous.x - anchor.x) <= tolerance);
  });
  const repeatedDataStarts: Array<{ x: number; fontSize: number; rows: Set<number> }> = [];
  dataGroups.forEach((group, rowIndex) => {
    for (const item of group.items) {
      if (!item.text.trim()) continue;
      const tolerance = Math.max(2.5, Math.min(5, item.fontSize * 0.35));
      const cluster = repeatedDataStarts.find((candidate) => Math.abs(candidate.x - item.x) <= Math.max(
        tolerance,
        Math.max(2.5, Math.min(5, candidate.fontSize * 0.35)),
      ));
      if (cluster) {
        if (!cluster.rows.has(rowIndex)) {
          cluster.x = (cluster.x * cluster.rows.size + item.x) / (cluster.rows.size + 1);
          cluster.rows.add(rowIndex);
        }
      } else {
        repeatedDataStarts.push({ x: item.x, fontSize: item.fontSize, rows: new Set([rowIndex]) });
      }
    }
  });
  const repeatedAnchors = repeatedDataStarts.filter((anchor) => anchor.rows.size >= Math.min(2, dataGroups.length));
  const columnAnchors = [...headerAnchors, ...repeatedAnchors]
    .filter((anchor, index, anchors) => !anchors.slice(0, index).some((previous) => (
      Math.abs(previous.x - anchor.x) <= Math.max(2.5, Math.min(5, anchor.fontSize * 0.35))
    )));

  const lines: PdfTextLine[] = headerGroups.map(({ group, isHeader }) => {
    const rowItems = group.items.sort((left, right) => left.x - right.x);
    const cells: string[] = [];
    let lastItem: PositionedTextItem | undefined;
    for (const item of rowItems) {
      const gap = lastItem ? item.x - (lastItem.x + lastItem.width) : 0;
      const threshold = Math.max(4, item.fontSize * 1.1);
      const anchorTolerance = Math.max(2.5, Math.min(5, item.fontSize * 0.35));
      const startsColumn = columnAnchors.some((anchor) => Math.abs(anchor.x - item.x) <= anchorTolerance);
      if (cells.length === 0 || gap > threshold || startsColumn) {
        cells.push(item.text.trim());
      } else {
        cells[cells.length - 1] = `${cells[cells.length - 1]} ${item.text.trim()}`.trim();
      }
      lastItem = item;
    }
    if (isHeader && cells.length === 1) {
      const labels = extractHeaderLabels(cells[0]);
      if (labels.length >= 2) cells.splice(0, 1, ...labels);
    }
    return { text: cells.join('  '), cells, isHeader };
  });

  if (unpositioned.length > 0) {
    let current = '';
    for (const item of unpositioned) {
      current += `${current ? ' ' : ''}${item.text}`;
      if (item.hasEOL) {
        if (current.trim()) {
          const text = current.trim();
          lines.push({ text, cells: [text], isHeader: getHeaderCategories(text).size >= 2 });
        }
        current = '';
      }
    }
    if (current.trim()) {
      const text = current.trim();
      lines.push({ text, cells: [text], isHeader: getHeaderCategories(text).size >= 2 });
    }
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
    if (incompleteLines > 0) {
      reasons.push(`${incompleteLines} linha(s) têm menos campos que o padrão; podem corresponder a candidatos excluídos e foram mantidas.`);
    }
    if (possibleShiftedLines > 0) {
      reasons.push(`${possibleShiftedLines} linha(s) têm campos além do padrão observado e foram mantidas para conferência.`);
    }

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
