import { AlertTriangle } from 'lucide-react';
import {
  MILITARY_RESULT_COLUMNS,
  type PdfQualityLevel,
  type PdfQualityReport,
  type PdfTextLine,
} from '@/lib/local-file-reader';

function getQualityCopy(level: PdfQualityLevel): { title: string; message: string } {
  if (level === 'consistent') {
    return {
      title: 'Estrutura aparentemente consistente',
      message: 'A estrutura da tabela parece consistente. Você pode continuar com o PDF, conferindo os dados com o documento original.',
    };
  }
  if (level === 'caution') {
    return {
      title: 'Confira a quantidade de campos',
      message: 'A quantidade de campos varia entre algumas linhas. Confira o original; nenhuma linha foi removida. Prefira a planilha original (XLS/XLSX), se houver.',
    };
  }
  if (level === 'insufficient') {
    return {
      title: 'Texto insuficiente para avaliar',
      message: 'Não foi possível extrair texto suficiente deste PDF. A conversão automática pode não funcionar.',
    };
  }
  return {
    title: 'Qualidade indeterminada',
    message: 'Não há estrutura tabular suficiente para avaliar se as linhas e colunas foram preservadas. Prefira fornecer a planilha original, se disponível.',
  };
}

export function PdfQualityNotice({ quality, documentId }: { quality: PdfQualityReport; documentId: string }) {
  const copy = getQualityCopy(quality.level);
  const style = quality.level === 'consistent' ? 'consistent' : quality.level === 'insufficient' ? 'insufficient' : 'uncertain';
  const consistency = quality.fieldCountConsistency === null
    ? 'indeterminada'
    : `${Math.round(quality.fieldCountConsistency * 100)}%`;

  return (
    <section
      className={`import-pdf-quality ${style}`}
      role="status"
      aria-label="Diagnóstico da extração do PDF"
      data-testid={`pdf-quality-${documentId}`}
    >
      <div className="import-pdf-quality-heading">
        <AlertTriangle size={17} />
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.message}</p>
        </div>
      </div>
      <dl className="import-pdf-quality-metrics">
        <div><dt>Páginas com texto</dt><dd>{Math.round(quality.pageTextCoverage * 100)}%</dd></div>
        <div><dt>Cabeçalho reconhecível</dt><dd>{quality.recognizedHeader ? 'Sim' : 'Não identificado'}</dd></div>
        <div><dt>Linhas com campos separados</dt><dd>{quality.structuredRows}</dd></div>
        <div><dt>Campos no padrão observado</dt><dd>{quality.expectedFields ?? 'Indeterminado'}</dd></div>
        <div><dt>Consistência de campos</dt><dd>{consistency}</dd></div>
        <div><dt>Linhas com campos vazios</dt><dd>{quality.incompleteLines}</dd></div>
        <div><dt>Linhas com campos excedentes</dt><dd>{quality.possibleShiftedLines}</dd></div>
        <div><dt>Linhas para conferir alinhamento</dt><dd>{quality.needsReviewLines}</dd></div>
      </dl>
      {quality.reasons.length > 0 && (
        <ul className="import-pdf-quality-reasons">
          {quality.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      <p className="import-pdf-quality-disclaimer">
        Linhas com quantidades diferentes de campos são mantidas; podem corresponder a candidatos excluídos e não são removidas nem marcadas automaticamente como erro. Estes sinais são preliminares e não substituem a conferência do original.
      </p>
    </section>
  );
}

export function PdfLayoutPreview({ lines, testId }: { lines: PdfTextLine[]; testId: string }) {
  const headerLineIndex = lines.findIndex((line) => line.kind === 'table-header' || line.isHeader === true);
  const headerLine = headerLineIndex >= 0 ? lines[headerLineIndex] : undefined;
  const schemaHeaders = headerLine
    ? MILITARY_RESULT_COLUMNS
      .map((column, index) => ({ ...column, label: headerLine.cells[index]?.trim() }))
      .filter((column) => Boolean(column.label))
    : [];
  const hasStructuredSchema = schemaHeaders.length > 0;
  const dataLines = lines
    .map((line, index) => ({ line, sourceLine: index + 1 }))
    .filter(({ line }, index) => {
      if (index === headerLineIndex || line.kind === 'metadata' || line.kind === 'table-header') return false;
      if (line.kind) return line.kind === 'candidate' || line.kind === 'unmapped';
      return true;
    });
  const visibleLines = dataLines.slice(0, 50);
  const unmappedLines = lines
    .map((line, index) => ({ line, sourceLine: index + 1 }))
    .filter(({ line }) => Boolean(line.unmappedFragments?.length));
  const visibleColumnCount = hasStructuredSchema ? schemaHeaders.length : 2;

  return (
    <div className="import-pdf-layout" data-testid={`pdf-layout-${testId}`}>
      <div className="import-sheet-summary">
        <strong>Separação espacial preliminar</strong>
        <span>
          {hasStructuredSchema
            ? `${dataLines.filter(({ line }) => line.kind === 'candidate' || line.record).length} registro(s) · ${schemaHeaders.length} campo(s) reconhecidos no cabeçalho`
            : `${dataLines.length} linha(s) preservadas para conferência · cabeçalho tabular não identificado`}
        </span>
      </div>
      <div className="import-table-wrap">
        <table className="import-data-table" data-testid={`table-pdf-layout-${testId}`}>
          <thead>
            <tr>
              <th scope="col">Linha</th>
              {hasStructuredSchema
                ? schemaHeaders.map((column) => <th scope="col" key={column.key}>{column.label}</th>)
                : <th scope="col">Texto extraído para conferência</th>}
            </tr>
          </thead>
          <tbody>
            {visibleLines.length > 0 ? visibleLines.map(({ line, sourceLine }) => (
              <tr key={sourceLine} data-review-required={line.needsReview ? 'true' : undefined}>
                <th scope="row" aria-label={line.needsReview ? `Linha ${sourceLine}; conferir alinhamento` : `Linha ${sourceLine}`}>
                  {sourceLine}
                  {line.needsReview && <span className="import-row-review">Conferir</span>}
                </th>
                {hasStructuredSchema
                  ? schemaHeaders.map((column) => {
                    const columnIndex = MILITARY_RESULT_COLUMNS.findIndex(({ key }) => key === column.key);
                    return (
                      <td key={column.key}>
                        {line.record?.[column.key] ?? line.cells[columnIndex] ?? ''}
                      </td>
                    );
                  })
                  : <td>{line.unmappedFragments?.join(' · ') || line.text}</td>}
              </tr>
            )) : (
              <tr>
                <td colSpan={visibleColumnCount + 1} className="import-empty-cell">
                  {hasStructuredSchema
                    ? 'Nenhum registro de candidato foi associado ao cabeçalho reconhecido.'
                    : 'Não foi reconhecido um cabeçalho tabular. O texto extraído foi mantido para conferência.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {unmappedLines.length > 0 && (
        <ul className="import-pdf-quality-reasons" aria-label="Trechos sem posição segura">
          {unmappedLines.slice(0, 20).map(({ line, sourceLine }) => (
            <li key={sourceLine}>
              Linha {sourceLine}: {line.unmappedFragments?.join(' · ')}
            </li>
          ))}
        </ul>
      )}
      {dataLines.length > visibleLines.length && (
        <p className="import-source-note">Exibindo as primeiras {visibleLines.length} linhas desta página. O texto extraído completo permanece disponível abaixo.</p>
      )}
    </div>
  );
}
