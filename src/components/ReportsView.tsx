import { CheckCircle2, ClipboardCopy, FileDown, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DatabaseState } from '../types/buddha';
import {
  copyReportCsvToClipboard,
  exportReportLandscapePdf,
  exportReportWorkbook,
  ReportSummaryRow,
} from '../utils/exports';
import { formatBRL, formatPercent, MONTH_FULL_LABELS, MONTH_LABELS } from '../utils/format';
import { getAvailableYears } from '../utils/years';

interface ReportsViewProps {
  state: DatabaseState;
  activeYear: number;
  onChangeYear: (y: number) => void;
}

type GroupByOption =
  | 'categoria'
  | 'fornecedor'
  | 'empresa'
  | 'departamento'
  | 'mes'
  | 'contrato';

const GROUP_LABELS: Record<GroupByOption, string> = {
  categoria: 'Categoria',
  fornecedor: 'Fornecedor',
  empresa: 'Empresa',
  departamento: 'Departamento',
  mes: 'Mês',
  contrato: 'Contrato',
};

export function ReportsView({ state, activeYear, onChangeYear }: ReportsViewProps) {
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(12);
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [deptoFilter, setDeptoFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupByOption>('categoria');
  const [copiedNotice, setCopiedNotice] = useState(false);

  const contractMap = useMemo(
    () => new Map(state.contracts.map((c) => [c.id, c])),
    [state.contracts]
  );

  const filteredEntries = useMemo(() => {
    const startComp = `${activeYear}-${String(startMonth).padStart(2, '0')}`;
    const endComp = `${activeYear}-${String(endMonth).padStart(2, '0')}`;
    return state.entries.filter((e) => {
      if (e.status === 'Cancelado') return false;
      if (e.competencia < startComp || e.competencia > endComp) return false;
      if (empresaFilter !== 'all' && e.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && e.departamento !== deptoFilter) return false;
      return true;
    });
  }, [state.entries, activeYear, startMonth, endMonth, empresaFilter, deptoFilter]);

  const filteredContracts = useMemo(() => {
    return state.contracts.filter((c) => {
      if (empresaFilter !== 'all' && c.empresa !== empresaFilter) return false;
      if (deptoFilter !== 'all' && c.departamento !== deptoFilter) return false;
      return true;
    });
  }, [state.contracts, empresaFilter, deptoFilter]);

  const showTeto = groupBy === 'categoria' || groupBy === 'mes';
  const plan = state.plans[String(activeYear)];

  const reportRows = useMemo((): ReportSummaryRow[] => {
    const map = new Map<string, { orcado: number; realizado: number; teto: number }>();

    if (groupBy === 'mes') {
      for (let m = startMonth; m <= endMonth; m++) {
        const key = `${String(m).padStart(2, '0')} · ${MONTH_FULL_LABELS[m - 1]}`;
        let monthTeto = 0;
        if (plan) {
          for (const arr of Object.values(plan.tetos)) {
            monthTeto += arr[m - 1] || 0;
          }
        }
        map.set(key, { orcado: 0, realizado: 0, teto: monthTeto });
      }
    }

    if (groupBy === 'categoria' && plan) {
      for (const [cat, arr] of Object.entries(plan.tetos)) {
        const tetoSlice = arr.slice(startMonth - 1, endMonth).reduce((a, b) => a + b, 0);
        map.set(cat, { orcado: 0, realizado: 0, teto: tetoSlice });
      }
    }

    for (const e of filteredEntries) {
      let key = '';
      if (groupBy === 'categoria') key = e.categoria;
      else if (groupBy === 'fornecedor') key = e.fornecedor || '(Sem fornecedor)';
      else if (groupBy === 'empresa') key = e.empresa;
      else if (groupBy === 'departamento') key = e.departamento;
      else if (groupBy === 'mes') {
        const mNum = parseInt(e.competencia.slice(5, 7), 10);
        key = `${String(mNum).padStart(2, '0')} · ${MONTH_FULL_LABELS[mNum - 1]}`;
      } else {
        const ctr = e.contratoId ? contractMap.get(e.contratoId) : undefined;
        key = ctr ? `${ctr.fornecedor} (${ctr.empresa})` : '(Sem vínculo contratual)';
      }

      const cur = map.get(key) || { orcado: 0, realizado: 0, teto: 0 };
      cur.orcado += e.orcado;
      cur.realizado += e.realizado;
      map.set(key, cur);
    }

    const list = Array.from(map.entries())
      .map(([grupo, vals]) => {
        const saldo = vals.orcado - vals.realizado;
        const base = showTeto && vals.teto > 0 ? vals.teto : vals.orcado;
        const percentual = base > 0 ? (vals.realizado / base) * 100 : 0;
        return {
          grupo,
          teto: showTeto ? vals.teto : undefined,
          orcado: vals.orcado,
          realizado: vals.realizado,
          saldo,
          percentual,
        };
      })
      .filter((r) => r.orcado > 0 || r.realizado > 0 || (r.teto ?? 0) > 0);

    if (groupBy === 'mes') {
      return list.sort((a, b) => a.grupo.localeCompare(b.grupo));
    }
    return list.sort((a, b) => b.realizado - a.realizado);
  }, [filteredEntries, groupBy, startMonth, endMonth, plan, contractMap, showTeto]);

  const totals = useMemo(() => {
    const teto = reportRows.reduce((s, r) => s + (r.teto ?? 0), 0);
    const orcado = reportRows.reduce((s, r) => s + r.orcado, 0);
    const realizado = reportRows.reduce((s, r) => s + r.realizado, 0);
    const saldo = orcado - realizado;
    const base = showTeto && teto > 0 ? teto : orcado;
    const pct = base > 0 ? (realizado / base) * 100 : 0;
    return { teto, orcado, realizado, saldo, pct };
  }, [reportRows, showTeto]);

  const periodLabel = `${MONTH_LABELS[startMonth - 1]}/${activeYear} a ${
    MONTH_LABELS[endMonth - 1]
  }/${activeYear}`;
  const filterLabel = `Empresa: ${
    empresaFilter === 'all' ? 'Todas' : empresaFilter
  } · Depto: ${deptoFilter === 'all' ? 'Todos' : deptoFilter}`;

  const columns = showTeto
    ? [GROUP_LABELS[groupBy], 'Teto Planejado', 'Previsto', 'Realizado', 'Saldo', '% Exec.']
    : [GROUP_LABELS[groupBy], 'Previsto', 'Realizado', 'Saldo', '% Exec.'];

  const handleExportExcel = () => {
    exportReportWorkbook({
      filename: `relatorio_dho_buddha_${activeYear}_${groupBy}.xlsx`,
      groupLabel: GROUP_LABELS[groupBy],
      showTeto,
      summaryRows: reportRows,
      entries: filteredEntries,
      contracts: filteredContracts,
    });
  };

  const handleExportPdf = () => {
    const pdfRows = reportRows.map((r) =>
      showTeto
        ? [
            r.grupo,
            formatBRL(r.teto ?? 0),
            formatBRL(r.orcado),
            formatBRL(r.realizado),
            formatBRL(r.saldo),
            formatPercent(r.percentual),
          ]
        : [
            r.grupo,
            formatBRL(r.orcado),
            formatBRL(r.realizado),
            formatBRL(r.saldo),
            formatPercent(r.percentual),
          ]
    );

    const totalsRow = showTeto
      ? [
          'TOTAL CONSOLIDADO',
          formatBRL(totals.teto),
          formatBRL(totals.orcado),
          formatBRL(totals.realizado),
          formatBRL(totals.saldo),
          formatPercent(totals.pct),
        ]
      : [
          'TOTAL CONSOLIDADO',
          formatBRL(totals.orcado),
          formatBRL(totals.realizado),
          formatBRL(totals.saldo),
          formatPercent(totals.pct),
        ];

    exportReportLandscapePdf({
      filename: `relatorio_dho_buddha_${activeYear}_${groupBy}.pdf`,
      title: `Relatório Consolidado por ${GROUP_LABELS[groupBy]}`,
      periodLabel,
      filterLabel,
      columns,
      rows: pdfRows,
      totalsRow,
    });
  };

  const handleCopyCsv = async () => {
    await copyReportCsvToClipboard(columns, reportRows, showTeto);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Filters & Export Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Ano
            </label>
            <select
              value={activeYear}
              onChange={(e) => onChangeYear(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              {getAvailableYears(state, activeYear).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Mês Inicial
            </label>
            <select
              value={startMonth}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStartMonth(v);
                if (v > endMonth) setEndMonth(v);
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              {MONTH_FULL_LABELS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Mês Final
            </label>
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              {MONTH_FULL_LABELS.map((m, i) => (
                <option key={m} value={i + 1} disabled={i + 1 < startMonth}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Empresa
            </label>
            <select
              value={empresaFilter}
              onChange={(e) => setEmpresaFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              <option value="all">Todas</option>
              {state.registries.empresas.map((emp) => (
                <option key={emp.id} value={emp.nome}>
                  {emp.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Departamento
            </label>
            <select
              value={deptoFilter}
              onChange={(e) => setDeptoFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              {state.registries.departamentos.map((d) => (
                <option key={d.id} value={d.nome}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Agrupar por
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
              className="w-full px-2.5 py-1.5 font-medium bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-900 dark:text-blue-200"
            >
              {(Object.keys(GROUP_LABELS) as GroupByOption[]).map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Período: <strong className="text-slate-800 dark:text-slate-200">{periodLabel}</strong> ·{' '}
            {filteredEntries.length} lançamento(s) incluído(s)
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              {copiedNotice ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>CSV copiado!</span>
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copiar CSV</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exportar PDF (Paisagem)</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exportar Excel (3 abas)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">{GROUP_LABELS[groupBy]}</th>
                {showTeto && <th className="py-2.5 px-4 text-right">Teto Planejado</th>}
                <th className="py-2.5 px-4 text-right">Previsto</th>
                <th className="py-2.5 px-4 text-right">Realizado</th>
                <th className="py-2.5 px-4 text-right">Saldo (Previsto − Realizado)</th>
                <th className="py-2.5 px-4 text-right">
                  {showTeto ? '% do Teto' : '% Executado'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {reportRows.map((r) => (
                <tr key={r.grupo} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {r.grupo}
                  </td>
                  {showTeto && (
                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {formatBRL(r.teto ?? 0)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                    {formatBRL(r.orcado)}
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
                  <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                    {formatPercent(r.percentual)}
                  </td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr>
                  <td
                    colSpan={showTeto ? 6 : 5}
                    className="py-10 text-center text-slate-500 dark:text-slate-400"
                  >
                    Nenhum dado encontrado para o período e filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>

            {reportRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold">
                  <td className="py-3 px-4 text-slate-900 dark:text-slate-100">
                    Total Consolidado
                  </td>
                  {showTeto && (
                    <td className="py-3 px-4 text-right font-mono text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                      {formatBRL(totals.teto)}
                    </td>
                  )}
                  <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatBRL(totals.orcado)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatBRL(totals.realizado)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap ${
                      totals.saldo < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatBRL(totals.saldo)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatPercent(totals.pct)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
