import { Copy, FileInput, Lock, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { parseBRNumber } from '../shared/normalization';
import { DatabaseState } from '../types/buddha';
import { formatBRL, formatDateTimeBR, MONTH_LABELS, sumArray } from '../utils/format';

interface AnnualPlanViewProps {
  state: DatabaseState;
  activeYear: number;
  isAdmin: boolean;
  onSavePlan: (year: number, tetos: Record<string, number[]>) => Promise<unknown>;
}

function buildInitialTetos(state: DatabaseState, year: number): Record<string, number[]> {
  const existing = state.plans[String(year)]?.tetos || {};
  const result: Record<string, number[]> = {};
  for (const cat of state.registries.categorias) {
    result[cat.nome] = existing[cat.nome]
      ? [...existing[cat.nome]]
      : Array(12).fill(0);
  }
  for (const key of Object.keys(existing)) {
    if (!result[key]) {
      result[key] = [...existing[key]];
    }
  }
  return result;
}

export function AnnualPlanView({
  state,
  activeYear,
  isAdmin,
  onSavePlan,
}: AnnualPlanViewProps) {
  const [draftTetos, setDraftTetos] = useState<Record<string, number[]>>(() =>
    buildInitialTetos(state, activeYear)
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copyPct, setCopyPct] = useState('5.0');
  const [showCopyBar, setShowCopyBar] = useState(false);

  // Sync from server only when not actively editing or when year changes
  useEffect(() => {
    if (!dirty) {
      setDraftTetos(buildInitialTetos(state, activeYear));
    }
  }, [state, activeYear, dirty]);

  useEffect(() => {
    setDirty(false);
    setFeedback(null);
    setDraftTetos(buildInitialTetos(state, activeYear));
  }, [activeYear]);

  // Realizado by category & month (excluding Cancelado)
  const realizedMatrix = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const cat of Object.keys(draftTetos)) {
      map[cat] = Array(12).fill(0);
    }
    for (const e of state.entries) {
      if (!e.competencia.startsWith(`${activeYear}-`) || e.status === 'Cancelado') continue;
      const mIdx = parseInt(e.competencia.slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;
      if (!map[e.categoria]) map[e.categoria] = Array(12).fill(0);
      map[e.categoria][mIdx] += e.realizado;
    }
    return map;
  }, [state.entries, activeYear, draftTetos]);

  const categories = useMemo(() => Object.keys(draftTetos), [draftTetos]);

  const columnTotals = useMemo(() => {
    const tetoCol = Array(12).fill(0) as number[];
    const realCol = Array(12).fill(0) as number[];
    for (const cat of categories) {
      for (let m = 0; m < 12; m++) {
        tetoCol[m] += draftTetos[cat]?.[m] || 0;
        realCol[m] += realizedMatrix[cat]?.[m] || 0;
      }
    }
    return {
      tetoCol,
      realCol,
      grandTeto: sumArray(tetoCol),
      grandReal: sumArray(realCol),
    };
  }, [categories, draftTetos, realizedMatrix]);

  const handleCellChange = (cat: string, monthIdx: number, raw: string) => {
    if (!isAdmin) return;
    const val = Math.max(0, parseBRNumber(raw));
    setDraftTetos((prev) => {
      const nextArr = [...(prev[cat] || Array(12).fill(0))];
      nextArr[monthIdx] = val;
      return { ...prev, [cat]: nextArr };
    });
    setDirty(true);
    setFeedback(null);
  };

  const handleAnnualDistribute = (cat: string, raw: string) => {
    if (!isAdmin) return;
    const annualVal = Math.max(0, parseBRNumber(raw));
    const baseMonthly = Math.floor((annualVal / 12) * 100) / 100;
    const remainder = Math.round((annualVal - baseMonthly * 12) * 100) / 100;
    const arr = Array(12).fill(baseMonthly);
    arr[11] = Math.round((baseMonthly + remainder) * 100) / 100;

    setDraftTetos((prev) => ({ ...prev, [cat]: arr }));
    setDirty(true);
    setFeedback(null);
  };

  const handleCopyPreviousYear = () => {
    if (!isAdmin) return;
    const prevPlan = state.plans[String(activeYear - 1)];
    if (!prevPlan) {
      setFeedback(`Não há planejamento salvo para ${activeYear - 1} para copiar.`);
      return;
    }
    const factor = 1 + parseBRNumber(copyPct) / 100;
    const next: Record<string, number[]> = {};
    for (const cat of categories) {
      const prevArr = prevPlan.tetos[cat] || Array(12).fill(0);
      next[cat] = prevArr.map((v) => Math.round(v * factor * 100) / 100);
    }
    setDraftTetos(next);
    setDirty(true);
    setShowCopyBar(false);
    setFeedback(
      `Tetos de ${activeYear - 1} copiados com reajuste de ${copyPct}%. Clique em Salvar para confirmar.`
    );
  };

  const handleFillFromEntries = () => {
    if (!isAdmin) return;
    const next: Record<string, number[]> = {};
    for (const cat of categories) {
      next[cat] = Array(12).fill(0);
    }
    for (const e of state.entries) {
      if (!e.competencia.startsWith(`${activeYear}-`) || e.status === 'Cancelado') continue;
      const mIdx = parseInt(e.competencia.slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;
      if (!next[e.categoria]) next[e.categoria] = Array(12).fill(0);
      next[e.categoria][mIdx] += e.orcado;
    }
    setDraftTetos(next);
    setDirty(true);
    setFeedback(
      `Grade preenchida com o somatório de "Orçado" dos lançamentos de ${activeYear}. Clique em Salvar para confirmar.`
    );
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setFeedback(null);
    try {
      await onSavePlan(activeYear, draftTetos);
      setDirty(false);
      setFeedback(`Planejamento anual de ${activeYear} salvo e sincronizado.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar planejamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraftTetos(buildInitialTetos(state, activeYear));
    setDirty(false);
    setFeedback('Alterações descartadas.');
  };

  const planMeta = state.plans[String(activeYear)];

  return (
    <div className="space-y-4">
      {/* Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Grade de Teto Orçamentário · {activeYear}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Embaixo de cada célula é exibido o Realizado do mês (em vermelho quando ultrapassar o teto).
            </p>
          </div>

          {!isAdmin ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Somente o Administrador pode editar o planejamento anual</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCopyBar((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copiar de {activeYear - 1}</span>
              </button>

              <button
                type="button"
                onClick={handleFillFromEntries}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <FileInput className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Preencher com previsto dos lançamentos</span>
              </button>

              {dirty && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Descartar</span>
                </button>
              )}

              <button
                type="button"
                disabled={!dirty || saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-45 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{saving ? 'Salvando...' : 'Salvar Planejamento'}</span>
              </button>
            </div>
          )}
        </div>

        {showCopyBar && isAdmin && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Copiar tetos de {activeYear - 1} aplicando ajuste de (%):
            </span>
            <input
              type="text"
              value={copyPct}
              onChange={(e) => setCopyPct(e.target.value)}
              className="w-24 px-2.5 py-1 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded"
            />
            <button
              type="button"
              onClick={handleCopyPreviousYear}
              className="px-3 py-1 font-semibold text-white bg-blue-700 rounded hover:bg-blue-800"
            >
              Aplicar Cópia
            </button>
          </div>
        )}

        {feedback && (
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg text-xs text-blue-900 dark:text-blue-200">
            {feedback}
          </div>
        )}

        {planMeta && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Última atualização por <strong>{planMeta.atualizadoPor}</strong> em{' '}
            {formatDateTimeBR(planMeta.atualizadoEm)}
          </div>
        )}
      </div>

      {/* 12-Month Matrix Grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4 min-w-[210px] sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800">
                  Categoria
                </th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="py-2.5 px-2 text-right min-w-[96px] whitespace-nowrap">
                    {m}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right min-w-[125px] bg-blue-50/70 dark:bg-blue-950/40 border-l border-slate-200 dark:border-slate-800 whitespace-nowrap">
                  Anual (÷12)
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {categories.map((cat) => {
                const rowTetos = draftTetos[cat] || Array(12).fill(0);
                const rowReal = realizedMatrix[cat] || Array(12).fill(0);
                const rowSumTeto = sumArray(rowTetos);
                const rowSumReal = sumArray(rowReal);
                const rowOver = rowSumReal > rowSumTeto && (rowSumTeto > 0 || rowSumReal > 0);

                return (
                  <tr key={cat} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800">
                      {cat}
                    </td>

                    {MONTH_LABELS.map((_, mIdx) => {
                      const tetoVal = rowTetos[mIdx] || 0;
                      const realVal = rowReal[mIdx] || 0;
                      const over = realVal > tetoVal && realVal > 0;

                      return (
                        <td key={mIdx} className="py-2 px-2 text-right align-top">
                          <input
                            type="number"
                            min={0}
                            step="100"
                            disabled={!isAdmin}
                            value={tetoVal}
                            onChange={(e) => handleCellChange(cat, mIdx, e.target.value)}
                            aria-label={`Teto ${cat} ${MONTH_LABELS[mIdx]}`}
                            className="w-full px-1.5 py-1 text-right font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 tabular-nums disabled:opacity-75 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <div
                            className={`mt-1 font-mono text-[10px] tabular-nums ${
                              over
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                            title="Realizado no mês"
                          >
                            {realVal > 0 ? formatBRL(realVal) : '—'}
                          </div>
                        </td>
                      );
                    })}

                    {/* Editable Annual Column that distributes /12 */}
                    <td className="py-2 px-3 text-right align-top bg-blue-50/40 dark:bg-blue-950/20 border-l border-slate-200 dark:border-slate-800">
                      <input
                        type="number"
                        min={0}
                        step="1000"
                        disabled={!isAdmin}
                        value={Math.round(rowSumTeto * 100) / 100}
                        onChange={(e) => handleAnnualDistribute(cat, e.target.value)}
                        title="Digite o teto anual para distribuir igualmente pelos 12 meses"
                        className="w-full px-2 py-1 text-right font-mono font-semibold text-xs bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded text-slate-900 dark:text-slate-100 tabular-nums disabled:opacity-75"
                      />
                      <div
                        className={`mt-1 font-mono text-[10px] tabular-nums ${
                          rowOver
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Real: {formatBRL(rowSumReal)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold">
                <td className="py-3 px-4 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                  Total Geral
                </td>
                {MONTH_LABELS.map((_, idx) => {
                  const t = columnTotals.tetoCol[idx];
                  const r = columnTotals.realCol[idx];
                  const over = r > t && r > 0;
                  return (
                    <td key={idx} className="py-3 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 dark:text-slate-100">{formatBRL(t)}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          over
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400 font-normal'
                        }`}
                      >
                        {r > 0 ? formatBRL(r) : '—'}
                      </div>
                    </td>
                  );
                })}
                <td className="py-3 px-3 text-right font-mono tabular-nums bg-blue-50/70 dark:bg-blue-950/40 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap">
                  <div className="text-slate-900 dark:text-slate-100">
                    {formatBRL(columnTotals.grandTeto)}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      columnTotals.grandReal > columnTotals.grandTeto
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-500 dark:text-slate-400 font-normal'
                    }`}
                  >
                    Real: {formatBRL(columnTotals.grandReal)}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
