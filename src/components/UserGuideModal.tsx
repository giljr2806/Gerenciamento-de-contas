import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  FolderCog,
  LayoutDashboard,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { BuddhaTab } from './Sidebar';

interface UserGuideModalProps {
  open: boolean;
  onClose: () => void;
  activeYear: number;
  onNavigateToTab?: (tab: BuddhaTab) => void;
}

type GuideSectionId =
  | 'fluxo'
  | 'painel'
  | 'lancamentos'
  | 'contratos'
  | 'planejamento'
  | 'analytics'
  | 'perfis';

interface GuideSection {
  id: GuideSectionId;
  title: string;
  shortTitle: string;
  icon: typeof BookOpen;
  targetTab?: BuddhaTab;
  targetLabel?: string;
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'fluxo',
    title: 'Fluxo Recomendado de Uso',
    shortTitle: '1. Fluxo Geral',
    icon: BookOpen,
  },
  {
    id: 'painel',
    title: 'Menu Painel & Central de Alertas',
    shortTitle: '2. Painel',
    icon: LayoutDashboard,
    targetTab: 'dashboard',
  },
  {
    id: 'lancamentos',
    title: 'Menu Lançamentos (Base de Tudo)',
    shortTitle: '3. Lançamentos',
    icon: FileSpreadsheet,
    targetTab: 'entries',
    targetLabel: 'Abrir Lançamentos',
  },
  {
    id: 'contratos',
    title: 'Contratos, Vigências e Reajustes',
    shortTitle: '4. Contratos',
    icon: FileText,
    targetTab: 'contracts',
    targetLabel: 'Abrir Contratos',
  },
  {
    id: 'planejamento',
    title: 'Planejamento Anual (Tetos por Categoria)',
    shortTitle: '5. Planejamento',
    icon: CalendarRange,
    targetTab: 'planning',
    targetLabel: 'Abrir Planejamento',
  },
  {
    id: 'analytics',
    title: 'Analytics & Indicadores Financeiros',
    shortTitle: '6. Analytics',
    icon: BarChart3,
    targetTab: 'analytics',
    targetLabel: 'Abrir Analytics',
  },
  {
    id: 'perfis',
    title: 'Cadastros, Perfis de Acesso & Relatórios',
    shortTitle: '7. Cadastros & Perfis',
    icon: ShieldCheck,
    targetTab: 'registries',
    targetLabel: 'Abrir Cadastros',
  },
];

export function UserGuideModal({
  open,
  onClose,
  activeYear,
  onNavigateToTab,
}: UserGuideModalProps) {
  const [activeSection, setActiveSection] = useState<GuideSectionId>('fluxo');

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const currentMeta = GUIDE_SECTIONS.find((s) => s.id === activeSection) || GUIDE_SECTIONS[0];

  const handleGoToTab = (tab?: BuddhaTab) => {
    if (!tab || !onNavigateToTab) return;
    onNavigateToTab(tab);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-guide-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4.5 h-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="user-guide-title"
                className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                Guia de Uso — Buddha Spa · DHO
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Manual rápido de operação, alimentação de dados e interpretação dos cálculos ({activeYear})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia de uso"
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: Sidebar Nav + Content */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <nav
            aria-label="Seções do Guia de Uso"
            className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto"
          >
            {GUIDE_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isSelected = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors whitespace-nowrap md:whitespace-normal shrink-0 ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/50 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{sec.shortTitle}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-slate-700 dark:text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {currentMeta.title}
              </h3>
              {currentMeta.targetTab && currentMeta.targetLabel && onNavigateToTab && (
                <button
                  type="button"
                  onClick={() => handleGoToTab(currentMeta.targetTab)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors"
                >
                  <span>{currentMeta.targetLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {activeSection === 'fluxo' && (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm leading-relaxed">
                  O sistema <strong>Buddha Spa · DHO</strong> centraliza planejamento orçamentário,
                  contratos e lançamentos mensais em um único fluxo automático. Você só precisa manter
                  os dados na origem — o <strong>Painel</strong>, o <strong>Analytics</strong> e os{' '}
                  <strong>Relatórios</strong> se atualizam sozinhos.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Passo 1 · Cadastros Base
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Cadastre ou padronize Empresas, Departamentos, Categorias e Fornecedores em{' '}
                      <strong>Cadastros</strong> para evitar duplicidades.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Passo 2 · Planejamento (Tetos)
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Defina os tetos mensais por categoria para o ano selecionado no menu{' '}
                      <strong>Planejamento</strong> (perfil Admin).
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Passo 3 · Contratos & Lançamentos
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Registre despesas mensais em <strong>Lançamentos</strong> (manual, recorrente ou
                      planilha Excel) e vincule contratos ativos.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Passo 4 · Painel & Analytics
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Acompanhe desvios, alertas e curvas sem digitação manual. Passe o mouse sobre
                      qualquer card para ver a fórmula exata do cálculo.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/40 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Dica rápida: Seletor de Ano Dinâmico
                    </div>
                    <p>
                      Use o seletor <strong>Ano de Referência</strong> na barra lateral esquerda para
                      alternar entre os 2 anos anteriores, o ano atual e os próximos 5 anos. Todos os
                      menus obedecem ao ano escolhido.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'painel' && (
              <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
                <p>
                  O <strong>Menu Painel</strong> oferece a visão executiva instantânea do ano{' '}
                  <strong>{activeYear}</strong>, combinando metas do Planejamento com os registros
                  de Lançamentos e Contratos.
                </p>
                <ul className="space-y-2.5 list-disc pl-5 text-xs sm:text-sm">
                  <li>
                    <strong>Filtros no topo:</strong> filtre rapidamente por <em>Ano</em>,{' '}
                    <em>Empresa</em> e <em>Departamento</em> para isolar uma unidade ou centro de custo.
                  </li>
                  <li>
                    <strong>5 Cards Executivos:</strong> passe o mouse em cima de qualquer card para abrir
                    a explicação completa e a fórmula com os números do filtro atual.
                  </li>
                  <li>
                    <strong>Gráfico Realizado × Previsto × Teto:</strong> alterne entre a visão{' '}
                    <em>Mensal</em> e <em>Acumulado</em>. Barras em vermelho indicam meses que
                    ultrapassaram o Teto Planejado.
                  </li>
                  <li>
                    <strong>Central de Alertas Clicável:</strong> lista automaticamente contratos
                    próximos do vencimento, despesas sem pagamento e categorias estouradas. Clique em
                    qualquer alerta para ir direto ao item.
                  </li>
                  <li>
                    <strong>Execução por Categoria & Top 8 Fornecedores:</strong> mostra o semáforo de
                    consumo do teto (<em>OK</em> até 90%, <em>Atenção</em> 90%–100%, <em>Estourado</em>{' '}
                    acima de 100%) e os maiores fornecedores.
                  </li>
                </ul>
              </div>
            )}

            {activeSection === 'lancamentos' && (
              <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
                <p>
                  O menu <strong>Lançamentos</strong> é a fonte única de despesas. O{' '}
                  <strong>Painel</strong>, o <strong>Analytics</strong> e os{' '}
                  <strong>Relatórios</strong> leem estes dados automaticamente — nunca é necessário
                  alimentar gráficos manualmente.
                </p>
                <ul className="space-y-2.5 list-disc pl-5">
                  <li>
                    <strong>Novo Lançamento:</strong> informe competência (mês/ano), categoria,
                    fornecedor, empresa, departamento, valor <em>Orçado (Previsto)</em> e valor{' '}
                    <em>Realizado (Pago)</em>.
                  </li>
                  <li>
                    <strong>Status do Lançamento:</strong> use <em>Previsto</em> para despesas futuras,{' '}
                    <em>Pago</em> após liquidação e <em>Cancelado</em> para desconsiderar dos totais
                    sem apagar o histórico.
                  </li>
                  <li>
                    <strong>Despesas Recorrentes:</strong> marque como <em>Recorrente</em> ou use a
                    geração automática de parcelas mensais para assinaturas e folhas contínuas.
                  </li>
                  <li>
                    <strong>Importação via Planilha:</strong> utilize o botão de importação Excel/CSV
                    para subir vários lançamentos em lote de forma padronizada.
                  </li>
                </ul>
              </div>
            )}

            {activeSection === 'contratos' && (
              <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
                <p>
                  Em <strong>Contratos</strong>, você controla compromissos recorrentes, vigências e
                  índices de reajuste antes mesmo que virem lançamentos pagos.
                </p>
                <ul className="space-y-2.5 list-disc pl-5">
                  <li>
                    <strong>Vigência e Alertas:</strong> contratos próximos do término geram alertas
                    automáticos na <em>Central de Alertas</em> do Painel.
                  </li>
                  <li>
                    <strong>Reajuste Contratual:</strong> aplique reajustes (IPCA, IGP-M ou percentual
                    negociado) mantendo o histórico atualizado.
                  </li>
                  <li>
                    <strong>Vínculo com Lançamentos:</strong> vincule lançamentos existentes a um
                    contrato para medir a cobertura contratual no módulo Analytics.
                  </li>
                </ul>
              </div>
            )}

            {activeSection === 'planejamento' && (
              <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
                <p>
                  O menu <strong>Planejamento</strong> define o limite máximo mensal (<strong>Teto</strong>)
                  aprovado para cada categoria de despesa no ano.
                </p>
                <ul className="space-y-2.5 list-disc pl-5">
                  <li>
                    <strong>Edição de Tetos (Admin):</strong> preencha os valores mês a mês (Jan a Dez)
                    por categoria e salve o plano do ano.
                  </li>
                  <li>
                    <strong>Impacto nos Cálculos:</strong> se o teto estiver zerado (`R$ 0,00`), o
                    indicador <em>Consumo do Teto</em> ficará em `0,0%` e o <em>Saldo Disponível</em>{' '}
                    aparecerá negativo conforme os gastos realizados entrarem.
                  </li>
                  <li>
                    <strong>Fallback em % de Execução:</strong> caso um lançamento não tenha{' '}
                    <em>Orçado</em> preenchido, o Analytics utiliza o Teto Planejado como referência
                    quando disponível.
                  </li>
                </ul>
              </div>
            )}

            {activeSection === 'analytics' && (
              <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
                <p>
                  O módulo <strong>Analytics</strong> transforma os Lançamentos em inteligência
                  financeira com filtros instantâneos por categoria, empresa, departamento e período.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Cards Interativos (Passe o Mouse)
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Passe o cursor sobre qualquer um dos 9 cards no topo do Analytics para ver a
                      fórmula exata e os valores usados no cálculo.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Comparativo Ano vs Ano (YoY) & Previsão 3M
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Compara mês a mês o ano atual contra o anterior com linha de{' '}
                      <em>Previsão de Gastos</em> (média móvel dos últimos 3 meses ativos).
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Tendência Acumulada (YTD)
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Mostra a evolução acumulada de gastos versus orçamento acumulado para visualizar
                      desvios ao longo do ano.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      Curva ABC (80/20) & Matriz
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Identifica fornecedores Classe A/B/C e cruza gastos entre Empresas e Departamentos.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'perfis' && (
              <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
                <p>
                  O sistema opera com dados compartilhados em tempo real e controle por perfil no rodapé
                  da barra lateral esquerda.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/30">
                    <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong>Desenvolvedor:</strong> nível máximo de segurança. Único autorizado a
                      criar, editar, ativar/desativar e excluir usuários e níveis de acesso no menu{' '}
                      <strong>Usuários & Acessos</strong> mediante chave de autorização.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <FolderCog className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong>Administrador:</strong> acesso operacional completo — edita Planejamento Anual (Tetos),
                      Cadastros, Lançamentos, Contratos e exportações.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong>Editor (Analista):</strong> cria e edita Lançamentos, Contratos e
                      Fornecedores, sem alterar os tetos globais de Planejamento.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <FileBarChart2 className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong>Visualizador (Diretoria):</strong> consulta Painel, Analytics e
                      Relatórios em modo somente leitura, podendo exportar planilhas e resumos.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Dica: passe o mouse sobre qualquer card de indicador no Painel ou Analytics para ver a fórmula do cálculo.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
          >
            Entendi, fechar guia
          </button>
        </div>
      </div>
    </div>
  );
}
