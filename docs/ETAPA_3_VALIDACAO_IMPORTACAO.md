# Etapa 3 — testes e privacidade da importação local

## Escopo

Este documento registra os testes automatizados da leitura local e a revisão das dependências usadas na importação. Os PDFs de teste são montados sinteticamente e não são PDFs oficiais. Um teste usa os quatro registros de referência informados pelo usuário para verificar a reconstrução dos campos; isso não confirma que os valores constem em um documento oficial.

Execute os testes com:

```sh
pnpm --filter @workspace/classifica-militares run test
pnpm --filter @workspace/classifica-militares run typecheck
```

Os testes exercitam leitura dos arquivos sintéticos com PDF.js e SheetJS, além da interação da página com seleção, fila, avisos e remoção. Eles não implementam nem testam classificação, cotas, reclassificação ou exportação de resultados.

## Estado da separação espacial preliminar

- O cabeçalho tabular é reconhecido antes da atribuição às colunas. O esquema EPCAR só é ativado quando os campos centrais e uma quantidade suficiente de cabeçalhos compatíveis estão presentes; títulos de página e estruturas parcialmente semelhantes permanecem sem mapeamento.
- As coordenadas do PDF.js orientam a reconstrução. Quando o PDF.js reúne números vizinhos em um único trecho de texto, os fragmentos numéricos são separados e posicionados para atribuição; divergências recuperadas por formato são marcadas para revisão.
- Campos vazios não deslocam os valores seguintes. Linhas incompletas e trechos sem posição segura são preservados para conferência; nenhum conteúdo é completado por inferência.
- A bateria atual cobre cabeçalhos institucionais, cabeçalho ausente em páginas de continuação, esquema incompatível, Clas deslocada, campos vazios e registros de referência em PDFs sintéticos.
- **Validação oficial pendente:** nenhum PDF de resultado oficial está disponível no projeto. Para confirmar cabeçalhos e registros contra a fonte, é necessário fornecer o PDF oficial que contém a tabela de resultado analisada. Até lá, os resultados são validados somente com fixtures sintéticas.

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
- Os testes automatizados não substituem a verificação manual em um navegador real com arquivos oficiais ou digitalizados. A bateria automatizada usa fixtures sintéticas, incluindo um PDF sintético com os quatro valores de referência fornecidos; ela não valida esses valores contra o PDF oficial.
