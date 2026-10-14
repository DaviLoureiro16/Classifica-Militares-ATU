# Etapa 3 — testes e privacidade da importação local

## Escopo

Este documento registra os testes automatizados da leitura local e a revisão das dependências usadas na importação. Todos os arquivos de teste são sintéticos, contêm apenas dados fictícios e não representam candidatos, editais ou resultados reais.

Execute os testes com:

```sh
pnpm --filter @workspace/classifica-militares run test
pnpm --filter @workspace/classifica-militares run typecheck
```

Os testes exercitam leitura real dos arquivos fictícios com PDF.js e SheetJS, além da interação da página com seleção, fila, avisos e remoção. Eles não implementam nem testam classificação, cotas, reclassificação ou exportação de resultados.

## Arquivos e dependências

- `local-file-reader.ts` lê os bytes selecionados com `File.arrayBuffer()` e interpreta PDF, XLS/XLSX e CSV no cliente.
- PDF.js é importado pelo pacote do aplicativo. O worker é referenciado por `pdfjs-dist/build/pdf.worker.min.mjs?url`, para o Vite incluí-lo como recurso do próprio build. Não há configuração para buscar o worker de um CDN em tempo de execução.
- SheetJS (`xlsx` 0.20.3) está instalado a partir do tarball `cdn.sheetjs.com`. Essa origem é usada pelo gerenciador de pacotes durante a instalação; não é um destino de upload dos arquivos selecionados. O módulo é importado pelo leitor e empacotado pelo Vite.
- A revisão do código do aplicativo não encontrou `fetch`, `XMLHttpRequest`, `sendBeacon`, `axios` ou `FormData` no fluxo de importação. O leitor não encaminha o conteúdo para a API do projeto, OCR ou serviço de IA.

## Recursos externos carregados pela interface

O HTML e a folha de estilos carregam fontes do Google Fonts (Inter, DM Sans e Manrope). Isso faz o navegador solicitar arquivos de fonte a um terceiro, mas a solicitação não inclui os arquivos escolhidos para importação. Portanto, a leitura continua local, embora a página não seja totalmente livre de solicitações externas.

Se o produto exigir que a página também funcione sem contatos externos, as alternativas são incluir os arquivos de fonte no próprio aplicativo ou usar uma pilha de fontes do sistema. Essa mudança não é necessária para impedir o envio dos documentos e foi deixada fora desta correção para preservar a apresentação existente.

## Limites verificados

- PDF sem texto selecionável é sinalizado; não há OCR.
- PDFs corrompidos ou incompatíveis devem produzir erro de leitura, não uma prévia de sucesso.
- O limite atual é de 25 MB por arquivo. Vários documentos podem permanecer simultaneamente na memória da página.
- Os testes automatizados não substituem a verificação manual em um navegador real com arquivos oficiais ou digitalizados. Para esta etapa, os testes usam somente conteúdo sintético.
