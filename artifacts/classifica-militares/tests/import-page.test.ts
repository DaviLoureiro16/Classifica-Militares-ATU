import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

let dom: JSDOM;
let React: typeof import('react');
let createRoot: typeof import('react-dom/client')['createRoot'];
let ImportPageContent: typeof import('../src/pages/import-page')['ImportPageContent'];
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement;
let confirmResult = true;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (check()) return;
    await React.act(async () => {
      await wait(10);
    });
  }
  assert.fail(`Timed out while waiting for ${description}.`);
}

function readJsdomFile(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new dom.window.FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Fictitious test file could not be read.'));
    reader.readAsArrayBuffer(file);
  });
}

function makeFile(contents: string, name: string): File {
  const file = new dom.window.File([contents], name, { type: 'text/csv' });
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: () => readJsdomFile(file),
  });
  return file as unknown as File;
}

function delayArrayBuffer(file: File, milliseconds: number): File {
  const originalArrayBuffer = file.arrayBuffer.bind(file);
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => {
      await wait(milliseconds);
      return originalArrayBuffer();
    },
  });
  return file;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

async function chooseCompetitionAndEdition(): Promise<void> {
  await React.act(async () => {
    const competition = container.querySelector<HTMLSelectElement>('#competition');
    const edition = container.querySelector<HTMLInputElement>('#edition');
    assert.ok(competition);
    assert.ok(edition);

    competition.value = 'EPCAR';
    competition.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    setInputValue(edition, '2026');
  });
}

async function upload(files: File[]): Promise<void> {
  await React.act(async () => {
    const input = container.querySelector<HTMLInputElement>('#local-file');
    assert.ok(input);
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}

async function mountPage(): Promise<void> {
  container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  root = createRoot(container);
  await React.act(async () => {
    root?.render(React.createElement(ImportPageContent));
  });
}

function cards(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.import-file-card'));
}

function statusFor(name: string): string {
  const card = cards().find((item) => item.querySelector('.file-name')?.textContent === name);
  return card?.querySelector('.import-status')?.textContent ?? '';
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await React.act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
}

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, {
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    FileReader: dom.window.FileReader,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
  React = await import('react');
  Object.assign(globalThis, { React });
  ({ createRoot } = await import('react-dom/client'));
  ({ ImportPageContent } = await import('../src/pages/import-page'));
});

beforeEach(async () => {
  confirmResult = true;
  dom.window.confirm = () => confirmResult;
  await mountPage();
});

afterEach(async () => {
  if (root) {
    await React.act(async () => root?.unmount());
    root = null;
  }
  container.remove();
});

after(() => {
  dom.window.close();
});

test('a importação múltipla mantém arquivos de mesmo nome com conteúdos diferentes e permite remover um', async () => {
  await chooseCompetitionAndEdition();
  const name = 'ficticio-duplicado.csv';
  await upload([
    makeFile('Nome;Código\nAna fictícia;A1', name),
    makeFile('Nome;Código\nAna fictícia;B2', name),
  ]);

  await waitFor(() => cards().length === 2 && cards().every((card) => card.textContent?.includes('Processado')), 'both fictional CSV files to process');
  assert.ok(cards().every((card) => card.textContent?.includes('mesmo nome, mas o conteúdo é diferente')));

  const removeFirst = container.querySelector<HTMLButtonElement>(`button[aria-label="Remover ${name}"]`);
  assert.ok(removeFirst);
  await clickButton(removeFirst);
  assert.equal(cards().length, 1);
  assert.equal(cards()[0].querySelector('.file-name')?.textContent, name);
});

test('um CSV inválido não interrompe a fila, e a limpeza remove os documentos após confirmação', async () => {
  await chooseCompetitionAndEdition();
  await upload([
    makeFile('Nome;Observação\n"aspas sem fechamento', 'ficticio-invalido.csv'),
    makeFile('Nome;Código\nCandidato fictício;C3', 'ficticio-valido.csv'),
  ]);

  await waitFor(
    () => statusFor('ficticio-invalido.csv').includes('aspa sem fechamento')
      && statusFor('ficticio-valido.csv').includes('Processado'),
    'the failed file and the following successful file',
  );

  const clearButton = container.querySelector<HTMLButtonElement>('[data-testid="button-limpar-arquivos"]');
  assert.ok(clearButton);
  confirmResult = false;
  await clickButton(clearButton);
  assert.equal(cards().length, 2);

  confirmResult = true;
  await clickButton(clearButton);
  assert.equal(cards().length, 0);
  assert.ok(container.querySelector('[data-testid="empty-import-list"]'));
});

test('remover o arquivo ativo cancela apenas sua leitura e permite que o próximo seja processado', async () => {
  await chooseCompetitionAndEdition();
  const activeFile = delayArrayBuffer(
    makeFile('Nome;Código\nPrimeiro fictício;D4', 'ficticio-lento.csv'),
    120,
  );
  await upload([
    activeFile,
    makeFile('Nome;Código\nSegundo fictício;E5', 'ficticio-seguinte.csv'),
  ]);

  await waitFor(() => statusFor('ficticio-lento.csv').includes('Lendo arquivo no navegador'), 'the first file to enter processing');
  const removeActive = container.querySelector<HTMLButtonElement>('button[aria-label="Remover ficticio-lento.csv"]');
  assert.ok(removeActive);
  await clickButton(removeActive);

  await waitFor(
    () => cards().length === 1 && statusFor('ficticio-seguinte.csv').includes('Processado'),
    'the remaining file to process after cancellation',
  );
});

test('limpar todos durante uma leitura cancela o item ativo e descarta o restante da fila', async () => {
  await chooseCompetitionAndEdition();
  await upload([
    delayArrayBuffer(makeFile('Nome;Código\nAtivo fictício;F6', 'ficticio-ativo.csv'), 160),
    makeFile('Nome;Código\nPendente fictício;G7', 'ficticio-pendente.csv'),
  ]);

  await waitFor(() => statusFor('ficticio-ativo.csv').includes('Lendo arquivo no navegador'), 'the queue to start processing');
  const clearButton = container.querySelector<HTMLButtonElement>('[data-testid="button-limpar-arquivos"]');
  assert.ok(clearButton);
  await clickButton(clearButton);
  assert.equal(cards().length, 0);

  await React.act(async () => {
    await wait(220);
  });
  assert.equal(cards().length, 0);
  assert.ok(container.querySelector('[data-testid="empty-import-list"]'));
});
