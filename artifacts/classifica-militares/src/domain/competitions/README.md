# Organização dos concursos

- A plataforma comum mantém navegação, seleção de arquivos, pesquisa e visualização da classificação sem presumir regras.
- `catalog.ts` define quais concursos aparecem como disponíveis na interface.
- `definitions/` contém os metadados de cada concurso em arquivos separados.
- Fontes oficiais e regras específicas devem ser organizadas por concurso quando forem implementadas e validadas.
- Não crie fórmulas, categorias de lista, campos ou etapas globais por suposição. Um concurso só deve ser habilitado após seus dados e regras próprios estarem disponíveis.

Nesta versão, EPCAR e AFA são as únicas opções habilitadas. Nenhuma lista real ou regra de classificação está carregada no aplicativo.
