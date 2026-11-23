import {
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileUp,
  Plus,
  Repeat,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { parseBRNumber } from '../shared/normalization';
import {
  DatabaseState,
  ENTRY_STATUSES,
  Entry,
  EntryStatus,
} from '../types/buddha';
import { exportFilteredEntriesToExcel } from '../utils/exports';
import {
  formatBRL,
  formatCompetenciaBR,
  formatDateBR,
  formatDateTimeBR,
} from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportSpreadsheetModal } from './ImportSpreadsheetModal';
import { EntryStatusChip } from './StatusChip';

interface EntriesViewProps {
  state: DatabaseState;
  activeYear: number;
  canEdit: boolean;
  initialSpecialFilter?: string | null;
  onClearInitialFilter?: () => void;
  createTrigger: number;
  onCreateEntry: (payload: Partial<Entry>) => Promise<unknown>;
  onUpdateEntry: (id: string, payload: Partial<Entry>) => Promise<unknown>;
  onDeleteEntry: (id: string) => Promise<unknown>;
  onGenerateRecurring: (
    sourceCompetencia: string,
    targetCompetencia: string
  ) => Promise<{ createdCount: number; skippedCount: number }>;
  onImportEntries: (
    entries: Array<
      Omit<Entry, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>
    >
  ) => Promise<{ importedCount: number }>;
}

const PAGE_SIZE = 50;

export function EntriesView({
  state,
  activeYear,
  canEdit,
  initialSpecialFilter,
  onClearInitialFilter,
  createTrigger,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
  onGenerateRecurring,
  onImportEntries,
}: EntriesViewProps) {
  // Filters
  const [search, setSearch] = useState('');
  const [compFrom, setCompFrom] = useState(`${activeYear}-01`);
  const [compTo, setCompTo] = useState(`${activeYear}-12`);
  const [catFilter, setCatFilter] = useState('all');
  const [empFilter, setEmpFilter] = useState('all');
  const [depFilter, setDepFilter] = useState('all');
  const [supFilter, setSupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [specialFilter, setSpecialFilter] = useState(initialSpecialFilter || 'all');

  useEffect(() => {
    setCompFrom(`${activeYear}-01`);
    setCompTo(`${activeYear}-12`);
  }, [activeYear]);

  useEffect(() => {
    if (initialSpecialFilter) {
      setSpecialFilter(initialSpecialFilter);
      onClearInitialFilter?.();
    }
  }, [initialSpecialFilter, onClearInitialFilter]);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<
    'competencia' | 'categoria' | 'fornecedor' | 'orcado' | 'realizado' | 'saldo'
  >('competencia');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  // Side Form Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [lastTrigger, setLastTrigger] = useState(createTrigger);

  // Form State
  const [formComp, setFormComp] = useState(`${activeYear}-11`);
  const [formPayDate, setFormPayDate] = useState('');
  const [formCat, setFormCat] = useState(state.registries.categorias[0]?.nome || '');
  const [formDesc, setFormDesc] = useState('');
  const [formFornecedor, setFormFornecedor] = useState('');
  const [formEmpresa, setFormEmpresa] = useState(state.registries.empresas[0]?.nome || '');
  const [formDepto, setFormDepto] = useState(state.registries.departamentos[0]?.nome || '');
  const [formRecorrente, setFormRecorrente] = useState(false);
  const [formOrcado, setFormOrcado] = useState('0');
  const [formRealizado, setFormRealizado] = useState('0');
  const [formStatus, setFormStatus] = useState<EntryStatus>('Previsto');
  const [formContratoId, setFormContratoId] = useState('');
  const [formObs, setFormObs] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Recurring generator modal
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recSource, setRecSource] = useState(`${activeYear}-10`);
  const [recTarget, setRecTarget] = useState(`${activeYear}-11`);
  const [recResult, setRecResult] = useState<string | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  // Import spreadsheet modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const contractMap = useMemo(
    () => new Map(state.contracts.map((c) => [c.id, c])),
    [state.contracts]
  );

  const openNewDrawer = (prefill?: Entry) => {
    setFormError(null);
    if (prefill) {
      setEditingEntry(null);
      setFormComp(prefill.competencia);
      setFormPayDate('');
      setFormCat(prefill.categoria);
      setFormDesc(prefill.descricao);
      setFormFornecedor(prefill.fornecedor);
      setFormEmpresa(prefill.empresa);
      setFormDepto(prefill.departamento);
      setFormRecorrente(prefill.recorrente);
      setFormOrcado(String(prefill.orcado));
      setFormRealizado('0');
      setFormStatus('Previsto');
      setFormContratoId(prefill.contratoId || '');
      setFormObs(prefill.obs);
    } else {
      setEditingEntry(null);
      setFormComp(`${activeYear}-11`);
      setFormPayDate('');
      setFormCat(state.registries.categorias[0]?.nome || '');
      setFormDesc('');
      setFormFornecedor('');
      setFormEmpresa(state.registries.empresas[0]?.nome || '');
      setFormDepto(state.registries.departamentos[0]?.nome || '');
      setFormRecorrente(false);
      setFormOrcado('0');
      setFormRealizado('0');
      setFormStatus('Previsto');
      setFormContratoId('');
      setFormObs('');
    }
    setDrawerOpen(true);
  };

  if (createTrigger !== lastTrigger) {
    setLastTrigger(createTrigger);
    if (canEdit) openNewDrawer();
  }

  const openEditDrawer = (entry: Entry) => {
    setFormError(null);
    setEditingEntry(entry);
    setFormComp(entry.competencia);
    setFormPayDate(entry.dataPagamento || '');
    setFormCat(entry.categoria);
    setFormDesc(entry.descricao);
    setFormFornecedor(entry.fornecedor);
    setFormEmpresa(entry.empresa);
    setFormDepto(entry.departamento);
    setFormRecorrente(entry.recorrente);
    setFormOrcado(String(entry.orcado));
    setFormRealizado(String(entry.realizado));
    setFormStatus(entry.status);
    setFormContratoId(entry.contratoId || '');
    setFormObs(entry.obs || '');
    setDrawerOpen(true);
  };

  // Contracts filtered by selected supplier in drawer + auto-suggest when exactly 1 match
  const matchingContractsForForm = useMemo(() => {
    const sup = formFornecedor.trim().toUpperCase();
    if (!sup) return state.contracts;
    return state.contracts.filter((c) => c.fornecedor.toUpperCase() === sup);
  }, [formFornecedor, state.contracts]);

  const handleFornecedorChange = (val: string) => {
    setFormFornecedor(val);
    const upper = val.trim().toUpperCase();
    if (!upper) {
      setFormContratoId('');
      return;
    }
    const matches = state.contracts.filter((c) => c.fornecedor.toUpperCase() === upper);
    if (matches.length === 1) {
      setFormContratoId(matches[0].id);
    } else if (!matches.some((m) => m.id === formContratoId)) {
      setFormContratoId('');
    }
  };

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = state.entries.filter((e) => {
      if (compFrom && e.competencia < compFrom) return false;
      if (compTo && e.competencia > compTo) return false;
      if (catFilter !== 'all' && e.categoria !== catFilter) return false;
      if (empFilter !== 'all' && e.empresa !== empFilter) return false;
      if (depFilter !== 'all' && e.departamento !== depFilter) return false;
      if (supFilter !== 'all' && e.fornecedor !== supFilter) return false;
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (contractFilter !== 'all' && e.contratoId !== contractFilter) return false;

      if (specialFilter === 'acima_orcado' && !(e.realizado > e.orcado && e.status !== 'Cancelado'))
        return false;
      if (
        specialFilter === 'sem_orcamento' &&
        !(e.realizado > 0 && e.orcado === 0 && e.status !== 'Cancelado')
      )
        return false;
      if (specialFilter === 'sem_fornecedor' && e.fornecedor !== '') return false;
      if (specialFilter === 'recorrente_sem_contrato' && !(e.recorrente && !e.contratoId))
        return false;

      if (q) {
        return (
          e.descricao.toLowerCase().includes(q) ||
          e.fornecedor.toLowerCase().includes(q) ||
          e.categoria.toLowerCase().includes(q) ||
          e.empresa.toLowerCase().includes(q) ||
          e.obs.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'orcado' || sortField === 'realizado' || sortField === 'saldo') {
        cmp = a[sortField] - b[sortField];
      } else {
        cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''), 'pt-BR');
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [
    state.entries,
    compFrom,
    compTo,
    catFilter,
    empFilter,
    depFilter,
    supFilter,
    statusFilter,
    contractFilter,
    specialFilter,
    search,
    sortField,
    sortAsc,
  ]);

  // Totals exclude 'Cancelado'
  const totals = useMemo(() => {
    let orcado = 0;
    let realizado = 0;
    let validCount = 0;
    for (const e of filteredEntries) {
      if (e.status === 'Cancelado') continue;
      orcado += e.orcado;
      realizado += e.realizado;
      validCount++;
    }
    return {
      orcado,
      realizado,
      saldo: orcado - realizado,
      validCount,
    };
  }, [filteredEntries]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, safePage]);

  const toggleSort = (
    field: 'competencia' | 'categoria' | 'fornecedor' | 'orcado' | 'realizado' | 'saldo'
  ) => {
    if (sortField === field) {
      setSortAsc((p) => !p);
    } else {
      setSortField(field);
      setSortAsc(field === 'categoria' || field === 'fornecedor');
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formComp || !/^\d{4}-\d{2}$/.test(formComp)) {
      setFormError('Informe uma competência válida no formato AAAA-MM.');
      return;
    }
    if (!formCat || !formDesc.trim() || !formEmpresa || !formDepto) {
      setFormError('Preencha categoria, descrição, empresa e departamento.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Entry> = {
        competencia: formComp,
        dataPagamento: formPayDate,
        categoria: formCat,
        descricao: formDesc.trim(),
        fornecedor: formFornecedor.trim(),
        empresa: formEmpresa,
        departamento: formDepto,
        recorrente: formRecorrente,
        orcado: Math.max(0, parseBRNumber(formOrcado)),
        realizado: parseBRNumber(formRealizado),
        status: formStatus,
        contratoId: formContratoId || undefined,
        obs: formObs.trim(),
      };

      if (editingEntry) {
        await onUpdateEntry(editingEntry.id, payload);
      } else {
        await onCreateEntry(payload);
      }
      setDrawerOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteEntry(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleRunRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecResult(null);
    setRecLoading(true);
    try {
      const res = await onGenerateRecurring(recSource, recTarget);
      setRecResult(
        `${res.createdCount} lançamento(s) recorrente(s) gerado(s) em ${formatCompetenciaBR(
          recTarget
        )} como Previsto (${res.skippedCount} já existente(s) ignorado(s)).`
      );
    } catch (err) {
      setRecResult(err instanceof Error ? err.message : 'Erro ao gerar recorrentes.');
    } finally {
      setRecLoading(false);
    }
  };

  const previewFormSaldo = Math.max(0, parseBRNumber(formOrcado)) - parseBRNumber(formRealizado);

  return (
    <div className="space-y-4">
      {importNotice && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{importNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            className="p-1 text-emerald-700 dark:text-emerald-400 hover:opacity-75 rounded"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por descrição, fornecedor, categoria, empresa ou observação..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportFilteredEntriesToExcel(
                  filteredEntries,
                  `lancamentos_dho_${activeYear}.xlsx`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exportar Excel</span>
            </button>

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950 whitespace-nowrap"
                >
                  <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Importar Planilha</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecResult(null);
                    setRecModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                >
                  <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Gerar recorrentes</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewDrawer()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Novo Lançamento</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Rich Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Comp. de
            </label>
            <input
              type="month"
              value={compFrom}
              onChange={(e) => {
                setCompFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Comp. até
            </label>
            <input
              type="month"
              value={compTo}
              onChange={(e) => {
                setCompTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Categoria
            </label>
            <select
              value={catFilter}
              onChange={(e) => {
                setCatFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              <option value="all">Todas</option>
              {state.registries.categorias.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Empresa
            </label>
            <select
              value={empFilter}
              onChange={(e) => {
                setEmpFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
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
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Departamento
            </label>
            <select
              value={depFilter}
              onChange={(e) => {
                setDepFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
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
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Fornecedor
            </label>
            <select
              value={supFilter}
              onChange={(e) => {
                setSupFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              <option value="all">Todos</option>
              {state.registries.fornecedores.map((f) => (
                <option key={f.id} value={f.nome}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Status / Contrato
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              <option value="all">Todos Status</option>
              {ENTRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              Situação Especial
            </label>
            <select
              value={specialFilter}
              onChange={(e) => {
                setSpecialFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            >
              <option value="all">Nenhuma</option>
              <option value="acima_orcado">Acima do orçado</option>
              <option value="sem_orcamento">Realizado sem orçamento</option>
              <option value="sem_fornecedor">Sem fornecedor</option>
              <option value="recorrente_sem_contrato">Recorrente sem contrato</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Exibindo <strong className="text-slate-800 dark:text-slate-200">{filteredEntries.length}</strong> registro(s)
              ({totals.validCount} ativos nos totais)
            </span>
            <select
              value={contractFilter}
              onChange={(e) => {
                setContractFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por contrato vinculado"
              className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px]"
            >
              <option value="all">Contrato: Todos</option>
              {state.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fornecedor} ({c.empresa})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCompFrom(`${activeYear}-01`);
              setCompTo(`${activeYear}-12`);
              setCatFilter('all');
              setEmpFilter('all');
              setDepFilter('all');
              setSupFilter('all');
              setStatusFilter('all');
              setContractFilter('all');
              setSpecialFilter('all');
              setPage(1);
            }}
            className="text-blue-700 dark:text-blue-400 hover:underline"
          >
            Resetar filtros
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('competencia')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Comp.</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('categoria')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Categoria · Descrição</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('fornecedor')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Fornecedor · Empresa</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('orcado')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Orçado</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('realizado')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Realizado</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('saldo')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    <span>Saldo</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                {canEdit && (
                  <th className="py-2.5 px-3 text-right whitespace-nowrap sticky right-0 bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                    Ações
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {paginatedRows.map((entry) => {
                const isCancelled = entry.status === 'Cancelado';
                const linkedCtr = entry.contratoId ? contractMap.get(entry.contratoId) : undefined;
                return (
                  <tr
                    key={entry.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                      isCancelled ? 'opacity-55' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCompetenciaBR(entry.competencia)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {entry.dataPagamento ? `Pgto ${formatDateBR(entry.dataPagamento)}` : 'Sem pgto'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {entry.descricao}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {entry.categoria}
                        {entry.recorrente ? ' · Recorrente' : ''}
                        {linkedCtr ? ` · Contrato ${linkedCtr.fornecedor}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {entry.fornecedor || '— Sem fornecedor —'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {entry.empresa} · {entry.departamento}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {formatBRL(entry.orcado)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      {formatBRL(entry.realizado)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap ${
                        entry.saldo < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatBRL(entry.saldo)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <EntryStatusChip status={entry.status} />
                    </td>
                    {canEdit && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDrawer(entry)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded"
                            title="Editar lançamento"
                            aria-label={`Editar ${entry.descricao}`}
                          >
                            <Edit3 className="w-3 h-3" aria-hidden="true" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openNewDrawer(entry)}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            title="Duplicar lançamento"
                            aria-label={`Duplicar ${entry.descricao}`}
                          >
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(entry)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded"
                            title="Excluir lançamento"
                            aria-label={`Excluir ${entry.descricao}`}
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                            <span>Excluir</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    {state.entries.length === 0 ? (
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-10 h-10 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-700 dark:text-blue-400">
                          <FileUp className="w-5 h-5" />
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          Nenhum lançamento cadastrado
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          A base foi limpa e está pronta para receber sua planilha corporativa (.xlsx / .csv) ou novos lançamentos manuais.
                        </p>
                        {canEdit && (
                          <div className="flex justify-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setImportModalOpen(true)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                            >
                              <FileUp className="w-3.5 h-3.5" />
                              <span>Importar Planilha</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openNewDrawer()}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Novo Lançamento</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      'Nenhum lançamento encontrado para os filtros aplicados.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals Row (excluding Cancelado) */}
            {filteredEntries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-semibold">
                  <td colSpan={3} className="py-3 px-3 text-slate-800 dark:text-slate-200">
                    Totais do filtro ({totals.validCount} válido(s), cancelados excluídos)
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatBRL(totals.orcado)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatBRL(totals.realizado)}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      totals.saldo < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatBRL(totals.saldo)}
                  </td>
                  <td colSpan={canEdit ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination (50 per page) */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span className="tabular-nums">
            Página {safePage} de {totalPages} · {PAGE_SIZE} itens por página
          </span>
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span>Próxima</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Side Form Drawer (Create / Edit) */}
      {drawerOpen && canEdit && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 dark:bg-black/70">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingEntry ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-5 space-y-4 text-xs flex-1">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Competência (AAAA-MM) *
                  </label>
                  <input
                    type="month"
                    required
                    value={formComp}
                    onChange={(e) => setFormComp(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data de Pagamento
                  </label>
                  <input
                    type="date"
                    value={formPayDate}
                    onChange={(e) => setFormPayDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Empresa *
                  </label>
                  <select
                    required
                    value={formEmpresa}
                    onChange={(e) => setFormEmpresa(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {state.registries.empresas.map((emp) => (
                      <option key={emp.id} value={emp.nome}>
                        {emp.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Departamento *
                  </label>
                  <select
                    required
                    value={formDepto}
                    onChange={(e) => setFormDepto(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {state.registries.departamentos.map((d) => (
                      <option key={d.id} value={d.nome}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Categoria *
                </label>
                <select
                  required
                  value={formCat}
                  onChange={(e) => setFormCat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {state.registries.categorias.map((c) => (
                    <option key={c.id} value={c.nome}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição *
                </label>
                <input
                  type="text"
                  required
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Ex: Licença mensal plataforma de clima"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Fornecedor (digite novo ou escolha do cadastro)
                </label>
                <input
                  type="text"
                  list="fornecedores-datalist"
                  value={formFornecedor}
                  onChange={(e) => handleFornecedorChange(e.target.value)}
                  placeholder="Opcional — novo fornecedor será cadastrado automaticamente"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <datalist id="fornecedores-datalist">
                  {state.registries.fornecedores.map((f) => (
                    <option key={f.id} value={f.nome} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contrato Vinculado {formFornecedor ? `(filtrado por ${formFornecedor})` : ''}
                </label>
                <select
                  value={formContratoId}
                  onChange={(e) => setFormContratoId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="">Sem vínculo contratual</option>
                  {matchingContractsForForm.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fornecedor} · {c.empresa} ({formatBRL(c.valorMensal)}/mês)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Orçado (R$)
                  </label>
                  <input
                    type="text"
                    value={formOrcado}
                    onChange={(e) => setFormOrcado(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Realizado (R$)
                  </label>
                  <input
                    type="text"
                    value={formRealizado}
                    onChange={(e) => setFormRealizado(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Saldo Calculado
                  </label>
                  <div
                    className={`px-3 py-2 font-mono font-semibold bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg tabular-nums ${
                      previewFormSaldo < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatBRL(previewFormSaldo)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as EntryStatus)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {ENTRY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pt-5">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={formRecorrente}
                      onChange={(e) => setFormRecorrente(e.target.checked)}
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>Lançamento mensal recorrente</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              {editingEntry && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                  <div>
                    Criado por <strong>{editingEntry.criadoPor}</strong> em{' '}
                    {formatDateTimeBR(editingEntry.criadoEm)}
                  </div>
                  <div>
                    Última alteração por <strong>{editingEntry.atualizadoPor}</strong> em{' '}
                    {formatDateTimeBR(editingEntry.atualizadoEm)}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                {editingEntry ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      setDeleteTarget(editingEntry);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-950"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Excluir</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                  >
                    {saving ? 'Salvando...' : editingEntry ? 'Salvar Alterações' : 'Criar Lançamento'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Recurring Entries Modal */}
      {recModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Gerar Lançamentos Recorrentes
              </h3>
              <button
                type="button"
                onClick={() => setRecModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRunRecurring} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Copia todos os lançamentos marcados como <strong>Recorrente</strong> da competência de origem para o mês de destino com status <strong>Previsto</strong> (sem duplicar os que já existem no destino).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mês de Origem
                  </label>
                  <input
                    type="month"
                    required
                    value={recSource}
                    onChange={(e) => setRecSource(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Mês de Destino
                  </label>
                  <input
                    type="month"
                    required
                    value={recTarget}
                    onChange={(e) => setRecTarget(e.target.value)}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {recResult && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-900 dark:text-blue-200">
                  {recResult}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={recLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                >
                  {recLoading ? 'Gerando...' : 'Gerar Recorrentes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir Lançamento"
        description={
          deleteTarget
            ? `Tem certeza que deseja excluir "${deleteTarget.descricao}" (${formatCompetenciaBR(
                deleteTarget.competencia
              )} · ${formatBRL(deleteTarget.orcado)})? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir Lançamento"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ImportSpreadsheetModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        state={state}
        onImportEntries={onImportEntries}
        onSuccess={(count) =>
          setImportNotice(
            `${count} lançamento(s) importado(s) da planilha e sincronizados no banco compartilhado.`
          )
        }
      />
    </div>
  );
}
