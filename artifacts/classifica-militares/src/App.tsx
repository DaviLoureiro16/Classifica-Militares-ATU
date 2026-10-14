import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AVAILABLE_COMPETITIONS } from '@/domain/competitions/catalog';
import {
  ArrowRight, BookOpen, Info, ListFilter, Search, ShieldCheck, Upload, UserRoundSearch,
} from 'lucide-react';
import { ImportPageContent } from '@/pages/import-page';
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
          <span className="brand-mark"><BookOpen size={20} strokeWidth={1.8} /></span>
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
          <span><Link href="/sobre">Conheça o projeto</Link> · Não oficial, sem vínculo com as Forças Armadas.</span>
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
          <h1>Classificação para concursos militares, com clareza.</h1>
          <p>
            Uma plataforma gratuita para organizar, consultar e analisar listas de classificação de concursos militares.
            Nesta versão, EPCAR e AFA são as únicas opções disponíveis, com espaço para expansão futura.
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
                <ListFilter size={14} /> PLATAFORMA GERAL
              </span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#bb9637' }} />
            </div>
            <div className="sheet-lines">
              {['EPCAR', 'AFA', 'LISTAS', 'ANÁLISE'].map((score, i) => (
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
          <p>Escolha EPCAR ou AFA e confira arquivos no navegador. A classificação ainda não é calculada.</p>
        </Link>
        <Link href="/classificacao" className="feature-card" data-testid="card-classificacao">
          <span className="feature-icon"><BookOpen size={18} /></span>
          <h3>Explorar classificação</h3>
          <p>Consulte a estrutura da página de classificação. Nenhuma lista real está carregada nesta etapa.</p>
        </Link>
        <Link href="/consulta" className="feature-card" data-testid="card-consulta">
          <span className="feature-icon"><UserRoundSearch size={18} /></span>
          <h3>Entender a consulta</h3>
          <p>Conheça a interface de busca sem confundir uma demonstração com consulta real.</p>
        </Link>
      </div>
      <div style={{ marginTop: 21 }}>
        <Notice warning>
          <strong>Disponibilidade atual:</strong> EPCAR e AFA são as únicas opções habilitadas. A importação permite leitura e prévia locais;
          a plataforma ainda não calcula classificações nem publica resultados oficiais.
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
  return (
    <Layout>
      <ImportPageContent />
    </Layout>
  );
}

function ClassificationPage() {
  const [competition, setCompetition] = useState('Todas');
  return (
    <Layout>
      <PageHeader
        eyebrow="Classificação"
        title="Classificação"
        description="A estrutura está preparada para apresentar listas de diferentes concursos sem presumir que todos usem os mesmos campos ou critérios."
      />
      <div style={{ marginBottom: 18 }}>
        <Notice warning><strong>Nenhuma lista real carregada.</strong> Campos, categorias e critérios devem vir de fontes válidas para cada concurso; esta tela não inventa registros ou regras.</Notice>
      </div>
      <section className="panel">
        <div className="filters">
          <div className="field">
            <label htmlFor="filter-competition">Competição</label>
            <select id="filter-competition" className="control" value={competition} onChange={(event) => setCompetition(event.target.value)} data-testid="filter-competicao">
              <option>Todas</option>
              {AVAILABLE_COMPETITIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-list">Tipo de lista</label>
            <select id="filter-list" className="control" disabled aria-disabled="true" data-testid="filter-tipo-lista">
              <option>Disponível após carregar uma lista real</option>
            </select>
          </div>
          <span style={{ color: '#81909d', fontSize: 11, marginLeft: 'auto', paddingBottom: 10 }}>Sem dados carregados</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Posição</th><th>Candidato</th><th>Inscrição</th><th>Concurso</th><th>Tipo de lista</th></tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: '#81909d' }}>
                  Nenhuma classificação real carregada{competition !== 'Todas' ? ` para ${competition}` : ''}.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="table-foot">O tipo de lista ficará disponível quando houver dados reais compatíveis.</div>
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
        description="Esta tela apresenta a estrutura de consulta prevista para concursos militares. Nenhuma busca real de candidato é realizada nesta etapa."
      />
      <div style={{ marginBottom: 18 }}>
        <Notice warning><strong>Nenhum dado real está carregado.</strong> A busca não consulta registros, não envia os campos e não encontra resultados. Não informe dados pessoais.</Notice>
      </div>
      <section className="panel panel-pad">
        <span className="eyebrow">Consulta de candidato</span>
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
        description="Classifica Militares é uma plataforma gratuita para organizar, consultar e analisar listas de classificação de concursos militares brasileiros."
      />
      <div className="about-grid">
        <section className="panel panel-pad about-copy">
          <h2>Para que serve</h2>
          <p>
            O projeto pretende atender candidatos de concursos militares de diferentes instituições e forças,
            mantendo a organização geral da plataforma separada dos dados e critérios específicos de cada processo seletivo.
            Nesta versão, EPCAR e AFA são as únicas opções habilitadas.
          </p>
          <h2 style={{ marginTop: 24 }}>Independência e caráter não oficial</h2>
          <p>
            Classifica Militares é um projeto independente, não oficial e sem vínculo institucional com as Forças Armadas.
            Não é um canal institucional nem publica resultados oficiais.
          </p>
          <p>
            A expansão para concursos de outras instituições é futura. As opções atuais continuam limitadas à EPCAR e à AFA;
            cada concurso deverá ter seus próprios dados e critérios validados, sem presumir fórmulas ou etapas comuns.
          </p>
        </section>
        <aside className="about-aside">
          <ShieldCheck size={21} style={{ marginBottom: 19, color: '#d1dce5' }} />
          <h3>O que esta versão oferece</h3>
          <p>Navegação entre as páginas, leitura local de PDFs e planilhas e estrutura de classificação sem registros inventados.</p>
          <div className="rule" />
          <h3>O que ainda não oferece</h3>
          <p>Consulta real de candidatos, resultados oficiais, aplicação de regras de edital ou qualquer cálculo de classificação.</p>
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
