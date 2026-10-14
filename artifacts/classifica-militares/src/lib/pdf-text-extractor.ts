export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfExtraction {
  kind: 'pdf';
  pageCount: number;
  pages: PdfPageText[];
  pagesWithoutText: number[];
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
      pages.push({ pageNumber, text });
      page.cleanup();
    }

    return { kind: 'pdf', pageCount: pages.length, pages, pagesWithoutText };
  } finally {
    signal?.removeEventListener('abort', cancel);
    try {
      await task.destroy();
    } catch {
      // The task may already have been destroyed by cancellation.
    }
  }
}
