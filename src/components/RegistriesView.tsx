import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  FileUp,
  GitMerge,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  isNonSupplierText,
  matchAgainstRegistry,
  MatchResult,
  normalizeForMatch,
  parseBRDate,
  parseBRNumber,
  parseCompetencia,
  stripAccents,
} from '../shared/normalization';
import {
  DatabaseState,
  Entry,
  RegistryItem,
  RegistryType,
} from '../types/buddha';
import { formatBRL, formatCompetenciaBR, formatDateBR } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportSpreadsheetModal } from './ImportSpreadsheetModal';

interface RegistriesViewProps {
  state: DatabaseState;
  isAdmin: boolean;
  canEdit: boolean;
  onCreateRegistry: (type: RegistryType, nome: string, apelidos: string[]) => Promise<unknown>;
  onUpdateRegistry: (
    type: RegistryType,
    id: string,
    nome: string,
    apelidos: string[]
  ) => Promise<unknown>;
  onMergeRegistry: (type: RegistryType, sourceId: string, targetId: string) => Promise<unknown>;
  onDeleteRegistry: (type: RegistryType, id: string) => Promise<unknown>;
  onImportEntries: (
    entries: Array<
      Omit<Entry, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>
    >
  ) => Promise<{ importedCount: number }>;
  onClearAllData?: () => Promise<unknown>;
}

const REGISTRY_TABS: Array<{ id: RegistryType; label: string }> = [
  { id: 'empresas', label: 'Empresas' },
  { id: 'departamentos', label: 'Departamentos' },
  { id: 'categorias', label: 'Categorias' },
  { id: 'fornecedores', label: 'Fornecedores' },
];

interface PreviewRow {
  rowIndex: number;
  selected: boolean;
  isDuplicate: boolean;
  competencia: string;
  dataPagamento: string;
  descricao: string;
  recorrente: boolean;
  orcado: number;
  realizado: number;
  saldo: number;
  catMatch: MatchResult;
  empMatch: MatchResult;
  depMatch: MatchResult;
  forMatch: MatchResult;
}

function findColumnKey(headers: string[], aliases: string[]): string | undefined {
  const norm = (s: string) =>
    stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map(headers.map((h) => [norm(h), h]));
  for (const a of aliases) {
    const exact = map.get(a);
    if (exact) return exact;
  }
  for (const [k, orig] of map.entries()) {
    if (aliases.some((a) => k.includes(a))) return orig;
  }
  return undefined;
}

export function RegistriesView({
  state,
  isAdmin,
  canEdit,
  onCreateRegistry,
  onUpdateRegistry,
  onMergeRegistry,
  onDeleteRegistry,
  onImportEntries,
  onClearAllData,
}: RegistriesViewProps) {
  const [section, setSection] = useState<'listas' | 'importar'>('listas');
  const [activeType, setActiveType] = useState<RegistryType>('empresas');

  // Create / Rename modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryItem | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formApelidos, setFormApelidos] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  // Merge modal
  const [mergeSource, setMergeSource] = useState<RegistryItem | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  // Delete confirm & in-use info
  const [deleteTarget, setDeleteTarget] = useState<{ type: RegistryType; item: RegistryItem } | null>(
    null
  );
  const [blockedDelete, setBlockedDelete] = useState<{ item: RegistryItem; usage: number } | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  // Importer state
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Clear all data
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearSuccessMsg, setClearSuccessMsg] = useState<string | null>(null);

  const usageMap = useMemo(() => {
    const counts = new Map<string, number>();
    const items = state.registries[activeType];

    for (const item of items) {
      const target = item.nome.toLowerCase();
      let count = 0;
      if (activeType === 'categorias') {
        count += state.entries.filter((e) => e.categoria.toLowerCase() === target).length;
        count += state.contracts.filter((c) => c.categoria.toLowerCase() === target).length;
        for (const p of Object.values(state.plans)) {
          if (p.tetos[item.nome]?.some((v) => v > 0)) count += 1;
        }
      } else if (activeType === 'empresas') {
        count += state.entries.filter((e) => e.empresa.toLowerCase() === target).length;
        count += state.contracts.filter((c) => c.empresa.toLowerCase() === target).length;
      } else if (activeType === 'departamentos') {
        count += state.entries.filter((e) => e.departamento.toLowerCase() === target).length;
        count += state.contracts.filter((c) => c.departamento.toLowerCase() === target).length;
      } else if (activeType === 'fornecedores') {
        count += state.entries.filter((e) => e.fornecedor.toLowerCase() === target).length;
        count += state.contracts.filter((c) => c.fornecedor.toLowerCase() === target).length;
      }
      counts.set(item.id, count);
    }
    return counts;
  }, [state, activeType]);

  const openNewItemModal = () => {
    setEditingItem(null);
    setFormNome('');
    setFormApelidos('');
    setModalError(null);
    setEditModalOpen(true);
  };

  const openEditItemModal = (item: RegistryItem) => {
    setEditingItem(item);
    setFormNome(item.nome);
    setFormApelidos(item.apelidos.join(', '));
    setModalError(null);
    setEditModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const aliases = formApelidos
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setModalSaving(true);
    try {
      if (editingItem) {
        await onUpdateRegistry(activeType, editingItem.id, formNome.trim(), aliases);
      } else {
        await onCreateRegistry(activeType, formNome.trim(), aliases);
      }
      setEditModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Erro ao salvar cadastro.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleConfirmMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSource || !mergeTargetId) return;
    setMerging(true);
    try {
      await onMergeRegistry(activeType, mergeSource.id, mergeTargetId);
      setMergeSource(null);
    } finally {
      setMerging(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteRegistry(deleteTarget.type, deleteTarget.item.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmClearAll = async () => {
    if (!onClearAllData) return;
    setClearing(true);
    try {
      await onClearAllData();
      setClearSuccessMsg(
        'Todos os dados fictícios foram apagados com sucesso. A plataforma está limpa para novos registros.'
      );
      setConfirmClearAllOpen(false);
    } finally {
      setClearing(false);
    }
  };

  // Download sample legacy spreadsheet (.xlsx) to test importer
  const handleDownloadSampleLegacy = () => {
    const sampleRows = [
      {
        Data: '10/2026',
        Categoria: 'Consultorias & Contabilidade',
        Descrição: 'Assessoria Contábil Outubro',
        Fornecedor: 'ASSESCON',
        'Data de Pagamento': '10/10/2026',
        Recorrente: 'Sim',
        Empresa: 'JG Parthners',
        Departamento: 'G&G',
        Orçado: 9500,
        Realizado: 9850,
        Saldo: -350,
      },
      {
        Data: '11/2026',
        Categoria: 'Recrutamento & Seleção',
        Descrição: 'Assinatura Portal Catho Novembro',
        Fornecedor: 'Catho Online',
        'Data de Pagamento': '',
        Recorrente: 'Sim',
        Empresa: 'Catho',
        Departamento: '',
        Orçado: 2500,
        Realizado: 0,
        Saldo: 2500,
      },
      {
        Data: '11/2026',
        Categoria: 'Cultura, Clima & Eventos',
        Descrição: 'Bolo aniversariantes',
        Fornecedor: 'Bolo aniversariantes',
        'Data de Pagamento': '18/11/2026',
        Recorrente: 'Sim',
        Empresa: 'Jg Partners ltda',
        Departamento: 'Gente & Gestão.',
        Orçado: 450,
        Realizado: 465,
        Saldo: -15,
      },
      {
        Data: '11/2026',
        Categoria: 'Sistemas & HRTech',
        Descrição: 'Licença Ponto Eletrônico Novembro',
        Fornecedor: 'CONTROLID',
        'Data de Pagamento': '15/11/2026',
        Recorrente: 'Sim',
        Empresa: 'JG PARTNERS',
        Departamento: 'G&G',
        Orçado: 1500,
        Realizado: 1480,
        Saldo: 20,
      },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha Antiga');
    XLSX.writeFile(wb, 'modelo_planilha_antiga_dho.xlsx');
  };

  // Parse uploaded .xlsx or .csv file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    setImportFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        setImportError('A planilha enviada não possui abas válidas.');
        return;
      }
      const ws = wb.Sheets[firstSheet];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      if (jsonRows.length === 0) {
        setImportError('Nenhuma linha de dados encontrada na primeira aba da planilha.');
        return;
      }

      const headers = Object.keys(jsonRows[0]);
      const colData = findColumnKey(headers, ['data', 'competencia', 'mesano']);
      const colCat = findColumnKey(headers, ['categoria']);
      const colDesc = findColumnKey(headers, ['descricao', 'desc', 'historico', 'item']);
      const colForn = findColumnKey(headers, ['fornecedor', 'parceiro']);
      const colPgto = findColumnKey(headers, ['datapagamento', 'pagamento', 'datapgto']);
      const colRec = findColumnKey(headers, ['recorrente', 'recorrencia']);
      const colEmp = findColumnKey(headers, ['empresa', 'unidade']);
      const colDep = findColumnKey(headers, ['departamento', 'area', 'depto']);
      const colOrc = findColumnKey(headers, ['orcado', 'previsto']);
      const colReal = findColumnKey(headers, ['realizado', 'pago']);

      if (!colData || !colDesc) {
        setImportError(
          'Colunas obrigatórias não encontradas ("Data" e "Descrição"). Verifique o cabeçalho da planilha.'
        );
        return;
      }

      const parsed: PreviewRow[] = [];

      jsonRows.forEach((rawRow, idx) => {
        const comp = parseCompetencia(rawRow[colData]);
        const desc = String(rawRow[colDesc] || '').trim();
        if (!comp || !desc) return;

        const rawCat = colCat ? String(rawRow[colCat] || '').trim() : '';
        const rawEmp = colEmp ? String(rawRow[colEmp] || '').trim() : '';
        const rawDep = colDep ? String(rawRow[colDep] || '').trim() : '';
        const rawForn = colForn ? String(rawRow[colForn] || '').trim() : '';
        const payDate = colPgto ? parseBRDate(rawRow[colPgto]) : '';
        const recStr = colRec ? stripAccents(String(rawRow[colRec] || '')).toLowerCase() : '';
        const recorrente = recStr === 'sim' || recStr === 's' || recStr === 'true' || recStr === '1';

        const orcado = colOrc ? Math.max(0, parseBRNumber(rawRow[colOrc])) : 0;
        const realizado = colReal ? Math.round(parseBRNumber(rawRow[colReal]) * 100) / 100 : 0;
        const saldo = Math.round((orcado - realizado) * 100) / 100;

        const catMatch = matchAgainstRegistry(rawCat || 'Benefícios & Saúde', state.registries.categorias);
        const empMatch = matchAgainstRegistry(
          rawEmp || 'JG PARTNERS LTDA',
          state.registries.empresas,
          { uppercaseNew: true }
        );
        const depMatch = matchAgainstRegistry(
          rawDep || 'Gente & Gestão',
          state.registries.departamentos
        );

        // Non-supplier text rule
        const supplierEmpty = isNonSupplierText(desc) || isNonSupplierText(rawForn);
        const forMatch: MatchResult = supplierEmpty
          ? { original: rawForn, oficial: '', matchType: 'vazio', similarity: 0 }
          : matchAgainstRegistry(rawForn, state.registries.fornecedores, {
              uppercaseNew: true,
              emptyIfNonSupplier: true,
            });

        // Duplicate detection: same competencia, descricao, fornecedor, empresa e valor
        const isDuplicate = state.entries.some(
          (existing) =>
            existing.competencia === comp &&
            normalizeForMatch(existing.descricao) === normalizeForMatch(desc) &&
            normalizeForMatch(existing.fornecedor) === normalizeForMatch(forMatch.oficial) &&
            normalizeForMatch(existing.empresa) === normalizeForMatch(empMatch.oficial) &&
            (Math.abs(existing.realizado - realizado) < 0.01 &&
              Math.abs(existing.orcado - orcado) < 0.01)
        );

        parsed.push({
          rowIndex: idx + 2,
          selected: !isDuplicate,
          isDuplicate,
          competencia: comp,
          dataPagamento: payDate,
          descricao: desc,
          recorrente,
          orcado,
          realizado,
          saldo,
          catMatch,
          empMatch,
          depMatch,
          forMatch,
        });
      });

      if (parsed.length === 0) {
        setImportError('Nenhuma linha válida com Data e Descrição foi identificada.');
        return;
      }

      setPreviewRows(parsed);
    } catch {
      setImportError('Falha ao ler o arquivo. Certifique-se de enviar um .xlsx ou .csv válido.');
    } finally {
      e.target.value = '';
    }
  };

  const previewStats = useMemo(() => {
    const selectedCount = previewRows.filter((r) => r.selected).length;
    const duplicatesCount = previewRows.filter((r) => r.isDuplicate).length;
    const newItems = new Set<string>();
    const autoMapped = previewRows.filter(
      (r) =>
        r.empMatch.matchType === 'apelido' ||
        r.empMatch.matchType === 'similaridade' ||
        r.depMatch.matchType === 'apelido' ||
        r.depMatch.matchType === 'similaridade' ||
        r.forMatch.matchType === 'apelido' ||
        r.forMatch.matchType === 'similaridade' ||
        r.catMatch.matchType === 'apelido' ||
        r.catMatch.matchType === 'similaridade'
    ).length;

    for (const r of previewRows) {
      if (r.catMatch.matchType === 'novo') newItems.add(`Cat: ${r.catMatch.oficial}`);
      if (r.empMatch.matchType === 'novo') newItems.add(`Emp: ${r.empMatch.oficial}`);
      if (r.depMatch.matchType === 'novo') newItems.add(`Depto: ${r.depMatch.oficial}`);
      if (r.forMatch.matchType === 'novo') newItems.add(`Forn: ${r.forMatch.oficial}`);
    }

    return {
      total: previewRows.length,
      selectedCount,
      duplicatesCount,
      autoMapped,
      newItems: Array.from(newItems),
    };
  }, [previewRows]);

  const handleConfirmImport = async () => {
    const chosen = previewRows.filter((r) => r.selected);
    if (chosen.length === 0) return;

    setImporting(true);
    setImportError(null);
    try {
      const payload = chosen.map((r) => ({
        competencia: r.competencia,
        dataPagamento: r.dataPagamento,
        categoria: r.catMatch.oficial,
        descricao: r.descricao,
        fornecedor: r.forMatch.oficial,
        empresa: r.empMatch.oficial,
        departamento: r.depMatch.oficial,
        recorrente: r.recorrente,
        orcado: r.orcado,
        realizado: r.realizado,
        saldo: r.saldo,
        status: (r.realizado > 0 ? 'Pago' : 'Previsto') as Entry['status'],
        obs: `Importado de ${importFileName}`,
      }));

      const res = await onImportEntries(payload);
      setImportSuccess(
        `${res.importedCount} lançamento(s) importado(s) e padronizado(s) com sucesso.`
      );
      setPreviewRows([]);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao gravar importação.');
    } finally {
      setImporting(false);
    }
  };

  const renderMatchBadge = (m: MatchResult) => {
    if (m.matchType === 'vazio') {
      return <span className="text-slate-400">— Vazio —</span>;
    }
    if (m.matchType === 'exato') {
      return <span className="text-slate-800 dark:text-slate-200">{m.oficial}</span>;
    }
    if (m.matchType === 'apelido') {
      return (
        <div>
          <div className="font-medium text-blue-700 dark:text-blue-400">{m.oficial}</div>
          <div className="text-[10px] text-slate-400">De: "{m.original}" (Apelido)</div>
        </div>
      );
    }
    if (m.matchType === 'similaridade') {
      return (
        <div>
          <div className="font-medium text-emerald-700 dark:text-emerald-400">{m.oficial}</div>
          <div className="text-[10px] text-slate-400">
            De: "{m.original}" ({m.similarity}% sim.)
          </div>
        </div>
      );
    }
    return (
      <div>
        <div className="font-medium text-amber-700 dark:text-amber-400">{m.oficial}</div>
        <div className="text-[10px] text-amber-600 dark:text-amber-500">Novo no cadastro</div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Section Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setSection('listas')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              section === 'listas'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Cadastros & Dicionário de Apelidos
          </button>
          <button
            type="button"
            onClick={() => setSection('importar')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              section === 'importar'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Importar Planilha (.xlsx / .csv)
          </button>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && onClearAllData && (
            <button
              type="button"
              onClick={() => setConfirmClearAllOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Zerar Dados Fictícios</span>
            </button>
          )}

          {!isAdmin && (
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Renomear, mesclar e excluir cadastros é exclusivo do Administrador</span>
            </div>
          )}
        </div>
      </div>

      {clearSuccessMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{clearSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setClearSuccessMsg(null)}
            className="p-1 text-emerald-700 dark:text-emerald-400 hover:opacity-75 rounded"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: LISTAS EDITÁVEIS */}
      {section === 'listas' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap p-1 bg-slate-100 dark:bg-slate-800 rounded-lg gap-0.5">
              {REGISTRY_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveType(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    activeType === t.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.label} ({state.registries[t.id].length})
                </button>
              ))}
            </div>

            {(isAdmin || (canEdit && activeType === 'fornecedores')) && (
              <button
                type="button"
                onClick={openNewItemModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Novo Item</span>
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4">Nome Oficial</th>
                    <th className="py-2.5 px-4">Apelidos (Variações Reconhecidas)</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">Registros em Uso</th>
                    {isAdmin && (
                      <th className="py-2.5 px-4 text-right whitespace-nowrap sticky right-0 bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                        Ações
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {state.registries[activeType].map((item) => {
                    const usage = usageMap.get(item.id) || 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {item.nome}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {item.apelidos.length > 0 ? item.apelidos.join(' · ') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {usage}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditItemModal(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded"
                                title="Editar nome oficial e apelidos"
                              >
                                <Edit3 className="w-3 h-3" aria-hidden="true" />
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMergeSource(item);
                                  const firstOther = state.registries[activeType].find(
                                    (x) => x.id !== item.id
                                  );
                                  setMergeTargetId(firstOther?.id || '');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                title="Mesclar com outro item"
                              >
                                <GitMerge className="w-3 h-3" aria-hidden="true" />
                                <span>Mesclar</span>
                              </button>
                              <button
                                type="button"
                                title={
                                  usage > 0
                                    ? `Em uso por ${usage} registro(s) — clique para ver opções`
                                    : 'Excluir item do cadastro'
                                }
                                onClick={() => {
                                  if (usage > 0) {
                                    setBlockedDelete({ item, usage });
                                  } else {
                                    setDeleteTarget({ type: activeType, item });
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded ${
                                  usage > 0
                                    ? 'text-red-500/70 dark:text-red-400/70 hover:bg-red-50 dark:hover:bg-red-950/40'
                                    : 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50'
                                }`}
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
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: IMPORTADOR DE PLANILHA */}
      {section === 'importar' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Importador Inteligente (.xlsx ou .csv) — Padrão da Ferramenta Anterior
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Colunas esperadas: Data, Categoria, Descrição, Fornecedor, Data de Pagamento, Recorrente, Empresa, Departamento, Orçado, Realizado e Saldo.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSampleLegacy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Baixar Planilha Exemplo (.xlsx)</span>
                </button>

                {canEdit && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setImportModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100"
                    >
                      <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Abrir Modal com Mapeamento</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                    >
                      <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Selecionar Planilha (.xlsx / .csv)</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-lg text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                {/* Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">Linhas Lidas</div>
                    <div className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {previewStats.total}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">
                      Padronizações (Apelido / ≥80%)
                    </div>
                    <div className="font-mono text-lg font-semibold text-blue-700 dark:text-blue-400">
                      {previewStats.autoMapped}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">Novos Cadastros</div>
                    <div className="font-mono text-lg font-semibold text-amber-700 dark:text-amber-400">
                      {previewStats.newItems.length}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">
                      Duplicatas Detectadas (Omitidas)
                    </div>
                    <div className="font-mono text-lg font-semibold text-red-700 dark:text-red-400">
                      {previewStats.duplicatesCount}
                    </div>
                  </div>
                </div>

                {previewStats.newItems.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-amber-900 dark:text-amber-200">
                    <strong>Novos itens que serão incluídos nos cadastros:</strong>{' '}
                    {previewStats.newItems.join(' · ')}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">
                    Arquivo: <strong>{importFileName}</strong> ·{' '}
                    <strong>{previewStats.selectedCount}</strong> linha(s) selecionada(s) para importação
                  </span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewRows([])}
                      className="px-3 py-1.5 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      Cancelar Prévia
                    </button>
                    <button
                      type="button"
                      disabled={importing || previewStats.selectedCount === 0}
                      onClick={handleConfirmImport}
                      className="px-4 py-1.5 font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
                    >
                      {importing
                        ? 'Gravando...'
                        : `Confirmar Importação (${previewStats.selectedCount})`}
                    </button>
                  </div>
                </div>

                {/* Preview Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-[420px]">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2 px-3">Importar</th>
                        <th className="py-2 px-3">Comp.</th>
                        <th className="py-2 px-3">Descrição</th>
                        <th className="py-2 px-3">Categoria (Mapeada)</th>
                        <th className="py-2 px-3">Empresa (Mapeada)</th>
                        <th className="py-2 px-3">Depto (Mapeado)</th>
                        <th className="py-2 px-3">Fornecedor (Mapeado)</th>
                        <th className="py-2 px-3 text-right">Orçado</th>
                        <th className="py-2 px-3 text-right">Realizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewRows.map((r, i) => (
                        <tr
                          key={r.rowIndex}
                          className={
                            r.isDuplicate
                              ? 'bg-red-50/40 dark:bg-red-950/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }
                        >
                          <td className="py-2 px-3 whitespace-nowrap">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={r.selected}
                                onChange={() =>
                                  setPreviewRows((prev) =>
                                    prev.map((row, idx) =>
                                      idx === i ? { ...row, selected: !row.selected } : row
                                    )
                                  )
                                }
                                className="rounded border-slate-300 text-blue-700"
                              />
                              {r.isDuplicate && (
                                <span className="text-[10px] font-semibold text-red-700 dark:text-red-400">
                                  Duplicata
                                </span>
                              )}
                            </label>
                          </td>
                          <td className="py-2 px-3 font-mono whitespace-nowrap">
                            <div>{formatCompetenciaBR(r.competencia)}</div>
                            {r.dataPagamento && (
                              <div className="text-[10px] text-slate-400">
                                {formatDateBR(r.dataPagamento)}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 max-w-[180px] truncate">{r.descricao}</td>
                          <td className="py-2 px-3">{renderMatchBadge(r.catMatch)}</td>
                          <td className="py-2 px-3">{renderMatchBadge(r.empMatch)}</td>
                          <td className="py-2 px-3">{renderMatchBadge(r.depMatch)}</td>
                          <td className="py-2 px-3">{renderMatchBadge(r.forMatch)}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatBRL(r.orcado)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatBRL(r.realizado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Rename Registry Item Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingItem ? 'Renomear & Editar Apelidos' : 'Novo Item no Cadastro'}
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome Oficial *
                </label>
                <input
                  type="text"
                  required
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
                {editingItem && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Ao renomear, todos os lançamentos, contratos e planejamentos serão atualizados automaticamente, e o nome anterior será salvo como apelido.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Apelidos (separados por vírgula)
                </label>
                <textarea
                  rows={2}
                  value={formApelidos}
                  onChange={(e) => setFormApelidos(e.target.value)}
                  placeholder="Ex: JG Parthners, JG, Jg Partners ltda"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="px-4 py-2 font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                >
                  {modalSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Registry Item Modal */}
      {mergeSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Mesclar Cadastro
              </h3>
              <button
                type="button"
                onClick={() => setMergeSource(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmMerge} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Mesclar <strong>{mergeSource.nome}</strong> dentro de um nome oficial. Todos os lançamentos, contratos e planejamentos serão migrados, e "{mergeSource.nome}" passará a ser um apelido do destino.
              </p>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Item Oficial de Destino
                </label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {state.registries[activeType]
                    .filter((x) => x.id !== mergeSource.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMergeSource(null)}
                  className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={merging || !mergeTargetId}
                  className="px-4 py-2 font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                >
                  {merging ? 'Mesclando...' : 'Mesclar e Propagar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir Item do Cadastro"
        description={
          deleteTarget
            ? `Confirma a exclusão de "${deleteTarget.item.nome}"? Este item não possui registros vinculados.`
            : ''
        }
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {blockedDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Exclusão Protegida
              </h3>
              <button
                type="button"
                onClick={() => setBlockedDelete(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <p>
                Não é possível excluir <strong>{blockedDelete.item.nome}</strong> diretamente pois existem{' '}
                <strong>{blockedDelete.usage} registro(s)</strong> (lançamentos, contratos ou planejamento) vinculados a este item.
              </p>
              <p>
                Você pode <strong>Editar</strong> o nome/apelidos ou <strong>Mesclar</strong> este item com outro cadastro oficial (migrando todos os vínculos automaticamente).
              </p>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBlockedDelete(null)}
                  className="px-3.5 py-2 font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const it = blockedDelete.item;
                    setBlockedDelete(null);
                    openEditItemModal(it);
                  }}
                  className="px-3.5 py-2 font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg"
                >
                  Editar Item
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const it = blockedDelete.item;
                    setBlockedDelete(null);
                    setMergeSource(it);
                    const firstOther = state.registries[activeType].find((x) => x.id !== it.id);
                    setMergeTargetId(firstOther?.id || '');
                  }}
                  className="px-3.5 py-2 font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  Mesclar com Outro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClearAllOpen}
        title="Apagar Todos os Dados Fictícios"
        description="Confirma a exclusão de todos os lançamentos, contratos e tetos orçamentários fictícios da plataforma? Esta ação deixará a plataforma 100% limpa para receber os seus dados reais."
        confirmLabel="Zerar e Limpar Tudo"
        loading={clearing}
        onConfirm={handleConfirmClearAll}
        onCancel={() => setConfirmClearAllOpen(false)}
      />

      <ImportSpreadsheetModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        state={state}
        onImportEntries={onImportEntries}
        onSuccess={(count) =>
          setImportSuccess(
            `${count} lançamento(s) importado(s) da planilha e sincronizados com sucesso.`
          )
        }
      />
    </div>
  );
}
