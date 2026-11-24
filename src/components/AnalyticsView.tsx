import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Percent,
  PieChart,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { DatabaseState, isProposal } from '../types/buddha';
import {
  formatBRL,
  formatCompetenciaBR,
  formatDateBR,
  formatPercent,
  MONTH_FULL_LABELS,
  MONTH_LABELS,
} from '../utils/format';
import { CumulativeMonthRow, CumulativeTrendChart } from './CumulativeTrendChart';
import { KpiCardWithTooltip } from './KpiCardWithTooltip';
import { YoYComparisonChart, YoYMonthRow } from './YoYComparisonChart';
import { getAvailableYears } from '../utils/years';

export interface AnalyticsViewProps {
  state: DatabaseState;
  activeYear: number;
  onChangeYear: (y: number) => void;
  onNavigateToTab?: (
    tab: 'dashboard' | 'entries' | 'contracts' | 'planning' | 'reports' | 'registries',
    options?: { contractId?: string; entryFilter?: string }
  ) => void;
}

type AnalyticsSubTab = 'visao-geral' | 'pareto' | 'matriz' | 'contratos' | 'tabela';
type MetricBase = 'realizado' | 'orcado';

export function AnalyticsView({
  state,
  activeYear,
  onChangeYear,
  onNavigateToTab,
}: AnalyticsViewProps) {
  const [subTab, setSubTab] = useState<AnalyticsSubTab>('visao-geral');

  // Dynamic available years from 2025 onward (expanding with entries, plans, contracts)
  const availableYears = useMemo(
    () => getAvailableYears(state, activeYear),
    [state, activeYear]
  );

  // Year filter ('all' or numeric year)
  const [yearScope, setYearScope] = useState<'all' | number>(activeYear);
  const userChangedYearRef = useRef(false);

  // Keep synced when external activeYear changes, unless user selected 'all'
  useEffect(() => {
    if (!userChangedYearRef.current) {
      setYearScope(activeYear);
    }
  }, [activeYear]);

  // If entries exist in Lançamentos but none match the currently selected year,
  // auto-switch to the latest year that has entries so data always surfaces immediately.
  useEffect(() => {
    if (userChangedYearRef.current) return;
    if (state.entries.length === 0 || yearScope === 'all') return;
    const prefix = `${yearScope}-`;
    const hasForYear = state.entries.some((e) => e.competencia.startsWith(prefix));
    if (!hasForYear) {
      const yearsWithEntries = Array.from(
        new Set(
          state.entries
            .map((e) => parseInt(e.competencia.slice(0, 4), 10))
            .filter((y) => Number.isFinite(y))
        )
      ).sort((a, b) => b - a);
      if (yearsWithEntries.length === 1) {
        setYearScope(yearsWithEntries[0]);
        onChangeYear(yearsWithEntries[0]);
      } else if (yearsWithEntries.length > 1) {
        setYearScope('all');
      }
    }
  }, [state.entries, yearScope, onChangeYear]);

  // Filters
  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [deptoFilter, setDeptoFilter] = useState<string>('all');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all');
  const [naturezaFilter, setNaturezaFilter] = useState<'all' | 'recorrente' | 'pontual'>('all');
  const [includeCanceled, setIncludeCanceled] = useState<boolean>(false);

  // Metric base for Pareto/Matrix/Breakdown (defaults to 'realizado', auto-switches to 'orcado' if only budgeted values exist)
  const [metricBase, setMetricBase] = useState<MetricBase>('realizado');
  const userChangedMetricRef = useRef(false);

  // Table explorer search & sort
  const [searchTable, setSearchTable] = useState<string>('');
  const [sortField, setSortField] = useState<'realizado' | 'orcado' | 'saldo' | 'competencia'>(
    'competencia'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // UI feedback
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Unique lists combining registries + actual entries + contracts + plans
  const filterOptions = useMemo(() => {
    const empSet = new Set(state.registries.empresas.map((e) => e.nome));
    const depSet = new Set(state.registries.departamentos.map((d) => d.nome));
    const catSet = new Set(state.registries.categorias.map((c) => c.nome));

    for (const e of state.entries) {
      if (e.empresa) empSet.add(e.empresa);
      if (e.departamento) depSet.add(e.departamento);
      if (e.categoria) catSet.add(e.categoria);
    }

    for (const c of state.contracts) {
      if (c.empresa) empSet.add(c.empresa);
      if (c.departamento) depSet.add(c.departamento);
      if (c.categoria) catSet.add(c.categoria);
    }

    for (const planItem of Object.values(state.plans || {})) {
      for (const catKey of Object.keys(planItem.tetos || {})) {
        if (catKey) catSet.add(catKey);
      }
    }

    return {
      empresas: Array.from(empSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      departamentos: Array.from(depSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      categorias: Array.from(catSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }, [state.registries, state.entries, state.contracts, state.plans]);

  // Entries filtered by all criteria EXCEPT category (to show live category counts in the top selector)
  const entriesBeforeCategory = useMemo(() => {
    return state.entries.filter((e) => {
      if (!includeCanceled && e.status === 'Cancelado') return false;

      if (yearScope !== 'all') {
        const startComp = `${yearScope}-${String(startMonth).padStart(2, '0')}`;
        const endComp = `${yearScope}-${String(endMonth).padStart(2, '0')}`;
        if (e.competencia < startComp || e.competencia > endComp) return false;
      } else {
        const m = parseInt(e.competencia.slice(5, 7), 10);
        if (Number.isFinite(m) && (m < startMonth || m > endMonth)) return false;
      }

      if (empresaFilter !== 'all' && e.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && e.departamento !== deptoFilter) return false;
      if (naturezaFilter === 'recorrente' && !e.recorrente) return false;
      if (naturezaFilter === 'pontual' && e.recorrente) return false;
      return true;
    });
  }, [
    state.entries,
    includeCanceled,
    yearScope,
    startMonth,
    endMonth,
    empresaFilter,
    deptoFilter,
    naturezaFilter,
  ]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entriesBeforeCategory) {
      if (!e.categoria) continue;
      counts.set(e.categoria, (counts.get(e.categoria) || 0) + 1);
    }
    return counts;
  }, [entriesBeforeCategory]);

  // 1. FILTERED ENTRIES (directly from state.entries populated in Menu Lançamentos)
  const filteredEntries = useMemo(() => {
    return state.entries.filter((e) => {
      if (!includeCanceled && e.status === 'Cancelado') return false;

      if (yearScope !== 'all') {
        const startComp = `${yearScope}-${String(startMonth).padStart(2, '0')}`;
        const endComp = `${yearScope}-${String(endMonth).padStart(2, '0')}`;
        if (e.competencia < startComp || e.competencia > endComp) return false;
      } else {
        const m = parseInt(e.competencia.slice(5, 7), 10);
        if (Number.isFinite(m) && (m < startMonth || m > endMonth)) return false;
      }

      if (empresaFilter !== 'all' && e.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && e.departamento !== deptoFilter) return false;
      if (categoriaFilter !== 'all' && e.categoria !== categoriaFilter) return false;
      if (naturezaFilter === 'recorrente' && !e.recorrente) return false;
      if (naturezaFilter === 'pontual' && e.recorrente) return false;
      return true;
    });
  }, [
    state.entries,
    includeCanceled,
    yearScope,
    startMonth,
    endMonth,
    empresaFilter,
    deptoFilter,
    categoriaFilter,
    naturezaFilter,
  ]);

  // Auto-switch metricBase if there are budgeted entries with 0 realized
  useEffect(() => {
    if (userChangedMetricRef.current) return;
    const sumR = filteredEntries.reduce((s, e) => s + e.realizado, 0);
    const sumO = filteredEntries.reduce((s, e) => s + e.orcado, 0);
    if (sumR === 0 && sumO > 0) {
      setMetricBase('orcado');
    } else if (sumR > 0) {
      setMetricBase('realizado');
    }
  }, [filteredEntries]);

  // 2. ANNUAL PLAN CEILINGS (Tetos)
  const effectivePlanYear = yearScope === 'all' ? activeYear : yearScope;
  const plan = state.plans[String(effectivePlanYear)];

  const tetoTotalFiltered = useMemo(() => {
    const yearsToSum =
      yearScope === 'all' ? Object.keys(state.plans) : [String(yearScope)];

    let sum = 0;
    for (const yKey of yearsToSum) {
      const p = state.plans[yKey];
      if (!p) continue;
      const catsToSum = categoriaFilter !== 'all' ? [categoriaFilter] : Object.keys(p.tetos);
      for (const cat of catsToSum) {
        const arr = p.tetos[cat];
        if (arr) {
          for (let m = startMonth - 1; m < endMonth; m++) {
            sum += arr[m] || 0;
          }
        }
      }
    }
    return sum;
  }, [state.plans, yearScope, categoriaFilter, startMonth, endMonth]);

  // 3. CORE EXECUTIVE INTELLIGENCE METRICS
  const metrics = useMemo(() => {
    let totalOrcado = 0;
    let totalRealizado = 0;
    let recorrenteValor = 0;
    let pontualValor = 0;
    let totalSavings = 0;
    let totalOverruns = 0;
    let paidCount = 0;
    let pendingCount = 0;

    for (const e of filteredEntries) {
      totalOrcado += e.orcado;
      totalRealizado += e.realizado;
      const valForNature = metricBase === 'realizado' ? e.realizado : e.orcado;
      if (e.recorrente) recorrenteValor += valForNature;
      else pontualValor += valForNature;

      if (e.status === 'Pago') paidCount++;
      else if (e.status === 'Previsto') pendingCount++;

      if (e.orcado > e.realizado) {
        totalSavings += e.orcado - e.realizado;
      } else if (e.realizado > e.orcado) {
        totalOverruns += e.realizado - e.orcado;
      }
    }

    const totalBase = metricBase === 'realizado' ? totalRealizado : totalOrcado;
    const totalDespesas = totalBase;
    const saldoOrcamento = totalOrcado - totalRealizado;
    const variacaoVsOrcamento = totalRealizado - totalOrcado;
    const variacaoPctVsOrcamento =
      totalOrcado > 0 ? (variacaoVsOrcamento / totalOrcado) * 100 : null;
    const execucaoBase = totalOrcado > 0 ? totalOrcado : tetoTotalFiltered;
    const pctExecucao = execucaoBase > 0 ? (totalRealizado / execucaoBase) * 100 : 0;
    const saldoTeto = tetoTotalFiltered - totalRealizado;
    const pctTeto = tetoTotalFiltered > 0 ? (totalRealizado / tetoTotalFiltered) * 100 : 0;
    const pctRecorrente = totalBase > 0 ? (recorrenteValor / totalBase) * 100 : 0;

    const desvioAbsoluto = Math.abs(totalRealizado - totalOrcado);
    const acuraciaPrevisao =
      totalOrcado > 0
        ? Math.max(0, 100 - (desvioAbsoluto / totalOrcado) * 100)
        : totalRealizado === 0
        ? 100
        : 0;

    const distinctMonths = new Set(filteredEntries.map((e) => e.competencia)).size;
    const monthsDivisor = Math.max(1, distinctMonths || endMonth - startMonth + 1);
    const mediaMensal = totalBase / monthsDivisor;
    const projecaoAnualizada = mediaMensal * 12;

    return {
      totalOrcado,
      totalRealizado,
      totalBase,
      totalDespesas,
      recorrenteValor,
      pontualValor,
      saldoOrcamento,
      variacaoVsOrcamento,
      variacaoPctVsOrcamento,
      execucaoBase,
      pctExecucao,
      saldoTeto,
      pctTeto,
      pctRecorrente,
      acuraciaPrevisao,
      totalSavings,
      totalOverruns,
      mediaMensal,
      projecaoAnualizada,
      distinctMonths,
      paidCount,
      pendingCount,
      entriesCount: filteredEntries.length,
    };
  }, [filteredEntries, metricBase, tetoTotalFiltered, startMonth, endMonth]);

  // 4. MONTHLY BREAKDOWN (Mês a Mês) & 3-MONTH MOVING AVERAGE FORECAST
  const forecastBaseline = useMemo(() => {
    const byComp = new Map<string, { val: number; count: number }>();

    for (const e of state.entries) {
      if (!includeCanceled && e.status === 'Cancelado') continue;
      if (empresaFilter !== 'all' && e.empresa !== empresaFilter) continue;
      if (deptoFilter !== 'all' && e.departamento !== deptoFilter) continue;
      if (categoriaFilter !== 'all' && e.categoria !== categoriaFilter) continue;
      if (naturezaFilter === 'recorrente' && !e.recorrente) continue;
      if (naturezaFilter === 'pontual' && e.recorrente) continue;
      if (!e.competencia) continue;

      const v = metricBase === 'realizado' ? e.realizado : e.orcado;
      const prev = byComp.get(e.competencia) || { val: 0, count: 0 };
      prev.val += v;
      prev.count += 1;
      byComp.set(e.competencia, prev);
    }

    const sortedActive = Array.from(byComp.entries())
      .filter(([, data]) => data.count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([comp, data]) => ({ comp, val: data.val }));

    const last3 = sortedActive.slice(-3);
    const latest3MAvg =
      last3.length > 0 ? last3.reduce((acc, item) => acc + item.val, 0) / last3.length : 0;
    const baselineLabels = last3.map((item) => formatCompetenciaBR(item.comp));

    const getForecastForComp = (comp: string): number => {
      if (sortedActive.length === 0) return 0;
      const upTo = sortedActive.filter((item) => item.comp <= comp);
      if (upTo.length === 0) return 0;
      const window3 = upTo.slice(-3);
      return window3.reduce((acc, item) => acc + item.val, 0) / window3.length;
    };

    return {
      sortedActive,
      latest3MAvg,
      baselineLabels,
      getForecastForComp,
    };
  }, [
    state.entries,
    includeCanceled,
    empresaFilter,
    deptoFilter,
    categoriaFilter,
    naturezaFilter,
    metricBase,
  ]);

  const monthlyBreakdown = useMemo(() => {
    const rawMonths = Array.from({ length: 12 }, (_, i) => {
      const monthNumber = i + 1;
      const monthSuffix = `-${String(monthNumber).padStart(2, '0')}`;

      let orcado = 0;
      let realizado = 0;
      let count = 0;

      for (const e of state.entries) {
        if (!includeCanceled && e.status === 'Cancelado') continue;
        if (yearScope !== 'all') {
          if (e.competencia !== `${yearScope}${monthSuffix}`) continue;
        } else {
          if (!e.competencia.endsWith(monthSuffix)) continue;
        }
        if (empresaFilter !== 'all' && e.empresa !== empresaFilter) continue;
        if (deptoFilter !== 'all' && e.departamento !== deptoFilter) continue;
        if (categoriaFilter !== 'all' && e.categoria !== categoriaFilter) continue;
        if (naturezaFilter === 'recorrente' && !e.recorrente) continue;
        if (naturezaFilter === 'pontual' && e.recorrente) continue;

        orcado += e.orcado;
        realizado += e.realizado;
        count++;
      }

      let teto = 0;
      const yearsToSum =
        yearScope === 'all' ? Object.keys(state.plans) : [String(yearScope)];
      for (const yKey of yearsToSum) {
        const p = state.plans[yKey];
        if (!p) continue;
        const cats = categoriaFilter !== 'all' ? [categoriaFilter] : Object.keys(p.tetos);
        for (const c of cats) {
          teto += p.tetos[c]?.[i] || 0;
        }
      }

      const isInPeriod = monthNumber >= startMonth && monthNumber <= endMonth;

      return {
        monthIndex: i,
        monthNumber,
        label: MONTH_LABELS[i],
        fullLabel: MONTH_FULL_LABELS[i],
        orcado,
        realizado,
        teto,
        saldo: orcado - realizado,
        count,
        isInPeriod,
      };
    });

    // Attach 3-month trailing/projected Previsão de Gastos to each month
    const activeMonthsInYear = rawMonths.filter((m) => m.count > 0);
    return rawMonths.map((m, idx) => {
      let previsaoGastos = 0;
      if (yearScope !== 'all') {
        const targetComp = `${yearScope}-${String(m.monthNumber).padStart(2, '0')}`;
        const windowVal = forecastBaseline.getForecastForComp(targetComp);
        previsaoGastos = windowVal > 0 ? windowVal : forecastBaseline.latest3MAvg;
      } else if (activeMonthsInYear.length > 0) {
        const activeUpTo = rawMonths
          .slice(0, idx + 1)
          .filter((item) => item.count > 0)
          .map((item) => (metricBase === 'realizado' ? item.realizado : item.orcado));
        if (activeUpTo.length > 0) {
          const w = activeUpTo.slice(-3);
          previsaoGastos = w.reduce((s, v) => s + v, 0) / w.length;
        } else {
          previsaoGastos = forecastBaseline.latest3MAvg;
        }
      }

      return {
        ...m,
        previsaoGastos: Math.round(previsaoGastos * 100) / 100,
      };
    });
  }, [
    state.entries,
    state.plans,
    includeCanceled,
    yearScope,
    empresaFilter,
    deptoFilter,
    categoriaFilter,
    naturezaFilter,
    startMonth,
    endMonth,
    metricBase,
    forecastBaseline,
  ]);

  const monthlyChartMax = useMemo(() => {
    let m = 0;
    for (const b of monthlyBreakdown) {
      m = Math.max(m, b.orcado, b.realizado, b.teto, b.previsaoGastos);
    }
    return m > 0 ? m * 1.15 : 10000;
  }, [monthlyBreakdown]);

  // 4B. YEAR-OVER-YEAR (YoY) MONTH-BY-MONTH BUDGET VARIATION (ANO ATUAL vs ANO ANTERIOR)
  const currentCompareYear = yearScope === 'all' ? activeYear : yearScope;
  const previousCompareYear = currentCompareYear - 1;

  const yoyComparison = useMemo<YoYMonthRow[]>(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNumber = i + 1;
      const monthStr = String(monthNumber).padStart(2, '0');
      const currComp = `${currentCompareYear}-${monthStr}`;
      const prevComp = `${previousCompareYear}-${monthStr}`;

      let prevOrcado = 0;
      let prevRealizado = 0;
      let prevCount = 0;
      let currOrcado = 0;
      let currRealizado = 0;
      let currCount = 0;

      for (const e of state.entries) {
        if (!includeCanceled && e.status === 'Cancelado') continue;
        if (empresaFilter !== 'all' && e.empresa !== empresaFilter) continue;
        if (deptoFilter !== 'all' && e.departamento !== deptoFilter) continue;
        if (categoriaFilter !== 'all' && e.categoria !== categoriaFilter) continue;
        if (naturezaFilter === 'recorrente' && !e.recorrente) continue;
        if (naturezaFilter === 'pontual' && e.recorrente) continue;

        if (e.competencia === prevComp) {
          prevOrcado += e.orcado;
          prevRealizado += e.realizado;
          prevCount++;
        } else if (e.competencia === currComp) {
          currOrcado += e.orcado;
          currRealizado += e.realizado;
          currCount++;
        }
      }

      const prevValue = metricBase === 'realizado' ? prevRealizado : prevOrcado;
      const currValue = metricBase === 'realizado' ? currRealizado : currOrcado;
      const variacaoAbs = currValue - prevValue;
      const variacaoPct = prevValue > 0 ? (variacaoAbs / prevValue) * 100 : null;
      const rawForecast = forecastBaseline.getForecastForComp(currComp);
      const previsaoGastos =
        Math.round((rawForecast > 0 ? rawForecast : forecastBaseline.latest3MAvg) * 100) / 100;

      return {
        monthIndex: i,
        monthNumber,
        label: MONTH_LABELS[i],
        fullLabel: MONTH_FULL_LABELS[i],
        prevOrcado,
        prevRealizado,
        currOrcado,
        currRealizado,
        prevValue,
        currValue,
        previsaoGastos,
        variacaoAbs,
        variacaoPct,
        prevCount,
        currCount,
        isInPeriod: monthNumber >= startMonth && monthNumber <= endMonth,
      };
    });
  }, [
    state.entries,
    currentCompareYear,
    previousCompareYear,
    includeCanceled,
    empresaFilter,
    deptoFilter,
    categoriaFilter,
    naturezaFilter,
    metricBase,
    startMonth,
    endMonth,
    forecastBaseline,
  ]);

  // 4C. YTD CUMULATIVE TREND (GASTOS ACUMULADOS vs ORÇAMENTO ACUMULADO NO ANO CORRENTE)
  const cumulativeTrendData = useMemo<CumulativeMonthRow[]>(() => {
    const planForYear = state.plans[String(currentCompareYear)];
    let runningOrcado = 0;
    let runningRealizado = 0;
    let runningTeto = 0;

    return Array.from({ length: 12 }, (_, i) => {
      const monthNumber = i + 1;
      const monthStr = String(monthNumber).padStart(2, '0');
      const targetComp = `${currentCompareYear}-${monthStr}`;

      let orcadoMes = 0;
      let realizadoMes = 0;
      let entriesCount = 0;

      for (const e of state.entries) {
        if (!includeCanceled && e.status === 'Cancelado') continue;
        if (e.competencia !== targetComp) continue;
        if (empresaFilter !== 'all' && e.empresa !== empresaFilter) continue;
        if (deptoFilter !== 'all' && e.departamento !== deptoFilter) continue;
        if (categoriaFilter !== 'all' && e.categoria !== categoriaFilter) continue;
        if (naturezaFilter === 'recorrente' && !e.recorrente) continue;
        if (naturezaFilter === 'pontual' && e.recorrente) continue;

        orcadoMes += e.orcado;
        realizadoMes += e.realizado;
        entriesCount++;
      }

      let tetoMes = 0;
      if (planForYear) {
        const cats =
          categoriaFilter !== 'all' ? [categoriaFilter] : Object.keys(planForYear.tetos);
        for (const c of cats) {
          tetoMes += planForYear.tetos[c]?.[i] || 0;
        }
      }

      const isInPeriod = monthNumber >= startMonth && monthNumber <= endMonth;
      if (isInPeriod) {
        runningOrcado += orcadoMes;
        runningRealizado += realizadoMes;
        runningTeto += tetoMes;
      }

      const desvioAcumulado = runningRealizado - runningOrcado;
      const desvioAcumuladoPct =
        runningOrcado > 0 ? (desvioAcumulado / runningOrcado) * 100 : null;

      return {
        monthIndex: i,
        monthNumber,
        label: MONTH_LABELS[i],
        fullLabel: MONTH_FULL_LABELS[i],
        orcadoMes,
        realizadoMes,
        tetoMes,
        orcadoAcumulado: Math.round(runningOrcado * 100) / 100,
        realizadoAcumulado: Math.round(runningRealizado * 100) / 100,
        tetoAcumulado: Math.round(runningTeto * 100) / 100,
        desvioAcumulado: Math.round(desvioAcumulado * 100) / 100,
        desvioAcumuladoPct,
        entriesCount,
        isInPeriod,
      };
    });
  }, [
    state.entries,
    state.plans,
    currentCompareYear,
    includeCanceled,
    empresaFilter,
    deptoFilter,
    categoriaFilter,
    naturezaFilter,
    startMonth,
    endMonth,
  ]);

  // 5. PARETO 80/20 ANALYSIS (FORNECEDORES)
  const paretoAnalysis = useMemo(() => {
    const map = new Map<
      string,
      {
        fornecedor: string;
        realizado: number;
        orcado: number;
        count: number;
      }
    >();

    for (const e of filteredEntries) {
      const forn = e.fornecedor?.trim() || '(Sem Fornecedor)';
      const curr = map.get(forn) || {
        fornecedor: forn,
        realizado: 0,
        orcado: 0,
        count: 0,
      };
      curr.realizado += e.realizado;
      curr.orcado += e.orcado;
      curr.count += 1;
      map.set(forn, curr);
    }

    const getVal = (item: { realizado: number; orcado: number }) =>
      metricBase === 'realizado' ? item.realizado : item.orcado;

    const sorted = Array.from(map.values()).sort((a, b) => getVal(b) - getVal(a));
    const totalGeral = sorted.reduce((acc, item) => acc + Math.max(0, getVal(item)), 0);

    let accum = 0;
    const classified = sorted.map((item, idx) => {
      const val = getVal(item);
      accum += Math.max(0, val);
      const pctItem = totalGeral > 0 ? (val / totalGeral) * 100 : 0;
      const pctAccum = totalGeral > 0 ? (accum / totalGeral) * 100 : 0;

      let classe: 'A' | 'B' | 'C' = 'A';
      if (pctAccum > 95) classe = 'C';
      else if (pctAccum > 80 && idx > 0) classe = 'B';

      const linkedContract = state.contracts.find(
        (c) =>
          c.fornecedor.toLowerCase().trim() === item.fornecedor.toLowerCase().trim() &&
          (c.status === 'Ativo' || c.status === 'A completar' || c.status === 'Em negociação')
      );

      return {
        rank: idx + 1,
        fornecedor: item.fornecedor,
        val,
        realizado: item.realizado,
        orcado: item.orcado,
        saldo: item.orcado - item.realizado,
        count: item.count,
        ticketMedio: item.count > 0 ? val / item.count : 0,
        pctItem,
        pctAccum,
        classe,
        linkedContractId: linkedContract?.id,
        contractStatus: linkedContract?.status,
      };
    });

    const classACount = classified.filter((c) => c.classe === 'A').length;
    const classBCount = classified.filter((c) => c.classe === 'B').length;
    const classCCount = classified.filter((c) => c.classe === 'C').length;
    const top3Share = classified.slice(0, 3).reduce((acc, c) => acc + c.pctItem, 0);

    return {
      rows: classified,
      totalFornecedores: classified.length,
      classACount,
      classBCount,
      classCCount,
      top3Share,
    };
  }, [filteredEntries, metricBase, state.contracts]);

  // 6. BI-DIMENSIONAL MATRIX: EMPRESAS x DEPARTAMENTOS
  const matrixAnalysis = useMemo(() => {
    const empSet = new Set(state.registries.empresas.map((e) => e.nome));
    const depSet = new Set(state.registries.departamentos.map((d) => d.nome));

    for (const e of filteredEntries) {
      if (e.empresa) empSet.add(e.empresa);
      if (e.departamento) depSet.add(e.departamento);
    }

    const empresasList = Array.from(empSet);
    const deptosList = Array.from(depSet);

    const cellValues: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};

    for (const emp of empresasList) {
      cellValues[emp] = {};
      rowTotals[emp] = 0;
      for (const dep of deptosList) {
        cellValues[emp][dep] = 0;
      }
    }
    for (const dep of deptosList) {
      colTotals[dep] = 0;
    }

    let grandTotal = 0;

    for (const e of filteredEntries) {
      const emp = e.empresa || '(Sem Empresa)';
      const dep = e.departamento || '(Sem Departamento)';
      const val = metricBase === 'realizado' ? e.realizado : e.orcado;

      if (!cellValues[emp]) {
        cellValues[emp] = {};
        rowTotals[emp] = 0;
      }
      if (cellValues[emp][dep] === undefined) cellValues[emp][dep] = 0;
      if (colTotals[dep] === undefined) colTotals[dep] = 0;

      cellValues[emp][dep] += val;
      rowTotals[emp] += val;
      colTotals[dep] += val;
      grandTotal += val;
    }

    const sortedEmpresas = Object.keys(rowTotals).sort((a, b) => rowTotals[b] - rowTotals[a]);

    return {
      empresasList: sortedEmpresas,
      deptosList,
      cellValues,
      rowTotals,
      colTotals,
      grandTotal,
    };
  }, [filteredEntries, metricBase, state.registries.empresas, state.registries.departamentos]);

  // 7. CATEGORY PARTICIPATION BREAKDOWN
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { realizado: number; orcado: number; count: number }>();

    for (const e of filteredEntries) {
      const cat = e.categoria || '(Sem categoria)';
      const curr = map.get(cat) || { realizado: 0, orcado: 0, count: 0 };
      curr.realizado += e.realizado;
      curr.orcado += e.orcado;
      curr.count += 1;
      map.set(cat, curr);
    }

    const totalRef = metricBase === 'realizado' ? metrics.totalRealizado : metrics.totalOrcado;

    return Array.from(map.entries())
      .map(([cat, data]) => {
        let tetoCat = 0;
        const yearsToSum =
          yearScope === 'all' ? Object.keys(state.plans) : [String(yearScope)];
        for (const yKey of yearsToSum) {
          const p = state.plans[yKey];
          if (p?.tetos[cat]) {
            for (let m = startMonth - 1; m < endMonth; m++) {
              tetoCat += p.tetos[cat][m] || 0;
            }
          }
        }

        const valBase = metricBase === 'realizado' ? data.realizado : data.orcado;
        const pctBaseTotal = totalRef > 0 ? (valBase / totalRef) * 100 : 0;
        const pctConsumoTeto = tetoCat > 0 ? (data.realizado / tetoCat) * 100 : 0;

        return {
          categoria: cat,
          realizado: data.realizado,
          orcado: data.orcado,
          valBase,
          teto: tetoCat,
          saldoTeto: tetoCat - data.realizado,
          count: data.count,
          pctBaseTotal,
          pctConsumoTeto,
        };
      })
      .sort((a, b) => b.valBase - a.valBase);
  }, [
    filteredEntries,
    metricBase,
    metrics.totalRealizado,
    metrics.totalOrcado,
    state.plans,
    yearScope,
    startMonth,
    endMonth,
  ]);

  // 8. CONTRACT RISK & EXPOSURE INTELLIGENCE
  const contractsAnalytics = useMemo(() => {
    const contracts = state.contracts.filter((c) => {
      if (isProposal(c)) return false;
      if (empresaFilter !== 'all' && c.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && c.departamento !== deptoFilter) return false;
      if (categoriaFilter !== 'all' && c.categoria !== categoriaFilter) return false;
      return true;
    });

    const active = contracts.filter(
      (c) => c.status === 'Ativo' || c.status === 'A completar' || c.status === 'Em negociação'
    );

    const indexExposure: Record<string, { count: number; valorMensal: number }> = {};
    let totalCommittedMonthly = 0;

    for (const c of active) {
      const idx = c.indiceReajuste || 'Sem reajuste';
      if (!indexExposure[idx]) indexExposure[idx] = { count: 0, valorMensal: 0 };
      indexExposure[idx].count += 1;
      indexExposure[idx].valorMensal += c.valorMensal;
      totalCommittedMonthly += c.valorMensal;
    }

    const expiryByMonth: Record<number, { count: number; totalMonthly: number }> = {};
    for (let m = 1; m <= 12; m++) expiryByMonth[m] = { count: 0, totalMonthly: 0 };

    const targetExpYear = yearScope === 'all' ? activeYear : yearScope;
    for (const c of active) {
      if (c.fim) {
        const [yearStr, monthStr] = c.fim.split('-');
        if (parseInt(yearStr, 10) === targetExpYear) {
          const m = parseInt(monthStr, 10);
          if (m >= 1 && m <= 12) {
            expiryByMonth[m].count += 1;
            expiryByMonth[m].totalMonthly += c.valorMensal;
          }
        }
      }
    }

    const recBase = metrics.recorrenteValor;
    const coveredVal = filteredEntries
      .filter((e) => e.recorrente && Boolean(e.contratoId))
      .reduce((acc, e) => acc + (metricBase === 'realizado' ? e.realizado : e.orcado), 0);

    const contractualCoveragePct = recBase > 0 ? (coveredVal / recBase) * 100 : 0;

    return {
      totalContracts: contracts.length,
      activeCount: active.length,
      totalCommittedMonthly,
      indexExposure,
      expiryByMonth,
      targetExpYear,
      contractualCoveragePct,
    };
  }, [
    state.contracts,
    empresaFilter,
    deptoFilter,
    categoriaFilter,
    yearScope,
    activeYear,
    metrics.recorrenteValor,
    filteredEntries,
    metricBase,
  ]);

  // 9. TABLE EXPLORER DATA
  const tableData = useMemo(() => {
    let list = [...filteredEntries];

    if (searchTable.trim()) {
      const q = searchTable.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.fornecedor.toLowerCase().includes(q) ||
          e.descricao.toLowerCase().includes(q) ||
          e.categoria.toLowerCase().includes(q) ||
          e.empresa.toLowerCase().includes(q) ||
          e.departamento.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA);
      }
      return sortOrder === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

    return list;
  }, [filteredEntries, searchTable, sortField, sortOrder]);

  const hasActiveFilters =
    startMonth !== 1 ||
    endMonth !== 12 ||
    empresaFilter !== 'all' ||
    deptoFilter !== 'all' ||
    categoriaFilter !== 'all' ||
    naturezaFilter !== 'all' ||
    includeCanceled;

  const resetFilters = () => {
    setStartMonth(1);
    setEndMonth(12);
    setEmpresaFilter('all');
    setDeptoFilter('all');
    setCategoriaFilter('all');
    setNaturezaFilter('all');
    setIncludeCanceled(false);
    setSearchTable('');
  };

  // EXCEL MULTI-SHEET EXPORT
  const handleExportAnalyticsExcel = () => {
    const wb = XLSX.utils.book_new();
    const yearLabel = yearScope === 'all' ? 'Todos os anos' : String(yearScope);

    const summaryData = [
      { Métrica: 'Ano Analisado', Valor: yearLabel },
      { Métrica: 'Período', Valor: `${MONTH_LABELS[startMonth - 1]} a ${MONTH_LABELS[endMonth - 1]}` },
      { Métrica: 'Empresa', Valor: empresaFilter === 'all' ? 'Todas' : empresaFilter },
      { Métrica: 'Departamento', Valor: deptoFilter === 'all' ? 'Todos' : deptoFilter },
      { Métrica: 'Categoria', Valor: categoriaFilter === 'all' ? 'Todas' : categoriaFilter },
      { Métrica: 'Base Analisada', Valor: metricBase === 'realizado' ? 'Realizado' : 'Orçado' },
      { Métrica: 'Total Realizado', 'Valor (R$)': metrics.totalRealizado },
      { Métrica: 'Total Previsto / Orçado', 'Valor (R$)': metrics.totalOrcado },
      { Métrica: 'Teto Planejado no Período', 'Valor (R$)': tetoTotalFiltered },
      { Métrica: 'Saldo do Teto', 'Valor (R$)': metrics.saldoTeto },
      { Métrica: 'Consumo do Teto (%)', 'Valor (%)': Number(metrics.pctTeto.toFixed(2)) },
      { Métrica: 'Acurácia de Previsão (%)', 'Valor (%)': Number(metrics.acuraciaPrevisao.toFixed(2)) },
      { Métrica: 'Economia / Saving (R$)', 'Valor (R$)': metrics.totalSavings },
      { Métrica: 'Concentração Top 3 Fornecedores (%)', 'Valor (%)': Number(paretoAnalysis.top3Share.toFixed(2)) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Resumo Executivo');

    const paretoExport = paretoAnalysis.rows.map((r) => ({
      Rank: r.rank,
      Fornecedor: r.fornecedor,
      Classe: r.classe,
      'Orçado (R$)': r.orcado,
      'Realizado (R$)': r.realizado,
      'Saldo (R$)': r.saldo,
      'Participação (%)': Number(r.pctItem.toFixed(2)),
      'Acumulado (%)': Number(r.pctAccum.toFixed(2)),
      'Qtd Lançamentos': r.count,
      'Ticket Médio (R$)': Number(r.ticketMedio.toFixed(2)),
      'Contrato Ativo': r.contractStatus || 'Não vinculado',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paretoExport), 'Curva ABC Fornecedores');

    const matrixExport = matrixAnalysis.empresasList.map((emp) => {
      const row: Record<string, string | number> = { Empresa: emp };
      for (const dep of matrixAnalysis.deptosList) {
        row[dep] = matrixAnalysis.cellValues[emp]?.[dep] || 0;
      }
      row['Total Empresa (R$)'] = matrixAnalysis.rowTotals[emp] || 0;
      row['% do Total'] =
        matrixAnalysis.grandTotal > 0
          ? Number(((matrixAnalysis.rowTotals[emp] / matrixAnalysis.grandTotal) * 100).toFixed(2))
          : 0;
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixExport), 'Matriz Empresa x Depto');

    const yoyExport = yoyComparison
      .filter((r) => r.isInPeriod)
      .map((r) => ({
        Mês: r.fullLabel,
        [`${previousCompareYear} (${metricBase === 'realizado' ? 'Realizado' : 'Orçado'})`]:
          r.prevValue,
        [`${currentCompareYear} (${metricBase === 'realizado' ? 'Realizado' : 'Orçado'})`]:
          r.currValue,
        'Previsão de Gastos (Média 3M)': r.previsaoGastos,
        'Variação (R$)': r.variacaoAbs,
        'Variação (%)':
          r.variacaoPct !== null ? Number(r.variacaoPct.toFixed(2)) : 'N/A',
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(yoyExport),
      `Comparativo ${previousCompareYear} vs ${currentCompareYear}`
    );

    const cumulativeExport = cumulativeTrendData
      .filter((r) => r.isInPeriod)
      .map((r) => ({
        Mês: r.fullLabel,
        'Orçamento no Mês (R$)': r.orcadoMes,
        'Realizado no Mês (R$)': r.realizadoMes,
        'Orçamento Acumulado (R$)': r.orcadoAcumulado,
        'Gasto Acumulado (R$)': r.realizadoAcumulado,
        'Desvio Acumulado (R$)': r.desvioAcumulado,
        'Desvio Acumulado (%)':
          r.desvioAcumuladoPct !== null ? Number(r.desvioAcumuladoPct.toFixed(2)) : 'N/A',
      }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(cumulativeExport),
      `Tendência Acumulada ${currentCompareYear}`
    );

    const entriesExport = tableData.map((e) => ({
      Competência: e.competencia,
      'Data Pagamento': e.dataPagamento ? formatDateBR(e.dataPagamento) : '',
      Categoria: e.categoria,
      Descrição: e.descricao,
      Fornecedor: e.fornecedor,
      Empresa: e.empresa,
      Departamento: e.departamento,
      Recorrente: e.recorrente ? 'Sim' : 'Não',
      'Orçado (R$)': e.orcado,
      'Realizado (R$)': e.realizado,
      'Saldo (R$)': e.saldo,
      Status: e.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entriesExport), 'Lançamentos');

    XLSX.writeFile(wb, `analytics_dho_buddha_spa_${yearScope}.xlsx`);
  };

  const handleCopySummary = () => {
    const yearLabel = yearScope === 'all' ? 'Todos os anos' : String(yearScope);
    const lines = [
      `RESUMO ANALÍTICO DHO — BUDDHA SPA (${yearLabel})`,
      `Período: ${MONTH_LABELS[startMonth - 1]} a ${MONTH_LABELS[endMonth - 1]}`,
      `Filtros: Empresa: ${empresaFilter} | Depto: ${deptoFilter} | Categoria: ${categoriaFilter}`,
      `----------------------------------------------------`,
      `• Lançamentos analisados: ${filteredEntries.length}`,
      `• Total Realizado: ${formatBRL(metrics.totalRealizado)}`,
      `• Total Orçado / Previsto: ${formatBRL(metrics.totalOrcado)}`,
      `• Teto Planejado: ${formatBRL(tetoTotalFiltered)}`,
      `• Consumo do Teto: ${formatPercent(metrics.pctTeto)}`,
      `• Acurácia das Estimativas: ${formatPercent(metrics.acuraciaPrevisao)}`,
      `• Rigidez Recorrente: ${formatPercent(metrics.pctRecorrente)}`,
      `• Saving Total Obtido: ${formatBRL(metrics.totalSavings)}`,
      `• Concentração Top 3 Fornecedores: ${formatPercent(paretoAnalysis.top3Share)}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 3000);
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. HEADER & AUTO-SYNC BANNER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold tracking-wider uppercase text-[11px] text-blue-700 dark:text-blue-400">
                Gente & Gestão · Inteligência Orçamentária
              </span>
              <span aria-hidden="true">·</span>
              <span>Alimentado automaticamente pelo menu Lançamentos</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <BarChart3 className="w-6 h-6 text-blue-700 dark:text-blue-400" />
              <span>Analytics & Inteligência Financeira</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Todos os indicadores, gráficos mensais, Curva ABC (80/20) e matrizes são calculados em tempo real a partir dos registros inseridos em <strong>Lançamentos</strong>, <strong>Contratos</strong> e <strong>Planejamento</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Base Toggle */}
            <div
              className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs"
              title="Escolha se os rankings e matrizes priorizam valores Realizados ou Orçados"
            >
              <button
                type="button"
                onClick={() => {
                  userChangedMetricRef.current = true;
                  setMetricBase('realizado');
                }}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  metricBase === 'realizado'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Base: Realizado
              </button>
              <button
                type="button"
                onClick={() => {
                  userChangedMetricRef.current = true;
                  setMetricBase('orcado');
                }}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  metricBase === 'orcado'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Base: Orçado
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {copiedNotice ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 dark:text-emerald-400">Copiado!</span>
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  <span>Copiar Resumo</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportAnalyticsExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 2. TOP CATEGORY FILTER SELECTOR */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Filter className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
              <span>Filtrar por Categoria</span>
              {categoriaFilter !== 'all' && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="text-blue-700 dark:text-blue-400 font-semibold">
                    {categoriaFilter}
                  </span>
                </>
              )}
            </div>

            {categoriaFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCategoriaFilter('all')}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X className="w-3 h-3" />
                <span>Limpar categoria</span>
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Seletor rápido de categoria"
            className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100/90 dark:bg-slate-800/80 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setCategoriaFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                categoriaFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Todas as Categorias ({entriesBeforeCategory.length})
            </button>

            {filterOptions.categorias.map((cat) => {
              const count = categoryCounts.get(cat) || 0;
              const isSelected = categoriaFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaFilter(isSelected ? 'all' : cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs font-semibold'
                      : count > 0
                      ? 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {cat}
                  {count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2B. SECONDARY FILTERS BAR */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Ano
            </label>
            <select
              value={yearScope}
              onChange={(e) => {
                userChangedYearRef.current = true;
                const val = e.target.value;
                if (val === 'all') {
                  setYearScope('all');
                } else {
                  const y = Number(val);
                  setYearScope(y);
                  onChangeYear(y);
                }
              }}
              className="w-full px-2.5 py-1.5 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="all">Todos os anos</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Mês Inicial
            </label>
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              {MONTH_LABELS.map((lbl, idx) => (
                <option key={lbl} value={idx + 1}>
                  {idx + 1} - {MONTH_FULL_LABELS[idx]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Mês Final
            </label>
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              {MONTH_LABELS.map((lbl, idx) => (
                <option key={lbl} value={idx + 1} disabled={idx + 1 < startMonth}>
                  {idx + 1} - {MONTH_FULL_LABELS[idx]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Empresa
            </label>
            <select
              value={empresaFilter}
              onChange={(e) => setEmpresaFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 truncate"
            >
              <option value="all">Todas as Empresas</option>
              {filterOptions.empresas.map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Departamento
            </label>
            <select
              value={deptoFilter}
              onChange={(e) => setDeptoFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 truncate"
            >
              <option value="all">Todos os Deptos</option>
              {filterOptions.departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Categoria
            </label>
            <select
              aria-label="Selecionar categoria"
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 truncate"
            >
              <option value="all">Todas as Categorias</option>
              {filterOptions.categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Recorrência
            </label>
            <select
              value={naturezaFilter}
              onChange={(e) =>
                setNaturezaFilter(e.target.value as 'all' | 'recorrente' | 'pontual')
              }
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              <option value="all">Todas</option>
              <option value="recorrente">Recorrentes (Fixas)</option>
              <option value="pontual">Pontuais (Variáveis)</option>
            </select>
          </div>
        </div>

        {/* Filter Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Fonte: <strong>{state.entries.length}</strong> registro(s) no menu Lançamentos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              No filtro atual: <strong>{filteredEntries.length}</strong> lançamento(s)
            </span>
            {categoriaFilter !== 'all' && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Categoria: <strong className="text-blue-700 dark:text-blue-400">{categoriaFilter}</strong>
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCanceled}
                onChange={(e) => setIncludeCanceled(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>Incluir cancelados</span>
            </label>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium hover:underline"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* EMPTY STATE WHEN NO ENTRIES IN LANÇAMENTOS */}
      {state.entries.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 rounded-lg shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Aguardando dados do menu Lançamentos
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Este painel não precisa de preenchimento manual. Assim que você cadastrar ou importar os lançamentos no menu <strong>Lançamentos</strong>, todos os gráficos e análises serão alimentados automaticamente.
              </p>
            </div>
          </div>
          {onNavigateToTab && (
            <button
              type="button"
              onClick={() => onNavigateToTab('entries')}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              <span>Ir para Lançamentos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* NOTICE IF ENTRIES EXIST IN OTHER YEARS / FILTERS */}
      {state.entries.length > 0 && filteredEntries.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Existem <strong>{state.entries.length}</strong> lançamento(s) no menu Lançamentos, mas nenhum corresponde aos filtros atuais (Ano/Mês/Empresa).
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              userChangedYearRef.current = true;
              setYearScope('all');
              resetFilters();
            }}
            className="px-3 py-1.5 font-semibold text-amber-950 bg-amber-200/80 hover:bg-amber-300 rounded-lg"
          >
            Mostrar Todos os Lançamentos
          </button>
        </div>
      )}

      {/* 2B. TOP KPI SUMMARY CARDS (Total Despesas, Variação vs Orçamento, % de Execução) */}
      <section
        aria-label="Resumo de KPIs Orçamentários"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <KpiCardWithTooltip
          align="left"
          tooltip={{
            title: 'Total Despesas',
            description:
              'Soma de todos os lançamentos válidos (exceto cancelados, salvo se marcado "Incluir cancelados") conforme a base selecionada (Realizado ou Orçado) e os filtros ativos.',
            formula:
              metricBase === 'realizado'
                ? 'Σ (Realizado dos lançamentos filtrados)'
                : 'Σ (Orçado dos lançamentos filtrados)',
            liveBreakdown: `Base ${
              metricBase === 'realizado' ? 'Realizado' : 'Orçado'
            }: ${formatBRL(metrics.totalDespesas)} em ${metrics.entriesCount} lançamento(s)`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Total Despesas
              </span>
              <Wallet className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatBRL(metrics.totalDespesas)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Base:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {metricBase === 'realizado' ? 'Realizado' : 'Orçado'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>Orçado: {formatBRL(metrics.totalOrcado, true)}</span>
              <span aria-hidden="true">·</span>
              <span>{metrics.entriesCount} lançamento(s)</span>
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Variação vs Orçamento',
            description:
              'Diferença entre o total efetivamente realizado e o total previsto/orçado nos lançamentos filtrados. Valores positivos indicam estouro; valores negativos indicam economia.',
            formula: 'Total Realizado − Total Orçado (e % = Variação ÷ Orçado × 100)',
            liveBreakdown: `${formatBRL(metrics.totalRealizado)} − ${formatBRL(
              metrics.totalOrcado
            )} = ${metrics.variacaoVsOrcamento > 0 ? '+' : ''}${formatBRL(
              metrics.variacaoVsOrcamento
            )}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Variação vs Orçamento
              </span>
              {metrics.variacaoVsOrcamento > 0 ? (
                <TrendingUp className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <div
              className={`font-mono text-2xl sm:text-3xl font-bold tabular-nums ${
                metrics.variacaoVsOrcamento > 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : metrics.variacaoVsOrcamento < 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {metrics.variacaoVsOrcamento > 0 ? '+' : ''}
              {formatBRL(metrics.variacaoVsOrcamento)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
              {metrics.variacaoPctVsOrcamento !== null && (
                <>
                  <span
                    className={`font-mono font-semibold ${
                      metrics.variacaoVsOrcamento > 0
                        ? 'text-rose-700 dark:text-rose-400'
                        : metrics.variacaoVsOrcamento < 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {metrics.variacaoPctVsOrcamento > 0 ? '+' : ''}
                    {formatPercent(metrics.variacaoPctVsOrcamento)}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>
                {metrics.variacaoVsOrcamento > 0
                  ? 'Acima do orçamento previsto'
                  : metrics.variacaoVsOrcamento < 0
                  ? 'Abaixo do orçado (economia)'
                  : 'Dentro do orçamento previsto'}
              </span>
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="right"
          tooltip={{
            title: '% de Execução',
            description:
              'Mede quanto do orçamento previsto já foi executado em gastos realizados. Quando não há orçado nos lançamentos, utiliza o Teto Planejado do período como base.',
            formula: '(Total Realizado ÷ Base Orçamentária) × 100',
            liveBreakdown: `(${formatBRL(metrics.totalRealizado, true)} ÷ ${formatBRL(
              metrics.execucaoBase,
              true
            )}) × 100 = ${formatPercent(metrics.pctExecucao)}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">
                % de Execução
              </span>
              <Percent className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatPercent(metrics.pctExecucao)}
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    metrics.pctExecucao > 100
                      ? 'bg-rose-600'
                      : metrics.pctExecucao >= 90
                      ? 'bg-amber-500'
                      : 'bg-blue-700'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, metrics.pctExecucao))}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono">
                  {formatBRL(metrics.totalRealizado, true)} / {formatBRL(metrics.execucaoBase, true)}
                </span>
                <span>
                  {metrics.paidCount} pago(s) · {metrics.pendingCount} previsto(s)
                </span>
              </div>
            </div>
          </div>
        </KpiCardWithTooltip>
      </section>

      {/* 3. EXECUTIVE KPI INTELLIGENCE CARDS (6 CARDS) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCardWithTooltip
          align="left"
          tooltip={{
            title: 'Total Realizado',
            description:
              'Soma direta da coluna Realizado de todos os lançamentos filtrados, comparada com o total Orçado (mostrando o saldo remanescente ou excedido abaixo).',
            formula: 'Total Realizado = Σ Realizado | Saldo = Total Orçado − Total Realizado',
            liveBreakdown: `Orçado ${formatBRL(metrics.totalOrcado, true)} − Realizado ${formatBRL(
              metrics.totalRealizado,
              true
            )} = ${metrics.saldoOrcamento >= 0 ? '+' : ''}${formatBRL(
              metrics.saldoOrcamento,
              true
            )}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">
                Total Realizado
              </span>
              <DollarSign className="w-4 h-4 text-slate-400" />
            </div>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatBRL(metrics.totalRealizado)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <span className="whitespace-nowrap">Orçado: {formatBRL(metrics.totalOrcado, true)}</span>
              <span
                className={`font-mono font-medium whitespace-nowrap ${
                  metrics.saldoOrcamento >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {metrics.saldoOrcamento >= 0 ? '+' : ''}
                {formatBRL(metrics.saldoOrcamento, true)}
              </span>
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Consumo do Teto',
            description:
              'Percentual consumido em relação aos tetos mensais cadastrados no menu Planejamento para o período e categoria filtrados. Se o teto for R$ 0,00, exibe 0,0%.',
            formula: '(Total Realizado ÷ Teto Planejado no Período) × 100',
            liveBreakdown:
              tetoTotalFiltered > 0
                ? `${formatBRL(metrics.totalRealizado, true)} ÷ ${formatBRL(
                    tetoTotalFiltered,
                    true
                  )} = ${formatPercent(metrics.pctTeto)}`
                : 'Nenhum teto planejado definido para o filtro atual (Teto = R$ 0,00)',
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">
                Consumo do Teto
              </span>
              <Scale className="w-4 h-4 text-slate-400" />
            </div>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatPercent(metrics.pctTeto)}
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    metrics.pctTeto > 100
                      ? 'bg-rose-600'
                      : metrics.pctTeto >= 90
                      ? 'bg-amber-500'
                      : 'bg-blue-700'
                  }`}
                  style={{ width: `${Math.min(100, metrics.pctTeto)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 text-right font-mono">
                Teto: {formatBRL(tetoTotalFiltered, true)}
              </div>
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Acurácia Previsão',
            description:
              'Mede o quão próximas as estimativas orçadas ficaram dos valores realmente gastos (quanto menor o desvio absoluto, maior a acurácia, limitada entre 0% e 100%).',
            formula: 'máx(0, 100 − (|Total Realizado − Total Orçado| ÷ Total Orçado) × 100)',
            liveBreakdown:
              metrics.totalOrcado > 0
                ? `Desvio de ${formatBRL(
                    Math.abs(metrics.variacaoVsOrcamento),
                    true
                  )} sobre ${formatBRL(metrics.totalOrcado, true)} → ${formatPercent(
                    metrics.acuraciaPrevisao
                  )}`
                : 'Sem valor orçado para comparar assertividade',
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">
                Acurácia Previsão
              </span>
              <ShieldCheck className="w-4 h-4 text-slate-400" />
            </div>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatPercent(metrics.acuraciaPrevisao)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Assertividade orçado vs realizado
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Rigidez (Recorrente)',
            description:
              'Indica a parcela fixa do orçamento comprometida com despesas marcadas como recorrentes (contratos contínuos e custos fixos) sobre o total da base ativa.',
            formula: '(Σ Lançamentos Recorrentes ÷ Total da Base) × 100',
            liveBreakdown: `${formatBRL(metrics.recorrenteValor, true)} ÷ ${formatBRL(
              metrics.totalBase,
              true
            )} = ${formatPercent(metrics.pctRecorrente)}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">
                Rigidez (Recorrente)
              </span>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatPercent(metrics.pctRecorrente)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatBRL(metrics.recorrenteValor, true)} (
              {metricBase === 'realizado' ? 'realizado' : 'orçado'})
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="center"
          tooltip={{
            title: 'Economia (Saving)',
            description:
              'Soma das economias individuais obtidas em cada lançamento onde o valor Realizado ficou abaixo do valor Orçado (não compensa estouros de outros itens).',
            formula: 'Σ (Orçado − Realizado) para todo lançamento com Orçado > Realizado',
            liveBreakdown: `Saving acumulado: ${formatBRL(
              metrics.totalSavings
            )} · Estouros isolados: ${formatBRL(metrics.totalOverruns, true)}`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">
                Economia (Saving)
              </span>
              <TrendingDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatBRL(metrics.totalSavings)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Economizado abaixo do orçado
            </div>
          </div>
        </KpiCardWithTooltip>

        <KpiCardWithTooltip
          align="right"
          tooltip={{
            title: 'Top 3 Fornecedores',
            description:
              'Percentual de concentração dos gastos nos 3 maiores fornecedores da Curva ABC dentro dos filtros selecionados.',
            formula: '(Σ dos 3 Maiores Fornecedores ÷ Total Geral dos Fornecedores) × 100',
            liveBreakdown: `Os 3 principais entre ${paretoAnalysis.totalFornecedores} fornecedor(es) representam ${formatPercent(
              paretoAnalysis.top3Share
            )} do total`,
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 h-full transition-colors group-hover:border-blue-300 dark:group-hover:border-blue-700">
            <div className="flex items-center justify-between pr-5 text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider">
                Top 3 Fornecedores
              </span>
              <PieChart className="w-4 h-4 text-amber-500" />
            </div>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatPercent(paretoAnalysis.top3Share)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {paretoAnalysis.totalFornecedores} fornecedor(es) no total
            </div>
          </div>
        </KpiCardWithTooltip>
      </section>

      {/* 4. SUB-TAB NAVIGATION BAR */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('visao-geral')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              subTab === 'visao-geral'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Visão Executiva & Sazonalidade</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('pareto')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              subTab === 'pareto'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>Curva ABC & Pareto (80/20)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('matriz')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              subTab === 'matriz'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Matriz Empresa × Depto</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('contratos')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              subTab === 'contratos'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Contratos & Indexadores</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('tabela')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              subTab === 'tabela'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Explorador de Dados ({tableData.length})</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center text-xs text-slate-500 dark:text-slate-400">
          <span>
            {filteredEntries.length} lançamento(s) · Base:{' '}
            <strong>{metricBase === 'realizado' ? 'Realizado' : 'Orçado'}</strong>
          </span>
        </div>
      </div>

      {/* 5. TAB 1: VISÃO GERAL & SAZONALIDADE */}
      {subTab === 'visao-geral' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Grouped Monthly Chart: Orçado + Realizado Bars + Teto Dashed Line */}
            <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Evolução Mensal: Orçado × Realizado × Teto ({yearScope === 'all' ? 'Todos os anos' : yearScope})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Barras comparativas por competência com dados vindos diretamente de Lançamentos
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-amber-400 rounded-xs inline-block" />
                    <span>Orçado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-blue-700 rounded-xs inline-block" />
                    <span>Realizado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" />
                    <span>Teto Planejado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 border-t-2 border-dashed border-cyan-600 inline-block" />
                    <span>Previsão de Gastos (Média 3M)</span>
                  </div>
                </div>
              </div>

              <div className="relative pt-2">
                <svg
                  viewBox="0 0 680 240"
                  className="w-full h-56 sm:h-64 select-none"
                  preserveAspectRatio="none"
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                    const y = 200 - pct * 170;
                    const val = monthlyChartMax * pct;
                    return (
                      <g key={idx}>
                        <line
                          x1="55"
                          y1={y}
                          x2="660"
                          y2={y}
                          stroke="#94A3B8"
                          strokeOpacity="0.2"
                          strokeDasharray="3 3"
                        />
                        <text
                          x="50"
                          y={y + 3}
                          fontSize="9"
                          fill="#94A3B8"
                          textAnchor="end"
                          fontFamily="monospace"
                        >
                          {formatBRL(val, true)}
                        </text>
                      </g>
                    );
                  })}

                  {monthlyBreakdown.map((m, idx) => {
                    const colWidth = 48;
                    const xCenter = 82 + idx * 48;
                    const barW = 13;

                    const orcadoH =
                      monthlyChartMax > 0 ? (Math.max(0, m.orcado) / monthlyChartMax) * 170 : 0;
                    const realH =
                      monthlyChartMax > 0 ? (Math.max(0, m.realizado) / monthlyChartMax) * 170 : 0;
                    const tetoY =
                      monthlyChartMax > 0 ? 200 - (m.teto / monthlyChartMax) * 170 : 200;

                    const isHovered = hoveredMonth === idx;
                    const isFiltered = m.isInPeriod;

                    return (
                      <g
                        key={m.monthIndex}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredMonth(idx)}
                        onMouseLeave={() => setHoveredMonth(null)}
                      >
                        {isHovered && (
                          <rect
                            x={xCenter - colWidth / 2}
                            y="20"
                            width={colWidth}
                            height="190"
                            fill="#3B82F6"
                            fillOpacity="0.08"
                            rx="4"
                          />
                        )}

                        {/* Orçado Bar (Left) */}
                        <rect
                          x={xCenter - barW - 1}
                          y={200 - orcadoH}
                          width={barW}
                          height={m.orcado > 0 ? Math.max(2, orcadoH) : 1}
                          fill={isFiltered ? '#F59E0B' : '#94A3B8'}
                          fillOpacity={isFiltered ? (isHovered ? 1 : 0.85) : 0.25}
                          rx="2"
                        />

                        {/* Realizado Bar (Right) */}
                        <rect
                          x={xCenter + 1}
                          y={200 - realH}
                          width={barW}
                          height={m.realizado > 0 ? Math.max(2, realH) : 1}
                          fill={isFiltered ? '#1D4ED8' : '#94A3B8'}
                          fillOpacity={isFiltered ? (isHovered ? 1 : 0.9) : 0.25}
                          rx="2"
                        />

                        {/* Teto Line Marker */}
                        {m.teto > 0 && (
                          <line
                            x1={xCenter - 17}
                            y1={tetoY}
                            x2={xCenter + 17}
                            y2={tetoY}
                            stroke="#059669"
                            strokeWidth="2"
                            strokeDasharray="3 2"
                            strokeLinecap="round"
                          />
                        )}

                        <text
                          x={xCenter}
                          y="222"
                          fontSize="10"
                          textAnchor="middle"
                          fill={isHovered ? '#1D4ED8' : isFiltered ? '#475569' : '#94A3B8'}
                          fontWeight={isHovered || isFiltered ? '600' : 'normal'}
                        >
                          {m.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Previsão de Gastos (Média 3M) Trend/Projection Line */}
                  {forecastBaseline.latest3MAvg > 0 && (
                    <g>
                      <polyline
                        fill="none"
                        stroke="#0891B2"
                        strokeWidth="2.2"
                        strokeDasharray="5 3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={monthlyBreakdown
                          .map((m, idx) => {
                            const xCenter = 82 + idx * 48;
                            const y =
                              monthlyChartMax > 0
                                ? 200 - (Math.max(0, m.previsaoGastos) / monthlyChartMax) * 170
                                : 200;
                            return `${xCenter},${y}`;
                          })
                          .join(' ')}
                      />
                      {monthlyBreakdown.map((m, idx) => {
                        const xCenter = 82 + idx * 48;
                        const y =
                          monthlyChartMax > 0
                            ? 200 - (Math.max(0, m.previsaoGastos) / monthlyChartMax) * 170
                            : 200;
                        return (
                          <circle
                            key={`prev-dot-${m.monthIndex}`}
                            cx={xCenter}
                            cy={y}
                            r={hoveredMonth === idx ? 4.5 : 3}
                            fill="#0891B2"
                            stroke="#FFFFFF"
                            strokeWidth="1.2"
                            opacity={m.isInPeriod ? 1 : 0.35}
                          />
                        );
                      })}
                    </g>
                  )}
                </svg>

                {hoveredMonth !== null && (
                  <div className="absolute top-2 right-4 p-3 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xs border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg text-xs space-y-1 z-10 min-w-[220px]">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-1">
                      {monthlyBreakdown[hoveredMonth].fullLabel} ·{' '}
                      {monthlyBreakdown[hoveredMonth].count} lanç.
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span>Orçado:</span>
                      <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        {formatBRL(monthlyBreakdown[hoveredMonth].orcado)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span>Realizado:</span>
                      <strong className="font-mono text-blue-700 dark:text-blue-400">
                        {formatBRL(monthlyBreakdown[hoveredMonth].realizado)}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span>Previsão (Média 3M):</span>
                      <span className="font-mono text-cyan-700 dark:text-cyan-400 font-semibold">
                        {formatBRL(monthlyBreakdown[hoveredMonth].previsaoGastos)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span>Teto Planejado:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {formatBRL(monthlyBreakdown[hoveredMonth].teto)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-700 text-[11px]">
                      <span>Saldo (Orç - Real):</span>
                      <span
                        className={`font-mono font-semibold ${
                          monthlyBreakdown[hoveredMonth].saldo >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {formatBRL(monthlyBreakdown[hoveredMonth].saldo)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Run-rate Panel */}
            <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Inteligência de Run-Rate
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Projeções calculadas sobre os meses com lançamentos
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">
                    Média Mensal ({metricBase === 'realizado' ? 'Realizado' : 'Orçado'})
                  </div>
                  <div className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                    {formatBRL(metrics.mediaMensal)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Base: {metrics.distinctMonths || 1} mês(es) com registro
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">
                    Previsão de Gastos (Média Últimos 3M)
                  </div>
                  <div className="font-mono text-lg font-bold text-cyan-700 dark:text-cyan-400">
                    {formatBRL(forecastBaseline.latest3MAvg)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {forecastBaseline.baselineLabels.length > 0
                      ? `Base: ${forecastBaseline.baselineLabels.join(', ')}`
                      : 'Aguardando histórico mensal'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">
                    Projeção Anualizada (12 meses)
                  </div>
                  <div className="font-mono text-lg font-bold text-blue-700 dark:text-blue-400">
                    {formatBRL(metrics.projecaoAnualizada)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Teto anual cadastrado:{' '}
                    {formatBRL(
                      plan
                        ? Object.values(plan.tetos).reduce(
                            (s, arr) => s + arr.reduce((a, b) => a + b, 0),
                            0
                          )
                        : 0,
                      true
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">
                      Natureza dos Lançamentos
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {formatPercent(metrics.pctRecorrente)} Fixo
                    </span>
                  </div>
                  <div className="h-2 w-full bg-amber-200 dark:bg-amber-950/40 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-blue-700"
                      style={{ width: `${Math.min(100, metrics.pctRecorrente)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Recorrente: {formatBRL(metrics.recorrenteValor, true)}</span>
                    <span>Pontual: {formatBRL(metrics.pontualValor, true)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Comparative YoY Bar Chart (Recharts) */}
          <YoYComparisonChart
            data={yoyComparison}
            currentYear={currentCompareYear}
            previousYear={previousCompareYear}
            metricBase={metricBase}
            forecast3MAvg={forecastBaseline.latest3MAvg}
            forecastBaselineLabels={forecastBaseline.baselineLabels}
          />

          {/* Cumulative YTD Trend Chart (Recharts) */}
          <CumulativeTrendChart data={cumulativeTrendData} year={currentCompareYear} />

          {/* Category Distribution Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Distribuição e Consumo por Categoria Orçamentária
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consolidado automático por categoria dos lançamentos inseridos
              </p>
            </div>

            <div className="space-y-3">
              {categoryBreakdown.map((c) => {
                const isSelected = categoriaFilter === c.categoria;
                return (
                <div
                  key={c.categoria}
                  className={`p-3 border rounded-lg space-y-2 text-xs transition-colors ${
                    isSelected
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCategoriaFilter(isSelected ? 'all' : c.categoria)}
                        className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-700 dark:hover:text-blue-400 text-left"
                        title={isSelected ? 'Remover filtro desta categoria' : 'Filtrar Analytics por esta categoria'}
                      >
                        {c.categoria}
                      </button>
                      <span className="text-slate-400">({c.count} lançamento(s))</span>
                      <button
                        type="button"
                        onClick={() => setCategoriaFilter(isSelected ? 'all' : c.categoria)}
                        className="text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {isSelected ? 'Limpar filtro' : 'Filtrar'}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 font-mono">
                      <div>
                        <span className="text-slate-400 text-[11px] mr-1">Orçado:</span>
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          {formatBRL(c.orcado)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] mr-1">Realizado:</span>
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatBRL(c.realizado)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] mr-1">Teto:</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {formatBRL(c.teto)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          c.pctConsumoTeto > 100
                            ? 'bg-rose-600'
                            : c.pctConsumoTeto >= 90
                            ? 'bg-amber-500'
                            : 'bg-blue-700'
                        }`}
                        style={{
                          width: `${Math.min(100, c.teto > 0 ? c.pctConsumoTeto : c.pctBaseTotal)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>
                        Participação ({metricBase === 'realizado' ? 'Realizado' : 'Orçado'}):{' '}
                        {formatPercent(c.pctBaseTotal)}
                      </span>
                      <span>
                        Saldo do Teto:{' '}
                        <span className={c.saldoTeto >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {formatBRL(c.saldoTeto)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                );
              })}

              {categoryBreakdown.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhum lançamento por categoria no período selecionado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB 2: CURVA ABC & PARETO (80/20) DE FORNECEDORES */}
      {subTab === 'pareto' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Fornecedores Classe A (80%)
              </div>
              <div className="font-mono text-2xl font-bold text-blue-700 dark:text-blue-400">
                {paretoAnalysis.classACount}
              </div>
              <p className="text-[11px] text-slate-500">
                Concentram 80% do volume ({metricBase})
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Fornecedores Classe B (15%)
              </div>
              <div className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
                {paretoAnalysis.classBCount}
              </div>
              <p className="text-[11px] text-slate-500">Média relevância orçamentária</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Fornecedores Classe C (5%)
              </div>
              <div className="font-mono text-2xl font-bold text-slate-600 dark:text-slate-400">
                {paretoAnalysis.classCCount}
              </div>
              <p className="text-[11px] text-slate-500">Cauda longa de pequenas despesas</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Concentração Top 3
              </div>
              <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatPercent(paretoAnalysis.top3Share)}
              </div>
              <p className="text-[11px] text-slate-500">Participação dos 3 maiores credores</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Classificação ABC de Fornecedores & Vínculo Contratual
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ranking automático gerado dos fornecedores registrados em Lançamentos
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Classes:</span>
                <span className="font-medium text-blue-700 dark:text-blue-400">A (≤80%)</span>
                <span>·</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">B (80-95%)</span>
                <span>·</span>
                <span className="font-medium text-slate-500">C (&gt;95%)</span>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-3 w-12 text-center">Rank</th>
                    <th className="py-2.5 px-3">Fornecedor</th>
                    <th className="py-2.5 px-3 text-center">Classe</th>
                    <th className="py-2.5 px-3 text-right">Orçado (R$)</th>
                    <th className="py-2.5 px-3 text-right">Realizado (R$)</th>
                    <th className="py-2.5 px-3 text-right">Part. %</th>
                    <th className="py-2.5 px-3 text-right">Acum. %</th>
                    <th className="py-2.5 px-3 text-right">Lanç.</th>
                    <th className="py-2.5 px-3 text-right">Ticket Médio</th>
                    <th className="py-2.5 px-3">Contrato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {paretoAnalysis.rows.map((row) => (
                    <tr
                      key={row.fornecedor}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400">#{row.rank}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                        {row.fornecedor}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-xs font-bold ${
                            row.classe === 'A'
                              ? 'text-blue-700 dark:text-blue-400'
                              : row.classe === 'B'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {row.classe}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-700 dark:text-amber-400 tabular-nums">
                        {formatBRL(row.orcado)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatBRL(row.realizado)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                        {formatPercent(row.pctItem)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {formatPercent(row.pctAccum)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums">
                        {row.count}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatBRL(row.ticketMedio)}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs">
                        {row.contractStatus ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (row.linkedContractId && onNavigateToTab) {
                                onNavigateToTab('contracts', { contractId: row.linkedContractId });
                              }
                            }}
                            className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            <span>{row.contractStatus}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-500 flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Sem contrato formal</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {paretoAnalysis.rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 font-sans">
                        Nenhum fornecedor registrado no período filtrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB 3: MATRIZ DE CUSTOS (EMPRESA x DEPARTAMENTO) */}
      {subTab === 'matriz' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Matriz Cruzada: Unidade / Empresa × Departamento ({metricBase === 'realizado' ? 'Realizado' : 'Orçado'})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Alocação de custos do DHO entre as empresas e departamentos a partir dos Lançamentos
                </p>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Total Geral: <strong>{formatBRL(matrixAnalysis.grandTotal)}</strong>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-3 px-4">Empresa / Unidade</th>
                    {matrixAnalysis.deptosList.map((dep) => (
                      <th key={dep} className="py-3 px-4 text-right">
                        {dep}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right bg-slate-100 dark:bg-slate-800">
                      Total Empresa
                    </th>
                    <th className="py-3 px-4 text-right bg-slate-100 dark:bg-slate-800">
                      Part. %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {matrixAnalysis.empresasList.map((emp) => {
                    const rowTotal = matrixAnalysis.rowTotals[emp] || 0;
                    const pctRow =
                      matrixAnalysis.grandTotal > 0
                        ? (rowTotal / matrixAnalysis.grandTotal) * 100
                        : 0;

                    return (
                      <tr
                        key={emp}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {emp}
                        </td>
                        {matrixAnalysis.deptosList.map((dep) => {
                          const val = matrixAnalysis.cellValues[emp]?.[dep] || 0;
                          const cellPct =
                            matrixAnalysis.grandTotal > 0
                              ? (val / matrixAnalysis.grandTotal) * 100
                              : 0;

                          return (
                            <td key={dep} className="py-3 px-4 text-right tabular-nums">
                              <div
                                className={
                                  val !== 0
                                    ? 'font-medium text-slate-900 dark:text-slate-100'
                                    : 'text-slate-300 dark:text-slate-600'
                                }
                              >
                                {val !== 0 ? formatBRL(val) : '—'}
                              </div>
                              {val !== 0 && (
                                <div className="text-[10px] text-slate-400">
                                  {formatPercent(cellPct)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-800/30 tabular-nums">
                          {formatBRL(rowTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-blue-700 dark:text-blue-400 bg-slate-50/50 dark:bg-slate-800/30 tabular-nums">
                          {formatPercent(pctRow)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/90 font-semibold text-xs">
                    <td className="py-3 px-4 text-slate-900 dark:text-slate-100 font-sans">
                      Total por Departamento
                    </td>
                    {matrixAnalysis.deptosList.map((dep) => {
                      const colTot = matrixAnalysis.colTotals[dep] || 0;
                      const colPct =
                        matrixAnalysis.grandTotal > 0
                          ? (colTot / matrixAnalysis.grandTotal) * 100
                          : 0;

                      return (
                        <td
                          key={dep}
                          className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums"
                        >
                          <div>{formatBRL(colTot)}</div>
                          <div className="text-[10px] text-slate-500 font-normal">
                            {formatPercent(colPct)}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-mono text-blue-700 dark:text-blue-400 text-sm font-bold tabular-nums">
                      {formatBRL(matrixAnalysis.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      100,0%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB 4: CONTRATOS & RISCOS FINANCEIROS */}
      {subTab === 'contratos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Contratos Vigentes Ativos
              </div>
              <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                {contractsAnalytics.activeCount}
              </div>
              <p className="text-[11px] text-slate-500">
                Total cadastrado: {contractsAnalytics.totalContracts}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Comprometimento Mensal
              </div>
              <div className="font-mono text-2xl font-bold text-blue-700 dark:text-blue-400">
                {formatBRL(contractsAnalytics.totalCommittedMonthly)}
              </div>
              <p className="text-[11px] text-slate-500">Valor mensal contratado sob gestão</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Cobertura de Gastos Recorrentes
              </div>
              <div className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatPercent(contractsAnalytics.contractualCoveragePct)}
              </div>
              <p className="text-[11px] text-slate-500">
                Lançamentos recorrentes vinculados a contrato
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Exposição por Índice de Reajuste
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sensibilidade da carteira a índices (IPCA, IGP-M, INPC)
                </p>
              </div>

              <div className="space-y-3">
                {Object.entries(contractsAnalytics.indexExposure).map(([idx, data]) => {
                  const share =
                    contractsAnalytics.totalCommittedMonthly > 0
                      ? (data.valorMensal / contractsAnalytics.totalCommittedMonthly) * 100
                      : 0;

                  return (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1 text-xs"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {idx}
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {formatBRL(data.valorMensal)}/mês ({data.count} contrato(s))
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-700 rounded-full"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-right font-mono text-slate-400">
                        {formatPercent(share)} da verba contratada
                      </div>
                    </div>
                  );
                })}

                {Object.keys(contractsAnalytics.indexExposure).length === 0 && (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    Nenhum contrato ativo cadastrado.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Cronograma de Vencimentos em {contractsAnalytics.targetExpYear}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Janelas para renegociação de preços, SLA ou rescisão
                </p>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {MONTH_LABELS.map((lbl, idx) => {
                  const m = idx + 1;
                  const data = contractsAnalytics.expiryByMonth[m];
                  const hasExp = data && data.count > 0;

                  return (
                    <div
                      key={lbl}
                      className={`p-3 rounded-lg border text-xs text-center space-y-1 transition-colors ${
                        hasExp
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {lbl}
                      </div>
                      <div
                        className={`font-mono text-base font-bold ${
                          hasExp
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      >
                        {data?.count || 0}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {hasExp ? formatBRL(data.totalMonthly, true) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateToTab?.('contracts')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  <span>Ver todos os contratos e alertas na aba Contratos</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. TAB 5: TABELA ANALÍTICA DE LANÇAMENTOS */}
      {subTab === 'tabela' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Explorador Detalhado de Lançamentos ({tableData.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Espelho em tempo real dos itens cadastrados no menu Lançamentos
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por fornecedor, descrição..."
                value={searchTable}
                onChange={(e) => setSearchTable(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400"
              />
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 text-[11px] z-10">
                <tr>
                  <th
                    className="py-2 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => {
                      if (sortField === 'competencia')
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('competencia');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    Comp. {sortField === 'competencia' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="py-2 px-3">Categoria</th>
                  <th className="py-2 px-3">Descrição & Fornecedor</th>
                  <th className="py-2 px-3">Empresa / Depto</th>
                  <th className="py-2 px-3 text-center">Tipo</th>
                  <th
                    className="py-2 px-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => {
                      if (sortField === 'orcado')
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('orcado');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    Orçado {sortField === 'orcado' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="py-2 px-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => {
                      if (sortField === 'realizado')
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('realizado');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    Realizado {sortField === 'realizado' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="py-2 px-3 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60"
                    onClick={() => {
                      if (sortField === 'saldo') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortField('saldo');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    Saldo {sortField === 'saldo' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tableData.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono whitespace-nowrap text-slate-800 dark:text-slate-200">
                      {formatCompetenciaBR(e.competencia)}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{e.categoria}</td>
                    <td className="py-2 px-3 max-w-[240px]">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {e.descricao}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {e.fornecedor || '—'}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                      <div>{e.empresa}</div>
                      <div>{e.departamento}</div>
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap text-[11px]">
                      {e.recorrente ? (
                        <span className="text-blue-700 dark:text-blue-400 font-medium">
                          Recorrente
                        </span>
                      ) : (
                        <span className="text-slate-500">Pontual</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {formatBRL(e.orcado)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatBRL(e.realizado)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${
                        e.saldo >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatBRL(e.saldo)}
                    </td>
                  </tr>
                ))}

                {tableData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Nenhum lançamento corresponde aos filtros e busca aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
