# Especificação funcional — Classifica Militares

## Finalidade e público

O Classifica Militares é uma plataforma gratuita e pública para ajudar candidatos a concursos militares brasileiros a organizar, consultar e analisar listas de classificação. O produto é independente e não oficial, sem vínculo institucional com as Forças Armadas.

O desenho da plataforma deve permitir que concursos de instituições diferentes tenham seus próprios documentos, etapas, campos e critérios. Regras de um concurso ou edição não são regras gerais do produto.

## Escopo da versão atual

**EPCAR e AFA são as únicas opções habilitadas na interface.** A versão atual lê arquivos localmente para conferência, mas ainda não carrega listas reais de candidatos, interpreta regras e resultados para classificação, consulta candidatos em uma base real nem calcula classificações.

### Funcionalidades gerais já presentes na interface

- Navegação entre início, importação, classificação, consulta e sobre.
- Seleção de concurso limitada ao catálogo ativo de EPCAR e AFA.
- Seleção local de vários arquivos CSV, XLS, XLSX ou PDF, com validação do formato, leitura no navegador, sugestões de tipo de documento e prévia para conferência.
- Extração local de linhas e coordenadas de texto selecionável em PDFs; arquivos sem camada de texto são sinalizados, sem OCR.
- Página de classificação com filtro de concurso; o filtro por tipo de lista permanece indisponível enquanto não houver uma lista real carregada.
- Campos de consulta por nome ou inscrição, com aviso explícito de que nenhum registro é pesquisado ou enviado.
- Avisos de independência, caráter não oficial e limites desta versão.

### EPCAR

O ZIP de referência descreve procedimentos para concursos da FAB e contém regras explicitamente identificadas como EPCAR/EA CPCAR. Essas regras são **documentação de referência**, não funcionalidades implementadas nem validação de um edital específico.

O plugin descreve reclassificação por etapa, cotas, reversões, decisões judiciais, listas de classificados e excluídos, além de exportação Excel/PDF. Qualquer uso futuro exige identificar o ano/edital e confirmar os dados e critérios nos documentos oficiais aplicáveis.

### AFA

AFA é uma opção habilitada na interface. O ZIP cita a AFA no roteamento e no mapa de ingresso da FAB, mas não inclui um conjunto detalhado de regras de classificação específico para AFA. Portanto, não se deve aplicar automaticamente à AFA o algoritmo documentado para a EPCAR.

### Fluxo futuro previsto

1. Selecionar um concurso habilitado.
2. Fornecer listas oficiais e, quando necessário, o edital da edição correspondente.
3. Identificar a edição, a etapa e os campos existentes nos arquivos.
4. Aplicar somente regras documentadas para aquele concurso e edição.
5. Apresentar resultados rastreáveis à fonte e permitir conferência.
6. Quando solicitado e validado, exportar a classificação para Excel e PDF.

Este fluxo é futuro; os passos 2 a 6 não estão implementados na interface atual.

## Funcionalidades futuras para outras instituições

O produto poderá incluir concursos de outras forças e instituições brasileiras. Nenhuma outra instituição está habilitada nesta versão. Cada inclusão exige suas próprias fontes, documentos, regras, etapas e critérios; o plugin analisado não serve como autoridade para Exército, Marinha ou outros concursos.

## Fora do escopo implementado

- OCR e interpretação automática de PDFs digitalizados.
- Classificação semântica universal de tabelas de concursos; a separação espacial preliminar de PDFs exige conferência com o original.
- Persistência ou compartilhamento de arquivos importados.
- Busca de candidatos em dados reais.
- Motor de classificação/reclassificação e previsão de convocação.
- Regras universais de cotas, notas, desempates ou fases.
- Geração real de arquivos Excel e PDF.

## Princípios de confiabilidade

- Identificar a fonte e a edição antes de calcular.
- Não inventar candidatos, resultados, vagas, notas, regras ou documentos.
- Não apresentar uma regra específica da EPCAR/FAB como regra geral.
- Marcar como pendente qualquer decisão que não possa ser sustentada por fonte aplicável.
- Manter visível o caráter independente e não oficial do projeto.

