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
      title: 'Confira possíveis desalinhamentos',
      message: 'Algumas linhas podem ter colunas desalinhadas. Recomendamos conferir os dados ou fornecer uma planilha original.',
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
        <div><dt>Linhas possivelmente incompletas</dt><dd>{quality.incompleteLines}</dd></div>
        <div><dt>Linhas com campos excedentes</dt><dd>{quality.possibleShiftedLines}</dd></div>
      </dl>
      {quality.reasons.length > 0 && (
        <ul className="import-pdf-quality-reasons">
          {quality.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      <p className="import-pdf-quality-disclaimer">
        Estes sinais são preliminares, não garantem correção e não substituem a conferência visual do original.
      </p>
    </section>
  );
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

export function PdfLayoutPreview({ lines, testId }: { lines: PdfTextLine[]; testId: string }) {
  const visibleLines = lines.slice(0, 50);
  const columns = Math.max(1, Math.min(12, lines.reduce((largest, line) => Math.max(largest, line.cells.length), 0)));
  const headers = Array.from({ length: columns }, (_, index) => `Campo ${getColumnLabel(index)}`);

  return (
    <div className="import-pdf-layout" data-testid={`pdf-layout-${testId}`}>
      <div className="import-sheet-summary">
        <strong>Separação espacial preliminar</strong>
        <span>{lines.length} linha(s) · até {columns} campo(s) identificados por posição</span>
      </div>
      <div className="import-table-wrap">
        <table className="import-data-table" data-testid={`table-pdf-layout-${testId}`}>
          <thead>
            <tr><th scope="col">Linha</th>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {visibleLines.length > 0 ? visibleLines.map((line, index) => (
              <tr key={index}>
                <th scope="row">{index + 1}</th>
                {headers.map((_, columnIndex) => <td key={columnIndex}>{line.cells[columnIndex] ?? ''}</td>)}
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
