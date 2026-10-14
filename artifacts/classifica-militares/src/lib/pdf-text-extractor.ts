export interface PdfPageText {
  pageNumber: number;
  text: string;
  lines: PdfTextLine[];
}

export interface PdfTextLine {
  text: string;
  cells: string[];
  isHeader?: boolean;
  isStructured?: boolean;
  needsReview?: boolean;
  unmappedFragments?: string[];
  kind?: 'metadata' | 'table-header' | 'candidate' | 'unmapped';
  record?: MilitaryCandidateRecord;
}

export const MILITARY_RESULT_COLUMNS = [
  { key: 'inha', label: 'INHA' },
  { key: 'nome', label: 'NOME' },
  { key: 'inscricao', label: 'INSCRIÇÃO' },
  { key: 'clas', label: 'CLAS' },
  { key: 'mf', label: 'MF' },
  { key: 'port', label: 'PORT' },
  { key: 'mat', label: 'MAT' },
  { key: 'ing', label: 'ING' },
  { key: 'red', label: 'RED' },
  { key: 'dtNasc', label: 'DT_NASC' },
  { key: 'ac', label: 'AC' },
  { key: 'rv', label: 'RV' },
  { key: 'ci', label: 'CI' },
] as const;

export type MilitaryCandidateColumnKey = typeof MILITARY_RESULT_COLUMNS[number]['key'];
export type MilitaryCandidateRecord = Record<MilitaryCandidateColumnKey, string>;

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
  needsReviewLines: number;
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

function isRecognizedHeader(line: PdfTextLine): boolean {
  return line.kind === 'table-header' || line.isHeader === true;
}

interface SchemaHeaderMatch {
  index: number;
  start: number;
  end: number;
  label: string;
}

const SCHEMA_ALIASES = MILITARY_RESULT_COLUMNS.map((column, index) => {
  const aliases: string[][] = [
    ['inha'],
    ['nome'],
    ['inscricao'],
    ['classificacao', 'clas'],
    ['mf'],
    ['portugues', 'port'],
    ['matematica', 'mat'],
    ['ingles', 'ing'],
    ['redacao', 'red'],
    ['data de nascimento', 'datanascimento', 'dt_nasc'],
    ['ac'],
    ['rv'],
    ['ci'],
  ];
  return { index, key: column.key, aliases: aliases[index] };
}).flatMap(({ index, aliases }) => aliases.map((alias) => ({ index, alias })))
  .sort((left, right) => right.alias.length - left.alias.length);

function extractSchemaHeaderMatches(text: string): SchemaHeaderMatch[] {
  const normalized = normalizeText(text);
  const matches: SchemaHeaderMatch[] = [];
  let previousMatchEnd = -1;

  for (let index = 0; index < normalized.length;) {
    const match = SCHEMA_ALIASES.find(({ alias }) => {
      if (!normalized.startsWith(alias, index)) return false;
      const previousCharacter = normalized[index - 1];
      const nextCharacter = normalized[index + alias.length];
      const beginsAtBoundary = index === 0 || index === previousMatchEnd || !/[a-z0-9]/.test(previousCharacter ?? '');
      const endsAtBoundary = !/[a-z0-9]/.test(nextCharacter ?? '');
      const startsNextLabel = SCHEMA_ALIASES.some(({ alias: nextAlias }) => normalized.startsWith(nextAlias, index + alias.length));
      return beginsAtBoundary && (endsAtBoundary || startsNextLabel);
    });
    if (!match) {
      index += 1;
      continue;
    }

    matches.push({
      index: match.index,
      start: index,
      end: index + match.alias.length,
      label: text.slice(index, index + match.alias.length),
    });
    index += match.alias.length;
    previousMatchEnd = index;
  }
  return matches;
}

interface PdfTableLayout {
  positions: Array<number | null>;
  labels: string[];
  complete: boolean;
  ordered: boolean;
}

function matchesForGroup(group: { items: PositionedTextItem[] }): Array<SchemaHeaderMatch & { x: number }> {
  return group.items.flatMap((item) => {
    const matches = extractSchemaHeaderMatches(item.text);
    return matches.map((match) => {
      const characters = Math.max(1, item.text.length);
      const measuredWidth = item.width > 0 ? item.width : item.fontSize * characters * 0.5;
      const estimatedX = matches.length > 1
        ? item.x + measuredWidth * (match.start / characters)
        : item.x;
      return { ...match, x: estimatedX };
    });
  });
}

function isCandidateHeader(group: { items: PositionedTextItem[] }): boolean {
  const indices = new Set(matchesForGroup(group).map((match) => match.index));
  return indices.has(1) && indices.has(2) && indices.has(3);
}

function makeTableLayout(
  group: { items: PositionedTextItem[] },
  previous?: PdfTableLayout,
): PdfTableLayout {
  const positions = previous ? [...previous.positions] : Array.from({ length: MILITARY_RESULT_COLUMNS.length }, () => null);
  const labels = previous ? [...previous.labels] : MILITARY_RESULT_COLUMNS.map((column) => column.label);
  const matches = matchesForGroup(group);
  const seen = new Set<number>();

  for (const match of matches) {
    if (seen.has(match.index)) continue;
    positions[match.index] = match.x;
    labels[match.index] = match.label;
    seen.add(match.index);
  }
  const knownPositions = positions.filter((position): position is number => position !== null);
  const ordered = knownPositions.every((position, index) => index === 0 || position > knownPositions[index - 1]);
  return {
    positions,
    labels,
    complete: positions.every((position) => position !== null),
    ordered,
  };
}

function assignToColumn(
  x: number,
  fontSize: number,
  layout: PdfTableLayout,
): number | null {
  if (!layout.ordered) return null;
  const known = layout.positions
    .map((position, index) => position === null ? null : { position, index })
    .filter((entry): entry is { position: number; index: number } => entry !== null);
  if (known.length === 0) return null;

  if (layout.complete) {
    const firstGap = known[1].position - known[0].position;
    const lastGap = known.at(-1)!.position - known.at(-2)!.position;
    if (x < known[0].position - Math.max(fontSize, firstGap * 0.4)
      || x > known.at(-1)!.position + Math.max(fontSize * 1.5, lastGap * 0.65)) {
      return null;
    }
    for (let index = 0; index < known.length - 1; index += 1) {
      const boundary = (known[index].position + known[index + 1].position) / 2;
      if (x < boundary) return known[index].index;
    }
    return known.at(-1)!.index;
  }

  let closest = known[0];
  for (const entry of known.slice(1)) {
    if (Math.abs(entry.position - x) < Math.abs(closest.position - x)) closest = entry;
  }
  const distances = known.slice(1).map((entry, index) => entry.position - known[index].position);
  const typicalGap = distances.length ? distances.sort((left, right) => left - right)[Math.floor(distances.length / 2)] : fontSize * 2;
  return Math.abs(closest.position - x) <= Math.max(fontSize, Math.min(10, typicalGap * 0.28))
    ? closest.index
    : null;
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
  const repeatedDataStarts: Array<{ x: number; fontSize: number; rows: Set<number> }> = [];
  dataGroups.forEach((group, rowIndex) => {
    for (const item of group.items) {
      if (!item.text.trim()) continue;
      const tolerance = Math.max(1.5, Math.min(3.5, item.fontSize * 0.25));
      const cluster = repeatedDataStarts.find((candidate) => Math.abs(candidate.x - item.x) <= Math.max(
        tolerance,
        Math.max(1.5, Math.min(3.5, candidate.fontSize * 0.25)),
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
  const repeatedAnchors = repeatedDataStarts
    .filter((anchor) => anchor.rows.size >= Math.min(2, dataGroups.length))
    .map(({ x, fontSize }) => ({ x, fontSize }));
  const columnAnchors = mergeColumnAnchors([...headerColumnStarts, ...repeatedAnchors]);
  const hasPositionedColumns = columnAnchors.length >= 2;

  const lines: PdfTextLine[] = headerGroups.map(({ group, isHeader }) => {
    const rowItems = [...group.items].sort((left, right) => left.x - right.x);
    const rawText = rowItems.map((item) => item.text.trim()).filter(Boolean).join(' ');
    let cells: string[] = [];
    let needsReview = false;
    const unmappedFragments: string[] = [];

    if (hasPositionedColumns) {
      cells = Array.from({ length: columnAnchors.length }, () => '');
      if (isHeader && rowItems.length === 1) {
        const labels = extractHeaderLabels(rowItems[0].text);
        if (labels.length === cells.length) {
          cells = labels;
        } else {
          const assignment = findColumnAssignment(rowItems[0].x, rowItems[0].fontSize, columnAnchors);
          if (assignment) {
            cells[assignment.index] = rowItems[0].text.trim();
          } else {
            unmappedFragments.push(rowItems[0].text.trim());
          }
          needsReview = labels.length > 1 || !assignment;
        }
      } else {
        for (const item of rowItems) {
          const assignment = findColumnAssignment(item.x, item.fontSize, columnAnchors);
          if (!assignment) {
            unmappedFragments.push(item.text.trim());
            needsReview = true;
            continue;
          }
          if (!assignment.aligned) needsReview = true;

          if (isHeader) {
            const labels = extractHeaderLabels(item.text);
            if (labels.length > 1 && assignment.index + labels.length <= cells.length) {
              labels.forEach((label, offset) => {
                cells[assignment.index + offset] = label;
              });
            } else if (labels.length > 1) {
              unmappedFragments.push(item.text.trim());
              needsReview = true;
            } else {
              cells[assignment.index] = [cells[assignment.index], item.text.trim()].filter(Boolean).join(' ');
            }
          } else {
            cells[assignment.index] = [cells[assignment.index], item.text.trim()].filter(Boolean).join(' ');
          }
        }
      }
    } else {
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
      if (isHeader && cells.length === 1) {
        const labels = extractHeaderLabels(cells[0]);
        if (labels.length >= 2) cells.splice(0, 1, ...labels);
      }
    }

    const populatedCells = cells.filter((cell) => cell.trim()).length;
    return {
      text: rawText,
      cells,
      isHeader,
      isStructured: isHeader || populatedCells >= 2,
      ...(needsReview || unmappedFragments.length > 0 ? { needsReview: true } : {}),
      ...(unmappedFragments.length > 0 ? { unmappedFragments } : {}),
    };
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
  const dataLines = allLines.filter((line) => !isRecognizedHeader(line) && (
    line.isStructured ?? line.cells.filter((cell) => cell.trim()).length >= 2
  ));
  const headerFieldCounts = new Map<number, number>();
  for (const line of headers) headerFieldCounts.set(line.cells.length, (headerFieldCounts.get(line.cells.length) ?? 0) + 1);
  const observedFieldCounts = new Map<number, number>();
  for (const line of dataLines) {
    const populatedCount = line.cells.filter((cell) => cell.trim()).length;
    observedFieldCounts.set(populatedCount, (observedFieldCounts.get(populatedCount) ?? 0) + 1);
  }
  const expectedFields = [...headerFieldCounts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0]
    ?? [...observedFieldCounts.entries()]
      .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0]
    ?? null;
  const completeRows = expectedFields === null
    ? 0
    : dataLines.filter((line) => line.cells.length >= expectedFields
      && line.cells.slice(0, expectedFields).every((cell) => cell.trim())).length;
  const fieldCountConsistency = dataLines.length > 0 ? completeRows / dataLines.length : null;
  const incompleteLines = expectedFields === null
    ? 0
    : dataLines.filter((line) => line.cells.length < expectedFields
      || line.cells.slice(0, expectedFields).some((cell) => !cell.trim())).length;
  const possibleShiftedLines = expectedFields === null
    ? 0
    : dataLines.filter((line) => line.cells.length > expectedFields || (line.unmappedFragments?.length ?? 0) > 0).length;
  const needsReviewLines = dataLines.filter((line) => line.needsReview).length;
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
      reasons.push(`${incompleteLines} linha(s) têm campos vazios; podem refletir o documento original e foram mantidas.`);
    }
    if (possibleShiftedLines > 0) {
      reasons.push(`${possibleShiftedLines} linha(s) têm trechos sem posição segura; o conteúdo foi preservado para conferência.`);
    }
    if (needsReviewLines > 0) reasons.push(`${needsReviewLines} linha(s) foram marcadas para conferir o alinhamento.`);

    const layoutLooksInconsistent = dataLines.length >= 3
      && ((fieldCountConsistency ?? 0) < 0.85 || incompleteLines > 0 || possibleShiftedLines > 0 || needsReviewLines > 0);
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
    needsReviewLines,
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
