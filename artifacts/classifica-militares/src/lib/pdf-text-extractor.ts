export interface PdfPageText {
  pageNumber: number;
  text: string;
  lines: PdfTextLine[];
}

export interface PdfTextLine {
  text: string;
  cells: string[];
  x?: number;
  y?: number;
  fontSize?: number;
  isHeader?: boolean;
  isStructured?: boolean;
  needsReview?: boolean;
  unmappedFragments?: string[];
  kind?: 'metadata' | 'table-header' | 'unmapped-header' | 'candidate' | 'unmapped';
  record?: MilitaryCandidateRecord;
}

/**
 * These are the headings present in the official EA CPCAR 2026 result table.
 * In particular, that PDF has no INHA heading: it must not be manufactured as
 * a column from the number or spacing of text fragments.
 */
export const MILITARY_RESULT_COLUMNS = [
  { key: 'nome', label: 'Nome' },
  { key: 'inscricao', label: 'Inscrição' },
  { key: 'clas', label: 'Clas' },
  { key: 'mf', label: 'MF' },
  { key: 'port', label: 'Port' },
  { key: 'mat', label: 'Mat' },
  { key: 'ing', label: 'Ing' },
  { key: 'red', label: 'Red' },
  { key: 'dtNasc', label: 'Dt_nasc' },
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

interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hasEOL: boolean;
}

interface SchemaHeaderMatch {
  index: number;
  start: number;
  end: number;
  label: string;
  x: number;
  fontSize: number;
}

interface PdfTableLayout {
  positions: Array<number | null>;
  labels: string[];
  complete: boolean;
  ordered: boolean;
}

const SCHEMA_ALIASES = [
  ['nome'],
  ['inscricao'],
  ['classificacao', 'clas'],
  ['mf'],
  ['portugues', 'port'],
  ['matematica', 'mat'],
  ['ingles', 'ing'],
  ['redacao', 'red'],
  ['data de nascimento', 'dt_nasc', 'dtnasc'],
  ['ac'],
  ['rv'],
  ['ci'],
].flatMap((aliases, index) => aliases.map((alias) => ({ index, alias })))
  .sort((left, right) => right.alias.length - left.alias.length);

const REQUIRED_RESULT_COLUMN_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11];

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Leitura cancelada.', 'AbortError');
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractSchemaHeaderMatches(text: string): Array<Omit<SchemaHeaderMatch, 'x' | 'fontSize'>> {
  const normalized = normalizeText(text);
  const matches: Array<Omit<SchemaHeaderMatch, 'x' | 'fontSize'>> = [];
  let previousMatchEnd = -1;

  for (let index = 0; index < normalized.length;) {
    const match = SCHEMA_ALIASES.find(({ alias }) => {
      if (!normalized.startsWith(alias, index)) return false;
      const previousCharacter = normalized[index - 1] ?? '';
      const nextCharacter = normalized[index + alias.length] ?? '';
      const startsNextLabel = SCHEMA_ALIASES.some(({ alias: nextAlias }) => (
        normalized.startsWith(nextAlias, index + alias.length)
      ));
      const beginsAtBoundary = index === 0
        || index === previousMatchEnd
        || !/[a-z0-9]/.test(previousCharacter);
      const endsAtBoundary = !/[a-z0-9]/.test(nextCharacter);
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

function matchesForGroup(group: { items: PositionedTextItem[] }): SchemaHeaderMatch[] {
  return group.items.flatMap((item) => {
    const matches = extractSchemaHeaderMatches(item.text);
    const textLength = Math.max(1, normalizeText(item.text).length);
    const measuredWidth = item.width > 0
      ? item.width
      : item.fontSize * Math.max(1, item.text.length) * 0.5;

    return matches.map((match) => ({
      ...match,
      x: item.x + measuredWidth * (match.start / textLength),
      fontSize: item.fontSize,
    }));
  });
}

function isCandidateHeader(group: { items: PositionedTextItem[] }): boolean {
  const matches = matchesForGroup(group);
  const indexes = new Set(matches.map((match) => match.index));
  const hasUniqueHeadings = matches.length === indexes.size;
  const hasCoreFields = [0, 1, 2, 3].every((index) => indexes.has(index));
  const hasEnoughKnownFields = indexes.size >= 8;
  const hasTableSpecificField = indexes.has(8) || indexes.has(11);
  return hasUniqueHeadings && hasCoreFields && hasEnoughKnownFields && hasTableSpecificField;
}

function isIncompatibleTableHeader(group: { items: PositionedTextItem[] }): boolean {
  const indexes = new Set(matchesForGroup(group).map((match) => match.index));
  return indexes.has(0) && indexes.has(1) && indexes.size >= 5;
}

function makeTableLayout(
  group: { items: PositionedTextItem[] },
  previous?: PdfTableLayout,
): PdfTableLayout {
  const positions = previous
    ? [...previous.positions]
    : Array.from({ length: MILITARY_RESULT_COLUMNS.length }, () => null);
  const labels = previous
    ? [...previous.labels]
    : Array.from({ length: MILITARY_RESULT_COLUMNS.length }, () => '');
  const matches = matchesForGroup(group);

  for (const match of matches) {
    positions[match.index] = match.x;
    labels[match.index] = MILITARY_RESULT_COLUMNS[match.index].label;
  }

  const knownPositions = positions.filter((position): position is number => position !== null);
  const ordered = knownPositions.every((position, index) => (
    index === 0 || position > knownPositions[index - 1]
  ));

  return {
    positions,
    labels,
    complete: positions.every((position) => position !== null),
    ordered,
  };
}

function assignToColumn(x: number, fontSize: number, layout: PdfTableLayout): number | null {
  if (!layout.ordered) return null;
  const known = layout.positions
    .map((position, index) => position === null ? null : { position, index })
    .filter((entry): entry is { position: number; index: number } => entry !== null);
  if (known.length === 0) return null;

  if (layout.complete) {
    const firstGap = known[1].position - known[0].position;
    const lastGap = known.at(-1)!.position - known.at(-2)!.position;
    if (
      x < known[0].position - Math.max(fontSize, firstGap * 0.4)
      || x > known.at(-1)!.position + Math.max(fontSize * 1.5, lastGap * 0.65)
    ) {
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
  const typicalGap = distances.length
    ? [...distances].sort((left, right) => left - right)[Math.floor(distances.length / 2)]
    : fontSize * 2;
  return Math.abs(closest.position - x) <= Math.max(fontSize, Math.min(10, typicalGap * 0.28))
    ? closest.index
    : null;
}

function findColumnAssignment(
  x: number,
  fontSize: number,
  layout: PdfTableLayout,
): { index: number; aligned: boolean } | null {
  const index = assignToColumn(x, fontSize, layout);
  if (index === null) return null;
  const anchor = layout.positions[index];
  if (anchor === null) return null;
  const neighboringDistances = layout.positions
    .map((position, neighborIndex) => position === null || neighborIndex === index
      ? null
      : Math.abs(position - anchor))
    .filter((distance): distance is number => distance !== null);
  const nearestGap = neighboringDistances.length ? Math.min(...neighboringDistances) : fontSize * 2;
  return {
    index,
    aligned: Math.abs(x - anchor) <= Math.max(fontSize * 1.5, nearestGap * 0.35),
  };
}

function positionedItems(items: unknown[]): { positioned: PositionedTextItem[]; unpositioned: string[] } {
  const positioned: PositionedTextItem[] = [];
  const unpositioned: string[] = [];

  for (const item of items) {
    const value = item as {
      str?: unknown;
      hasEOL?: unknown;
      transform?: unknown;
      width?: unknown;
      height?: unknown;
    };
    if (typeof value.str !== 'string' || value.str.trim() === '') continue;
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
      const text = value.str.trim();
      const x = transform[4] as number;
      const y = transform[5] as number;
      const width = typeof value.width === 'number' && Number.isFinite(value.width) ? value.width : 0;
      const fontSize = Math.max(
          1,
          Math.hypot(a, b),
          Math.hypot(c, d),
          typeof value.height === 'number' && Number.isFinite(value.height) ? value.height : 0,
        );
      const parts = text.match(/\S+/g) ?? [text];
      const firstNumericPart = parts.findIndex((part) => /\d/.test(part));
      const segments = parts.length > 1 && firstNumericPart >= 0
        ? [
          ...(firstNumericPart > 0 ? [parts.slice(0, firstNumericPart).join(' ')] : []),
          ...parts.slice(firstNumericPart),
        ]
        : [text];
      let searchFrom = 0;

      for (const segment of segments) {
        const start = text.indexOf(segment, searchFrom);
        const end = start + segment.length;
        const measuredWidth = width > 0
          ? width
          : fontSize * Math.max(1, text.length) * 0.5;
        positioned.push({
          text: segment,
          x: x + measuredWidth * (start / Math.max(1, text.length)),
          y,
          width: measuredWidth * (segment.length / Math.max(1, text.length)),
          fontSize,
          hasEOL: value.hasEOL === true && end === text.length,
        });
        searchFrom = end;
      }
    } else {
      unpositioned.push(value.str);
    }
  }

  return { positioned, unpositioned };
}

function groupPositionedItems(items: PositionedTextItem[]): Array<{ y: number; items: PositionedTextItem[] }> {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
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
  return groups;
}

function isInstitutionalMetadata(text: string): boolean {
  const normalized = normalizeText(text);
  return [
    'diretoria de ensino',
    'sistema integrado de gestao e controle',
    'ea cpcar',
    'exame de admissao ao curso preparatorio',
    'resultado final nas provas escritas',
    'ampla concorrencia',
    'reserva de vagas',
    'concentracao intermediaria',
    'candidatos excluidos',
    'data:',
  ].some((phrase) => normalized.includes(phrase));
}

function makeEmptyRecord(): MilitaryCandidateRecord {
  return Object.fromEntries(
    MILITARY_RESULT_COLUMNS.map(({ key }) => [key, '']),
  ) as MilitaryCandidateRecord;
}

function associateNearbyNameFragments(lines: PdfTextLine[], layout: PdfTableLayout): void {
  const firstColumnX = layout.positions[0];
  const registrationColumnX = layout.positions[1];
  if (firstColumnX === null || firstColumnX === undefined
    || registrationColumnX === null || registrationColumnX === undefined) return;

  const nameBoundary = (firstColumnX + registrationColumnX) / 2;
  const candidates = lines.filter((line) => {
    const record = line.record;
    return line.kind === 'candidate'
      && line.y !== undefined
      && record !== undefined
      && /^\d{6,}$/.test(record.inscricao.replace(/\s+/g, ''))
      && Boolean(record.clas || record.mf);
  });
  const claimedLines = new Set<PdfTextLine>();

  for (const fragmentLine of lines) {
    const fragment = fragmentLine.text.trim();
    if (
      fragmentLine.kind !== 'unmapped'
      || fragmentLine.y === undefined
      || fragmentLine.x === undefined
      || fragmentLine.x >= nameBoundary
      || !/^[\p{L}\s.'’-]{3,}$/u.test(fragment)
    ) continue;

    const fontSize = fragmentLine.fontSize ?? 10;
    const maxDistance = Math.max(4, Math.min(14, fontSize * 1.35));
    const nearest = candidates
      .map((line) => ({
        line,
        distance: Math.abs((line.y ?? 0) - fragmentLine.y!),
      }))
      .sort((left, right) => left.distance - right.distance);
    const closest = nearest[0];
    const nextClosest = nearest[1];
    if (!closest || closest.distance > maxDistance) continue;
    if (
      nextClosest
      && nextClosest.distance - closest.distance < Math.max(2, fontSize * 0.2)
    ) continue;

    const record = closest.line.record!;
    const existingName = record.nome.trim();
    const normalizedFragment = normalizeText(fragment);
    if (normalizeText(existingName).includes(normalizedFragment)) {
      claimedLines.add(fragmentLine);
      continue;
    }
    record.nome = existingName
      ? (fragmentLine.y > closest.line.y! ? `${fragment} ${existingName}` : `${existingName} ${fragment}`)
      : fragment;
    closest.line.cells[0] = record.nome;
    closest.line.text = `${closest.line.text} ${fragment}`.trim();
    claimedLines.add(fragmentLine);
  }

  if (claimedLines.size > 0) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (claimedLines.has(lines[index])) lines.splice(index, 1);
    }
  }
}

function makePdfLines(
  items: unknown[],
  previousLayout?: PdfTableLayout,
): { lines: PdfTextLine[]; layout?: PdfTableLayout } {
  const { positioned, unpositioned } = positionedItems(items);
  const groups = groupPositionedItems(positioned);
  let layout = previousLayout;
  let tableStarted = previousLayout !== undefined;
  const lines: PdfTextLine[] = [];

  for (const group of groups) {
    const rowItems = [...group.items].sort((left, right) => left.x - right.x);
    const rawText = rowItems.map((item) => item.text.trim()).filter(Boolean).join(' ');
    const isHeader = isCandidateHeader(group);

    if (isHeader) {
      layout = makeTableLayout(group, layout);
      tableStarted = true;
      const cells = layout.labels.map((label, index) => (
        layout?.positions[index] === null ? '' : label
      ));
      lines.push({
        text: rawText,
        cells,
        x: rowItems[0]?.x,
        y: group.y,
        fontSize: Math.max(...rowItems.map((item) => item.fontSize)),
        isHeader: true,
        isStructured: true,
        kind: 'table-header',
      });
      continue;
    }

    if (isIncompatibleTableHeader(group)) {
      layout = undefined;
      tableStarted = false;
      lines.push({
        text: rawText,
        cells: [],
        x: rowItems[0]?.x,
        y: group.y,
        fontSize: Math.max(...rowItems.map((item) => item.fontSize)),
        isHeader: true,
        isStructured: false,
        needsReview: true,
        kind: 'unmapped-header',
      });
      continue;
    }

    if (isInstitutionalMetadata(rawText)) {
      lines.push({
        text: rawText,
        cells: [rawText],
        x: rowItems[0]?.x,
        y: group.y,
        fontSize: Math.max(...rowItems.map((item) => item.fontSize)),
        isStructured: false,
        kind: 'metadata',
      });
      continue;
    }

    if (!tableStarted || !layout) {
      lines.push({
        text: rawText,
        cells: [rawText],
        x: rowItems[0]?.x,
        y: group.y,
        fontSize: Math.max(...rowItems.map((item) => item.fontSize)),
        isStructured: false,
        kind: 'unmapped',
        needsReview: true,
        unmappedFragments: [rawText],
      });
      continue;
    }

    const cells = Array.from({ length: MILITARY_RESULT_COLUMNS.length }, () => '');
    const unmappedFragments: string[] = [];
    const unassignedNameFragments: string[] = [];
    const nameRegionBoundary = layout.positions[0] !== null && layout.positions[1] !== null
      ? (layout.positions[0]! + layout.positions[1]!) / 2
      : null;
    let needsReview = !layout.complete || !layout.ordered;

    for (const item of rowItems) {
      const assignment = findColumnAssignment(item.x, item.fontSize, layout);
      if (!assignment) {
        const value = item.text.trim();
        if (
          nameRegionBoundary !== null
          && item.x < nameRegionBoundary
          && /^[\p{L}\s.'’-]+$/u.test(value)
          && value.length > 1
        ) {
          // The candidate name can begin well before the centered "Nome"
          // header. It remains in this Y-group until the rest of the row is
          // mapped, so only attach it when the same visual line has data.
          unassignedNameFragments.push(value);
        } else {
          unmappedFragments.push(value);
          needsReview = true;
        }
        continue;
      }
      if (!assignment.aligned) needsReview = true;

      const value = item.text.trim();
      let destination = assignment.index;
      const compactValue = value.replace(/\s+/g, '');
      const hasRegistration = /^\d{6,}$/.test(cells[1].replace(/\s+/g, ''));

      // Text can drift across a nearby geometric boundary when a result is
      // right-aligned or a row has a different layout. Use only unmistakable
      // value shapes to recover the two most error-prone adjacent fields.
      if (
        destination >= 2
        && destination <= 7
        && !cells[1]
        && /^\d{6,}$/.test(compactValue)
      ) {
        destination = 1;
        needsReview = true;
      } else if (
        destination === 3
        && hasRegistration
        && !cells[2]
        && /^\d{1,5}$/.test(compactValue)
      ) {
        destination = 2;
        needsReview = true;
      } else if (
        destination === 2
        && hasRegistration
        && !cells[3]
        && /^\d+[.,]\d{2,4}$/.test(compactValue)
      ) {
        destination = 3;
        needsReview = true;
      }

      const isNameFragment = destination > 0
        && destination <= 8
        && /^[\p{L}\s.'’-]+$/u.test(value)
        && value.length > 1;
      if (isNameFragment && cells[0]) {
        cells[0] = `${cells[0]} ${value}`.trim();
        needsReview = true;
        continue;
      }
      cells[destination] = [cells[destination], value].filter(Boolean).join(' ');
    }

    if (!cells[0].trim() && cells.slice(1).some((cell) => cell.trim()) && unassignedNameFragments.length) {
      cells[0] = unassignedNameFragments.join(' ').replace(/\s+/g, ' ').trim();
    }

    const populatedCount = cells.filter((cell) => cell.trim()).length;
    const hasCandidateName = /^[\p{L}\s.'’-]{3,}$/u.test(cells[0].trim());
    const hasCandidateContent = populatedCount >= 2 || hasCandidateName;
    const kind: PdfTextLine['kind'] = hasCandidateContent ? 'candidate' : 'unmapped';
    const missingRequiredFields = REQUIRED_RESULT_COLUMN_INDEXES.some((index) => !cells[index].trim());
    if (hasCandidateContent && missingRequiredFields) needsReview = true;
    if (kind === 'unmapped') unmappedFragments.push(...unassignedNameFragments);
    const record = makeEmptyRecord();
    MILITARY_RESULT_COLUMNS.forEach(({ key }, index) => { record[key] = cells[index]; });

    lines.push({
      text: rawText,
      cells,
      record,
      x: rowItems[0]?.x,
      y: group.y,
      fontSize: Math.max(...rowItems.map((item) => item.fontSize)),
      kind,
      isStructured: populatedCount >= 2,
      ...(needsReview ? { needsReview: true } : {}),
      ...(unmappedFragments.length > 0 ? { unmappedFragments } : {}),
    });
  }

  if (layout) associateNearbyNameFragments(lines, layout);

  if (unpositioned.length > 0) {
    for (const text of unpositioned) {
      lines.push({
        text,
        cells: [text],
        kind: 'unmapped',
        isStructured: false,
        needsReview: true,
        unmappedFragments: [text],
      });
    }
  }

  // The prior page's mapping remains active when a continuation page omits
  // its repeated header. A newly recognized heading always refreshes anchors.
  return { lines, layout };
}

export function assessPdfQuality(
  pages: PdfPageText[],
  pagesWithoutText: number[],
): PdfQualityReport {
  const pageCount = pages.length;
  const textPages = pageCount - pagesWithoutText.length;
  const pageTextCoverage = pageCount > 0 ? textPages / pageCount : 0;
  const allLines = pages.flatMap((page) => page.lines);
  const headers = allLines.filter((line) => line.kind === 'table-header' || line.isHeader === true);
  const incompatibleHeaders = allLines.filter((line) => line.kind === 'unmapped-header').length;
  const dataLines = allLines.filter((line) => line.kind === 'candidate');
  const expectedFields = headers.length
    ? Math.max(...headers.map((line) => line.cells.filter(Boolean).length))
    : null;
  const completeRows = dataLines.filter((line) => REQUIRED_RESULT_COLUMN_INDEXES.every(
    (index) => Boolean(line.cells[index]?.trim()),
  )).length;
  const fieldCountConsistency = dataLines.length > 0 ? completeRows / dataLines.length : null;
  const incompleteLines = dataLines.filter((line) => REQUIRED_RESULT_COLUMN_INDEXES.some(
    (index) => !line.cells[index]?.trim(),
  )).length;
  const possibleShiftedLines = dataLines.filter((line) => (
    (line.unmappedFragments?.length ?? 0) > 0
  )).length;
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
    if (headers.length === 0) reasons.push('Não foi reconhecido o cabeçalho real da tabela de resultados.');
    if (incompatibleHeaders > 0) {
      reasons.push(`${incompatibleHeaders} cabeçalho(s) têm um esquema diferente; as linhas foram preservadas sem forçar o mapeamento.`);
    }
    if (dataLines.length < 3) reasons.push('Há poucas linhas de candidatos com separação espacial para comparar.');
    if (incompleteLines > 0) {
      reasons.push(`${incompleteLines} linha(s) têm campos essenciais vazios; foram mantidas para conferência.`);
    }
    if (possibleShiftedLines > 0) {
      reasons.push(`${possibleShiftedLines} linha(s) têm trechos sem posição segura; o conteúdo foi preservado para conferência.`);
    }
    if (needsReviewLines > 0) reasons.push(`${needsReviewLines} linha(s) foram marcadas para conferir o alinhamento.`);

    const layoutLooksInconsistent = dataLines.length > 0 && (
      incompleteLines > 0
      || possibleShiftedLines > 0
      || needsReviewLines > 0
      || (dataLines.length >= 3 && (fieldCountConsistency ?? 0) < 0.85)
    );
    if (pagesWithoutText.length > 0 || incompatibleHeaders > 0 || layoutLooksInconsistent) {
      level = 'caution';
    } else if (headers.length > 0 && dataLines.length >= 3 && (fieldCountConsistency ?? 0) >= 0.85) {
      level = 'consistent';
      reasons.push('Cabeçalho, linhas e campos essenciais parecem compatíveis; confira os dados com o documento original.');
    } else {
      level = 'indeterminate';
    }
  }

  if (level === 'insufficient') {
    reasons.push('A conversão para planilha não recupera texto ou células que não foram extraídos.');
  } else if (level === 'caution' || level === 'indeterminate') {
    reasons.push('Uma planilha original, se disponível, preserva melhor as colunas do que a inferência espacial.');
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
    let previousLayout: PdfTableLayout | undefined;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      assertNotAborted(signal);
      onProgress(`PDF: lendo página ${pageNumber} de ${document.numPages}`);
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const parsed = makePdfLines(content.items, previousLayout);
      previousLayout = parsed.layout;
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
      pages.push({ pageNumber, text, lines: parsed.lines });
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
