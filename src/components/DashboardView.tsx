import { AlertTriangle, Bell, BookOpen, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import buddhaDarkImg from '../assets/images/buddha_dark_clean_1795102387887.jpg';
import buddhaLightImg from '../assets/images/buddha_light_clean_1795102387815.jpg';
import { AlertItem, DatabaseState } from '../types/buddha';
import { formatBRL, formatPercent, MONTH_FULL_LABELS, MONTH_LABELS, sumArray } from '../utils/format';
import { getAvailableYears } from '../utils/years';
import { KpiCardWithTooltip } from './KpiCardWithTooltip';
import { BuddhaTab } from './Sidebar';
import { HealthChip } from './StatusChip';
import { UserGuideModal } from './UserGuideModal';

interface DashboardViewProps {
  state: DatabaseState;
  activeYear: number;
  onChangeYear: (y: number) => void;
  alerts: AlertItem[];
  onAlertClick: (alert: AlertItem) => void;
  onNavigateToTab?: (tab: BuddhaTab) => void;
}

export function DashboardView({
  state,
  activeYear,
  onChangeYear,
  alerts,
  onAlertClick,
  onNavigateToTab,
}: DashboardViewProps) {
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [deptoFilter, setDeptoFilter] = useState('all');
  const [chartMode, setChartMode] = useState<'mensal' | 'acumulado'>('mensal');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    return state.entries.filter((e) => {
      if (!e.competencia.startsWith(`${activeYear}-`)) return false;
      if (e.status === 'Cancelado') return false;
      if (empresaFilter !== 'all' && e.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && e.departamento !== deptoFilter) return false;
      return true;
    });
  }, [state.entries, activeYear, empresaFilter, deptoFilter]);

  const filteredContracts = useMemo(() => {
    return state.contracts.filter((c) => {
      if (empresaFilter !== 'all' && c.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && c.departamento !== deptoFilter) return false;
      return true;
    });
  }, [state.contracts, empresaFilter, deptoFilter]);

  const plan = state.plans[String(activeYear)];

  const metrics = useMemo(() => {
    const tetoMensal = Array(12).fill(0) as number[];
    const previstoMensal = Array(12).fill(0) as number[];
    const realizadoMensal = Array(12).fill(0) as number[];

    if (plan) {
      for (const arr of Object.values(plan.tetos)) {
        for (let m = 0; m < 12; m++) {
          tetoMensal[m] += arr[m] || 0;
        }
      }
    }

    for (const e of filteredEntries) {
      const mIdx = parseInt(e.competencia.slice(5, 7), 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        previstoMensal[mIdx] += e.orcado;
        realizadoMensal[mIdx] += e.realizado;
      }
    }

    const tetoAcumulado: number[] = [];
    const previstoAcumulado: number[] = [];
    const realizadoAcumulado: number[] = [];
    let accT = 0;
    let accP = 0;
    let accR = 0;
    for (let m = 0; m < 12; m++) {
      accT += tetoMensal[m];
      accP += previstoMensal[m];
      accR += realizadoMensal[m];
      tetoAcumulado.push(accT);
      previstoAcumulado.push(accP);
      realizadoAcumulado.push(accR);
    }

    const totalTeto = sumArray(tetoMensal);
    const totalPrevisto = sumArray(previstoMensal);
    const totalRealizado = sumArray(realizadoMensal);
    const saldoTeto = totalTeto - totalRealizado;
    const pctTeto = totalTeto > 0 ? (totalRealizado / totalTeto) * 100 : 0;

    const activeContracts = filteredContracts.filter(
      (c) => c.status === 'Ativo' || c.status === 'A completar' || c.status === 'Em negociação'
    );
    const committedMonthly = activeContracts.reduce((s, c) => s + c.valorMensal, 0);

    return {
      tetoMensal,
      previstoMensal,
      realizadoMensal,
      tetoAcumulado,
      previstoAcumulado,
      realizadoAcumulado,
      totalTeto,
      totalPrevisto,
      totalRealizado,
      saldoTeto,
      pctTeto,
      activeContractsCount: activeContracts.length,
      committedMonthly,
    };
  }, [filteredEntries, filteredContracts, plan]);

  const categoryRows = useMemo(() => {
    const allCats = new Set<string>([
      ...state.registries.categorias.map((c) => c.nome),
      ...filteredEntries.map((e) => e.categoria),
      ...(plan ? Object.keys(plan.tetos) : []),
    ]);

    return Array.from(allCats)
      .map((cat) => {
        const teto = plan?.tetos[cat] ? sumArray(plan.tetos[cat]) : 0;
        const catEntries = filteredEntries.filter((e) => e.categoria === cat);
        const previsto = catEntries.reduce((s, e) => s + e.orcado, 0);
        const realizado = catEntries.reduce((s, e) => s + e.realizado, 0);
        const saldo = teto > 0 ? teto - realizado : previsto - realizado;
        const pct = teto > 0 ? (realizado / teto) * 100 : realizado > 0 ? 101 : 0;

        let status: 'ok' | 'atencao' | 'critico' = 'ok';
        let statusLabel = 'OK';
        if (pct > 100) {
          status = 'critico';
          statusLabel = teto === 0 && realizado > 0 ? 'Sem teto' : 'Estourado';
        } else if (pct >= 90) {
          status = 'atencao';
          statusLabel = 'Atenção';
        }

        return { cat, teto, previsto, realizado, saldo, pct, status, statusLabel };
      })
      .filter((r) => r.teto > 0 || r.previsto > 0 || r.realizado > 0)
      .sort((a, b) => b.realizado - a.realizado);
  }, [state.registries.categorias, filteredEntries, plan]);

  const topSuppliers = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredEntries) {
      if (!e.fornecedor || e.realizado <= 0) continue;
      map.set(e.fornecedor, (map.get(e.fornecedor) || 0) + e.realizado);
    }
    const maxVal = Math.max(...Array.from(map.values()), 1);
    return Array.from(map.entries())
      .map(([fornecedor, total]) => ({
        fornecedor,
        total,
        barPct: (total / maxVal) * 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filteredEntries]);

  const activeTetoSeries =
    chartMode === 'mensal' ? metrics.tetoMensal : metrics.tetoAcumulado;
  const activePrevistoSeries =
    chartMode === 'mensal' ? metrics.previstoMensal : metrics.previstoAcumulado;
  const activeRealizadoSeries =
    chartMode === 'mensal' ? metrics.realizadoMensal : metrics.realizadoAcumulado;

  const chartMax = useMemo(() => {
    const m = Math.max(
      ...activeTetoSeries,
      ...activePrevistoSeries,
      ...activeRealizadoSeries,
      1000
    );
    return Math.ceil(m * 1.12);
  }, [activeTetoSeries, activePrevistoSeries, activeRealizadoSeries]);

  const buildPolyline = (values: number[]) => {
    return values
      .map((v, i) => {
        const x = 68 + i * 50;
        const y = 200 - (chartMax > 0 ? (v / chartMax) * 175 : 0);
        return `${x},${y}`;
      })
      .join(' ');
  };

  return (
    <div className="space-y-6">
      {/* Buddha Spa Institutional Banner (Light & Dark Cleaned Artwork) */}
      <div className="dark:hidden flex flex-col md:flex-row items-stretch rounded-xl overflow-hidden border border-[#E3DAC8] bg-[#F7F3EC]">
        <div className="p-5 sm:p-6 flex-1 flex flex-col justify-center gap-2">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-[#A6711D]">
            DHO · Gente & Gestão
          </div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-[#1F1914] leading-snug">
            Buddha Spa — Orçamentos & Contratos
          </h2>
          <p className="text-xs text-[#6D6150] leading-relaxed max-w-lg">
            Acompanhamento executivo de tetos orçamentários, lançamentos mensais e vigências contratuais ({activeYear}).
          </p>
        </div>
        <div className="relative w-full md:w-[360px] lg:w-[400px] aspect-video md:aspect-auto md:h-[216px] shrink-0 overflow-hidden bg-[#F7F3EC]">
          <img
            src={buddhaLightImg}
            alt="Buddha Spa — Tema Claro"
            className="w-full h-full object-cover object-center"
          />
          <div className="hidden md:block absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#F7F3EC] to-transparent pointer-events-none" />
        </div>
      </div>

      <div className="hidden dark:flex flex-col md:flex-row items-stretch rounded-xl overflow-hidden border border-[#64191F] bg-[#360608]">
        <div className="p-5 sm:p-6 flex-1 flex flex-col justify-center gap-2">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-[#E5B95C]">
            DHO · Gente & Gestão
          </div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-[#F8F3EB] leading-snug">
            Buddha Spa — Orçamentos & Contratos
          </h2>
          <p className="text-xs text-[#D1BAA9] leading-relaxed max-w-lg">
            Acompanhamento executivo de tetos orçamentários, lançamentos mensais e vigências contratuais ({activeYear}).
          </p>
        </div>
        <div className="relative w-full md:w-[360px] lg:w-[400px] aspect-video md:aspect-auto md:h-[216px] shrink-0 overflow-hidden bg-[#360608]">
          <img
            src={buddhaDarkImg}
            alt="Buddha Spa — Tema Escuro"
            className="w-full h-full object-cover object-right"
          />
          <div className="hidden md:block absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#360608] to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Top Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="dash-year" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Ano:
            </label>
            <select
              id="dash-year"
              value={activeYear}
              onChange={(e) => onChangeYear(Number(e.target.value))}
              className="text-xs font-mono font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-2.5 py-1.5"
            >
              {getAvailableYears(state, activeYear).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="dash-emp" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Empresa:
            </label>
            <select
              id="dash-emp"
              value={empresaFilter}
              onChange={(e) => setEmpresaFilter(e.target.value)}
              className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">Todas as Empresas</option>
              {state.registries.empresas.map((emp) => (
                <option key={emp.id} value={emp.nome}>
                  {emp.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="dash-dep" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Departamento:
            </label>
            <select
              id="dash-dep"
              value={deptoFilter}
              onChange={(e) => setDeptoFilter(e.target.value)}
              className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">Todos os Departamentos</option>
              {state.registries.departamentos.map((dep) => (
                <option key={dep.id} value={dep.nome}>
                  {dep.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(empresaFilter !== 'all' || deptoFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setEmpresaFilter('all');
                setDeptoFilter('all');
              }}
              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
            >
              Limpar filtros
            </button>
          )}

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/80 rounded-lg transition-colors whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Guia de Uso</span>
          </button>
        </div>
      </div>

      {/* 5 Executive KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" aria-label="Indicadores do Painel">
        <KpiCardWithTooltip
          align="left"
          tooltip={{
            title: 'Teto Anual Planejado',
            description:
              'Soma de todos os tetos mensais (Janeiro a Dezembro) cadastrados no menu Planejamento para o ano selecionado.',
            formula: 'Σ Tetos Mensais de todas as categorias no ano',
            liveBreakdown: `Planejamento ${activeYear}: ${formatBRL(metrics.totalTeto)}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pr-5">
              Teto Anual Planejado
            </div>
            <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatBRL(metrics.totalTeto)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Planejamento DHO {activeYear}
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Realizado no Ano',
            description:
              'Soma da coluna Realizado de todos os lançamentos válidos do ano selecionado e proporção consumida frente ao Teto Planejado.',
            formula: 'Total = Σ Realizado | Consumo = (Realizado ÷ Teto Anual) × 100',
            liveBreakdown:
              metrics.totalTeto > 0
                ? `${formatBRL(metrics.totalRealizado, true)} ÷ ${formatBRL(
                    metrics.totalTeto,
                    true
                  )} = ${formatPercent(metrics.pctTeto)}`
                : `Realizado: ${formatBRL(metrics.totalRealizado)} (sem teto definido)`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pr-5">
              Realizado no Ano
            </div>
            <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatBRL(metrics.totalRealizado)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Consumo do teto</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {formatPercent(metrics.pctTeto)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    metrics.pctTeto > 100
                      ? 'bg-red-600'
                      : metrics.pctTeto >= 90
                      ? 'bg-amber-500'
                      : 'bg-blue-700'
                  }`}
                  style={{ width: `${Math.min(100, metrics.pctTeto)}%` }}
                />
              </div>
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Previsto nos Lançamentos',
            description:
              'Soma da coluna Orçado (Previsto) de todos os lançamentos válidos (não cancelados) cadastrados para o ano e filtros selecionados.',
            formula: 'Σ Orçado dos lançamentos válidos no ano',
            liveBreakdown: `${filteredEntries.length} lançamento(s) somando ${formatBRL(
              metrics.totalPrevisto
            )}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pr-5">
              Previsto nos Lançamentos
            </div>
            <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatBRL(metrics.totalPrevisto)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {filteredEntries.length} lançamento(s) válido(s)
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Saldo Disponível no Teto',
            description:
              'Quanto ainda resta do Teto Anual Planejado após descontar tudo o que já foi realizado no ano. Valores negativos indicam estouro do teto.',
            formula: 'Teto Anual Planejado − Realizado no Ano',
            liveBreakdown: `${formatBRL(metrics.totalTeto, true)} − ${formatBRL(
              metrics.totalRealizado,
              true
            )} = ${formatBRL(metrics.saldoTeto)}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pr-5">
              Saldo Disponível no Teto
            </div>
            <div
              className={`font-mono text-xl font-semibold tabular-nums ${
                metrics.saldoTeto < 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {formatBRL(metrics.saldoTeto)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Teto planejado menos realizado
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="right"
          tooltip={{
            title: 'Contratos Ativos · Mensal',
            description:
              'Soma do valor mensal comprometido em todos os contratos com status Ativo, A completar ou Em negociação dentro dos filtros de Empresa e Departamento.',
            formula: 'Σ Valor Mensal dos contratos vigentes',
            liveBreakdown: `${metrics.activeContractsCount} contrato(s) vigente(s) = ${formatBRL(
              metrics.committedMonthly
            )}/mês`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pr-5">
              Contratos Ativos · Mensal
            </div>
            <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatBRL(metrics.committedMonthly)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {metrics.activeContractsCount} contrato(s) vigente(s)
            </div>
          </div>
        </KpiCardWithTooltip>
      </section>

      {/* Chart + Clickable Alert Center */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Monthly Chart: Realizado Bars + Teto Line + Previsto Line + Acumulado toggle */}
        <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Realizado × Previsto × Teto ({activeYear})
              </h2>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-blue-700 inline-block" />
                  <span>Realizado (barra)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-amber-500 inline-block" />
                  <span>Previsto</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" />
                  <span>Teto Planejado</span>
                </span>
              </div>
            </div>

            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setChartMode('mensal')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartMode === 'mensal'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setChartMode('acumulado')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartMode === 'acumulado'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Acumulado
              </button>
            </div>
          </div>

          <div className="min-h-9 mb-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
            {hoveredMonth !== null ? (
              <>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {MONTH_FULL_LABELS[hoveredMonth]} ({chartMode === 'mensal' ? 'Mês' : 'Acumulado'})
                </span>
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Teto: {formatBRL(activeTetoSeries[hoveredMonth])}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    Previsto: {formatBRL(activePrevistoSeries[hoveredMonth])}
                  </span>
                  <span className="text-blue-700 dark:text-blue-400 font-semibold">
                    Realizado: {formatBRL(activeRealizadoSeries[hoveredMonth])}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    (Acum. Realizado: {formatBRL(metrics.realizadoAcumulado[hoveredMonth])})
                  </span>
                </div>
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                Passe o cursor sobre qualquer mês para comparar Realizado, Previsto, Teto e Acumulado.
              </span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[540px]">
              <svg viewBox="0 0 660 235" className="w-full h-60 overflow-visible" role="img" aria-label="Gráfico mensal de orçamento">
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = 200 - step * 175;
                  const val = chartMax * step;
                  return (
                    <g key={step}>
                      <line
                        x1={46}
                        x2={648}
                        y1={y}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                        strokeDasharray={step === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={40}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                      >
                        {val >= 1000 ? `${Math.round(val / 1000)}k` : Math.round(val)}
                      </text>
                    </g>
                  );
                })}

                {/* Bars for Realizado */}
                {MONTH_LABELS.map((label, idx) => {
                  const val = activeRealizadoSeries[idx];
                  const tetoVal = activeTetoSeries[idx];
                  const cx = 68 + idx * 50;
                  const h = chartMax > 0 ? (val / chartMax) * 175 : 0;
                  const isOver = tetoVal > 0 && val > tetoVal;
                  const isHovered = hoveredMonth === idx;

                  return (
                    <g
                      key={label}
                      onMouseEnter={() => setHoveredMonth(idx)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={cx - 20}
                        y={20}
                        width={40}
                        height={188}
                        rx={4}
                        className={isHovered ? 'fill-slate-100 dark:fill-slate-800/70' : 'fill-transparent'}
                      />
                      <rect
                        x={cx - 12}
                        y={200 - h}
                        width={24}
                        height={Math.max(0, h)}
                        rx={3}
                        className={
                          isOver
                            ? 'fill-red-600 dark:fill-red-500'
                            : 'fill-blue-700 dark:fill-blue-400'
                        }
                        opacity={0.9}
                      />
                      <text
                        x={cx}
                        y={220}
                        textAnchor="middle"
                        className={`text-[11px] ${
                          isHovered
                            ? 'fill-slate-900 dark:fill-slate-100 font-semibold'
                            : 'fill-slate-500 dark:fill-slate-400'
                        }`}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

                {/* Line for Previsto */}
                <polyline
                  fill="none"
                  stroke="#D97706"
                  strokeWidth={2}
                  points={buildPolyline(activePrevistoSeries)}
                  className="pointer-events-none"
                />

                {/* Dashed Line for Teto */}
                <polyline
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  points={buildPolyline(activeTetoSeries)}
                  className="pointer-events-none"
                />
              </svg>
            </div>
          </div>
        </section>

        {/* Central de Alertas Clicáveis */}
        <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Central de Alertas ({alerts.length})
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Clique para ir ao item
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[340px] overflow-y-auto flex-1">
            {alerts.map((al) => (
              <button
                key={al.id}
                type="button"
                onClick={() => onAlertClick(al)}
                className="w-full px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <HealthChip severity={al.severity} label={al.categoryLabel} />
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {al.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {al.detail}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" aria-hidden="true" />
              </button>
            ))}

            {alerts.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Nenhum alerta crítico ou pendência no momento.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Category Table + Top 8 Suppliers */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Execução por Categoria ({activeYear})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Status por consumo do teto: até 90% OK · 90% a 100% Atenção · acima de 100% Estourado
            </p>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-4">Categoria</th>
                  <th className="py-2.5 px-4 text-right">Teto</th>
                  <th className="py-2.5 px-4 text-right">Previsto</th>
                  <th className="py-2.5 px-4 text-right">Realizado</th>
                  <th className="py-2.5 px-4 text-right">Saldo</th>
                  <th className="py-2.5 px-4 text-right">% Teto</th>
                  <th className="py-2.5 px-4">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {categoryRows.map((r) => (
                  <tr key={r.cat} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {r.cat}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {formatBRL(r.teto)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {formatBRL(r.previsto)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      {formatBRL(r.realizado)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-medium tabular-nums whitespace-nowrap ${
                        r.saldo < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatBRL(r.saldo)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {r.teto > 0 ? formatPercent(r.pct) : '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <HealthChip severity={r.status} label={r.statusLabel} />
                    </td>
                  </tr>
                ))}
                {categoryRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Nenhum dado disponível para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top 8 Fornecedores */}
        <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Top 8 Fornecedores (Realizado)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Maiores valores realizados no período em {activeYear}
            </p>
          </div>

          <div className="space-y-3 flex-1">
            {topSuppliers.map((sup, idx) => (
              <div key={sup.fornecedor} className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {idx + 1}. {sup.fornecedor}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                    {formatBRL(sup.total)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-700 dark:bg-blue-500 rounded-full"
                    style={{ width: `${Math.max(4, sup.barPct)}%` }}
                  />
                </div>
              </div>
            ))}

            {topSuppliers.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span>Nenhum gasto com fornecedor registrado no período.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <UserGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        activeYear={activeYear}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
}
