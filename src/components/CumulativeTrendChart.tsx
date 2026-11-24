import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL, formatPercent } from '../utils/format';

export interface CumulativeMonthRow {
  monthIndex: number;
  monthNumber: number;
  label: string;
  fullLabel: string;
  orcadoMes: number;
  realizadoMes: number;
  tetoMes: number;
  orcadoAcumulado: number;
  realizadoAcumulado: number;
  tetoAcumulado: number;
  desvioAcumulado: number;
  desvioAcumuladoPct: number | null;
  entriesCount: number;
  isInPeriod: boolean;
}

interface CumulativeTrendChartProps {
  data: CumulativeMonthRow[];
  year: number;
}

type TrendMode = 'acumulado' | 'desvio';

interface TooltipPayloadItem {
  payload?: CumulativeMonthRow;
}

function CumulativeTooltip({
  active,
  payload,
  year,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  year: number;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const row = payload[0].payload;
  const isOverrun = row.desvioAcumulado > 0;
  const isSaving = row.desvioAcumulado < 0;

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3.5 text-xs space-y-2 min-w-[250px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {row.fullLabel} {year}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Acumulado até o mês
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-500 inline-block" />
            <span>Orçamento Acumulado</span>
          </div>
          <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
            {formatBRL(row.orcadoAcumulado)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-3 h-0.5 bg-blue-700 inline-block" />
            <span>Gasto Acumulado</span>
          </div>
          <span className="font-mono font-bold text-blue-700 dark:text-blue-400 tabular-nums">
            {formatBRL(row.realizadoAcumulado)}
          </span>
        </div>

        {row.tetoAcumulado > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="w-3 h-0.5 border-t-2 border-dotted border-emerald-600 inline-block" />
              <span>Teto Acumulado</span>
            </div>
            <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatBRL(row.tetoAcumulado)}
            </span>
          </div>
        )}
      </div>

      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Desvio Anual (Real − Orç):</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              isOverrun
                ? 'text-rose-600 dark:text-rose-400'
                : isSaving
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {row.desvioAcumulado > 0 ? '+' : ''}
            {formatBRL(row.desvioAcumulado)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-slate-400">Desvio Percentual:</span>
          <span
            className={`font-mono font-medium tabular-nums ${
              isOverrun
                ? 'text-rose-600 dark:text-rose-400'
                : isSaving
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            {row.desvioAcumuladoPct === null
              ? '—'
              : `${row.desvioAcumuladoPct > 0 ? '+' : ''}${formatPercent(row.desvioAcumuladoPct)}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400 pt-0.5">
          <span>Movimento no mês ({row.entriesCount} lanç.):</span>
          <span className="font-mono tabular-nums">
            Orç {formatBRL(row.orcadoMes, true)} · Real {formatBRL(row.realizadoMes, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CumulativeTrendChart({ data, year }: CumulativeTrendChartProps) {
  const [trendMode, setTrendMode] = useState<TrendMode>('acumulado');

  const visibleData = useMemo(() => data.filter((d) => d.isInPeriod), [data]);
  const hasTeto = useMemo(() => visibleData.some((d) => d.tetoAcumulado > 0), [visibleData]);

  const summary = useMemo(() => {
    const lastRow = visibleData[visibleData.length - 1];
    const orcadoFinal = lastRow?.orcadoAcumulado || 0;
    const realizadoFinal = lastRow?.realizadoAcumulado || 0;
    const desvioFinal = realizadoFinal - orcadoFinal;
    const desvioPct = orcadoFinal > 0 ? (desvioFinal / orcadoFinal) * 100 : null;
    const execucaoFinalPct = orcadoFinal > 0 ? (realizadoFinal / orcadoFinal) * 100 : 0;
    const totalEntries = visibleData.reduce((s, r) => s + r.entriesCount, 0);

    return {
      orcadoFinal,
      realizadoFinal,
      desvioFinal,
      desvioPct,
      execucaoFinalPct,
      totalEntries,
    };
  }, [visibleData]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
            <span>Tendência Acumulada Anual (YTD)</span>
            <span aria-hidden="true">·</span>
            <span>Exercício {year}</span>
            <span aria-hidden="true">·</span>
            <span>{summary.totalEntries} lançamento(s)</span>
          </div>
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Tendência Acumulada: Gastos vs Orçamento ({year})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evolução acumulada mês a mês ao longo do ano corrente para acompanhar o desvio orçamentário anual
          </p>
        </div>

        {/* Mode Segmented Toggle */}
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setTrendMode('acumulado')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              trendMode === 'acumulado'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Gastos vs Orçamento
          </button>
          <button
            type="button"
            onClick={() => setTrendMode('desvio')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              trendMode === 'desvio'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Curva de Desvio (R$)
          </button>
        </div>
      </div>

      {/* Recharts LineChart */}
      <div className="w-full h-72 sm:h-80 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {trendMode === 'acumulado' ? (
            <LineChart data={visibleData} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#94A3B8"
                strokeOpacity={0.2}
                vertical={false}
              />
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
                cursor={{ stroke: '#94A3B8', strokeOpacity: 0.4, strokeDasharray: '3 3' }}
                content={<CumulativeTooltip year={year} />}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} iconSize={12} />
              <Line
                type="monotone"
                dataKey="orcadoAcumulado"
                name="Orçamento Acumulado"
                stroke="#F59E0B"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 3.5, fill: '#F59E0B', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="realizadoAcumulado"
                name="Gasto Realizado Acumulado"
                stroke="#1D4ED8"
                strokeWidth={3}
                dot={{ r: 4, fill: '#1D4ED8', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                activeDot={{ r: 6 }}
              />
              {hasTeto && (
                <Line
                  type="monotone"
                  dataKey="tetoAcumulado"
                  name="Teto Planejado Acumulado"
                  stroke="#059669"
                  strokeWidth={2}
                  strokeDasharray="2 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          ) : (
            <LineChart data={visibleData} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#94A3B8"
                strokeOpacity={0.2}
                vertical={false}
              />
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
              <ReferenceLine y={0} stroke="#64748B" strokeWidth={1.5} strokeDasharray="4 2" />
              <Tooltip
                cursor={{ stroke: '#94A3B8', strokeOpacity: 0.4, strokeDasharray: '3 3' }}
                content={<CumulativeTooltip year={year} />}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} iconSize={12} />
              <Line
                type="monotone"
                dataKey="desvioAcumulado"
                name="Desvio Acumulado (Realizado − Orçado)"
                stroke={summary.desvioFinal > 0 ? '#E11D48' : '#059669'}
                strokeWidth={3}
                dot={{
                  r: 4,
                  fill: summary.desvioFinal > 0 ? '#E11D48' : '#059669',
                  stroke: '#FFFFFF',
                  strokeWidth: 1.5,
                }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* YTD Cumulative Summary Strip */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Orçamento Acumulado ({year})
          </div>
          <div className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
            {formatBRL(summary.orcadoFinal)}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Gasto Realizado Acumulado ({year})
          </div>
          <div className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400 tabular-nums">
            {formatBRL(summary.realizadoFinal)}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Desvio Anual Acumulado
          </div>
          <div
            className={`font-mono text-sm font-bold flex items-center gap-1 tabular-nums ${
              summary.desvioFinal > 0
                ? 'text-rose-600 dark:text-rose-400'
                : summary.desvioFinal < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {summary.desvioFinal > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
            ) : summary.desvioFinal < 0 ? (
              <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Minus className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {summary.desvioFinal > 0 ? '+' : ''}
              {formatBRL(summary.desvioFinal)}
            </span>
            {summary.desvioPct !== null && (
              <span className="text-[11px] font-medium opacity-85">
                ({summary.desvioPct > 0 ? '+' : ''}
                {formatPercent(summary.desvioPct)})
              </span>
            )}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Taxa de Execução Acumulada
          </div>
          <div className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
            {formatPercent(summary.execucaoFinalPct)}
          </div>
        </div>
      </div>
    </div>
  );
}
