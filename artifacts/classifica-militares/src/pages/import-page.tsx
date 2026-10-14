import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck,
  FileSpreadsheet, FileText, Info, LoaderCircle, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react';
import { AVAILABLE_COMPETITIONS } from '@/domain/competitions/catalog';
import { PdfLayoutPreview, PdfQualityNotice } from '@/components/pdf-extraction-review';
import {
  DOCUMENT_TYPE_OPTIONS,
  MAX_FILE_SIZE_BYTES,
  formatCell,
  normalizeDocumentType,
  readLocalFile,
  reparseCsvFile,
  type CompetitionId,
  type CsvDelimiterChoice,
  type DocumentType,
  type ExtractedContent,
  type LocalReadResult,
  type MetadataHints,
  type SpreadsheetSheet,
} from '@/lib/local-file-reader';

type ProcessingStatus =
  | 'queued'
  | 'processing'
  | 'processed'
  | 'review'
  | 'no-text'
  | 'failed'
  | 'incompatible';

interface ImportedDocument {
  id: string;
  file: File;
  name: string;
  size: number;
  extension: string;
  selectedCompetition: string;
  selectedCompetitionLabel: string;
  selectedEdition: string;
  status: ProcessingStatus;
  progressMessage?: string;
  errorMessage?: string;
  format?: LocalReadResult['format'];
  extracted?: ExtractedContent;
  checksum?: string | null;
  warnings: string[];
  metadata?: MetadataHints;
  documentType: DocumentType;
  delimiterChoice: CsvDelimiterChoice;
}

interface QueueProgress {
  complete: number;
  total: number;
  message: string;
}

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  queued: 'Aguardando processamento',
  processing: 'Processando localmente',
  processed: 'Processado',
  review: 'Revisão necessária',
  'no-text': 'PDF sem texto extraível',
  failed: 'Falha na leitura',
  incompatible: 'Formato incompatível',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function getDocumentIcon(document: ImportedDocument) {
  return document.extension === 'xls' || document.extension === 'xlsx' || document.extension === 'csv'
    ? FileSpreadsheet
    : FileText;
}

function getStatusClass(status: ProcessingStatus): string {
  if (status === 'processed') return 'import-status success';
  if (status === 'processing' || status === 'queued') return 'import-status pending';
  if (status === 'failed' || status === 'incompatible' || status === 'no-text') return 'import-status danger';
  return 'import-status warning';
}

function makeDocumentId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function countColumns(rows: unknown[][]): number {
  return rows.reduce((largest, row) => Math.max(largest, row.length), 0);
}

function getColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function isPdfWithoutText(extracted: ExtractedContent): boolean {
  return extracted.kind === 'pdf'
    && extracted.pageCount > 0
    && extracted.pagesWithoutText.length === extracted.pageCount;
}

function buildConflictMessages(
  documents: ImportedDocument[],
  selectedCompetition: string,
  selectedEdition: string,
): string[] {
  if (!selectedCompetition || !selectedEdition.trim()) return [];
  const messages = new Set<string>();
  const selectedYears: string[] = selectedEdition.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  const detectedCompetitions = new Set<string>();
  const detectedEditions = new Set<string>();

  for (const document of documents) {
    if (document.selectedCompetition !== selectedCompetition || document.selectedEdition !== selectedEdition.trim()) {
      messages.add(
        `${document.name}: foi importado com ${document.selectedCompetitionLabel}, edição ${document.selectedEdition}; a seleção atual é ${selectedCompetition}, edição ${selectedEdition.trim()}.`,
      );
    }

    const candidates = document.metadata?.competitionCandidates ?? [];
    for (const candidate of candidates) detectedCompetitions.add(candidate);
    if (candidates.length > 1) {
      messages.add(`${document.name}: o conteúdo sugere mais de um concurso (${candidates.join(' e ')}).`);
    } else if (candidates.length === 1 && candidates[0] !== selectedCompetition) {
      messages.add(`${document.name}: há uma sugestão de concurso ${candidates[0]}, mas a seleção atual é ${selectedCompetition}.`);
    }

    const years = document.metadata?.editionCandidates ?? [];
    for (const year of years) detectedEditions.add(year);
    const unselectedYears = years.filter((year) => !selectedYears.includes(year));
    if (unselectedYears.length > 0) {
      messages.add(`${document.name}: o nome ou conteúdo sugere ${unselectedYears.join(', ')}, mas a edição selecionada é ${selectedEdition.trim()}.`);
    }
  }

  if (detectedCompetitions.size > 1) {
    messages.add(`Os documentos incluem sugestões de concursos diferentes: ${[...detectedCompetitions].join(' e ')}.`);
  }
  if (detectedEditions.size > 1) {
    messages.add(`Os documentos incluem sugestões de edições diferentes: ${[...detectedEditions].sort().join(', ')}.`);
  }
  return [...messages];
}

function getDuplicateMessage(document: ImportedDocument, documents: ImportedDocument[]): string | null {
  const sameContent = documents.find((other) => other.id !== document.id
    && document.checksum
    && other.checksum
    && other.checksum === document.checksum);
  if (sameContent) return `Conteúdo idêntico ao arquivo “${sameContent.name}”. Nenhum arquivo foi removido.`;

  const sameName = documents.find((other) => other.id !== document.id
    && other.name.toLocaleLowerCase() === document.name.toLocaleLowerCase());
  if (!sameName) return null;
  if (document.checksum !== undefined && sameName.checksum !== undefined && document.checksum && sameName.checksum) {
    return `Outro arquivo tem o mesmo nome, mas o conteúdo é diferente. Ambos foram mantidos.`;
  }
  if (document.checksum === null || sameName.checksum === null) {
    return 'Outro arquivo tem o mesmo nome; não foi possível comparar os conteúdos. Ambos foram mantidos.';
  }
  return 'Outro arquivo tem o mesmo nome. A verificação de conteúdo ainda não foi concluída; ambos foram mantidos.';
}

function getDocumentTypeLabel(value: string): string {
  const normalized = normalizeDocumentType(value);
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? 'Outro documento';
}

function getDelimiterLabel(delimiter: string): string {
  if (delimiter === '\t') return 'Tabulação';
  if (delimiter === ';') return 'Ponto e vírgula';
  if (delimiter === ',') return 'Vírgula';
  if (delimiter === '|') return 'Barra vertical';
  return delimiter;
}

function PreviewTable({ rows, page, onPageChange, testId }: {
  rows: Array<Array<string | number | boolean | Date | null>>;
  page: number;
  onPageChange: (page: number) => void;
  testId: string;
}) {
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const columns = countColumns(rows);
  const headers = Array.from({ length: columns }, (_, index) => `Coluna ${getColumnLabel(index)}`);

  return (
    <>
      <div className="import-table-wrap" data-testid={`table-wrap-${testId}`}>
        <table className="import-data-table" data-testid={`table-extracted-${testId}`}>
          <thead>
            <tr>
              <th scope="col">Linha</th>
              {headers.map((header) => <th scope="col" key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? visibleRows.map((row, index) => (
              <tr key={`${safePage}-${index}`}>
                <th scope="row">{safePage * pageSize + index + 1}</th>
                {headers.map((_, columnIndex) => (
                  <td key={columnIndex}>{formatCell(row[columnIndex] ?? '')}</td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={Math.max(1, columns + 1)} className="import-empty-cell">Esta planilha não tem linhas para pré-visualizar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="import-pagination">
          <span>Exibindo linhas {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, rows.length)} de {rows.length}. As demais linhas permanecem na extração local.</span>
          <div className="import-pagination-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onPageChange(Math.max(0, safePage - 1))} disabled={safePage === 0} aria-label="Página anterior" data-testid={`button-prev-page-${testId}`}>
              <ChevronLeft size={15} /> Anterior
            </button>
            <span>Página {safePage + 1} de {pageCount}</span>
            <button type="button" className="btn btn-secondary" onClick={() => onPageChange(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} aria-label="Próxima página" data-testid={`button-next-page-${testId}`}>
              Próxima <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function FilePreview({
  document,
  documents,
  selectedSheet,
  onSelectSheet,
  page,
  onPageChange,
  csvDelimiterChoice,
  onChangeCsvDelimiter,
}: {
  document: ImportedDocument;
  documents: ImportedDocument[];
  selectedSheet: string;
  onSelectSheet: (sheet: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  csvDelimiterChoice: CsvDelimiterChoice;
  onChangeCsvDelimiter: (choice: CsvDelimiterChoice) => void;
}) {
  const { extracted } = document;
  const duplicateMessage = getDuplicateMessage(document, documents);

  return (
    <section className="panel import-preview-panel" id="import-preview" aria-labelledby="preview-title">
      <div className="import-section-heading">
        <div>
          <span className="eyebrow">03 · Conferência</span>
          <h2 id="preview-title">Pré-visualização dos dados extraídos</h2>
          <p>Confira a origem e a leitura. Nenhuma classificação ou regra de edital é aplicada nesta etapa.</p>
        </div>
      </div>

      <div className="import-source-line" data-testid={`text-preview-source-${document.id}`}>
        <FileText size={16} />
        <span><strong>{document.name}</strong> · {document.format ?? 'formato não confirmado'}</span>
      </div>

      {duplicateMessage && (
        <div className="import-inline-warning" role="status" data-testid={`warning-duplicate-preview-${document.id}`}>
          <AlertTriangle size={16} /> {duplicateMessage}
        </div>
      )}

      {!extracted ? (
        <div className="import-preview-empty" role="status">
          <CircleAlert size={19} />
          <p>O conteúdo ainda não está disponível. Confira o estado e a mensagem deste arquivo na lista.</p>
        </div>
      ) : extracted.kind === 'pdf' ? (
        <div className="import-document-content">
          <div className="import-preview-toolbar">
            <div>
              <strong>{extracted.pageCount} página(s)</strong>
              <span> · Texto extraído por página, sem OCR.</span>
            </div>
            {extracted.pageCount > 1 && (
              <div className="import-pagination-actions">
                <button type="button" className="btn btn-secondary" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} aria-label="Página anterior do PDF" data-testid={`button-pdf-prev-${document.id}`}>
                  <ChevronLeft size={15} /> Anterior
                </button>
                <span>Página {page + 1} de {extracted.pageCount}</span>
                <button type="button" className="btn btn-secondary" onClick={() => onPageChange(Math.min(extracted.pageCount - 1, page + 1))} disabled={page >= extracted.pageCount - 1} aria-label="Próxima página do PDF" data-testid={`button-pdf-next-${document.id}`}>
                  Próxima <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
          <PdfQualityNotice quality={extracted.quality} documentId={document.id} />
          {extracted.pagesWithoutText.includes(page + 1) ? (
            <div className="import-scan-notice" role="status" data-testid={`status-pdf-page-no-text-${document.id}-${page + 1}`}>
              <AlertTriangle size={17} />
              <div>
                <strong>Página {page + 1} sem texto selecionável.</strong>
                <p>Ela pode conter uma digitalização. Nenhum OCR foi executado e nenhum conteúdo foi inventado.</p>
              </div>
            </div>
          ) : (
            <>
              <PdfLayoutPreview
                lines={extracted.pages[page]?.lines ?? []}
                testId={`${document.id}-${page + 1}`}
              />
              <details className="import-pdf-raw-details">
                <summary>Consultar o texto extraído em ordem de leitura</summary>
                <pre className="import-pdf-text" data-testid={`text-pdf-page-${document.id}-${page + 1}`}>
                  {extracted.pages[page]?.text || 'Esta página não contém texto extraível.'}
                </pre>
              </details>
            </>
          )}
          <p className="import-source-note">Origem rastreável: {document.name} · página {page + 1}. Os campos acima são inferidos da posição dos textos no PDF, não de uma planilha original.</p>
        </div>
      ) : extracted.kind === 'spreadsheet' ? (
        <div className="import-document-content">
          <div className="import-preview-toolbar">
            <div>
              <strong>{extracted.sheets.length} planilha(s)</strong>
              <span> · Cabeçalhos, linhas e colunas são exibidos como encontrados.</span>
            </div>
            <label className="import-preview-select">
              Planilha
              <select className="control" value={selectedSheet} onChange={(event) => onSelectSheet(event.target.value)} data-testid={`select-sheet-${document.id}`}>
                {extracted.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
              </select>
            </label>
          </div>
          {extracted.sheets.map((sheet: SpreadsheetSheet) => (
            sheet.name === selectedSheet && (
              <div key={sheet.name}>
                <div className="import-sheet-summary">
                  <strong>{sheet.name}</strong>
                  <span>{sheet.rows.length} linha(s) · {countColumns(sheet.rows)} coluna(s) encontradas</span>
                </div>
                <PreviewTable rows={sheet.rows} page={page} onPageChange={onPageChange} testId={`${document.id}-sheet`} />
              </div>
            )
          ))}
          <p className="import-source-note">Origem rastreável: {document.name} · planilha “{selectedSheet}”. A primeira linha é mostrada como veio do arquivo; não foi presumida como cabeçalho.</p>
        </div>
      ) : (
        <div className="import-document-content">
          <div className="import-preview-toolbar">
            <div>
              <strong>{extracted.rows.length} linha(s)</strong>
              <span> · {countColumns(extracted.rows)} coluna(s) · codificação {extracted.encoding}.</span>
            </div>
            <label className="import-preview-select">
              Delimitador
              <select
                className="control"
                value={csvDelimiterChoice}
                onChange={(event) => onChangeCsvDelimiter(event.target.value as CsvDelimiterChoice)}
                data-testid={`select-csv-delimiter-${document.id}`}
              >
                <option value="auto">Automático ({getDelimiterLabel(extracted.delimiter)})</option>
                <option value=";">Ponto e vírgula (;)</option>
                <option value=",">Vírgula (,)</option>
                <option value={'\t'}>Tabulação</option>
                <option value="|">Barra vertical (|)</option>
              </select>
            </label>
          </div>
          {extracted.delimiterAmbiguous && csvDelimiterChoice === 'auto' && (
            <div className="import-inline-warning" role="status" data-testid={`warning-csv-delimiter-${document.id}`}>
              <AlertTriangle size={16} /> Separador sugerido: {getDelimiterLabel(extracted.delimiter)}. A leitura é ambígua; escolha o delimitador correto se necessário.
            </div>
          )}
          <div className="import-sheet-summary">
            <strong>CSV</strong>
            <span>{extracted.rows.length} linha(s) · separador: {getDelimiterLabel(extracted.delimiter)}</span>
          </div>
          <PreviewTable rows={extracted.rows} page={page} onPageChange={onPageChange} testId={`${document.id}-csv`} />
          <p className="import-source-note">Origem rastreável: {document.name} · CSV completo preservado na memória desta página até a limpeza ou saída.</p>
        </div>
      )}
    </section>
  );
}

export function ImportPageContent() {
  const [competition, setCompetition] = useState('');
  const [edition, setEdition] = useState('');
  const [documents, setDocuments] = useState<ImportedDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<Record<string, string>>({});
  const [previewPages, setPreviewPages] = useState<Record<string, number>>({});
  const [delimiterChoices, setDelimiterChoices] = useState<Record<string, CsvDelimiterChoice>>({});
  const [queueProgress, setQueueProgress] = useState<QueueProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [inputError, setInputError] = useState('');
  const [showConflictPrompt, setShowConflictPrompt] = useState(false);
  const [conflictsConfirmed, setConflictsConfirmed] = useState(false);
  const [hasOpenedReview, setHasOpenedReview] = useState(false);
  const documentsRef = useRef<ImportedDocument[]>([]);
  const queueRef = useRef<ImportedDocument[]>([]);
  const activeControllerRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const isProcessingRef = useRef(false);
  const generationRef = useRef(0);
  const queuedTotalRef = useRef(0);
  const completedRef = useRef(0);

  const selectedCompetition = AVAILABLE_COMPETITIONS.find((item) => item.id === competition);
  const canImport = Boolean(selectedCompetition && /\b(?:19|20)\d{2}\b/.test(edition.trim()));
  const selectedDocument = documents.find((item) => item.id === selectedDocumentId)
    ?? documents[0]
    ?? null;
  const conflictMessages = useMemo(
    () => buildConflictMessages(documents, competition, edition),
    [documents, competition, edition],
  );
  const hasPendingFiles = documents.some((item) => item.status === 'queued' || item.status === 'processing');
  const previewSheet = selectedDocument?.extracted?.kind === 'spreadsheet'
    ? (selectedSheets[selectedDocument.id] ?? selectedDocument.extracted.sheets[0]?.name ?? '')
    : '';
  const previewPage = selectedDocument ? (previewPages[selectedDocument.id] ?? 0) : 0;

  const replaceDocuments = (next: ImportedDocument[]) => {
    documentsRef.current = next;
    setDocuments(next);
  };

  const updateDocument = (id: string, update: (document: ImportedDocument) => ImportedDocument) => {
    replaceDocuments(documentsRef.current.map((document) => document.id === id ? update(document) : document));
  };

  const drainQueue = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    const generation = generationRef.current;

    try {
      while (queueRef.current.length > 0 && generation === generationRef.current) {
        const document = queueRef.current.shift();
        if (!document) continue;
        const controller = new AbortController();
        activeControllerRef.current = { id: document.id, controller };
        updateDocument(document.id, (current) => ({
          ...current,
          status: 'processing',
          errorMessage: undefined,
          progressMessage: 'Preparando leitura local…',
        }));

        try {
          const result = await readLocalFile(document.file, controller.signal, (message) => {
            if (generation !== generationRef.current || controller.signal.aborted) return;
            updateDocument(document.id, (current) => ({ ...current, progressMessage: message }));
            setQueueProgress((current) => current ? { ...current, message } : null);
          });
          if (controller.signal.aborted || generation !== generationRef.current) continue;

          const warnings = [...result.warnings];
          let status: ProcessingStatus = warnings.length > 0 ? 'review' : 'processed';
          let errorMessage: string | undefined;
          if (isPdfWithoutText(result.extracted)) {
            status = 'no-text';
            errorMessage = 'Nenhuma página apresentou texto selecionável. O PDF pode ser uma digitalização; OCR não foi executado.';
          } else if (result.extracted.kind === 'pdf' && result.extracted.pagesWithoutText.length > 0) {
            status = 'review';
            warnings.push(`Páginas sem texto selecionável: ${result.extracted.pagesWithoutText.join(', ')}. Confira se contêm digitalizações.`);
          } else if (result.extracted.kind === 'pdf' && result.extracted.quality.level !== 'consistent') {
            status = 'review';
            warnings.push(
              result.extracted.quality.reasons[0]
                ?? 'A estrutura da tabela não pôde ser avaliada com confiança. Confira a pré-visualização.',
            );
          }

          updateDocument(document.id, (current) => ({
            ...current,
            status,
            format: result.format,
            extracted: result.extracted,
            checksum: result.checksum,
            warnings,
            metadata: result.metadata,
            documentType: result.metadata.documentTypeSuggestion ?? 'outro',
            errorMessage,
            progressMessage: undefined,
          }));
        } catch (error) {
          if (controller.signal.aborted || generation !== generationRef.current) continue;
          const message = error instanceof Error ? error.message : 'Não foi possível ler este arquivo.';
          const incompatible = /formato não aceito|extensão .* mas o conteúdo|não foi reconhecido como XLS|não parece ser um PDF|não parece conter dados binários/i.test(message);
          updateDocument(document.id, (current) => ({
            ...current,
            status: incompatible ? 'incompatible' : 'failed',
            errorMessage: message,
            progressMessage: undefined,
          }));
        } finally {
          if (activeControllerRef.current?.id === document.id) activeControllerRef.current = null;
          if (generation === generationRef.current) {
            completedRef.current += 1;
            setQueueProgress({
              complete: Math.min(completedRef.current, queuedTotalRef.current),
              total: queuedTotalRef.current,
              message: '',
            });
          }
        }
      }
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      if (generation === generationRef.current) {
        setQueueProgress(null);
      } else if (queueRef.current.length > 0) {
        void drainQueue();
      }
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    setInputError('');
    if (!canImport || !selectedCompetition) {
      setInputError('Selecione EPCAR ou AFA e informe o ano/edição antes de importar arquivos.');
      return;
    }
    const additions = Array.from(fileList).map((file): ImportedDocument => ({
      id: makeDocumentId(),
      file,
      name: file.name,
      size: file.size,
      extension: getExtension(file.name),
      selectedCompetition: selectedCompetition.id,
      selectedCompetitionLabel: selectedCompetition.label,
      selectedEdition: edition.trim(),
      status: 'queued',
      warnings: [],
      documentType: 'outro',
      delimiterChoice: 'auto',
    }));
    if (additions.length === 0) return;

    replaceDocuments([...documentsRef.current, ...additions]);
    queueRef.current.push(...additions);
    queuedTotalRef.current += additions.length;
    setQueueProgress({
      complete: completedRef.current,
      total: queuedTotalRef.current,
      message: 'Aguardando processamento local…',
    });
    setSelectedDocumentId((current) => current ?? additions[0].id);
    setConflictsConfirmed(false);
    setShowConflictPrompt(false);
    setHasOpenedReview(false);
    void drainQueue();
  };

  const removeDocument = (id: string) => {
    if (activeControllerRef.current?.id === id) activeControllerRef.current.controller.abort();
    const wasQueued = queueRef.current.some((document) => document.id === id);
    queueRef.current = queueRef.current.filter((document) => document.id !== id);
    if (wasQueued) queuedTotalRef.current = Math.max(completedRef.current, queuedTotalRef.current - 1);
    const next = documentsRef.current.filter((document) => document.id !== id);
    replaceDocuments(next);
    if (selectedDocumentId === id) setSelectedDocumentId(next[0]?.id ?? null);
    setConflictsConfirmed(false);
    setShowConflictPrompt(false);
    setHasOpenedReview(false);
  };

  const clearAllDocuments = () => {
    if (documentsRef.current.length === 0) return;
    const confirmed = window.confirm('Remover todos os arquivos e dados temporários desta página? Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    generationRef.current += 1;
    activeControllerRef.current?.controller.abort();
    activeControllerRef.current = null;
    queueRef.current = [];
    queuedTotalRef.current = 0;
    completedRef.current = 0;
    replaceDocuments([]);
    setSelectedDocumentId(null);
    setSelectedSheets({});
    setPreviewPages({});
    setDelimiterChoices({});
    setQueueProgress(null);
    setInputError('');
    setConflictsConfirmed(false);
    setShowConflictPrompt(false);
    setHasOpenedReview(false);
  };

  const updateSelection = (nextCompetition: string, nextEdition: string) => {
    setCompetition(nextCompetition);
    setEdition(nextEdition);
    setConflictsConfirmed(false);
    setShowConflictPrompt(false);
    setHasOpenedReview(false);
  };

  const beginReview = () => {
    if (conflictMessages.length > 0 && !conflictsConfirmed) {
      setShowConflictPrompt(true);
      window.setTimeout(() => document.getElementById('import-conflicts')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    setHasOpenedReview(true);
    setShowConflictPrompt(false);
    window.setTimeout(() => document.getElementById('import-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const confirmConflicts = () => {
    setConflictsConfirmed(true);
    setShowConflictPrompt(false);
    setHasOpenedReview(true);
    window.setTimeout(() => document.getElementById('import-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const changeCsvDelimiter = async (document: ImportedDocument, choice: CsvDelimiterChoice) => {
    if (document.extracted?.kind !== 'csv') return;
    setDelimiterChoices((current) => ({ ...current, [document.id]: choice }));
    updateDocument(document.id, (current) => ({ ...current, status: 'processing', progressMessage: 'Relendo CSV localmente…', errorMessage: undefined }));
    try {
      const extracted = await reparseCsvFile(document.file, choice);
      updateDocument(document.id, (current) => {
        const warnings = current.warnings.filter((warning) => !warning.toLowerCase().includes('separador'));
        return {
          ...current,
          extracted,
          status: extracted.delimiterAmbiguous || warnings.length > 0 ? 'review' : 'processed',
          progressMessage: undefined,
          warnings,
        };
      });
      setPreviewPages((current) => ({ ...current, [document.id]: 0 }));
    } catch (error) {
      updateDocument(document.id, (current) => ({
        ...current,
        status: 'review',
        errorMessage: `${error instanceof Error ? error.message : 'Não foi possível reler o CSV.'} A pré-visualização anterior foi mantida.`,
        progressMessage: undefined,
      }));
      setDelimiterChoices((current) => ({ ...current, [document.id]: document.delimiterChoice }));
    }
  };

  const selectionCanProceed = canImport && documents.length > 0 && !hasPendingFiles && !isProcessing;
  const progressPercent = queueProgress && queueProgress.total > 0
    ? Math.round((queueProgress.complete / queueProgress.total) * 100)
    : 0;

  return (
    <div className="import-page">
      <div className="page-header">
        <span className="eyebrow">Área de preparação</span>
        <h1 className="page-title">Importar uma lista</h1>
        <p className="page-intro">
          Selecione o concurso e a edição; depois, extraia texto e planilhas no seu navegador para conferir os documentos.
          Nenhuma classificação é calculada nesta etapa.
        </p>
      </div>

      <div className="notice warning import-privacy-notice" role="note" data-testid="notice-local-processing">
        <ShieldCheck size={17} className="notice-icon" />
        <div>
          <strong>Processamento local nesta etapa:</strong> os arquivos são lidos no navegador e não são enviados a APIs,
          serviços de OCR ou servidores para extração. O conteúdo permanece apenas na memória desta página e pode ser removido abaixo.
          Esta informação descreve o fluxo implementado; não é uma promessa de privacidade absoluta.
        </div>
      </div>

      <div className="steps" aria-label="Etapas de importação">
        <div className="step current"><span className="step-number">1</span> Concurso e arquivos</div>
        <div className={`step ${documents.length > 0 ? 'current' : ''}`}><span className="step-number">2</span> Leitura local</div>
        <div className={`step ${hasOpenedReview ? 'current' : ''}`}><span className="step-number">3</span> Conferência</div>
      </div>

      <div className="import-grid import-workspace">
        <section className="panel panel-pad import-selection-panel" aria-labelledby="import-selection-title">
          <span className="eyebrow">01 · Concurso e edição</span>
          <h2 id="import-selection-title" className="import-panel-title">Identifique os documentos</h2>
          <div className="field import-form-field">
            <label htmlFor="competition">Concurso</label>
            <select
              id="competition"
              className="control"
              value={competition}
              onChange={(event) => updateSelection(event.target.value, edition)}
              data-testid="select-competicao"
            >
              <option value="">Selecione EPCAR ou AFA</option>
              {AVAILABLE_COMPETITIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="field import-form-field">
            <label htmlFor="edition">Ano/edição</label>
            <input
              id="edition"
              className="control"
              type="text"
              value={edition}
              onChange={(event) => updateSelection(competition, event.target.value)}
              placeholder="Ex.: 2026 ou 2026/2027"
              autoComplete="off"
              data-testid="input-edicao"
            />
            <span className="import-field-help">Informe o ano ou a denominação da edição. O aplicativo não presume um valor.</span>
          </div>

          {!canImport && (
            <div className="import-inline-info" role="status" data-testid="status-selection-required">
              <Info size={16} /> Selecione um concurso e informe um ano de quatro dígitos para habilitar a importação.
            </div>
          )}

          <div
            className={`upload-zone import-dropzone ${isDragging ? 'dragging' : ''} ${!canImport ? 'disabled' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); if (canImport) setIsDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); if (canImport) setIsDragging(true); }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (canImport) addFiles(event.dataTransfer.files);
            }}
            data-testid="dropzone-importacao"
          >
            <input
              id="local-file"
              type="file"
              multiple
              accept=".csv,.xls,.xlsx,.pdf,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canImport}
              onChange={(event) => {
                addFiles(event.target.files ?? []);
                event.target.value = '';
              }}
              data-testid="input-arquivo"
            />
            <label htmlFor="local-file" className="import-dropzone-label">
              <span className="upload-icon"><Upload size={19} /></span>
              <span className="upload-title">{isDragging ? 'Solte os arquivos para importar' : 'Arraste arquivos ou escolha no dispositivo'}</span>
              <span className="upload-help">PDF, XLS, XLSX ou CSV · leitura no navegador</span>
            </label>
          </div>
          <p className="import-limit-note">Até 25 MB por arquivo; não há limite artificial de quantidade. Arquivos maiores serão identificados com uma mensagem.</p>
          {inputError && <div className="import-error" role="alert" data-testid="alert-import-input">{inputError}</div>}
        </section>

        <section className="panel panel-pad import-files-panel" aria-labelledby="import-files-title">
          <div className="import-files-heading">
            <div>
              <span className="eyebrow">02 · Arquivos locais</span>
              <h2 id="import-files-title" className="import-panel-title">Documentos importados</h2>
              <p className="import-panel-description">Cada arquivo mantém sua origem, edição selecionada e estado de leitura.</p>
            </div>
            {documents.length > 0 && (
              <button type="button" className="btn btn-secondary import-clear-button" onClick={clearAllDocuments} data-testid="button-limpar-arquivos">
                <Trash2 size={15} /> Limpar todos
              </button>
            )}
          </div>

          {queueProgress && (
            <div className="import-progress" role="status" aria-live="polite" data-testid="status-progress">
              <div className="import-progress-topline">
                <span><LoaderCircle size={15} className="import-spinner" /> {queueProgress.message || 'Leitura local em andamento…'}</span>
                <span>{queueProgress.complete} de {queueProgress.total}</span>
              </div>
              <div className="import-progress-track" aria-label={`Processamento ${progressPercent}%`}>
                <div className="import-progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}

          {documents.length === 0 ? (
            <div className="import-files-empty" data-testid="empty-import-list">
              <FileText size={20} />
              <strong>Nenhum documento selecionado</strong>
              <span>Depois de escolher a edição, adicione um ou vários arquivos para começar a leitura local.</span>
            </div>
          ) : (
            <div className="import-file-list" data-testid="list-imported-files">
              {documents.map((document) => {
                const Icon = getDocumentIcon(document);
                const duplicateMessage = getDuplicateMessage(document, documents);
                const detectedCompetition = document.metadata?.competitionCandidates;
                const documentType = normalizeDocumentType(document.documentType);
                const documentTypeDescription = DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.description;
                return (
                  <article key={document.id} className={`import-file-card ${selectedDocument?.id === document.id ? 'selected' : ''}`} data-testid={`card-document-${document.id}`}>
                    <div className="import-file-card-top">
                      <button type="button" className="import-file-select" onClick={() => {
                        setSelectedDocumentId(document.id);
                        setPreviewPages((current) => ({ ...current, [document.id]: 0 }));
                      }} aria-pressed={selectedDocument?.id === document.id} data-testid={`button-preview-file-${document.id}`}>
                        <span className="import-file-icon"><Icon size={17} /></span>
                        <span className="file-meta">
                          <span className="file-name" title={document.name}>{document.name}</span>
                          <span className="file-size">{document.extension.toUpperCase() || 'SEM EXTENSÃO'} · {formatFileSize(document.size)}</span>
                        </span>
                      </button>
                      <button type="button" className="import-remove-button" onClick={() => removeDocument(document.id)} aria-label={`Remover ${document.name}`} data-testid={`button-remover-arquivo-${document.id}`}>
                        <X size={16} />
                      </button>
                    </div>

                    <div className={getStatusClass(document.status)} role="status" data-testid={`status-document-${document.id}`}>
                      {document.status === 'processed' ? <CircleCheck size={14} /> : document.status === 'processing' || document.status === 'queued' ? <LoaderCircle size={14} className={document.status === 'processing' ? 'import-spinner' : ''} /> : <CircleAlert size={14} />}
                      <span>{document.progressMessage ?? document.errorMessage ?? STATUS_LABELS[document.status]}</span>
                    </div>

                    <div className="import-file-details">
                      <span>Selecionado: {document.selectedCompetitionLabel} · {document.selectedEdition}</span>
                      <span>
                        Detectado: {detectedCompetition?.length
                          ? detectedCompetition.join(' / ')
                          : 'concurso não identificado'}
                        {document.metadata?.editionCandidates.length
                          ? ` · edição sugerida ${document.metadata.editionCandidates.join(' / ')}`
                          : ''}
                      </span>
                      {document.extracted?.kind === 'pdf' && <span>{document.extracted.pageCount} página(s)</span>}
                      {document.extracted?.kind === 'spreadsheet' && <span>{document.extracted.sheets.length} planilha(s)</span>}
                      {document.extracted?.kind === 'csv' && <span>1 planilha · {document.extracted.rows.length} linha(s)</span>}
                    </div>

                    {duplicateMessage && (
                      <div className="import-duplicate-note" role="status" data-testid={`warning-duplicate-${document.id}`}>
                        <AlertTriangle size={14} /> {duplicateMessage}
                      </div>
                    )}
                    {document.warnings.map((warning, index) => (
                      <div className="import-file-warning" role="status" key={`${document.id}-warning-${index}`} data-testid={`warning-document-${document.id}-${index}`}>
                        <AlertTriangle size={14} /> {warning}
                      </div>
                    ))}

                    {document.extracted && (
                      <div className="import-file-controls">
                        <label>
                          Tipo de documento
                          <select
                            className="control"
                            value={documentType}
                            onChange={(event) => {
                              const value = event.target.value as DocumentType;
                              updateDocument(document.id, (current) => ({ ...current, documentType: value }));
                            }}
                            data-testid={`select-document-type-${document.id}`}
                          >
                            {DOCUMENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <span className="import-auto-suggestion" data-testid={`text-document-type-description-${document.id}`}>
                          {documentTypeDescription}
                        </span>
                        <span className="import-auto-suggestion" data-testid={`text-document-type-${document.id}`}>
                          {document.metadata?.documentTypeSuggestion
                            ? `Sugestão automática: ${getDocumentTypeLabel(document.metadata.documentTypeSuggestion)} · confirme ou ajuste.`
                            : 'Tipo sem sugestão automática forte; escolha manualmente.'}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {documents.length > 0 && (
            <div className="import-review-action">
              <button type="button" className="btn" onClick={beginReview} disabled={!selectionCanProceed} data-testid="button-conferir-dados">
                {hasPendingFiles ? <><LoaderCircle size={15} className="import-spinner" /> Aguardando leitura</> : <>Conferir dados extraídos <ChevronRight size={16} /></>}
              </button>
              {hasPendingFiles && <span>Conclua a leitura de todos os arquivos antes da conferência.</span>}
              {!canImport && <span>Informe o concurso e o ano/edição para continuar.</span>}
            </div>
          )}
        </section>
      </div>

      {showConflictPrompt && conflictMessages.length > 0 && (
        <section className="import-conflict-panel" id="import-conflicts" role="alert" aria-labelledby="import-conflict-title" data-testid="panel-import-conflicts">
          <div className="import-conflict-heading">
            <AlertTriangle size={19} />
            <div>
              <h2 id="import-conflict-title">Confira as divergências antes de continuar</h2>
              <p>As sugestões são automáticas e podem estar erradas. Nenhum arquivo foi ajustado ou excluído.</p>
            </div>
          </div>
          <ul>
            {conflictMessages.map((message) => <li key={message}>{message}</li>)}
          </ul>
          <div className="import-conflict-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowConflictPrompt(false)} data-testid="button-rever-selecao">
              Rever seleção
            </button>
            <button type="button" className="btn" onClick={confirmConflicts} data-testid="button-confirmar-divergencias">
              Confirmo as divergências e quero conferir <ChevronRight size={16} />
            </button>
          </div>
        </section>
      )}

      {conflictsConfirmed && conflictMessages.length > 0 && (
        <div className="import-inline-warning import-confirmed-notice" role="status" data-testid="status-conflicts-confirmed">
          <Check size={16} /> Divergências confirmadas para esta sessão. Os metadados e arquivos não foram alterados automaticamente.
        </div>
      )}

      {selectedDocument?.extracted ? (
        <FilePreview
          document={selectedDocument}
          documents={documents}
          selectedSheet={previewSheet}
          onSelectSheet={(sheet) => {
            setSelectedSheets((current) => ({ ...current, [selectedDocument.id]: sheet }));
            setPreviewPages((current) => ({ ...current, [selectedDocument.id]: 0 }));
          }}
          page={previewPage}
          onPageChange={(page) => setPreviewPages((current) => ({ ...current, [selectedDocument.id]: page }))}
          csvDelimiterChoice={delimiterChoices[selectedDocument.id] ?? selectedDocument.delimiterChoice}
          onChangeCsvDelimiter={(choice) => void changeCsvDelimiter(selectedDocument, choice)}
        />
      ) : selectedDocument ? (
        <section className="panel import-preview-panel" id="import-preview" aria-labelledby="preview-title">
          <div className="import-section-heading">
            <div>
              <span className="eyebrow">03 · Conferência</span>
              <h2 id="preview-title">Pré-visualização dos dados extraídos</h2>
            </div>
          </div>
          <div className="import-preview-empty" role="status" data-testid="empty-file-preview">
            {selectedDocument.status === 'no-text' ? <AlertTriangle size={19} /> : <Info size={19} />}
            <p>{selectedDocument.errorMessage ?? 'O arquivo ainda está sendo processado. O conteúdo será exibido aqui quando a leitura terminar.'}</p>
          </div>
        </section>
      ) : null}

      <div className="import-safety-note" role="note">
        <ShieldCheck size={17} />
        <p><strong>Sem motor de classificação nesta etapa.</strong> A leitura mostra o conteúdo disponível e suas fontes (arquivo, página ou planilha). Ela não aplica cotas, desempates, convocação nem regras específicas de EPCAR/AFA.</p>
      </div>
    </div>
  );
}

