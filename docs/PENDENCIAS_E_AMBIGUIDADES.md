# Pendências e ambiguidades da análise do plugin

## Prioridade alta — resolver antes de implementar regras

### P1. Regras detalhadas da AFA não estão no ZIP

- **Descrição:** O roteamento do plugin menciona AFA, mas os arquivos de cálculo são identificados como EPCAR/EA CPCAR. Não há especificação de fórmula, desempate, cotas, fases ou saídas própria da AFA.
- **Impacto:** Aplicar o algoritmo CPCAR à AFA sem confirmação pode produzir classificação incorreta.
- **Arquivos:** `skills/fab-concursos/SKILL.md`; `references/mapa-ingresso.md`; `references/etapas-eliminatorias.md`; `references/regras-edital-classificacao.md`; `references/reclassificacao-edital.md`.
- **Informação necessária:** edital e resultados oficiais da edição AFA desejada e regras próprias validadas.
- **Prioridade:** Alta.

### P2. Escopo FAB versus plataforma geral

- **Descrição:** O plugin se apresenta como assistente de concursos FAB e o algoritmo/base de cotas é EPCAR/EA CPCAR. Isso não estabelece regras para outras forças ou instituições.
- **Impacto:** Não é seguro generalizar nomenclaturas, etapas, fórmulas, listas ou cores para concursos do Exército, Marinha ou outras instituições.
- **Arquivos:** `SKILL.md`; `skills/fab-concursos/SKILL.md`; `references/mapa-ingresso.md`; `references/etapas-eliminatorias.md`; `references/regras-edital-classificacao.md`.
- **Informação necessária:** pacote de regras e documentos oficiais próprios de cada concurso e edição a habilitar.
- **Prioridade:** Alta.

### P3. Cotas e referência legal precisam de validação por edição

- **Descrição:** `regras-edital-classificacao.md` atribui percentuais (30%, divididos em 25%/3%/2%), requisito de duas vagas por especialidade e arredondamento à Lei nº 15.142/2025, mas o ZIP não inclui o texto da lei nem a edição do edital que sustenta essa regra.
- **Impacto:** Percentuais e reversões podem mudar ou ter condições específicas no edital.
- **Arquivos:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Reserva de vagas”.
- **Informação necessária:** fonte legal e edital vigentes da edição concreta; confirmar percentuais, elegibilidade, arredondamento e ordem de reversão.
- **Prioridade:** Alta.

### P4. Nome da lista de eliminados

- **Descrição:** Há referências à “aba Ausentes”, “aba Excluidos” e “lista de fora da ordem”. A especificação mais recente do produto exige `Excluidos`, mas outras passagens ainda usam `Ausentes`.
- **Impacto:** Pode haver abas ou blocos com nomes divergentes, apesar da regra de acumulação ser a mesma.
- **Arquivos:** `skills/fab-concursos/references/colunas-situacao-etapa.md`, “O que NÃO muda”; `references/etapas-eliminatorias.md`, “Acúmulo”; `references/reclassificacao-edital.md`, regras 1–2; `commands/listas.md`, ordem obrigatória.
- **Informação necessária:** confirmar que `Excluidos` é o nome final em Excel e PDF e que inclui ausentes, incapazes e excluídos de todas as etapas.
- **Prioridade:** Alta.

### P5. Identificação e pesquisa de candidatos judiciais

- **Descrição:** O plugin permite pesquisa no ano do concurso para confirmar participação judicial, usando cruzamento de nome e inscrição. As demais regras priorizam apenas anexos do usuário. Não há lista de fontes/critério de evidência ou procedimento de registro da pesquisa.
- **Impacto:** Marcar alguém incorretamente altera a sequência de classificação e o tamanho do bloco de ampla.
- **Arquivos:** `skills/fab-concursos/references/decisao-judicial.md`, “Busca permitida”; `references/reclassificacao-edital.md`, regra 13; `SKILL.md`, itens 7, 12 e 24.
- **Informação necessária:** política de fontes permitidas, evidência mínima, registro da fonte e autorização para pesquisar a edição.
- **Prioridade:** Alta.

## Prioridade média — resolver ao projetar dados e saídas

### P6. Metadado de versão divergente

- **Descrição:** `.claude-plugin/plugin.json` e `README.md` declaram `1.31.0`; o frontmatter de `SKILL.md` declara `metadata.version: "1.25.0"`. Há também menções a versões históricas no texto, que não são por si só divergências.
- **Impacto:** Ferramentas ou leitores podem atribuir o conteúdo à versão errada e não saber se as regras recentes estão incorporadas.
- **Arquivos:** `.claude-plugin/plugin.json`; `README.md`; `SKILL.md`, frontmatter.
- **Informação necessária:** confirmar a versão efetiva do `SKILL.md` e atualizar seu metadado numa revisão do plugin.
- **Prioridade:** Média.

### P7. Empate e regras de classificação dependem do edital

- **Descrição:** O desempate por notas e idade vem de `regras-edital-classificacao.md`; a classificação pós-etapa permite usar menor Clas. Original se faltarem notas individuais. Não há especificação do próximo critério se todos esses elementos empatarem nem de como proceder com dados incompletos além do caso descrito.
- **Impacto:** A ordem final pode não ser determinística em casos não cobertos.
- **Arquivos:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Critérios de desempate”; `references/reclassificacao-edital.md`, regra 3.
- **Informação necessária:** critério residual no edital da edição e regra para campo ausente/conflitante.
- **Prioridade:** Média.

### P8. Vocabulário de etapa e status

- **Descrição:** O plugin padroniza `Inapto`/`Não apto` como `Incapaz` no arquivo final, mas os documentos oficiais podem usar termos diferentes. O mapeamento pode depender da etapa, recurso e edital.
- **Impacto:** Transformação inadequada pode alterar quem permanece ou sai da classificação.
- **Arquivos:** `skills/fab-concursos/references/etapas-eliminatorias.md`, tabela de títulos e status e “Acúmulo”; `references/colunas-situacao-etapa.md`.
- **Informação necessária:** tabela de mapeamento por documento oficial/etapa e validação de que cada equivalência se aplica à edição.
- **Prioridade:** Média.

### P9. Ordem e tratamento de reversões por edital

- **Descrição:** A regra de reversão descreve uma sequência para categorias reservadas, enquanto instruções também falam em proporcionalidade e reversão para ampla. A fórmula para calcular cada modalidade e interação com todas as vagas não está formalizada para toda edição.
- **Impacto:** A quantidade e a modalidade de vagas podem ser atribuídas incorretamente.
- **Arquivos:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Reversão de vagas não preenchidas”; `references/reclassificacao-edital.md`, regras 5–8.
- **Informação necessária:** sequência exata e exemplos oficiais para cada edital a suportar.
- **Prioridade:** Média.

### P10. Estrutura exata de arquivos de entrada e variações

- **Descrição:** As referências listam colunas comuns e orientam preservar colunas extras, mas não fornecem planilhas/PDF de entrada nem especificam formatos, cabeçalhos alternativos, codificação, duplicatas ou erros de OCR.
- **Impacto:** A importação pode interpretar colunas ou linhas incorretamente.
- **Arquivos:** `skills/excel-arquivos/SKILL.md`; `skills/excel-arquivos/references/fluxo-arquivos.md`; `skills/fab-concursos/references/etapas-eliminatorias.md`, “O que permanece”.
- **Informação necessária:** arquivos de amostra autorizados, esquemas por concurso/etapa e regras de validação.
- **Prioridade:** Média.

### P11. Exportação sem arquivo-modelo

- **Descrição:** O plugin descreve cores, fontes e paginação, mas o ZIP não contém um workbook nem PDF-modelo para comparação visual.
- **Impacto:** Alguns detalhes não podem ser confirmados por inspeção de um resultado real, sobretudo quebras, larguras e consistência entre Excel/PDF.
- **Arquivos:** `skills/fab-concursos/references/estilo-pdf-classificacao.md`; `skills/fab-concursos/references/formato-proibido.md`; `skills/excel-arquivos/references/fluxo-arquivos.md`.
- **Informação necessária:** modelo aprovado de Excel/PDF ou arquivos de saída aceitos, quando disponíveis.
- **Prioridade:** Média.

### P12. Escopo do produto versus obrigação de saída do plugin

- **Descrição:** O plugin manda entregar Excel e PDF para classificação/lista mesmo quando o pedido cita um formato; isso é uma regra operacional do plugin, não necessariamente uma decisão confirmada de produto para todas as futuras funcionalidades do Classifica Militares.
- **Impacto:** Implementar saída dupla sem decisão pode contrariar necessidades específicas de cada concurso ou pedido.
- **Arquivos:** `skills/excel-arquivos/SKILL.md`, “Passos”; `commands/excel.md`; `references/reclassificacao-edital.md`, “Saída”.
- **Informação necessária:** confirmar quais formatos o produto deve oferecer por concurso e se a preferência pode ser configurada.
- **Prioridade:** Média.

## Arquivos ausentes ou inacessíveis

- A extração do ZIP foi concluída e todos os 18 arquivos regulares foram lidos.
- Nenhuma referência interna a arquivo do próprio ZIP ficou sem correspondente.
- O ZIP não contém editais, listas de candidatos, planilhas/PDF de entrada, exemplos de Excel/PDF exportados ou regras específicas da AFA. Esses itens estão ausentes do material fornecido, não são falhas de extração.

