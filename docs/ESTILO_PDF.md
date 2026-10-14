# Estilo de saída — Excel e PDF

## Aplicabilidade

Os requisitos abaixo são os que o Excel-FAB-Assistente descreve para reclassificação, sobretudo no estilo EPCAR/EA CPCAR. Não são um padrão universal do Classifica Militares nem devem ser aplicados a AFA/outros concursos sem conferir a edição e o formato oficial.

## Estrutura dos arquivos

### Excel

Abas, nesta ordem:

1. `Classificacao_Geral`
2. `Reserva_PP`
3. `Cotistas_Ampla`
4. `Excluidos`
5. `Regras`

### PDF

Blocos, nesta ordem: classificação geral; lista exclusiva dos cotistas; cotistas nas vagas da ampla; excluídos acumulativos. Cada bloco tem título próprio. A aba `Regras` é indicada como última aba do Excel; o ZIP não exige um bloco `Regras` no PDF.

**Origem:** `commands/listas.md`, “Ordem obrigatória”; `skills/fab-concursos/references/formato-proibido.md`, “Obrigatório entregar”.

## Colunas e conservação dos dados

Ordem-base, quando os campos existem na origem:

`Nova Clas.` | `Nome` | `Inscrição` | `Clas. RV` | `Situação da Vaga` | `MF` | `Port` | `Mat` | `Ing` | `Red` | `Dt_nasc` | `Cota` | `Clas. Original` | `Clas. RV Original` | coluna(s) de situação da etapa | `Observação`

- Manter colunas adicionais presentes na lista original.
- Usar o nome completo da coluna de etapa: `Situação CI`, `Situação INSPSAU`, `Situação EAP` ou `Situação TACF`.
- Incluir só a etapa atual, salvo pedido explícito de histórico ou dados anteriores nos anexos.
- Cota por extenso segundo os rótulos da fonte.
- Não tachar células.

**Origem:** `skills/fab-concursos/references/estilo-pdf-classificacao.md`, “Colunas-base” e “Colunas de situação”; `references/colunas-situacao-etapa.md`, “Regra de inclusão”; `references/etapas-eliminatorias.md`, “O que permanece”.

## Apresentação

- Página A4 paisagem; margem aproximada de 0,6–0,8 cm.
- Fonte Calibri ou Arial. Excel: 9 pt. PDF: 7–8 pt; mínimo 6,5 pt apenas se ainda legível.
- Título centralizado, azul-marinho `#1F3864`, em duas linhas.
- Cabeçalho da tabela repetido em cada página do PDF; número da página no canto inferior direito.
- Referência de 35–42 linhas de dados por página, priorizando legibilidade.
- Cabeçalho da tabela: fundo `#1F3864`, texto branco e negrito; todos os títulos centralizados, inclusive Nome; borda `#BFBFBF`.
- Corpo: texto preto, grade `#BFBFBF`; Nome à esquerda e demais colunas centralizadas.
- Excel: autofit com largura mínima razoável. PDF: larguras proporcionais fixas.
- Nenhuma célula pode ultrapassar duas linhas ou cortar texto. Data `DD/MM/AAAA` deve permanecer em uma linha. Cabeçalhos podem ter até duas linhas.
- Se faltarem espaço ou legibilidade, reduzir colunas de situação antes de estreitar ou cortar conteúdo.

**Origem:** `skills/fab-concursos/references/estilo-pdf-classificacao.md`, “Página”, “Largura e espaçamento”, “Cabeçalho da tabela” e “Corpo”; `references/colunas-situacao-etapa.md`, “Layout”.

## Cores por situação e lista

As cores aplicam-se à linha inteira conforme a classificação e o bloco; a mesma reversão deliberadamente usa cores diferentes nas duas listas.

| Situação | Classificação geral | Lista exclusiva dos cotistas | Cotistas na ampla |
|---|---|---|---|
| Vaga Ampla | Amarelo-claro `#FFF2CC` | `#FFF2CC` | `#FFF2CC` |
| Vaga Reservada PP | Verde-claro `#E2EFDA` | `#E2EFDA` | — |
| Vaga PP por reversão | Verde-claro `#E2EFDA` | Amarelo-claro `#FFF2CC` | — |
| Cadastro de reserva AC | Ímpar branco `#FFFFFF`; par cinza `#F2F2F2` | — | — |
| Cadastro de reserva RV | Ímpar/par pela Nova Clas. | Ímpar/par pela Clas. RV | — |
| Ausente/Incapaz | Vermelho-claro `#F6C9C9`, texto preto | Vermelho-claro `#F6C9C9`, texto preto | Vermelho-claro `#F6C9C9`, texto preto |

- Cadastro não recebe verde/laranja nem tachado.
- A linha judicial identificada apenas com `*` não participa da zebra numérica; aplicar a cor de sua situação de vaga.
- A numeração da reversão continua a contagem da reserva; não reinicia na quantidade revertida.

**Origem:** `skills/fab-concursos/references/estilo-pdf-classificacao.md`, “Cores da linha inteira”, “Cadastro” e “Numeração da reversão”; `README.md`, tabela “Cores oficiais”; `SKILL.md`, “BLOQUEIO DE ENTREGA”.

## Requisitos de saída e limitações

- Para pedido de classificação/reclassificação, o plugin prescreve Excel e PDF, com o PDF derivado do mesmo conteúdo do Excel.
- A saída de reclassificação deve ser a tabela de classificação do plugin; não substituir por “Resultado Consolidado”, `Base_Geral` ou painel/dashboard de totais.
- Uma solicitação explicitamente estatística pode ter painel além da classificação; a instrução não o coloca no lugar da tabela, salvo se o usuário disser que não quer a tabela.
- O ZIP define especificações visuais e nomes de abas, mas não contém arquivo-modelo, arquivo de entrada ou arquivo exportado de exemplo para comparar.

**Origem:** `skills/excel-arquivos/SKILL.md`, “Passos”; `skills/fab-concursos/references/formato-proibido.md`; `references/reclassificacao-edital.md`, “Saída”.

## Itens que ainda precisam de validação

- Se o PDF de uma edição da AFA ou de outro concurso exige estrutura, cores ou paginação diferente.
- Se os cabeçalhos-base e categorias de cotas se aplicam à edição a processar.
- Se os nomes e a ordem dos quatro blocos coincidem com as exigências oficiais daquele edital.
- Se os tamanhos de fonte e limite de linhas são adequados à quantidade de colunas reais.

