import { AlertTriangle } from 'lucide-react';
import type { PdfQualityLevel, PdfQualityReport, PdfTextLine } from '@/lib/local-file-reader';

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
  const findHeaderLine = (line: PdfTextLine): boolean => {
    if (line.cells.length < 2) return false;
    const value = line.cells.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const categories = [
      /\b(nome|candidato|candidata)\b/,
      /\b(inscri\w*|matricul\w*|codigo)\b/,
      /\b(classific\w*|clas|posic\w*|situac\w*)\b/,
      /\b(mf|media|nota|pontos|gp|gm|gi|gr)\b/,
    ].filter((pattern) => pattern.test(value)).length;
    return line.isHeader === true || categories >= 2;
  };
  const headerLineIndex = lines.findIndex(findHeaderLine);
  const headerLine = headerLineIndex >= 0 ? lines[headerLineIndex] : undefined;
  const dataLines = lines
    .map((line, index) => ({ line, sourceLine: index + 1 }))
    .filter((_, index) => index !== headerLineIndex);
  const visibleLines = dataLines.slice(0, 50);
  const schemaColumns = Math.max(
    1,
    headerLine?.cells.length ?? 0,
    dataLines.reduce((largest, item) => Math.max(largest, item.line.cells.length), 0),
  );
  const hasUnmappedFragments = lines.some((line) => (line.unmappedFragments?.length ?? 0) > 0);
  const columns = schemaColumns + (hasUnmappedFragments ? 1 : 0);
  const headers = Array.from(
    { length: schemaColumns },
    (_, index) => headerLine?.cells[index]?.trim() || 'Cabeçalho não identificado',
  );

  return (
    <div className="import-pdf-layout" data-testid={`pdf-layout-${testId}`}>
      <div className="import-sheet-summary">
        <strong>Separação espacial preliminar</strong>
        <span>{lines.length} linha(s) · até {columns} campo(s) identificados por posição</span>
      </div>
      <div className="import-table-wrap">
        <table className="import-data-table" data-testid={`table-pdf-layout-${testId}`}>
          <thead>
            <tr>
              <th scope="col">Linha</th>
              {headers.map((header, index) => <th scope="col" key={`${index}-${header}`}>{header}</th>)}
              {hasUnmappedFragments && <th scope="col">Trecho sem posição segura</th>}
            </tr>
          </thead>
          <tbody>
            {visibleLines.length > 0 ? visibleLines.map(({ line, sourceLine }) => (
              <tr key={sourceLine} data-review-required={line.needsReview ? 'true' : undefined}>
                <th scope="row" aria-label={line.needsReview ? `Linha ${sourceLine}; conferir alinhamento` : `Linha ${sourceLine}`}>
                  {sourceLine}
                  {line.needsReview && <span className="import-row-review">Conferir</span>}
                </th>
                {headers.map((_, columnIndex) => <td key={columnIndex}>{line.cells[columnIndex] ?? ''}</td>)}
                {hasUnmappedFragments && <td>{line.unmappedFragments?.join(' · ') ?? ''}</td>}
              </tr>
            )) : (
              <tr><td colSpan={columns + 1} className="import-empty-cell">Nenhuma linha com posição espacial disponível.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {lines.length > visibleLines.length && (
        <p className="import-source-note">Exibindo as primeiras {visibleLines.length} linhas desta página. O texto extraído completo permanece disponível abaixo.</p>
      )}
    </div>
  );
}
