import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowRight, BookOpen, Check, FileText, Info, ListFilter, Search,
  ShieldCheck, Upload, UserRoundSearch, X, Plane,
} from 'lucide-react';
import {
  Link, Route, Switch, useLocation, Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'Início' },
  { href: '/importar', label: 'Importar lista' },
  { href: '/classificacao', label: 'Classificação' },
  { href: '/consulta', label: 'Consulta' },
  { href: '/sobre', label: 'Sobre' },
];

function Header() {
  const [location] = useLocation();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" data-testid="link-home">
          <span className="brand-mark"><Plane size={20} strokeWidth={1.8} /></span>
          <span>
            <span className="brand-name">Classifica Militares</span>
            <span className="brand-sub">Organização para candidatos</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${location === item.href ? 'active' : ''}`}
              aria-current={location === item.href ? 'page' : undefined}
              data-testid={`link-nav-${item.href === '/' ? 'inicio' : item.href.slice(1)}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <main className="main-content">{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <span>Classifica Militares · Ferramenta independente de organização.</span>
          <span><Link href="/sobre">Conheça o projeto</Link> · Não oficial, sem vínculo com a FAB.</span>
        </div>
      </footer>
    </div>
  );
}

function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <div className={`notice ${warning ? 'warning' : ''}`} role="note">
      <Info size={16} className="notice-icon" />
      <div>{children}</div>
    </div>
  );
}

function Home() {
  return (
    <Layout>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">Preparação com clareza</span>
          <h1>Organize sua jornada rumo à aviação.</h1>
          <p>
            Um espaço de apoio para candidatos EPCAR e AFA organizarem listas de classificação
            e consultarem informações com transparência sobre o que está disponível.
          </p>
          <div className="hero-actions">
            <Link href="/classificacao" className="btn" data-testid="link-ver-classificacao">
              Ver classificação <ArrowRight size={16} />
            </Link>
            <Link href="/sobre" className="btn btn-secondary" data-testid="link-conhecer-projeto">
              Conhecer o projeto
            </Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit" />
          <div className="hero-sheet">
            <div className="sheet-head">
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#2a4d69', fontSize: 10, fontWeight: 700 }}>
                <ListFilter size={14} /> LISTA DE EXEMPLO
              </span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#bb9637' }} />
            </div>
            <div className="sheet-lines">
              {['EPCAR', 'AFA', 'PDF', 'CSV'].map((score, i) => (
                <div className="sheet-row" key={score}>
                  <span className="sheet-number">0{i + 1}</span>
                  <span className="sheet-bar" />
                  <span className="sheet-score">{score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="section-heading">
        <div>
          <h2>Um ponto de partida organizado</h2>
          <p>Recursos simples, com os limites desta etapa sempre à vista.</p>
        </div>
      </div>
      <div className="feature-grid">
        <Link href="/importar" className="feature-card" data-testid="card-importar">
          <span className="feature-icon"><Upload size={18} /></span>
          <h3>Preparar uma lista</h3>
          <p>Escolha EPCAR ou AFA e confira um arquivo local. O envio e a leitura ainda não estão disponíveis.</p>
        </Link>
        <Link href="/classificacao" className="feature-card" data-testid="card-classificacao">
          <span className="feature-icon"><BookOpen size={18} /></span>
          <h3>Explorar classificação</h3>
          <p>Veja como a tabela funciona com registros fictícios, identificados como demonstração.</p>
        </Link>
        <Link href="/consulta" className="feature-card" data-testid="card-consulta">
          <span className="feature-icon"><UserRoundSearch size={18} /></span>
          <h3>Entender a consulta</h3>
          <p>Conheça a interface de busca sem confundir uma demonstração com consulta real.</p>
        </Link>
      </div>
      <div style={{ marginTop: 21 }}>
        <Notice warning>
          <strong>Conteúdo demonstrativo:</strong> esta versão não carrega dados reais, resultados oficiais
          nem realiza processamento de arquivos. Não use os exemplos para tomar decisões.
        </Notice>
      </div>
    </Layout>
  );
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="page-header">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="page-title">{title}</h1>
      <p className="page-intro">{description}</p>
    </div>
  );
}

function ImportPage() {
  const [competition, setCompetition] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const selectFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const additions = Array.from(selected);
    setFiles((current) => {
      const currentKeys = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [
        ...current,
        ...additions.filter((file) => !currentKeys.has(`${file.name}-${file.size}-${file.lastModified}`)),
      ];
    });
  };
  return (
    <Layout>
      <PageHeader
        eyebrow="Área de preparação"
        title="Importar uma lista"
        description="Selecione a competição e confira um arquivo no seu dispositivo. Nesta etapa, a seleção é apenas local: não há envio, extração ou leitura dos dados."
      />
      <Notice warning>
        A função de importação ainda não está disponível. O arquivo permanece no seu dispositivo e não será processado.
      </Notice>
      <div className="steps" aria-label="Etapas de importação">
        <div className="step current"><span className="step-number">1</span> Seleção</div>
        <div className="step"><span className="step-number">2</span> Conferência</div>
        <div className="step"><span className="step-number">3</span> Importação indisponível</div>
      </div>
      <div className="import-grid">
        <section className="panel panel-pad">
          <span className="eyebrow">01 · Competição</span>
          <h2 style={{ font: '700 17px Manrope,sans-serif', color: '#25425d', margin: '8px 0 17px' }}>O que você está organizando?</h2>
          <div className="field" style={{ marginBottom: 19 }}>
            <label htmlFor="competition">Selecione a competição</label>
            <select
              id="competition"
              className="control"
              value={competition}
              onChange={(event) => setCompetition(event.target.value)}
              data-testid="select-competicao"
            >
              <option value="">Escolha uma opção</option>
              <option value="EPCAR">EPCAR</option>
              <option value="AFA">AFA</option>
            </select>
          </div>
          <label className="upload-zone" htmlFor="local-file">
            <input
              id="local-file"
              type="file"
              multiple
              accept=".csv,.xls,.xlsx,.pdf"
              onChange={(event) => {
                selectFiles(event.target.files);
                event.target.value = '';
              }}
              data-testid="input-arquivo"
            />
            <span className="upload-icon"><Upload size={19} /></span>
            <p className="upload-title">Escolher arquivo no dispositivo</p>
            <p className="upload-help">CSV, XLS, XLSX ou PDF · seleção local</p>
          </label>
          {files.map((file, index) => {
            const accepted = /\.(csv|xlsx|xls|pdf)$/i.test(file.name);
            return (
              <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                <div className="selected-file" data-testid={`preview-arquivo-${index}`}>
                  <span className="feature-icon" style={{ margin: 0, flex: 'none' }}><FileText size={17} /></span>
                  <div className="file-meta">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{(file.size / 1024).toFixed(1)} KB · não enviado</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remover ${file.name}`}
                    className="btn btn-secondary"
                    style={{ minHeight: 32, padding: '0 8px' }}
                    onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    data-testid={`button-remover-arquivo-${index}`}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className={`validation ${accepted ? '' : 'invalid'}`} role="status">
                  {accepted ? <Check size={15} /> : <Info size={15} />}
                  <span>{accepted
                    ? 'Extensão reconhecida. O conteúdo não foi enviado nem lido.'
                    : 'Formato não reconhecido. Selecione CSV, XLS, XLSX ou PDF.'}</span>
                </div>
              </div>
            );
          })}
          {competition && files.length > 0 && files.every((file) => /\.(csv|xlsx|xls|pdf)$/i.test(file.name)) && (
            <p style={{ color: '#778695', fontSize: 11, lineHeight: 1.5, margin: '13px 0 0' }}>
              {files.length} arquivo(s) selecionado(s) para conferência local: {competition}. A etapa seguinte não está habilitada.
            </p>
          )}
        </section>
        <section className="panel panel-pad">
          <span className="eyebrow">02 · Prévia da seleção</span>
          <h2 style={{ font: '700 17px Manrope,sans-serif', color: '#25425d', margin: '8px 0 17px' }}>O que acontece agora</h2>
          <div style={{ border: '1px solid #e6ebef', background: '#f8fafb', borderRadius: 8, padding: 19, minHeight: 126 }}>
            {files.length > 0 ? (
              <>
                <div style={{ color: '#345a76', display: 'flex', gap: 9, alignItems: 'center', fontWeight: 700, fontSize: 13 }}>
                  <FileText size={17} /> {files.length} arquivo(s) selecionado(s)
                </div>
                <p style={{ color: '#6f7e8b', fontSize: 12, lineHeight: 1.6, margin: '9px 0 0' }}>
                  A prévia exibe apenas nomes e tamanhos. O conteúdo não é aberto nem analisado.
                </p>
              </>
            ) : (
              <>
                <div style={{ color: '#64788b', display: 'flex', gap: 9, alignItems: 'center', fontWeight: 700, fontSize: 13 }}>
                  <FileText size={17} /> Nenhum arquivo selecionado
                </div>
                <p style={{ color: '#82909c', fontSize: 12, lineHeight: 1.6, margin: '9px 0 0' }}>
                  Primeiro escolha uma competição e, se desejar, um arquivo para conferir a seleção.
                </p>
              </>
            )}
          </div>
          <div style={{ marginTop: 15 }}>
            <Notice>
              <strong>Sem processamento:</strong> a validação verifica somente a extensão. Não confirma o conteúdo ou a autenticidade do documento.
            </Notice>
          </div>
          <button type="button" className="btn" disabled style={{ width: '100%', marginTop: 17 }} aria-disabled="true" data-testid="button-importacao-indisponivel">
            Importação indisponível nesta etapa
          </button>
        </section>
      </div>
    </Layout>
  );
}

const demoRows = [
  { rank: '001', name: 'Candidato Demonstração A', id: 'EX-0001', competition: 'EPCAR', list: 'Lista demonstrativa A', score: '84,7' },
  { rank: '002', name: 'Candidata Demonstração B', id: 'EX-0002', competition: 'EPCAR', list: 'Lista demonstrativa A', score: '81,3' },
  { rank: '003', name: 'Candidato Demonstração C', id: 'EX-0003', competition: 'AFA', list: 'Lista demonstrativa A', score: '79,8' },
  { rank: '004', name: 'Candidata Demonstração D', id: 'EX-0004', competition: 'AFA', list: 'Lista demonstrativa B', score: '77,2' },
  { rank: '005', name: 'Candidato Demonstração E', id: 'EX-0005', competition: 'EPCAR', list: 'Lista demonstrativa B', score: '75,6' },
];

function ClassificationPage() {
  const [competition, setCompetition] = useState('Todas');
  const [listType, setListType] = useState('Todos os tipos');
  const filtered = demoRows.filter((row) =>
    (competition === 'Todas' || row.competition === competition) &&
    (listType === 'Todos os tipos' || row.list === listType)
  );
  return (
    <Layout>
      <PageHeader
        eyebrow="Visualização de exemplo"
        title="Classificação"
        description="Explore uma tabela de demonstração e seus filtros. Os registros abaixo são inventados e não representam resultados de concursos."
      />
      <div style={{ marginBottom: 18 }}>
        <Notice warning><strong>Dados fictícios:</strong> todos os nomes, identificadores e notas nesta tabela foram criados apenas para demonstrar a interface. Não são dados oficiais ou reais.</Notice>
      </div>
      <section className="panel">
        <div className="filters">
          <div className="field">
            <label htmlFor="filter-competition">Competição</label>
            <select id="filter-competition" className="control" value={competition} onChange={(event) => setCompetition(event.target.value)} data-testid="filter-competicao">
              <option>Todas</option><option>EPCAR</option><option>AFA</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-list">Tipo de lista</label>
            <select id="filter-list" className="control" value={listType} onChange={(event) => setListType(event.target.value)} data-testid="filter-tipo-lista">
              <option>Todos os tipos</option><option>Lista demonstrativa A</option><option>Lista demonstrativa B</option>
            </select>
          </div>
          <span style={{ color: '#81909d', fontSize: 11, marginLeft: 'auto', paddingBottom: 10 }}>{filtered.length} registros fictícios</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Posição</th><th>Nome demonstrativo</th><th>Identificador fictício</th><th>Competição</th><th>Tipo de lista</th><th>Nota exemplo</th></tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id} data-testid={`row-demonstracao-${row.id}`}>
                  <td className="rank">{row.rank}</td>
                  <td className="candidate-name">{row.name}</td>
                  <td>{row.id}</td><td>{row.competition}</td><td>{row.list}</td><td>{row.score}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#81909d' }}>Nenhum exemplo corresponde aos filtros escolhidos.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-foot">Tabela meramente ilustrativa · Tipos de lista, posições e notas também são fictícios.</div>
      </section>
    </Layout>
  );
}

function SearchPage() {
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');
  const [attempted, setAttempted] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
  };
  return (
    <Layout>
      <PageHeader
        eyebrow="Busca demonstrativa"
        title="Consulta"
        description="Esta tela apresenta os campos de consulta previstos para o projeto. Não há base real conectada e nenhuma busca de candidato é realizada."
      />
      <div style={{ marginBottom: 18 }}>
        <Notice warning><strong>Nenhum dado real está carregado.</strong> A busca não consulta registros, não envia os campos e não encontra resultados. Não informe dados pessoais.</Notice>
      </div>
      <section className="panel panel-pad">
        <span className="eyebrow">Pesquisa de exemplo</span>
        <form className="search-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="search-name">Nome</label>
            <input id="search-name" className="control" value={name} onChange={(event) => setName(event.target.value)} placeholder="Campo demonstrativo" autoComplete="off" data-testid="input-nome-consulta" />
          </div>
          <div className="field">
            <label htmlFor="search-registration">Inscrição</label>
            <input id="search-registration" className="control" value={registration} onChange={(event) => setRegistration(event.target.value)} placeholder="Campo demonstrativo" autoComplete="off" data-testid="input-inscricao-consulta" />
          </div>
          <button type="submit" className="btn btn-secondary" data-testid="button-consultar"><Search size={15} /> Ver disponibilidade</button>
        </form>
        {attempted && (
          <div className="validation invalid" role="status" style={{ maxWidth: 700, marginBottom: 17 }} data-testid="status-consulta">
            <Info size={15} /><span>A consulta real não está disponível. Os campos não foram enviados e nenhum registro foi pesquisado.</span>
          </div>
        )}
        <div className="panel search-result" style={{ background: '#fafbfc' }} data-testid="area-resultados">
          <div>
            <span className="empty-symbol"><Search size={20} /></span>
            <h2 className="empty-title">Nenhum resultado disponível</h2>
            <p className="empty-copy">Não há dados reais carregados nesta ferramenta. Esta área não realiza nem simula uma busca por candidatos.</p>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function AboutPage() {
  return (
    <Layout>
      <PageHeader
        eyebrow="Sobre o projeto"
        title="Transparência antes de tudo."
        description="Classifica Militares é uma proposta de ferramenta pública para apoiar a organização de candidatos a processos seletivos da EPCAR e da AFA."
      />
      <div className="about-grid">
        <section className="panel panel-pad about-copy">
          <h2>Para que serve</h2>
          <p>
            O projeto pretende oferecer um espaço claro para reunir e consultar listas de classificação,
            com foco em organização e leitura acessível. A versão atual é uma demonstração de interface:
            não possui dados reais, consulta funcional ou importação de documentos.
          </p>
          <h2 style={{ marginTop: 24 }}>Independência e caráter não oficial</h2>
          <p>
            Classifica Militares é um projeto independente, sem vínculo, afiliação ou endosso da
            Força Aérea Brasileira (FAB), da EPCAR ou da AFA. Não é um canal institucional e não publica
            resultados oficiais.
          </p>
          <p>
            Para informações válidas sobre editais e processos seletivos, consulte sempre os canais oficiais
            das instituições responsáveis.
          </p>
        </section>
        <aside className="about-aside">
          <ShieldCheck size={21} style={{ marginBottom: 19, color: '#d1dce5' }} />
          <h3>O que esta versão oferece</h3>
          <p>Uma navegação demonstrativa, uma tabela com exemplos inventados e seleção local de arquivo sem processamento.</p>
          <div className="rule" />
          <h3>O que ainda não oferece</h3>
          <p>Consulta de candidatos, importação de listas, resultados oficiais ou qualquer cálculo de classificação.</p>
        </aside>
      </div>
      <div style={{ marginTop: 18 }}>
        <Notice warning><strong>Não oficial:</strong> a ferramenta não substitui editais, comunicados ou publicações das instituições responsáveis.</Notice>
      </div>
    </Layout>
  );
}

function NotFoundPage() {
  return (
    <Layout>
      <div className="not-found">
        <span className="eyebrow">Página não encontrada</span>
        <h1 className="page-title">Este endereço não existe.</h1>
        <p className="page-intro" style={{ margin: '0 auto 22px' }}>Volte ao início para continuar explorando a demonstração.</p>
        <Link href="/" className="btn" data-testid="link-voltar-inicio">Voltar ao início</Link>
      </div>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/importar" component={ImportPage} />
        <Route path="/classificacao" component={ClassificationPage} />
        <Route path="/consulta" component={SearchPage} />
        <Route path="/sobre" component={AboutPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
