# Regras de classificação — inventário do ZIP

## Limites desta documentação

Este documento registra o que está escrito no **Excel-FAB-Assistente 1.31.0**. Não é validação independente de lei, edital ou resultado oficial. As regras abaixo são principalmente de EPCAR/EA CPCAR; não as aplique à AFA sem conferir os documentos próprios da edição.

Não há edital, lista de candidatos, planilha de origem ou PDF oficial de resultado dentro do ZIP. Nomes e números usados como exemplos neste documento de referência são exemplos do próprio plugin, não dados de candidatos nem vagas de uma edição válida.

## 1. Fontes, edição e dados de entrada

- O ano/edição, a etapa e os números de vagas ampla `N` e reserva `M` devem vir dos documentos fornecidos pelo usuário. O plugin proíbe assumir valores ou reutilizar números de outra edição.
- Identificar etapa e ano pelo título/cabeçalho do PDF antes de excluir candidatos.
- Se os documentos não indicarem `N`/`M` e não houver edital, perguntar antes de concluir a classificação por cotas.
- Se os PDFs oficiais foram fornecidos para produzir os arquivos, usar somente esses anexos. A exceção documentada é a pesquisa, no ano do concurso, para confirmar candidatos que participaram por decisão judicial; cruzar nome e inscrição e não marcar ninguém sem confirmação.
- Preservar as colunas de origem adicionais.

**Origem:** `skills/fab-concursos/SKILL.md`, “Fonte de dados e identificação do edital”; `references/reclassificacao-edital.md`, “Fonte de dados e identificação do edital”; `SKILL.md`, itens 6–7.

## 2. Classificação por notas e desempates

As fórmulas a seguir são apresentadas como extraídas da estrutura do edital do EA CPCAR, em `references/regras-edital-classificacao.md`; não são confirmadas para AFA nem para outros concursos.

- Média Final: `MF = (GP + GM + GI + GR) / 4`.
- Para aproveitamento, cada prova escrita, inclusive redação, e a MF devem ser pelo menos `5,0000`.
- Ordenar candidatos com aproveitamento por MF decrescente.
- Média Parcial antes da redação: `MP = (GP + GM + GI) / 3`; cada disciplina deve ser pelo menos `5,0000`.
- Desempate de MF: maior Português (GP), Matemática (GM), Inglês (GI), Redação (GR), depois maior idade (nascimento mais antigo).
- Desempate de MP: maior GP, GM, GI e depois maior idade.
- Na reclassificação por etapas, se a MF empatar e as notas individuais não resolverem, usar menor classificação original como desempate auxiliar.

**Origem:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Média Final (MF) e aproveitamento”, “Média Parcial (MP)”, “Critérios de desempate” e “Aplicação na reclassificação”.

## 3. Reserva de vagas e concorrência

O arquivo de regras afirma reserva total de 30% segundo a Lei nº 15.142/2025: 25% para pretos e pardos, 3% para indígenas e 2% para quilombolas. Afirma também aplicação somente quando há pelo menos duas vagas por especialidade e arredondamento de fração a partir de 0,5 para cima. **O ZIP não inclui o texto da lei nem identifica uma edição específica do edital que confirme a aplicação; validar antes de implementar.**

- Candidatos optantes por reserva concorrem simultaneamente às vagas reservadas e à ampla.
- Cotista dentro do número `N` de ampla ocupa vaga ampla, não consome reserva e fica com `Clas. RV` vazia.
- A regra específica de reclassificação abre uma janela de ampla remanescente quando sobram vagas reservadas. O cálculo deve ser repetido até não haver cotista dentro da nova janela marcado como vaga reservada.
- Depois da ampla, cotistas elegíveis preenchem as vagas reservadas, conforme o edital.
- Desistência/exclusão em vaga reservada: próximo classificado da mesma modalidade.
- Quem opta por mais de uma modalidade é classificado apenas na modalidade de percentual mais elevado, segundo a regra documentada.

**Origem:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Reserva de vagas”, “Concorrência concomitante”, “Desistência / exclusão em vaga reservada” e “Múltiplas reservas”; `references/reclassificacao-edital.md`, regras 4–6 e 9; `SKILL.md`, itens 20 e 22.

## 4. Reversão de vagas e numeração

O arquivo `regras-edital-classificacao.md` descreve, nesta ordem, reversões entre quilombolas, indígenas, pretos e pardos e ampla, além de reversão proporcional de vagas de ampla para reservas quando aplicável. Cotistas aprovados em número insuficiente podem deixar vagas reservadas remanescentes para ampla. A ordem efetiva deve ser verificada no edital da edição.

- A ampla remanescente por sobra de cota é recalculada iterativamente; cotista que entra nessa janela passa à ampla e não consome reserva.
- A desistência/exclusão em modalidade reservada chama o próximo candidato da mesma modalidade.
- A contagem de uma reversão PP continua a contagem PP, não reinicia pela quantidade revertida. Exemplo explícito do plugin: 38 vagas PP e 8 revertidas resultam em `Vaga PP por reversão (39/46)` até `(46/46)`, não `(1/8)`.

**Origem:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Reversão de vagas não preenchidas” e “Aplicação na reclassificação”; `references/reclassificacao-edital.md`, regras 5.1 e 7; `references/estilo-pdf-classificacao.md`, “Numeração da reversão”; `SKILL.md`, itens 22, 16 e 18.

## 5. Decisão judicial

- Judicial: candidato confirmado como permanecendo no concurso por decisão judicial, liminar ou reintegração, a partir do PDF e/ou confirmação permitida pelo plugin. Não marcar candidato sem confirmação cruzada por nome e inscrição.
- Ordenar presentes por MF decrescente e desempate aplicável.
- Candidato judicial recebe somente `*` em Nova Clas.; não incrementa a sequência dos candidatos ordinários. Exemplo do plugin: `23`, `*`, `24`, não `23`, `*`, `25`.
- Escrever `Decisão judicial` em Observação; não usar termos judiciais na coluna de situação da etapa.
- A faixa ampla pode incluir `N` ordinários e `K` judiciais cuja MF esteja entre a do primeiro e a do N-ésimo ordinário; o bloco fica com `N+K` candidatos. Registrar esse fato em Regras/rodapé se `K > 0`.
- Antes de entregar: nenhuma Nova Clas. deve misturar dígitos com `*`; a sequência dos ordinários não pode ter lacunas causadas por judicial; verificar datas sem quebra.

**Origem:** `skills/fab-concursos/references/decisao-judicial.md`, “Busca permitida”, “Algoritmo de numeração”, “Expansão de vagas de ampla” e “Teste de sanidade”; `references/reclassificacao-edital.md`, regras 13–16.

## 6. Etapas eliminatórias e recursos

O mapa de etapas documentado é identificado como específico da EPCAR:

| Etapa | Cabeçalho requerido | Valores descritos |
|---|---|---|
| Concentração Intermediária (C.I./CINTER) | `Situação CI` | Presente, Ausente, Excluído |
| Inspeção de Saúde | `Situação INSPSAU` | Apto, Ausente, Incapaz |
| EAP | `Situação EAP` | Apto, Ausente, Incapaz |
| TACF/TAF | `Situação TACF` | Apto, Ausente, Incapaz |

- Incluir apenas a coluna da etapa processada, exceto quando o usuário solicitar histórico ou os anexos trouxerem etapas anteriores.
- Resultado de recurso prevalece para o candidato que aparece no recurso; para os demais, conservar o resultado da lista inicial.
- Apto em recurso volta à classificação; inapto/incapaz/ausente continua fora.
- A etapa em que a pessoa realmente saiu determina seu registro, independentemente da ordem em que os pedidos/arquivos foram processados.
- Acumular ausentes, incapazes e excluídos de etapas anteriores; não apagar histórico.
- Para o arquivo final, padronizar Inapto/Não apto como `Incapaz`, preservar `Ausente` e `Excluído`, e registrar etapa/motivo em Observação.
- A etapa indicada no documento oficial deve prevalecer para a linha de excluídos; não criar uma segunda linha por ausência em etapa anterior.

**Origem:** `skills/fab-concursos/references/etapas-eliminatorias.md`, “Ordem das etapas”, “Como cruzar”, “Acúmulo...” e “Etapa real”; `references/colunas-situacao-etapa.md`, “Regra de inclusão”; `references/reclassificacao-edital.md`, regras 1–2 e 18.

## 7. PCCA/PHC

Para retificação por Processo de Heteroidentificação Complementar (PHC), o plugin orienta mudar para Ampla Concorrência quem não foi considerado PP; quem foi considerado PP permanece em Pretos e Pardos. Recalcular ampla, reserva e ampla remanescente. Não inferir o resultado: usar somente o que estiver no anexo ou for informado pelo usuário.

**Origem:** `skills/fab-concursos/references/regras-edital-classificacao.md`, “Autodeclaração e verificação”; `references/reclassificacao-edital.md`, regra 17; `SKILL.md`, item 22.

## 8. Listas e conteúdo

Ordem obrigatória descrita pelo plugin:

1. Classificação geral — Excel `Classificacao_Geral`.
2. Lista exclusiva dos cotistas — Excel `Reserva_PP`.
3. Cotistas ocupando vagas da ampla — Excel `Cotistas_Ampla`.
4. Excluídos acumulativos — Excel `Excluidos`.

O Excel ainda recebe `Regras` por último. O PDF deve conter os quatro blocos na mesma ordem; o ZIP não especifica exportar uma página/bloco `Regras` no PDF.

Colunas-base documentadas, quando existentes: Nova Clas., Nome, Inscrição, Clas. RV, Situação da Vaga, MF, Port, Mat, Ing, Red, Dt_nasc, Cota, Clas. Original, Clas. RV Original, coluna(s) da(s) etapa(s), Observação. Preservar colunas extras da origem. Clas. RV fica vazia para cotista em vaga ampla e continua para cotistas fora da ampla, inclusive cadastro.

**Origem:** `commands/listas.md`, “Ordem obrigatória”; `skills/fab-concursos/references/formato-proibido.md`, “Obrigatório entregar”; `references/etapas-eliminatorias.md`, “O que permanece”; `references/estilo-pdf-classificacao.md`, “Colunas-base”; `references/regras-edital-classificacao.md`, “Clas. RV”.

## 9. Situações não encontradas ou não generalizáveis

- Não há regras detalhadas para AFA no ZIP, apesar de AFA constar no roteamento de comandos e no mapa de ingresso da FAB.
- Não há regra para Exército, Marinha ou demais instituições.
- Não há algoritmo de extração/OCR, formatos de origem garantidos, limite de precisão ou protocolo de reconciliação de listas duplicadas.
- Não há confirmação independente do texto legal citado nem correspondência com um ano/edital concreto.
- Não há regra universal de desempate, quotas, notas ou etapas aplicável a todos os concursos.

