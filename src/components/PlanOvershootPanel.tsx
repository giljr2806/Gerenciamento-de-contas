import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DatabaseState, tetoCategoryOf } from '../types/buddha';
import { formatBRL, formatPercent, MONTH_FULL_LABELS, MONTH_LABELS } from '../utils/format';

interface PlanOvershootPanelProps {
  state: DatabaseState;
  year: number;
  /** Tetos mensais por categoria (rascunho atual da grade). */
  tetos: Record<string, number[]>;
}

type Mode = 'mes' | 'acumulado';

const sumRange = (arr: number[] | undefined, from: number, to: number) => {
  if (!arr) return 0;
  let s = 0;
  for (let i = from; i <= to; i++) s += arr[i] || 0;
  return s;
};

const CHART_X = (i: number) => 68 + i * 50;
const chartY = (v: number, max: number) => 200 - (max > 0 ? (v / max) * 175 : 0);
const axisLabel = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

export function PlanOvershootPanel({ state, year, tetos }: PlanOvershootPanelProps) {
  const [monthSel, setMonthSel] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('mes');

  const data = useMemo(() => {
    const catReal = new Map<string, number[]>();
    const supReal = new Map<string, { vals: number[]; count: number[] }>();
    const totalReal: number[] = Array(12).fill(0);

    for (const e of state.entries) {
      if (!e.competencia.startsWith(`${year}-`) || e.status === 'Cancelado') continue;
      const m = parseInt(e.competencia.slice(5, 7), 10) - 1;
      if (m < 0 || m > 11) continue;

      const cat = tetoCategoryOf(e) || '(Sem categoria)';
      if (!catReal.has(cat)) catReal.set(cat, Array(12).fill(0));
      catReal.get(cat)![m] += e.realizado;

      const sup = e.fornecedor || '(Sem fornecedor)';
      if (!supReal.has(sup)) supReal.set(sup, { vals: Array(12).fill(0), count: Array(12).fill(0) });
      const s = supReal.get(sup)!;
      s.vals[m] += e.realizado;
      s.count[m] += 1;

      totalReal[m] += e.realizado;
    }

    const totalTeto: number[] = Array(12).fill(0);
    for (const arr of Object.values(tetos)) {
      for (let m = 0; m < 12; m++) totalTeto[m] += arr[m] || 0;
    }

    let lastMonth = -1;
    for (let m = 0; m < 12; m++) if (totalReal[m] !== 0) lastMonth = m;
    if (lastMonth < 0) lastMonth = new Date().getFullYear() === year ? new Date().getMonth() : 0;

    return { catReal, supReal, totalReal, totalTeto, lastMonth };
  }, [state.entries, year, tetos]);

  const month = monthSel ?? data.lastMonth;
  const from = mode === 'mes' ? month : 0;
  const to = month;
  const periodLabel =
    mode === 'mes' ? MONTH_FULL_LABELS[month] : `Janeiro a ${MONTH_FULL_LABELS[month]} (acumulado)`;

  const categoryRows = useMemo(() => {
    const names = new Set<string>([...Object.keys(tetos), ...data.catReal.keys()]);
    const all = Array.from(names)
      .map((cat) => {
        const teto = sumRange(tetos[cat], from, to);
        const real = sumRange(data.catReal.get(cat), from, to);
        const diff = teto - real;
        const pct = teto > 0 ? (real / teto) * 100 : real > 0 ? 999 : 0;
        const over = real > 0 && real > teto;
        // Saldo em %: (Teto − Realizado) ÷ Teto. Negativo = estouro. Sem teto não há base.
        const saldoPct = teto > 0 ? (diff / teto) * 100 : null;
        return { cat, teto, real, diff, pct, saldoPct, over, semTeto: teto === 0 && real > 0 };
      })
      .filter((r) => r.teto > 0 || r.real !== 0)
      .sort((a, b) => b.real - a.real);
    return { top: all.slice(0, 10), overCount: all.filter((r) => r.over).length, total: all.length };
  }, [tetos, data.catReal, from, to]);

  const supplierRows = useMemo(() => {
    const totalPeriod = sumRange(data.totalReal, from, to);
    const rows = Array.from(data.supReal.entries())
      .map(([nome, s]) => ({
        nome,
        real: sumRange(s.vals, from, to),
        count: sumRange(s.count, from, to),
      }))
      .filter((r) => r.real !== 0)
      .sort((a, b) => b.real - a.real)
      .slice(0, 10)
      .map((r) => ({ ...r, pct: totalPeriod > 0 ? (r.real / totalPeriod) * 100 : 0 }));
    return { rows, totalPeriod };
  }, [data.supReal, data.totalReal, from, to]);

  // Séries dos gráficos
  const series = useMemo(() => {
    const cumTeto: number[] = [];
    const cumReal: number[] = [];
    let at = 0;
    let ar = 0;
    for (let m = 0; m < 12; m++) {
      at += data.totalTeto[m];
      ar += data.totalReal[m];
      cumTeto.push(at);
      cumReal.push(ar);
    }
    let firstOver = -1;
    for (let m = 0; m < 12; m++) {
      if (cumTeto[m] > 0 && cumReal[m] > cumTeto[m]) {
        firstOver = m;
        break;
      }
    }
    const maxCum = Math.max(1, ...cumTeto, ...cumReal) * 1.05;
    const maxMonthly = Math.max(1, ...data.totalTeto, ...data.totalReal) * 1.05;
    return { cumTeto, cumReal, firstOver, maxCum, maxMonthly };
  }, [data.totalTeto, data.totalReal]);

  const monthTeto = data.totalTeto[month];
  const monthReal = data.totalReal[month];
  const prevReal = month > 0 ? data.totalReal[month - 1] : null;
  const momDiff = prevReal !== null ? monthReal - prevReal : null;
  const momPct = prevReal && prevReal !== 0 ? ((monthReal - prevReal) / Math.abs(prevReal)) * 100 : null;

  const poly = (vals: number[], max: number) =>
    vals.map((v, i) => `${CHART_X(i)},${chartY(v, max)}`).join(' ');

  const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl';

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className={`${card} p-4 flex flex-wrap items-end gap-4`}>
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Estouro de Teto · {year}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Rankings e gráficos usam o teto da grade acima (inclusive alterações ainda não salvas).
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3 text-xs">
          <div>
            <label htmlFor="ov-month" className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Mês
            </label>
            <select
              id="ov-month"
              value={month}
              onChange={(e) => setMonthSel(Number(e.target.value))}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              {MONTH_FULL_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div role="group" aria-label="Período do ranking" className="inline-flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
            {(
              [
                { k: 'mes', label: 'Só o mês' },
                { k: 'acumulado', label: 'Acumulado' },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setMode(o.k)}
                aria-pressed={mode === o.k}
                className={`px-3 py-1.5 font-medium ${
                  mode === o.k
                    ? 'bg-blue-700 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo do mês */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `Teto de ${MONTH_LABELS[month]}`, value: formatBRL(monthTeto), tone: '' },
          {
            label: `Realizado em ${MONTH_LABELS[month]}`,
            value: formatBRL(monthReal),
            tone: monthTeto > 0 && monthReal > monthTeto ? 'text-red-600 dark:text-red-400' : '',
          },
          {
            label: monthTeto - monthReal < 0 ? 'Estouro do mês' : 'Folga do mês',
            value:
              formatBRL(Math.abs(monthTeto - monthReal)) +
              (monthTeto > 0
                ? ` (${formatPercent(((monthTeto - monthReal) / monthTeto) * 100, 1, true)})`
                : ''),
            tone: monthTeto - monthReal < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: 'Categorias estouradas no período',
            value: `${categoryRows.overCount} de ${categoryRows.total}`,
            tone: categoryRows.overCount > 0 ? 'text-red-600 dark:text-red-400' : '',
          },
        ].map((c) => (
          <div key={c.label} className={`${card} p-3`}>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.label}</div>
            <div className={`font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 ${c.tone}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={`${card} p-4`}>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Top 10 categorias · {periodLabel}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            <strong>% consumido</strong> = Realizado ÷ Teto (100% é o limite). <strong>Dif.</strong> = Teto − Realizado,
            com o saldo em % = Dif ÷ Teto (negativo = estouro).
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5 pr-2 w-6">#</th>
                  <th className="py-1.5 pr-2">Categoria</th>
                  <th className="py-1.5 px-2 text-right">Teto</th>
                  <th className="py-1.5 px-2 text-right">Realizado</th>
                  <th className="py-1.5 px-2 text-right">Dif. (Teto − Real.)</th>
                  <th className="py-1.5 pl-2 text-right min-w-[110px]">% consumido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {categoryRows.top.map((r, i) => (
                  <tr key={r.cat}>
                    <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-900 dark:text-slate-100">
                      <span className="inline-flex items-center gap-1">
                        {r.over && <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400 shrink-0" aria-label="Estourou" />}
                        {r.cat}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono tabular-nums">{formatBRL(r.teto)}</td>
                    <td className="py-1.5 px-2 text-right font-mono tabular-nums font-semibold">{formatBRL(r.real)}</td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                        r.over ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      <div>{`${r.diff < 0 ? '-' : ''}${formatBRL(Math.abs(r.diff))}`}</div>
                      <div className="text-[10px] font-normal">
                        {r.saldoPct === null ? 'Sem teto' : `${formatPercent(r.saldoPct, 1, true)} do teto`}
                      </div>
                    </td>
                    <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {r.semTeto ? (
                        <span className="text-red-600 dark:text-red-400">Sem teto</span>
                      ) : (
                        <>
                          <div className={r.over ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                            {formatPercent(r.pct)}
                          </div>
                          <div
                            className="mt-1 h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden"
                            role="img"
                            aria-label={`${formatPercent(r.pct)} do teto consumido`}
                          >
                            <div
                              className={`h-full ${r.over ? 'bg-red-600 dark:bg-red-500' : 'bg-blue-600 dark:bg-blue-500'}`}
                              style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }}
                            />
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {categoryRows.top.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Sem lançamentos no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${card} p-4`}>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Top 10 fornecedores · {periodLabel}
          </h3>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5 pr-2 w-6">#</th>
                  <th className="py-1.5 pr-2">Fornecedor</th>
                  <th className="py-1.5 px-2 text-right">Realizado</th>
                  <th className="py-1.5 px-2 text-right">% do total</th>
                  <th className="py-1.5 pl-2 text-right">Lanç.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {supplierRows.rows.map((r, i) => (
                  <tr key={r.nome}>
                    <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-900 dark:text-slate-100">
                      <div className="truncate max-w-[260px]">{r.nome}</div>
                      <div className="mt-1 h-1.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500"
                          style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono tabular-nums font-semibold">{formatBRL(r.real)}</td>
                    <td className="py-1.5 px-2 text-right font-mono tabular-nums">{formatPercent(r.pct)}</td>
                    <td className="py-1.5 pl-2 text-right font-mono tabular-nums">{r.count}</td>
                  </tr>
                ))}
                {supplierRows.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Sem lançamentos no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={`${card} p-4`}>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Evolução acumulada: Teto × Realizado
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
            {series.firstOver >= 0
              ? `O realizado acumulado passou do teto acumulado em ${MONTH_FULL_LABELS[series.firstOver]}.`
              : 'O realizado acumulado não passou do teto acumulado.'}
          </p>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[540px]">
              <svg viewBox="0 0 660 235" className="w-full h-60 overflow-visible" role="img" aria-label="Evolução acumulada de teto e realizado">
                {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                  <g key={step}>
                    <line
                      x1={46}
                      x2={648}
                      y1={200 - step * 175}
                      y2={200 - step * 175}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeDasharray={step === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={40}
                      y={200 - step * 175 + 4}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                    >
                      {axisLabel(series.maxCum * step)}
                    </text>
                  </g>
                ))}
                {MONTH_LABELS.map((label, i) => (
                  <text
                    key={label}
                    x={CHART_X(i)}
                    y={220}
                    textAnchor="middle"
                    className={`text-[11px] ${
                      i === month ? 'fill-slate-900 dark:fill-slate-100 font-semibold' : 'fill-slate-500 dark:fill-slate-400'
                    }`}
                  >
                    {label}
                  </text>
                ))}
                <polyline fill="none" stroke="#16A34A" strokeWidth={2} strokeDasharray="5 4" points={poly(series.cumTeto, series.maxCum)} />
                <polyline fill="none" stroke="#1D4ED8" strokeWidth={2.5} points={poly(series.cumReal.slice(0, data.lastMonth + 1), series.maxCum)} />
                {series.cumReal.slice(0, data.lastMonth + 1).map((v, i) => (
                  <circle
                    key={i}
                    cx={CHART_X(i)}
                    cy={chartY(v, series.maxCum)}
                    r={series.firstOver >= 0 && i >= series.firstOver ? 4 : 3}
                    fill={series.firstOver >= 0 && i >= series.firstOver ? '#DC2626' : '#1D4ED8'}
                  >
                    <title>{`${MONTH_FULL_LABELS[i]}: realizado acumulado ${formatBRL(v)} · teto acumulado ${formatBRL(series.cumTeto[i])}`}</title>
                  </circle>
                ))}
              </svg>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-slate-600 dark:text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-700 inline-block" /> Realizado acumulado</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-green-600 inline-block" /> Teto acumulado</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Acima do teto</span>
          </div>
        </section>

        <section className={`${card} p-4`}>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Comparação mês a mês: Teto × Realizado
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
            {momDiff !== null
              ? `${MONTH_FULL_LABELS[month]} vs ${MONTH_FULL_LABELS[month - 1]}: ${momDiff >= 0 ? '+' : '-'}${formatBRL(Math.abs(momDiff))}${
                  momPct !== null ? ` (${formatPercent(momPct, 1, true)})` : ''
                } no realizado.`
              : 'Janeiro não tem mês anterior para comparar.'}
          </p>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[540px]">
              <svg viewBox="0 0 660 235" className="w-full h-60 overflow-visible" role="img" aria-label="Comparação mensal de teto e realizado">
                {[0, 0.25, 0.5, 0.75, 1].map((step) => (
                  <g key={step}>
                    <line
                      x1={46}
                      x2={648}
                      y1={200 - step * 175}
                      y2={200 - step * 175}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeDasharray={step === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={40}
                      y={200 - step * 175 + 4}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                    >
                      {axisLabel(series.maxMonthly * step)}
                    </text>
                  </g>
                ))}
                {MONTH_LABELS.map((label, i) => {
                  const t = data.totalTeto[i];
                  const r = data.totalReal[i];
                  const th = (Math.max(0, t) / series.maxMonthly) * 175;
                  const rh = (Math.max(0, r) / series.maxMonthly) * 175;
                  const over = t > 0 ? r > t : r > 0;
                  const sel = i === month;
                  return (
                    <g key={label} className="cursor-pointer" onClick={() => setMonthSel(i)}>
                      <title>{`${MONTH_FULL_LABELS[i]}: teto ${formatBRL(t)} · realizado ${formatBRL(r)}`}</title>
                      <rect
                        x={CHART_X(i) - 24}
                        y={20}
                        width={48}
                        height={188}
                        rx={4}
                        className={sel ? 'fill-slate-100 dark:fill-slate-800/70' : 'fill-transparent'}
                      />
                      <rect x={CHART_X(i) - 18} y={200 - th} width={16} height={th} rx={2} fill="#16A34A" opacity={0.55} />
                      <rect
                        x={CHART_X(i) + 2}
                        y={200 - rh}
                        width={16}
                        height={rh}
                        rx={2}
                        fill={over ? '#DC2626' : '#1D4ED8'}
                        opacity={0.92}
                      />
                      <text
                        x={CHART_X(i)}
                        y={220}
                        textAnchor="middle"
                        className={`text-[11px] ${
                          sel ? 'fill-slate-900 dark:fill-slate-100 font-semibold' : 'fill-slate-500 dark:fill-slate-400'
                        }`}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-slate-600 dark:text-slate-400 mt-1">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-green-600/60 inline-block" /> Teto do mês</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-700 inline-block" /> Realizado</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-600 inline-block" /> Realizado acima do teto</span>
            <span>Clique em um mês para selecioná-lo.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
