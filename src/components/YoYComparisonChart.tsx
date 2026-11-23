import { ArrowDownRight, ArrowUpRight, BarChart2, CalendarRange, Minus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL, formatPercent } from '../utils/format';

export interface YoYMonthRow {
  monthIndex: number;
  monthNumber: number;
  label: string;
  fullLabel: string;
  prevOrcado: number;
  prevRealizado: number;
  currOrcado: number;
  currRealizado: number;
  prevValue: number;
  currValue: number;
  previsaoGastos: number;
  variacaoAbs: number;
  variacaoPct: number | null;
  prevCount: number;
  currCount: number;
  isInPeriod: boolean;
}

interface YoYComparisonChartProps {
  data: YoYMonthRow[];
  currentYear: number;
  previousYear: number;
  metricBase: 'realizado' | 'orcado';
  forecast3MAvg?: number;
  forecastBaselineLabels?: string[];
}

type ChartMode = 'comparativo' | 'variacao';

interface TooltipPayloadItem {
  payload?: YoYMonthRow;
}

function YoYCustomTooltip({
  active,
  payload,
  currentYear,
  previousYear,
  metricBase,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  currentYear: number;
  previousYear: number;
  metricBase: 'realizado' | 'orcado';
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const row = payload[0].payload;
  const isIncrease = row.variacaoAbs > 0;
  const isDecrease = row.variacaoAbs < 0;
  const baseLabel = metricBase === 'realizado' ? 'Realizado' : 'Orçado';

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3.5 text-xs space-y-2 min-w-[240px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-900 dark:text-slate-100">{row.fullLabel}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">Base: {baseLabel}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 inline-block" />
            <span>
              Ano Anterior ({previousYear}) · {row.prevCount} lanç.
            </span>
          </div>
          <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {formatBRL(row.prevValue)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2.5 h-2.5 rounded-xs bg-blue-700 inline-block" />
            <span>
              Ano Atual ({currentYear}) · {row.currCount} lanç.
            </span>
          </div>
          <span className="font-mono font-bold text-blue-700 dark:text-blue-400 tabular-nums">
            {formatBRL(row.currValue)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-cyan-600 inline-block" />
            <span>Previsão de Gastos (3M)</span>
          </div>
          <span className="font-mono font-semibold text-cyan-700 dark:text-cyan-400 tabular-nums">
            {formatBRL(row.previsaoGastos)}
          </span>
        </div>
      </div>

      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Variação (YoY):</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              isIncrease
                ? 'text-rose-600 dark:text-rose-400'
                : isDecrease
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {row.variacaoAbs > 0 ? '+' : ''}
            {formatBRL(row.variacaoAbs)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-slate-400">Variação Percentual:</span>
          <span
            className={`font-mono font-medium tabular-nums ${
              isIncrease
                ? 'text-rose-600 dark:text-rose-400'
                : isDecrease
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            {row.variacaoPct === null
              ? row.currValue > 0
                ? 'Novo gasto (base 0)'
                : '—'
              : `${row.variacaoPct > 0 ? '+' : ''}${formatPercent(row.variacaoPct)}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400 pt-0.5">
          <span>
            {currentYear} (Orç / Real):
          </span>
          <span className="font-mono tabular-nums">
            {formatBRL(row.currOrcado, true)} / {formatBRL(row.currRealizado, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function YoYComparisonChart({
  data,
  currentYear,
  previousYear,
  metricBase,
  forecast3MAvg = 0,
  forecastBaselineLabels = [],
}: YoYComparisonChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('comparativo');

  const visibleData = useMemo(() => data.filter((d) => d.isInPeriod), [data]);
  const hasForecast = visibleData.some((d) => d.previsaoGastos > 0);

  const summary = useMemo(() => {
    let totalPrev = 0;
    let totalCurr = 0;
    let prevEntriesCount = 0;
    let currEntriesCount = 0;
    let maxIncreaseRow: YoYMonthRow | null = null;
    let maxDecreaseRow: YoYMonthRow | null = null;

    for (const row of visibleData) {
      totalPrev += row.prevValue;
      totalCurr += row.currValue;
      prevEntriesCount += row.prevCount;
      currEntriesCount += row.currCount;

      if (row.variacaoAbs > 0 && (!maxIncreaseRow || row.variacaoAbs > maxIncreaseRow.variacaoAbs)) {
        maxIncreaseRow = row;
      }
      if (row.variacaoAbs < 0 && (!maxDecreaseRow || row.variacaoAbs < maxDecreaseRow.variacaoAbs)) {
        maxDecreaseRow = row;
      }
    }

    const totalDelta = totalCurr - totalPrev;
    const totalDeltaPct = totalPrev > 0 ? (totalDelta / totalPrev) * 100 : null;

    return {
      totalPrev,
      totalCurr,
      totalDelta,
      totalDeltaPct,
      prevEntriesCount,
      currEntriesCount,
      maxIncreaseRow,
      maxDecreaseRow,
    };
  }, [visibleData]);

  const baseLabel = metricBase === 'realizado' ? 'Realizado' : 'Orçado';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CalendarRange className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
            <span>Comparativo Interanual (YoY)</span>
            <span aria-hidden="true">·</span>
            <span>Base: {baseLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {previousYear} ({summary.prevEntriesCount} lanç.) vs {currentYear} (
              {summary.currEntriesCount} lanç.)
            </span>
          </div>
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Variação Orçamentária Mês a Mês: {currentYear} vs {previousYear}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Comparação mensal automática entre o ano selecionado e o ano anterior a partir dos registros de Lançamentos
          </p>
        </div>

        {/* Chart Mode Segmented Switch */}
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setChartMode('comparativo')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              chartMode === 'comparativo'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>
              {previousYear} vs {currentYear}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setChartMode('variacao')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              chartMode === 'variacao'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Variação Líquida (R$)
          </button>
        </div>
      </div>

      {/* Recharts ComposedChart / BarChart */}
      <div className="w-full h-72 sm:h-80 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'comparativo' ? (
            <ComposedChart
              data={visibleData}
              margin={{ top: 12, right: 16, left: 8, bottom: 4 }}
              barGap={4}
              barCategoryGap="22%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#CBD5E1', strokeOpacity: 0.4 }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => formatBRL(value, true)}
                tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={76}
              />
              <Tooltip
                cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
                content={
                  <YoYCustomTooltip
                    currentYear={currentYear}
                    previousYear={previousYear}
                    metricBase={metricBase}
                  />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                iconSize={10}
              />
              <Bar
                dataKey="prevValue"
                name={`Ano Anterior (${previousYear})`}
                fill="#94A3B8"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              />
              <Bar
                dataKey="currValue"
                name={`Ano Atual (${currentYear})`}
                fill="#1D4ED8"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              />
              {hasForecast && (
                <Line
                  type="monotone"
                  dataKey="previsaoGastos"
                  name="Previsão de Gastos (Média 3M)"
                  stroke="#0891B2"
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                  dot={{ r: 3.5, fill: '#0891B2', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              )}
            </ComposedChart>
          ) : (
            <BarChart
              data={visibleData}
              margin={{ top: 12, right: 16, left: 8, bottom: 4 }}
              barCategoryGap="26%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#CBD5E1', strokeOpacity: 0.4 }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => formatBRL(value, true)}
                tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={76}
              />
              <ReferenceLine y={0} stroke="#64748B" strokeWidth={1.5} />
              <Tooltip
                cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
                content={
                  <YoYCustomTooltip
                    currentYear={currentYear}
                    previousYear={previousYear}
                    metricBase={metricBase}
                  />
                }
              />
              <Bar
                dataKey="variacaoAbs"
                name={`Variação (${currentYear} − ${previousYear})`}
                radius={[4, 4, 4, 4]}
                maxBarSize={32}
              >
                {visibleData.map((entry) => (
                  <Cell
                    key={`cell-${entry.monthNumber}`}
                    fill={
                      entry.variacaoAbs > 0
                        ? '#E11D48'
                        : entry.variacaoAbs < 0
                        ? '#059669'
                        : '#CBD5E1'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* YoY Consolidated Summary Strip */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Acumulado {previousYear} ({baseLabel})
          </div>
          <div className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
            {formatBRL(summary.totalPrev)}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Acumulado {currentYear} ({baseLabel})
          </div>
          <div className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400 tabular-nums">
            {formatBRL(summary.totalCurr)}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Previsão Mensal (Média 3M)
          </div>
          <div className="font-mono text-sm font-bold text-cyan-700 dark:text-cyan-400 tabular-nums">
            {formatBRL(forecast3MAvg)}
          </div>
          {forecastBaselineLabels.length > 0 && (
            <div className="text-[10px] text-slate-400 truncate">
              Base: {forecastBaselineLabels.join(', ')}
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Variação Anual (R$ / %)
          </div>
          <div
            className={`font-mono text-sm font-bold flex items-center gap-1 tabular-nums ${
              summary.totalDelta > 0
                ? 'text-rose-600 dark:text-rose-400'
                : summary.totalDelta < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {summary.totalDelta > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            ) : summary.totalDelta < 0 ? (
              <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Minus className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {summary.totalDelta > 0 ? '+' : ''}
              {formatBRL(summary.totalDelta)}
            </span>
            {summary.totalDeltaPct !== null && (
              <span className="text-[11px] font-medium opacity-85">
                ({summary.totalDeltaPct > 0 ? '+' : ''}
                {formatPercent(summary.totalDeltaPct)})
              </span>
            )}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Maior Variação Mensal
          </div>
          <div className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
            {summary.maxIncreaseRow ? (
              <span className="text-rose-600 dark:text-rose-400">
                {summary.maxIncreaseRow.label}: +{formatBRL(summary.maxIncreaseRow.variacaoAbs, true)}
              </span>
            ) : summary.maxDecreaseRow ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {summary.maxDecreaseRow.label}: {formatBRL(summary.maxDecreaseRow.variacaoAbs, true)}
              </span>
            ) : (
              <span className="text-slate-400">Sem variação registrada</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
