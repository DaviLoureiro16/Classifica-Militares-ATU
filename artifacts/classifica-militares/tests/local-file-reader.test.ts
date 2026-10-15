import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  DOCUMENT_TYPE_OPTIONS,
  MAX_FILE_SIZE_BYTES,
  normalizeDocumentType,
  readLocalFile,
  reparseCsvFile,
} from '../src/lib/local-file-reader';
import {
  assessPdfQuality,
  extractPdfPages,
  type PdfJsEngine,
} from '../src/lib/pdf-text-extractor';
import { makeFictionalLayoutPdf, makeFictionalPdf } from './fixtures/pdf-bytes';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfJsEngine;

test('as oito categorias de documento mantêm a ordem solicitada e convertem o valor legado', () => {
  assert.deepEqual(DOCUMENT_TYPE_OPTIONS.map((option) => option.label), [
    'Edital e anexos',
    'Lista de resultado oficial',
    'Lista de resultado de uma etapa',
    'Lista de classificação após uma etapa',
    'Lista histórica de classificação',
    'Lista de convocação final e/ou matrícula',
    'Retificação ou resultado de recurso',
    'Outro documento relacionado ao concurso',
  ]);
  assert.ok(DOCUMENT_TYPE_OPTIONS.every((option) => option.description.length > 0));
  assert.equal(normalizeDocumentType('resultado-inicial'), 'resultado-oficial');
  assert.equal(normalizeDocumentType('historico-classificacao'), 'historico-classificacao');
  assert.equal(normalizeDocumentType('valor-desconhecido'), 'outro');
});

test('as sugestões de tipo de documento usam as novas categorias', async () => {
  const cases: Array<[string, string, string]> = [
    ['ficticio-edital.csv', 'Edital de abertura e documentos anexos', 'edital'],
    ['ficticio-resultado.csv', 'Resultado oficial e classificação geral', 'resultado-oficial'],
    ['ficticio-etapa.csv', 'Resultado da etapa TACF: candidato apto', 'resultado-etapa'],
    ['ficticio-pos-etapa.csv', 'Classificação após a etapa TACF', 'classificacao-apos-etapa'],
    ['ficticio-historico.csv', 'Histórico de classificação da edição anterior', 'historico-classificacao'],
    ['ficticio-convocacao.csv', 'Convocação final para matrícula', 'convocacao-matricula'],
    ['ficticio-retificacao.csv', 'Retificação do resultado após recurso', 'recurso-retificado'],
  ];

  for (const [name, text, expected] of cases) {
    const result = await readLocalFile(makeFile(`Documento fictício;${text}`, name));
    assert.equal(result.metadata.documentTypeSuggestion, expected, name);
  }
});

function makeFile(bytes: string | Uint8Array, name: string, type = ''): File {
  if (typeof bytes === 'string') return new File([bytes], name, { type });
  const safeBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(safeBuffer).set(bytes);
  return new File([safeBuffer], name, { type });
}

function makeWorkbookFile(bookType: 'xlsx' | 'xls'): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Nome', 'Inscrição'],
      ['Candidato fictício', '000321'],
    ]),
    'Lista principal',
  );
  if (bookType === 'xlsx') {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Disciplina', 'Nota'],
        ['Matemática', 8.5],
      ]),
      'Notas fictícias',
    );
  }
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType }) as Uint8Array;
  return makeFile(bytes, `ficticio-teste.${bookType}`, 'application/octet-stream');
}

test('CSV fictício preserva acentos, zeros iniciais e campos entre aspas', async () => {
  const bytes = await readFile(new URL('./fixtures/ficticio-portugues.csv', import.meta.url));
  const result = await readLocalFile(makeFile(bytes, 'ficticio-portugues.csv', 'text/csv'));

  assert.equal(result.format, 'CSV');
  assert.equal(result.extracted.kind, 'csv');
  if (result.extracted.kind !== 'csv') return;
  assert.deepEqual(result.extracted.rows[1], [
    'João de Souza',
    '000123',
    'Candidato fictício; sem dados oficiais',
  ]);
  assert.deepEqual(result.extracted.rows[2], ['Maria da Conceição', '000124', 'Revisar ação']);
});

test('CSV fictício com vírgula respeita o delimitador escolhido', async () => {
  const bytes = await readFile(new URL('./fixtures/ficticio-virgula.csv', import.meta.url));
  const file = makeFile(bytes, 'ficticio-virgula.csv', 'text/csv');
  const automatic = await readLocalFile(file);
  assert.equal(automatic.extracted.kind, 'csv');
  if (automatic.extracted.kind !== 'csv') return;
  assert.equal(automatic.extracted.delimiter, ',');

  const forcedSemicolon = await reparseCsvFile(file, ';');
  assert.equal(forcedSemicolon.delimiter, ';');
  assert.equal(forcedSemicolon.rows[0].length, 1);

  const forcedComma = await reparseCsvFile(file, ',');
  assert.equal(forcedComma.rows[1][0], 'João, candidato fictício');
  assert.equal(forcedComma.rows[1][2], 'Ação, revisão');
});

test('CSV legado em Windows-1252 sinaliza e preserva caracteres portugueses', async () => {
  const bytes = Uint8Array.from([
    78, 111, 109, 101, 59, 79, 98, 115, 101, 114, 118, 97, 231, 227, 111, 10,
    74, 111, 227, 111, 59, 97, 231, 227, 111,
  ]);
  const result = await readLocalFile(makeFile(bytes, 'ficticio-windows-1252.csv', 'text/csv'));

  assert.equal(result.extracted.kind, 'csv');
  if (result.extracted.kind !== 'csv') return;
  assert.equal(result.extracted.encoding, 'Windows-1252');
  assert.deepEqual(result.extracted.rows[1], ['João', 'ação']);
  assert.ok(result.warnings.some((warning) => warning.includes('Windows-1252')));
});

test('XLSX fictício preserva múltiplas planilhas, linhas e valores', async () => {
  const result = await readLocalFile(makeWorkbookFile('xlsx'));

  assert.equal(result.format, 'Excel XLSX');
  assert.equal(result.extracted.kind, 'spreadsheet');
  if (result.extracted.kind !== 'spreadsheet') return;
  assert.deepEqual(result.extracted.sheets.map((sheet) => sheet.name), [
    'Lista principal',
    'Notas fictícias',
  ]);
  assert.deepEqual(result.extracted.sheets[0].rows[1], ['Candidato fictício', '000321']);
  assert.deepEqual(result.extracted.sheets[1].rows[1], ['Matemática', 8.5]);
});

test('XLS fictício em formato legado é lido como planilha', async () => {
  const result = await readLocalFile(makeWorkbookFile('xls'));

  assert.equal(result.format, 'Excel XLS');
  assert.equal(result.extracted.kind, 'spreadsheet');
  if (result.extracted.kind !== 'spreadsheet') return;
  assert.equal(result.extracted.sheets[0].name, 'Lista principal');
  assert.deepEqual(result.extracted.sheets[0].rows[1], ['Candidato fictício', '000321']);
});

test('arquivo vazio e conteúdo incompatível com a extensão são rejeitados', async () => {
  await assert.rejects(
    readLocalFile(makeFile(new Uint8Array(), 'ficticio-vazio.csv', 'text/csv')),
    /arquivo está vazio/i,
  );
  await assert.rejects(
    readLocalFile(makeFile('Nome;Inscrição\nTeste;0001', 'ficticio-planilha.xlsx')),
    /não foi reconhecido como XLS\/XLSX/i,
  );
  await assert.rejects(
    readLocalFile(makeFile('conteúdo fictício', 'ficticio-pdf-invalido.pdf')),
    /não parece ser um PDF válido/i,
  );
});

test('PDF fictício extrai texto na ordem das páginas', async () => {
  const bytes = makeFictionalPdf([
    'FICTICIO PAGINA UM CANDIDATO DE TESTE',
    'FICTICIO PAGINA DOIS RESULTADO DE TESTE',
  ]);
  const messages: string[] = [];
  const result = await extractPdfPages(bytes, pdfjs, undefined, (message) => messages.push(message));

  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2]);
  assert.match(result.pages[0].text, /FICTICIO PAGINA UM/);
  assert.match(result.pages[1].text, /FICTICIO PAGINA DOIS/);
  assert.deepEqual(result.pagesWithoutText, []);
  assert.equal(result.quality.level, 'indeterminate');
  assert.deepEqual(messages, ['PDF: lendo página 1 de 2', 'PDF: lendo página 2 de 2']);
});

const CPCAR_COLUMNS = [
  'Nome', 'Inscrição', 'Clas', 'MF', 'Port', 'Mat', 'Ing', 'Red',
  'Dt_nasc', 'AC', 'RV', 'CI',
];
const CPCAR_COLUMN_X = [20, 180, 270, 320, 370, 420, 470, 520, 570, 635, 690, 750];

function makeCpcarResultPage(records: string[][], includeHeader = true, title = false) {
  const items: Array<{ text: string; x: number; y: number }> = [];
  if (title) {
    items.push(
      { text: 'DIRETORIA DE ENSINO', x: 20, y: 196 },
      { text: 'SISTEMA INTEGRADO DE GESTAO E CONTROLE', x: 20, y: 188 },
      { text: 'EA CPCAR 2026', x: 20, y: 180 },
      { text: 'AMPLA CONCORRENCIA', x: 20, y: 174 },
    );
  }
  if (includeHeader) {
    CPCAR_COLUMNS.forEach((text, index) => items.push({
      text: text === 'Inscrição' ? 'Inscricao' : text,
      x: CPCAR_COLUMN_X[index],
      y: 165,
    }));
  }
  records.forEach((record, rowIndex) => {
    const y = 145 - rowIndex * 18;
    record.forEach((text, index) => {
      if (text !== '') items.push({ text, x: CPCAR_COLUMN_X[index], y });
    });
  });
  return items;
}

const CPCAR_REFERENCE_RECORDS = [
  [
    'ADAM QUINTANILHA DA SILVA', '2030008', '1040', '6.0812', '5.0000', '6.2500',
    '6.8750', '6.2000', '19/06/2008', 'X', '', 'Convocado',
  ],
  [
    'ADLA DE ANDRADE SALES', '2120002', '211', '7.4625', '6.2500', '6.8750',
    '8.1250', '8.6000', '18/11/2009', 'X', 'X', 'Convocado',
  ],
  [
    'ADRIAN CARVALHO DESVARS ARAUJO', '2060002', '507', '7.0125', '5.6250', '5.0000',
    '8.1250', '9.3000', '23/12/2010', 'X', 'X', 'Convocado',
  ],
  [
    'ADRIANO HENRIQUE DO NASCIMENTO CARVALHO', '2030013', '141', '7.6625', '7.5000',
    '5.6250', '8.1250', '9.4000', '18/02/2008', 'X', '', 'Convocado',
  ],
];

test('PDF EA CPCAR reconhece os 12 cabeçalhos reais e ignora títulos institucionais', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([makeCpcarResultPage(CPCAR_REFERENCE_RECORDS, true, true)]),
    pdfjs,
  );
  const lines = result.pages[0].lines;
  const header = lines.find((line) => line.kind === 'table-header');

  assert.ok(header);
  assert.deepEqual(header.cells, CPCAR_COLUMNS);
  assert.equal(header.cells.includes('INHA'), false);
  assert.equal(lines.filter((line) => line.kind === 'metadata').length, 4);
  assert.equal(result.quality.expectedFields, 12);
  assert.equal(result.quality.structuredRows, 4);
});

test('PDF EA CPCAR mantém inscrição, classificação, notas, data e status em campos independentes', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([makeCpcarResultPage(CPCAR_REFERENCE_RECORDS)]),
    pdfjs,
  );
  const records = result.pages[0].lines
    .filter((line) => line.kind === 'candidate')
    .map((line) => line.record);

  assert.deepEqual(records[0], {
    nome: 'ADAM QUINTANILHA DA SILVA',
    inscricao: '2030008',
    clas: '1040',
    mf: '6.0812',
    port: '5.0000',
    mat: '6.2500',
    ing: '6.8750',
    red: '6.2000',
    dtNasc: '19/06/2008',
    ac: 'X',
    rv: '',
    ci: 'Convocado',
  });
  assert.deepEqual(records[1], {
    nome: 'ADLA DE ANDRADE SALES',
    inscricao: '2120002',
    clas: '211',
    mf: '7.4625',
    port: '6.2500',
    mat: '6.8750',
    ing: '8.1250',
    red: '8.6000',
    dtNasc: '18/11/2009',
    ac: 'X',
    rv: 'X',
    ci: 'Convocado',
  });
  assert.equal(records[2]?.nome, 'ADRIAN CARVALHO DESVARS ARAUJO');
  assert.equal(records[2]?.inscricao, '2060002');
  assert.equal(records[2]?.clas, '507');
  assert.equal(records[2]?.mf, '7.0125');
  assert.equal(records[2]?.dtNasc, '23/12/2010');
  assert.equal(records[3]?.nome, 'ADRIANO HENRIQUE DO NASCIMENTO CARVALHO');
  assert.equal(records[3]?.inscricao, '2030013');
  assert.equal(records[3]?.clas, '141');
  assert.equal(records[3]?.mf, '7.6625');
  assert.equal(records[3]?.dtNasc, '18/02/2008');
  assert.equal(result.quality.level, 'consistent');
});

test('PDF recupera Clas deslocada uma coluna sem confundir inscrição ou média final', async () => {
  const page = makeCpcarResultPage([CPCAR_REFERENCE_RECORDS[1]]);
  const shiftedClas = page.find((item) => item.text === '211');
  assert.ok(shiftedClas);
  shiftedClas.x = 301;

  const result = await extractPdfPages(makeFictionalLayoutPdf([page]), pdfjs);
  const candidate = result.pages[0].lines.find((line) => line.kind === 'candidate');

  assert.equal(candidate?.record?.inscricao, '2120002');
  assert.equal(candidate?.record?.clas, '211');
  assert.equal(candidate?.record?.mf, '7.4625');
  assert.equal(candidate?.record?.port, '6.2500');
  assert.equal(candidate?.record?.ci, 'Convocado');
  assert.equal(candidate?.needsReview, true);
});

test('PDF de estrutura diferente não recebe os cabeçalhos CPCAR por semelhança parcial', async () => {
  const items = makeCpcarResultPage([CPCAR_REFERENCE_RECORDS[0]]);
  const reducedHeader = new Set(['Nome', 'Inscricao', 'Clas', 'MF', 'Port', 'Mat', 'Ing']);
  const page = items.filter((item) => item.y !== 165 || reducedHeader.has(item.text));

  const result = await extractPdfPages(makeFictionalLayoutPdf([page]), pdfjs);

  assert.equal(result.pages[0].lines.some((line) => line.kind === 'table-header'), false);
  assert.equal(result.pages[0].lines.some((line) => line.kind === 'candidate'), false);
  assert.ok(result.pages[0].lines.some((line) => line.kind === 'unmapped'));
});

test('PDF multipágina reutiliza o cabeçalho e não transforma títulos repetidos em registros', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([
      makeCpcarResultPage(CPCAR_REFERENCE_RECORDS.slice(0, 2), true, true),
      makeCpcarResultPage(CPCAR_REFERENCE_RECORDS.slice(2), true, true),
    ]),
    pdfjs,
  );

  assert.equal(result.pageCount, 2);
  assert.equal(result.quality.structuredRows, 4);
  assert.equal(result.pages[1].lines.filter((line) => line.kind === 'table-header').length, 1);
  assert.equal(result.pages[1].lines.filter((line) => line.kind === 'metadata').length, 4);
  assert.equal(result.pages[1].lines.filter((line) => line.kind === 'candidate').length, 2);
});

test('PDF sem cabeçalho repetido reutiliza os limites anteriores em páginas seguintes', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([
      makeCpcarResultPage(CPCAR_REFERENCE_RECORDS.slice(0, 2)),
      makeCpcarResultPage(CPCAR_REFERENCE_RECORDS.slice(2), false),
    ]),
    pdfjs,
  );

  assert.equal(result.pages[1].lines.filter((line) => line.kind === 'candidate').length, 2);
  assert.equal(result.pages[1].lines[0].record?.inscricao, '2060002');
});

test('PDF mantém linha incompleta para revisão e não desloca campos depois de um valor vazio', async () => {
  const incomplete = [...CPCAR_REFERENCE_RECORDS[0]];
  incomplete[1] = '';
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([makeCpcarResultPage([CPCAR_REFERENCE_RECORDS[0], incomplete])]),
    pdfjs,
  );
  const candidates = result.pages[0].lines.filter((line) => line.kind === 'candidate');

  assert.equal(candidates.length, 2);
  assert.equal(candidates[1].record?.inscricao, '');
  assert.equal(candidates[1].record?.clas, '1040');
  assert.equal(candidates[1].record?.mf, '6.0812');
  assert.equal(candidates[1].record?.ci, 'Convocado');
  assert.equal(candidates[1].needsReview, true);
  assert.equal(result.quality.level, 'caution');
});

test('PDF preserva trechos de posição incerta sem adicionar colunas à tabela', async () => {
  const page = makeCpcarResultPage(CPCAR_REFERENCE_RECORDS.slice(0, 1));
  page.push({ text: 'FICTICIO', x: 810, y: 145 });
  const result = await extractPdfPages(makeFictionalLayoutPdf([page]), pdfjs);
  const candidate = result.pages[0].lines.find((line) => line.kind === 'candidate');

  assert.ok(candidate);
  assert.equal(candidate.cells.length, 12);
  assert.deepEqual(candidate.unmappedFragments, ['FICTICIO']);
  assert.equal(candidate.needsReview, true);
  assert.equal(result.quality.possibleShiftedLines, 1);
});

test('PDF com página sem texto alerta sobre cobertura parcial', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([
      makeCpcarResultPage(CPCAR_REFERENCE_RECORDS.slice(0, 3)),
      [],
    ]),
    pdfjs,
  );

  assert.equal(result.quality.level, 'caution');
  assert.equal(result.quality.pageTextCoverage, 0.5);
  assert.deepEqual(result.pagesWithoutText, [2]);
});

test('linhas numerosas sem cabeçalho não são classificadas como confiáveis', () => {
  const pages = [{
    pageNumber: 1,
    text: Array.from({ length: 30 }, (_, index) => `Pessoa Fictícia ${index} 000${index} 8,5`).join('\n'),
    lines: Array.from({ length: 30 }, (_, index) => ({
      text: `Pessoa Fictícia ${index} 000${index} 8,5`,
      cells: [`Pessoa Fictícia ${index}`, `000${index}`, '8,5'],
    })),
  }];

  const quality = assessPdfQuality(pages, []);
  assert.equal(quality.level, 'indeterminate');
  assert.equal(quality.recognizedHeader, false);
});

test('PDF sintético sem camada de texto é reconhecido sem OCR ou conteúdo inventado', async () => {
  const result = await extractPdfPages(makeFictionalPdf([null]), pdfjs);

  assert.equal(result.pageCount, 1);
  assert.deepEqual(result.pagesWithoutText, [1]);
  assert.equal(result.pages[0].text, '');
  assert.equal(result.quality.level, 'insufficient');
});

test('PDF corrompido com assinatura válida falha explicitamente', async () => {
  await assert.rejects(
    extractPdfPages(new TextEncoder().encode('%PDF-1.4\nconteúdo fictício truncado'), pdfjs),
  );
});

test('arquivos acima do limite por item são recusados antes da leitura', async () => {
  const oversized = {
    name: 'ficticio-grande.csv',
    size: MAX_FILE_SIZE_BYTES + 1,
    arrayBuffer: async () => {
      throw new Error('A leitura não deveria começar para um arquivo fora do limite.');
    },
  } as unknown as File;

  await assert.rejects(readLocalFile(oversized), /excede o limite de 25 MB/i);
});
