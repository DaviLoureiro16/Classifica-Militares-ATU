import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {
  MAX_FILE_SIZE_BYTES,
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

function makeFictionalTablePage(
  names: string[],
  includeHeader = true,
  shiftedRow = -1,
  incompleteRow = -1,
) {
  const items: Array<{ text: string; x: number; y: number }> = [];
  if (includeHeader) {
    items.push(
      { text: 'Nome', x: 20, y: 175 },
      { text: 'Inscricao', x: 220, y: 175 },
      { text: 'Nota', x: 360, y: 175 },
    );
  }
  names.forEach((name, index) => {
    const y = 150 - index * 20;
    items.push({ text: name, x: 20, y }, { text: `000${index + 101}`, x: 220, y });
    if (index !== incompleteRow) items.push({ text: `${8 + index},5`, x: 360, y });
    if (index === shiftedRow) items.push({ text: 'APTO fictício', x: 470, y });
  });
  return items;
}

test('PDF fictício com tabela alinhada recebe diagnóstico preliminar consistente', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([makeFictionalTablePage([
      'Ana Candidata Fictícia',
      'Bruno Candidato Fictício',
      'Carla Candidata Fictícia',
    ])]),
    pdfjs,
  );

  assert.equal(result.quality.level, 'consistent');
  assert.equal(result.quality.recognizedHeader, true);
  assert.equal(result.quality.structuredRows, 3);
  assert.equal(result.quality.expectedFields, 3);
  assert.equal(result.quality.fieldCountConsistency, 1);
  assert.equal(result.quality.incompleteLines, 0);
  assert.equal(result.quality.possibleShiftedLines, 0);
  assert.deepEqual(result.pages[0].lines[0].cells, ['Nome', 'Inscricao', 'Nota']);
});

test('PDF fictício multipágina exclui cabeçalhos repetidos das linhas de dados', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([
      makeFictionalTablePage(['Ana Candidata Fictícia', 'Bruno Candidato Fictício']),
      makeFictionalTablePage(['Carla Candidata Fictícia', 'Diego Candidato Fictício']),
    ]),
    pdfjs,
  );

  assert.equal(result.pageCount, 2);
  assert.equal(result.quality.level, 'consistent');
  assert.equal(result.quality.structuredRows, 4);
  assert.equal(result.pages[1].lines[0].cells[0], 'Nome');
});

test('PDF fictício com campo deslocado recomenda revisão em vez de declarar a tabela confiável', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([makeFictionalTablePage([
      'Ana Candidata Fictícia',
      'Bruno Candidato Fictício',
      'Carla Candidata Fictícia',
    ], true, 1)]),
    pdfjs,
  );

  assert.equal(result.quality.level, 'caution');
  assert.equal(result.quality.possibleShiftedLines, 1);
  assert.ok(result.quality.reasons.some((reason) => reason.includes('campos além')));
});

test('PDF fictício com linha incompleta sinaliza a quantidade de campos divergente', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([makeFictionalTablePage([
      'Ana Candidata Fictícia',
      'Bruno Candidato Fictício',
      'Carla Candidata Fictícia',
    ], true, -1, 1)]),
    pdfjs,
  );

  assert.equal(result.quality.level, 'caution');
  assert.equal(result.quality.incompleteLines, 1);
});

test('PDF com páginas legíveis e páginas sem texto alerta sobre cobertura parcial', async () => {
  const result = await extractPdfPages(
    makeFictionalLayoutPdf([
      makeFictionalTablePage([
        'Ana Candidata Fictícia',
        'Bruno Candidato Fictício',
        'Carla Candidata Fictícia',
      ]),
      [],
    ]),
    pdfjs,
  );

  assert.equal(result.quality.level, 'caution');
  assert.equal(result.quality.pageTextCoverage, 0.5);
  assert.deepEqual(result.pagesWithoutText, [2]);
});

test('PDF fictício com texto em duas colunas preserva a separação, mas sem cabeçalho é indeterminado', async () => {
  const page = [
    { text: 'Coluna esquerda', x: 20, y: 170 },
    { text: 'Coluna direita', x: 360, y: 170 },
    { text: 'Linha esquerda', x: 20, y: 145 },
    { text: 'Linha direita', x: 360, y: 145 },
    { text: 'Outra esquerda', x: 20, y: 120 },
    { text: 'Outra direita', x: 360, y: 120 },
  ];
  const result = await extractPdfPages(makeFictionalLayoutPdf([page]), pdfjs);

  assert.deepEqual(result.pages[0].lines[0].cells, ['Coluna esquerda', 'Coluna direita']);
  assert.equal(result.quality.level, 'indeterminate');
  assert.equal(result.quality.recognizedHeader, false);
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
