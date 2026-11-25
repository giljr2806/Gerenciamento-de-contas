import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { DatabaseState, Entry, EntryStatus, RegistryItem } from '../types/buddha';
import { formatBRL, formatCompetenciaBR, formatDateBR } from '../utils/format';

interface ImportSpreadsheetModalProps {
  open: boolean;
  onClose: () => void;
  state: DatabaseState;
  onImportEntries: (
    entries: Array<
      Omit<Entry, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>
    >
  ) => Promise<{ importedCount: number }>;
  onSuccess?: (importedCount: number) => void;
}

interface ColumnMapping {
  data: string;
  categoria: string;
  descricao: string;
  fornecedor: string;
  dataPagamento: string;
  recorrente: string;
  empresa: string;
  departamento: string;
  orcado: string;
  realizado: string;
  status: string;
  linhaOpex: string;
  subarea: string;
  macroArea: string;
  categoriaTeto: string;
}

interface PreviewRow {
  linhaOpex: string;
  subarea: string;
  macroArea: string;
  categoriaTeto: string;
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
  rawCategoria: string;
  catMatch: MatchResult;
  empMatch: MatchResult;
  depMatch: MatchResult;
  forMatch: MatchResult;
  status: EntryStatus;
}

const DEFAULT_CATEGORY_HINTS: Record<string, string> = {
  'consultorias & servicos terceirizados': 'Consultorias & Contabilidade',
  'tecnologia & sistemas de rh': 'Sistemas & HRTech',
  'ead & plataformas': 'Treinamento & Desenvolvimento',
  'endomarketing & eventos': 'Cultura, Clima & Eventos',
  'folha & encargos': 'Folha, Encargos & Obrigações',
  'beneficios': 'Benefícios & Saúde',
};

const DEFAULT_SUPPLIER_HINTS: Record<string, string> = {
  'sults tecnologia ltda': 'SULTS',
  'sults tecnologia': 'SULTS',
  'praxis business conteudos': 'PRAXIS BUSINESS',
};

/**
 * Procura a coluna pelos apelidos, em ordem de prioridade: primeiro nome exato, depois
 * nome que contém o apelido. Colunas já usadas por outro campo são ignoradas.
 */
function findColumnKey(headers: string[], aliases: string[], used: Set<string>): string {
  const norm = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const entries = headers.map((h) => [norm(h), h] as const).filter(([, h]) => !used.has(h));
  for (const a of aliases) {
    const exact = entries.find(([k]) => k === a);
    if (exact) {
      used.add(exact[1]);
      return exact[1];
    }
  }
  for (const a of aliases) {
    const partial = entries.find(([k]) => k.includes(a));
    if (partial) {
      used.add(partial[1]);
      return partial[1];
    }
  }
  return '';
}

function buildAutoMapping(headers: string[]): ColumnMapping {
  const used = new Set<string>();
  // Campos mais específicos primeiro, para não "roubarem" colunas de nomes parecidos
  // (ex.: "Categoria Teto" vs "Categoria", "Macro área" vs "área").
  const categoriaTeto = findColumnKey(headers, ['categoriateto', 'categteto', 'tetocategoria'], used);
  const macroArea = findColumnKey(headers, ['macroarea', 'macro'], used);
  const linhaOpex = findColumnKey(headers, ['linhaopex', 'opex'], used);
  const dataPagamento = findColumnKey(
    headers,
    ['datadepagamento', 'datapagamento', 'datapgto', 'pagamento', 'vencimento'],
    used
  );
  const data = findColumnKey(headers, ['competencia', 'mesano', 'data', 'mes'], used);
  const categoria = findColumnKey(headers, ['categoria', 'cat'], used);
  const descricao = findColumnKey(headers, ['descricao', 'desc', 'historico', 'item'], used);
  const fornecedor = findColumnKey(headers, ['fornecedor', 'parceiro'], used);
  const recorrente = findColumnKey(headers, ['recorrente', 'recorrencia'], used);
  const empresa = findColumnKey(headers, ['empresa', 'unidade', 'cnpj'], used);
  // 1ª coluna "Departamento" = departamento; a 2ª (Departamento_1, etc.) = subárea.
  const departamento = findColumnKey(headers, ['departamento', 'depto', 'setor'], used);
  const subarea = findColumnKey(
    headers,
    ['subarea', 'departamento1', 'departamento2', 'depto1', 'depto2', 'area'],
    used
  );
  const orcado = findColumnKey(headers, ['orcado', 'previsto', 'budget'], used);
  const realizado = findColumnKey(headers, ['realizado', 'pago', 'valor'], used);
  const status = findColumnKey(headers, ['status', 'situacao'], used);
  return {
    data,
    categoria,
    descricao,
    fornecedor,
    dataPagamento,
    recorrente,
    empresa,
    departamento,
    orcado,
    realizado,
    status,
    linhaOpex,
    subarea,
    macroArea,
    categoriaTeto,
  };
}

function parseStatusCell(raw: unknown): EntryStatus | '' {
  const s = stripAccents(String(raw ?? '')).toLowerCase().trim();
  if (s === 'pago' || s === 'paga') return 'Pago';
  if (s === 'previsto' || s === 'prevista' || s === 'pendente') return 'Previsto';
  if (s === 'aprovado' || s === 'aprovada') return 'Aprovado';
  if (s === 'cancelado' || s === 'cancelada') return 'Cancelado';
  return '';
}

export function ImportSpreadsheetModal({
  open,
  onClose,
  state,
  onImportEntries,
  onSuccess,
}: ImportSpreadsheetModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    data: '',
    categoria: '',
    descricao: '',
    fornecedor: '',
    dataPagamento: '',
    recorrente: '',
    empresa: '',
    departamento: '',
    orcado: '',
    realizado: '',
    status: '',
    linhaOpex: '',
    subarea: '',
    macroArea: '',
    categoriaTeto: '',
  });
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Fill options
  const [defaultEmpresa, setDefaultEmpresa] = useState(
    state.registries.empresas[0]?.nome || 'JG PARTNERS LTDA'
  );
  const [defaultDepto, setDefaultDepto] = useState(
    state.registries.departamentos[0]?.nome || 'Gente & Gestão'
  );
  const [defaultCategoria, setDefaultCategoria] = useState(
    state.registries.categorias[0]?.nome || 'Benefícios & Saúde'
  );
  const [statusMode, setStatusMode] = useState<'auto' | EntryStatus>('auto');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [allowNegativeRealized, setAllowNegativeRealized] = useState(true);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  // Manual row selection overrides: rowIndex -> boolean
  const [selectionOverrides, setSelectionOverrides] = useState<Record<number, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDefaultEmpresa((prev) => prev || state.registries.empresas[0]?.nome || 'JG PARTNERS LTDA');
    setDefaultDepto((prev) => prev || state.registries.departamentos[0]?.nome || 'Gente & Gestão');
    setDefaultCategoria((prev) => prev || state.registries.categorias[0]?.nome || 'Benefícios & Saúde');
  }, [open, state.registries]);

  const resetFileState = () => {
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setCategoryOverrides({});
    setSelectionOverrides({});
    setErrorMsg(null);
  };

  const loadSheetData = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (jsonRows.length === 0) {
      setHeaders([]);
      setRawRows([]);
      setErrorMsg(`A aba "${sheetName}" não possui linhas de dados.`);
      return;
    }
    const cols = Object.keys(jsonRows[0]);

    // Competência digitada como "jan-26" pode virar data (26/jan) no Excel. Quando a célula é
    // um número formatado como "mmm-aa" (texto exibido = mês-ano), usa o texto exibido.
    const compCol = buildAutoMapping(cols).data;
    const ref = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (compCol && ref) {
      const colIdx = ref.s.c + cols.indexOf(compCol);
      jsonRows.forEach((row, i) => {
        const cell = ws[XLSX.utils.encode_cell({ r: ref.s.r + 1 + i, c: colIdx })];
        const shown = typeof cell?.w === 'string' ? cell.w.trim() : '';
        if (cell?.t === 'n' && /^[A-Za-zÀ-ÿ]{3,9}[-/ ]\d{2,4}$/.test(shown)) {
          row[compCol] = shown;
        }
      });
    }
    setHeaders(cols);
    setRawRows(jsonRows);
    setMapping(buildAutoMapping(cols));
    setCategoryOverrides({});
    setSelectionOverrides({});
    setErrorMsg(null);
  };

  const handleFileObject = async (file: File) => {
    setErrorMsg(null);
    setFileName(file.name);
    // Limite de tamanho: reduz o risco de arquivos malformados/gigantes travarem o leitor de planilhas
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Arquivo muito grande. O limite é 5 MB.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      if (wb.SheetNames.length === 0) {
        setErrorMsg('A planilha enviada não possui abas válidas.');
        return;
      }

      const preferredSheet =
        wb.SheetNames.find((n) => stripAccents(n).toLowerCase().includes('lancamento')) ||
        wb.SheetNames[0];

      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      setSelectedSheet(preferredSheet);
      loadSheetData(wb, preferredSheet);
    } catch {
      setErrorMsg('Falha ao ler o arquivo. Envie um arquivo .xlsx, .xls ou .csv válido.');
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFileObject(file);
    e.target.value = '';
  };

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name);
    if (workbook) loadSheetData(workbook, name);
  };

  const handleDownloadSample = () => {
    const sampleRows = [
      {
        Data: '05/08/2026',
        Categoria: 'Consultorias & Serviços Terceirizados',
        Descrição: 'ASSESCON ASSESSORIA CONTABIL LTDA.',
        Fornecedor: 'ASSESCON ASSESSORIA CONTABIL LTDA.',
        'Data de Pagamento': '05/08/2026',
        Recorrente: 'Sim',
        Empresa: 'JG PARTNERS LTDA',
        Departamento: 'Gente & Gestão',
        Orçado: 4002,
        Realizado: 4002,
        Saldo: 0,
      },
      {
        Data: '18/08/2026',
        Categoria: 'EAD & Plataformas',
        Descrição: 'LUDOS PRO - JG',
        Fornecedor: 'LUDOS PRO',
        'Data de Pagamento': '24/08/2026',
        Recorrente: 'Sim',
        Empresa: 'JG PARTNERS LTDA',
        Departamento: 'Gente & Gestão',
        Orçado: 6556.74,
        Realizado: 6556.74,
        Saldo: 0,
      },
      {
        Data: '01/01/2026',
        Categoria: 'Consultorias & Serviços Terceirizados',
        Descrição: 'Custo por nova contratação',
        Fornecedor: 'PLUGAAE LTDA',
        'Data de Pagamento': '05/01/2026',
        Recorrente: 'Sim',
        Empresa: 'Jg Partners ltda',
        Departamento: 'Gente & Gestão',
        Orçado: 0,
        Realizado: -1684.09,
        Saldo: 1684.09,
      },
      {
        Data: '01/02/2026',
        Categoria: 'Endomarketing & Eventos',
        Descrição: 'Bolo aniversariantes',
        Fornecedor: 'Bolo aniversariantes',
        'Data de Pagamento': '26/02/2026',
        Recorrente: 'Sim',
        Empresa: '',
        Departamento: 'Gente & Gestão',
        Orçado: 300,
        Realizado: 1214,
        Saldo: -914,
      },
    ];
    const extras = [
      { macro: 'DESPESAS ADMINISTRATIVAS', teto: 'Outros', sub: 'DHO' },
      { macro: 'DESPESAS ADMINISTRATIVAS', teto: 'Treinamento & Desenvolvimento', sub: 'DHO' },
      { macro: 'DESPESAS ADMINISTRATIVAS', teto: 'Outros', sub: 'R&S' },
      { macro: 'PESSOAL', teto: 'Cultura, Clima & Eventos', sub: 'G&G Geral' },
    ];
    const extended = sampleRows.map((r, i) => ({
      'Competência': r.Data.slice(3).replace(/^(\d{2})\/(\d{4})$/, '$2-$1'),
      Categoria: r.Categoria,
      'Linha Opex': r.Descrição,
      Descrição: r.Descrição,
      Fornecedor: r.Fornecedor,
      Empresa: r.Empresa,
      Departamento: r.Departamento,
      Recorrente: r.Recorrente,
      Orçado: r.Orçado,
      Realizado: r.Realizado,
      Saldo: r.Saldo,
      'Data de Pagamento': r['Data de Pagamento'],
      Status: r.Realizado !== 0 ? 'Pago' : 'Previsto',
      'Subárea': extras[i].sub,
      'Macro área': extras[i].macro,
      'Categoria Teto': extras[i].teto,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(extended);
    XLSX.utils.book_append_sheet(wb, ws, 'Lancamentos');
    XLSX.writeFile(wb, 'modelo_lancamentos_buddha_spa.xlsx');
  };

  // Enrich registry matching with built-in legacy spreadsheet hints
  const resolveCategoryMatch = (rawCat: string): MatchResult => {
    const clean = String(rawCat || '').replace(/\s+/g, ' ').trim();
    if (!clean) {
      return { original: '', oficial: defaultCategoria, matchType: 'apelido', similarity: 100 };
    }
    if (categoryOverrides[clean]) {
      const target = categoryOverrides[clean];
      if (target === '__create__') {
        return { original: clean, oficial: clean, matchType: 'novo', similarity: 0 };
      }
      return {
        original: clean,
        oficial: target,
        matchType: target.toLowerCase() === clean.toLowerCase() ? 'exato' : 'apelido',
        similarity: 100,
      };
    }

    const direct = matchAgainstRegistry(clean, state.registries.categorias);
    if (direct.matchType !== 'novo') return direct;

    const hintKey = stripAccents(clean).toLowerCase().replace(/\s+/g, ' ').trim();
    const hintedOfficial = DEFAULT_CATEGORY_HINTS[hintKey];
    if (
      hintedOfficial &&
      state.registries.categorias.some((c) => c.nome.toLowerCase() === hintedOfficial.toLowerCase())
    ) {
      const found = state.registries.categorias.find(
        (c) => c.nome.toLowerCase() === hintedOfficial.toLowerCase()
      )!;
      return { original: clean, oficial: found.nome, matchType: 'apelido', similarity: 100 };
    }

    return direct;
  };

  const resolveSupplierMatch = (rawForn: string, desc: string): MatchResult => {
    if (isNonSupplierText(desc) || isNonSupplierText(rawForn)) {
      return { original: rawForn, oficial: '', matchType: 'vazio', similarity: 0 };
    }
    const direct = matchAgainstRegistry(rawForn, state.registries.fornecedores, {
      uppercaseNew: true,
      emptyIfNonSupplier: true,
    });
    if (direct.matchType !== 'novo') return direct;

    const normKey = normalizeForMatch(rawForn).toLowerCase();
    const hinted = DEFAULT_SUPPLIER_HINTS[normKey];
    if (hinted) {
      const found = state.registries.fornecedores.find(
        (f) => f.nome.toLowerCase() === hinted.toLowerCase()
      );
      if (found) {
        return { original: rawForn, oficial: found.nome, matchType: 'apelido', similarity: 100 };
      }
    }
    return direct;
  };

  // Detect distinct categories in sheet that are either new or resolved via hint (so user can inspect/override)
  const rawCategoriesNeedingReview = useMemo(() => {
    if (!mapping.categoria || rawRows.length === 0) return [];
    const seen = new Map<string, MatchResult>();
    for (const row of rawRows) {
      const rawCat = String(row[mapping.categoria] || '').replace(/\s+/g, ' ').trim();
      if (!rawCat || seen.has(rawCat)) continue;
      const direct = matchAgainstRegistry(rawCat, state.registries.categorias);
      if (direct.matchType === 'novo') {
        seen.set(rawCat, resolveCategoryMatch(rawCat));
      }
    }
    return Array.from(seen.entries());
  }, [rawRows, mapping.categoria, state.registries.categorias, categoryOverrides]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (rawRows.length === 0 || !mapping.data || !mapping.descricao) return [];
    const rows: PreviewRow[] = [];

    rawRows.forEach((rawRow, idx) => {
      const comp = parseCompetencia(rawRow[mapping.data]);
      const desc = String(rawRow[mapping.descricao] || '').replace(/\s+/g, ' ').trim();
      if (!comp || !desc) return;

      const rawCat = mapping.categoria ? String(rawRow[mapping.categoria] || '').trim() : '';
      const rawEmp = mapping.empresa ? String(rawRow[mapping.empresa] || '').trim() : '';
      const rawDep = mapping.departamento ? String(rawRow[mapping.departamento] || '').trim() : '';
      const rawForn = mapping.fornecedor ? String(rawRow[mapping.fornecedor] || '').trim() : '';
      const payDate = mapping.dataPagamento ? parseBRDate(rawRow[mapping.dataPagamento]) : '';

      const recStr = mapping.recorrente
        ? stripAccents(String(rawRow[mapping.recorrente] || '')).toLowerCase().trim()
        : '';
      const recorrente = recStr === 'sim' || recStr === 's' || recStr === 'true' || recStr === '1';

      const orcado = mapping.orcado ? Math.max(0, parseBRNumber(rawRow[mapping.orcado])) : 0;
      const parsedReal = mapping.realizado ? parseBRNumber(rawRow[mapping.realizado]) : 0;
      const realizado = allowNegativeRealized
        ? Math.round(parsedReal * 100) / 100
        : Math.max(0, Math.round(parsedReal * 100) / 100);
      const saldo = Math.round((orcado - realizado) * 100) / 100;

      const catMatch = resolveCategoryMatch(rawCat);
      const empMatch = matchAgainstRegistry(rawEmp || defaultEmpresa, state.registries.empresas, {
        uppercaseNew: true,
      });
      const depMatch = matchAgainstRegistry(
        rawDep || defaultDepto,
        state.registries.departamentos
      );
      const forMatch = resolveSupplierMatch(rawForn, desc);

      const isDuplicate = state.entries.some(
        (existing) =>
          existing.competencia === comp &&
          normalizeForMatch(existing.descricao) === normalizeForMatch(desc) &&
          normalizeForMatch(existing.fornecedor) === normalizeForMatch(forMatch.oficial) &&
          normalizeForMatch(existing.empresa) === normalizeForMatch(empMatch.oficial) &&
          Math.abs(existing.realizado - realizado) < 0.01 &&
          Math.abs(existing.orcado - orcado) < 0.01
      );

      const rowIndex = idx + 2;
      const defaultSelected = skipDuplicates ? !isDuplicate : true;
      const selected =
        selectionOverrides[rowIndex] !== undefined ? selectionOverrides[rowIndex] : defaultSelected;

      const cellStatus = mapping.status ? parseStatusCell(rawRow[mapping.status]) : '';
      const computedStatus: EntryStatus =
        statusMode === 'auto'
          ? cellStatus || (realizado !== 0 ? 'Pago' : 'Previsto')
          : statusMode;

      const txt = (col: string) =>
        col ? String(rawRow[col] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';

      rows.push({
        linhaOpex: txt(mapping.linhaOpex),
        subarea: txt(mapping.subarea),
        macroArea: txt(mapping.macroArea),
        categoriaTeto: txt(mapping.categoriaTeto),
        rowIndex,
        selected,
        isDuplicate,
        competencia: comp,
        dataPagamento: payDate,
        descricao: desc,
        recorrente,
        orcado,
        realizado,
        saldo,
        rawCategoria: rawCat,
        catMatch,
        empMatch,
        depMatch,
        forMatch,
        status: computedStatus,
      });
    });

    return rows;
  }, [
    rawRows,
    mapping,
    defaultEmpresa,
    defaultDepto,
    defaultCategoria,
    statusMode,
    skipDuplicates,
    allowNegativeRealized,
    categoryOverrides,
    selectionOverrides,
    state.entries,
    state.registries,
  ]);

  const previewStats = useMemo(() => {
    const selectedCount = previewRows.filter((r) => r.selected).length;
    const duplicatesCount = previewRows.filter((r) => r.isDuplicate).length;
    const newItems = new Set<string>();
    let autoMapped = 0;

    for (const r of previewRows) {
      if (
        r.empMatch.matchType === 'apelido' ||
        r.empMatch.matchType === 'similaridade' ||
        r.depMatch.matchType === 'apelido' ||
        r.depMatch.matchType === 'similaridade' ||
        r.forMatch.matchType === 'apelido' ||
        r.forMatch.matchType === 'similaridade' ||
        r.catMatch.matchType === 'apelido' ||
        r.catMatch.matchType === 'similaridade'
      ) {
        autoMapped++;
      }
      if (r.selected) {
        if (r.catMatch.matchType === 'novo') newItems.add(`Cat: ${r.catMatch.oficial}`);
        if (r.empMatch.matchType === 'novo') newItems.add(`Emp: ${r.empMatch.oficial}`);
        if (r.depMatch.matchType === 'novo') newItems.add(`Depto: ${r.depMatch.oficial}`);
        if (r.forMatch.matchType === 'novo') newItems.add(`Forn: ${r.forMatch.oficial}`);
      }
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
    setErrorMsg(null);
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
        status: r.status,
        ...(r.linhaOpex ? { linhaOpex: r.linhaOpex } : {}),
        ...(r.subarea ? { subarea: r.subarea } : {}),
        ...(r.macroArea ? { macroArea: r.macroArea } : {}),
        ...(r.categoriaTeto ? { categoriaTeto: r.categoriaTeto } : {}),
        obs: `Importado de ${fileName} (${selectedSheet})`,
      }));

      const res = await onImportEntries(payload);
      resetFileState();
      onSuccess?.(res.importedCount);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gravar lançamentos importados.');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const renderMatchCell = (m: MatchResult) => {
    if (m.matchType === 'vazio') return <span className="text-slate-400">— Vazio —</span>;
    if (m.matchType === 'exato') return <span className="text-slate-800 dark:text-slate-200">{m.oficial}</span>;
    if (m.matchType === 'apelido') {
      return (
        <div>
          <div className="font-medium text-blue-700 dark:text-blue-400">{m.oficial}</div>
          <div className="text-[10px] text-slate-400">De: "{m.original}"</div>
        </div>
      );
    }
    if (m.matchType === 'similaridade') {
      return (
        <div>
          <div className="font-medium text-emerald-700 dark:text-emerald-400">{m.oficial}</div>
          <div className="text-[10px] text-slate-400">
            De: "{m.original}" ({m.similarity}%)
          </div>
        </div>
      );
    }
    return (
      <div>
        <div className="font-medium text-amber-700 dark:text-amber-400">{m.oficial}</div>
        <div className="text-[10px] text-amber-600 dark:text-amber-500">Novo cadastro</div>
      </div>
    );
  };

  const renderRegistrySelect = (items: RegistryItem[], value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
    >
      {items.map((it) => (
        <option key={it.id} value={it.nome}>
          {it.nome}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/55 dark:bg-black/75">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                Importar Planilha de Lançamentos (.xlsx / .xls / .csv)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Compatível com as colunas Data, Categoria, Descrição, Fornecedor, Data de Pagamento, Recorrente, Empresa, Departamento, Orçado, Realizado e Saldo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Baixar Modelo (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* File Dropzone */}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) await handleFileObject(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
              isDragging
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:border-blue-500'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <FileUp className="w-6 h-6 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <div className="text-left">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {fileName
                    ? `Arquivo carregado: ${fileName} (${rawRows.length} linha(s) na aba "${selectedSheet}")`
                    : 'Clique para selecionar ou arraste sua planilha (.xlsx, .xls ou .csv) aqui'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {fileName
                    ? 'Clique novamente para substituir o arquivo.'
                    : 'Aceita datas em dd/mm/aaaa, números brasileiros com vírgula e valores negativos de estorno.'}
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Options & Mapping Panel (visible when workbook is loaded) */}
          {workbook && rawRows.length > 0 && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <SlidersHorizontal className="w-4 h-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                    <span>Opções de Preenchimento e Estrutura</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowColumnConfig((v) => !v)}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    {showColumnConfig
                      ? 'Ocultar mapeamento de colunas'
                      : 'Ajustar mapeamento de colunas'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Aba da Planilha
                    </label>
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Empresa Padrão (se vazia)
                    </label>
                    {renderRegistrySelect(state.registries.empresas, defaultEmpresa, setDefaultEmpresa)}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Departamento Padrão (se vazio)
                    </label>
                    {renderRegistrySelect(
                      state.registries.departamentos,
                      defaultDepto,
                      setDefaultDepto
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Categoria Padrão (se vazia)
                    </label>
                    {renderRegistrySelect(
                      state.registries.categorias,
                      defaultCategoria,
                      setDefaultCategoria
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Status ao Importar
                    </label>
                    <select
                      value={statusMode}
                      onChange={(e) => setStatusMode(e.target.value as 'auto' | EntryStatus)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="auto">Automático (Pago se Realizado ≠ 0)</option>
                      <option value="Pago">Sempre Pago</option>
                      <option value="Aprovado">Sempre Aprovado</option>
                      <option value="Previsto">Sempre Previsto</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => {
                        setSkipDuplicates(e.target.checked);
                        setSelectionOverrides({});
                      }}
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>Desmarcar automaticamente lançamentos duplicados</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={allowNegativeRealized}
                      onChange={(e) => setAllowNegativeRealized(e.target.checked)}
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>Manter valores negativos no Realizado (estornos/reembolsos)</span>
                  </label>
                </div>

                {/* Column Mapping Editor */}
                {showColumnConfig && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {(
                      [
                        { key: 'data', label: 'Coluna Data *' },
                        { key: 'categoria', label: 'Coluna Categoria' },
                        { key: 'descricao', label: 'Coluna Descrição *' },
                        { key: 'fornecedor', label: 'Coluna Fornecedor' },
                        { key: 'dataPagamento', label: 'Coluna Data Pgto' },
                        { key: 'recorrente', label: 'Coluna Recorrente' },
                        { key: 'empresa', label: 'Coluna Empresa' },
                        { key: 'departamento', label: 'Coluna Departamento' },
                        { key: 'orcado', label: 'Coluna Orçado' },
                        { key: 'realizado', label: 'Coluna Realizado' },
                        { key: 'status', label: 'Coluna Status' },
                        { key: 'linhaOpex', label: 'Coluna Linha Opex' },
                        { key: 'subarea', label: 'Coluna Subárea (DHO, R&S…)' },
                        { key: 'macroArea', label: 'Coluna Macro área' },
                        { key: 'categoriaTeto', label: 'Coluna Categoria Teto' },
                      ] as Array<{ key: keyof ColumnMapping; label: string }>
                    ).map((col) => (
                      <div key={col.key}>
                        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                          {col.label}
                        </label>
                        <select
                          value={mapping[col.key]}
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [col.key]: e.target.value }))
                          }
                          className="w-full px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                        >
                          <option value="">— Não mapear —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unrecognized Categories Mapping */}
                {rawCategoriesNeedingReview.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      Categorias da planilha com nome diferente — escolha como padronizar:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {rawCategoriesNeedingReview.map(([rawCat, resolved]) => {
                        const currentVal =
                          categoryOverrides[rawCat] ||
                          (resolved.matchType === 'novo' ? '__create__' : resolved.oficial);
                        return (
                          <div
                            key={rawCat}
                            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1"
                          >
                            <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                              Na planilha: <strong>{rawCat}</strong>
                            </div>
                            <select
                              value={currentVal}
                              onChange={(e) =>
                                setCategoryOverrides((prev) => ({
                                  ...prev,
                                  [rawCat]: e.target.value,
                                }))
                              }
                              className="w-full px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                            >
                              <option value="__create__">
                                + Criar nova categoria "{rawCat}"
                              </option>
                              {state.registries.categorias.map((c) => (
                                <option key={c.id} value={c.nome}>
                                  Mapear para: {c.nome}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Validation Error when Data / Descrição columns missing */}
              {(!mapping.data || !mapping.descricao) && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-amber-800 dark:text-amber-300">
                  Mapeie as colunas obrigatórias <strong>Data</strong> e <strong>Descrição</strong> acima para visualizar a prévia dos lançamentos.
                </div>
              )}

              {/* Preview Summary & Table */}
              {previewRows.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Linhas Lidas</div>
                      <div className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {previewStats.total}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Padronizações (Apelido / ≥80%)
                      </div>
                      <div className="font-mono text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
                        {previewStats.autoMapped}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Novos Cadastros
                      </div>
                      <div className="font-mono text-lg font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                        {previewStats.newItems.length}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Duplicatas Detectadas
                      </div>
                      <div className="font-mono text-lg font-semibold text-red-700 dark:text-red-400 tabular-nums">
                        {previewStats.duplicatesCount}
                      </div>
                    </div>
                  </div>

                  {previewStats.newItems.length > 0 && (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg text-[11px] text-amber-900 dark:text-amber-200">
                      <strong>Novos itens que serão incluídos automaticamente nos cadastros:</strong>{' '}
                      {previewStats.newItems.join(' · ')}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-600 dark:text-slate-400">
                      <strong>{previewStats.selectedCount}</strong> de <strong>{previewStats.total}</strong> linha(s) marcada(s) para importar
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<number, boolean> = {};
                          previewRows.forEach((r) => {
                            next[r.rowIndex] = !r.isDuplicate;
                          });
                          setSelectionOverrides(next);
                        }}
                        className="text-blue-700 dark:text-blue-400 hover:underline font-medium"
                      >
                        Marcar todas não duplicadas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<number, boolean> = {};
                          previewRows.forEach((r) => {
                            next[r.rowIndex] = true;
                          });
                          setSelectionOverrides(next);
                        }}
                        className="text-slate-600 dark:text-slate-400 hover:underline"
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<number, boolean> = {};
                          previewRows.forEach((r) => {
                            next[r.rowIndex] = false;
                          });
                          setSelectionOverrides(next);
                        }}
                        className="text-slate-600 dark:text-slate-400 hover:underline"
                      >
                        Desmarcar todas
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-[340px]">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 z-10">
                        <tr>
                          <th className="py-2 px-2.5">Imp.</th>
                          <th className="py-2 px-2.5">Comp. / Pgto</th>
                          <th className="py-2 px-2.5">Descrição</th>
                          <th className="py-2 px-2.5">Categoria</th>
                          <th className="py-2 px-2.5">Fornecedor</th>
                          <th className="py-2 px-2.5">Empresa</th>
                          <th className="py-2 px-2.5">Depto</th>
                          <th className="py-2 px-2.5 text-right">Orçado</th>
                          <th className="py-2 px-2.5 text-right">Realizado</th>
                          <th className="py-2 px-2.5 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {previewRows.map((r) => (
                          <tr
                            key={r.rowIndex}
                            className={
                              r.isDuplicate
                                ? 'bg-red-50/40 dark:bg-red-950/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }
                          >
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={r.selected}
                                  onChange={() =>
                                    setSelectionOverrides((prev) => ({
                                      ...prev,
                                      [r.rowIndex]: !r.selected,
                                    }))
                                  }
                                  className="rounded border-slate-300 text-blue-700"
                                />
                                {r.isDuplicate && (
                                  <span className="text-[10px] font-semibold text-red-700 dark:text-red-400">
                                    Dup.
                                  </span>
                                )}
                              </label>
                            </td>
                            <td className="py-2 px-2.5 font-mono whitespace-nowrap">
                              <div>{formatCompetenciaBR(r.competencia)}</div>
                              <div className="text-[10px] text-slate-400">
                                {r.dataPagamento ? formatDateBR(r.dataPagamento) : 'Sem pgto'}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 max-w-[165px]">
                              <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {r.descricao}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {r.recorrente ? 'Recorrente' : 'Avulso'} · {r.status}
                              </div>
                            </td>
                            <td className="py-2 px-2.5">{renderMatchCell(r.catMatch)}</td>
                            <td className="py-2 px-2.5">{renderMatchCell(r.forMatch)}</td>
                            <td className="py-2 px-2.5">{renderMatchCell(r.empMatch)}</td>
                            <td className="py-2 px-2.5">{renderMatchCell(r.depMatch)}</td>
                            <td className="py-2 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                              {formatBRL(r.orcado)}
                            </td>
                            <td
                              className={`py-2 px-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                                r.realizado < 0
                                  ? 'text-blue-700 dark:text-blue-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {formatBRL(r.realizado)}
                            </td>
                            <td
                              className={`py-2 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                                r.saldo < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {formatBRL(r.saldo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Os dados importados são gravados e sincronizados em tempo real para toda a equipe.</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {workbook && (
              <button
                type="button"
                onClick={resetFileState}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Limpar Arquivo
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={importing || previewStats.selectedCount === 0}
              onClick={handleConfirmImport}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {importing
                ? 'Importando...'
                : `Importar ${previewStats.selectedCount} Lançamento(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
