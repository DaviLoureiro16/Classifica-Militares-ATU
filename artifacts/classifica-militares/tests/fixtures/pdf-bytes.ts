import { Buffer } from 'node:buffer';

export interface FictionalPdfTextItem {
  text: string;
  x: number;
  y: number;
}

/**
 * Builds small, synthetic PDF files for parser tests. The content is fictional
 * and contains no real candidate or competition data.
 */
export function makeFictionalPdf(pages: Array<string | null>): Uint8Array {
  return buildPdf(pages.map((text) => text === null ? [] : [{ text, x: 20, y: 100 }]));
}

export function makeFictionalLayoutPdf(
  pages: Array<FictionalPdfTextItem[]>,
): Uint8Array {
  return buildPdf(pages);
}

function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, '\\$&');
}

function buildPdf(pages: Array<FictionalPdfTextItem[]>): Uint8Array {
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  pages.forEach((text, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const content = text
      .map((item) => `BT /F1 10 Tf ${item.x} ${item.y} Td (${escapePdfText(item.text)}) Tj ET`)
      .join('\n');
    objects[pageObjectId - 1] = [
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 220]',
      '/Resources << /Font << /F1 3 0 R >> >>',
      `/Contents ${contentObjectId} 0 R >>`,
    ].join(' ');
    objects[contentObjectId - 1] = [
      `<< /Length ${Buffer.byteLength(content)} >>`,
      'stream',
      content,
      'endstream',
    ].join('\n');
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, 'utf8'));
}
