import {
  Edit3,
  ExternalLink,
  FileText,
  Link2,
  Percent,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { parseBRNumber } from '../shared/normalization';
import {
  ADJUSTMENT_INDICES,
  AdjustmentIndex,
  AlertSeverity,
  CONTRACT_STATUSES,
  Contract,
  ContractKind,
  ContractStatus,
  DatabaseState,
  isProposal,
  PROPOSAL_STATUSES,
  ProposalStatus,
} from '../types/buddha';
import {
  daysUntil,
  daysUntilDataBase,
  elapsedContractMonthsInYear,
  formatBRL,
  formatCompetenciaBR,
  formatDateBR,
  formatDateTimeBR,
  formatPercent,
  MONTH_LABELS,
  subtractDaysISO,
} from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { ContractStatusChip, EntryStatusChip, HealthChip } from './StatusChip';
import { TermCounter } from './TermCounter';

interface ContractsViewProps {
  state: DatabaseState;
  activeYear: number;
  canEdit: boolean;
  selectedContractId: string | null;
  onSelectContract: (id: string | null) => void;
  createTrigger: number;
  onCreateContract: (payload: Partial<Contract>) => Promise<unknown>;
  onUpdateContract: (id: string, payload: Partial<Contract>) => Promise<unknown>;
  onDeleteContract: (id: string) => Promise<unknown>;
  onApplyAdjustment: (
    id: string,
    payload: { percentual: number; data: string; indice?: string }
  ) => Promise<unknown>;
  onLinkEntries: (id: string, entryIds?: string[]) => Promise<{ linkedCount: number }>;
}

type DetailTab = 'dados' | 'reajustes' | 'lancamentos';

export function ContractsView({
  state,
  activeYear,
  canEdit,
  selectedContractId,
  onSelectContract,
  createTrigger,
  onCreateContract,
  onUpdateContract,
  onDeleteContract,
  onApplyAdjustment,
  onLinkEntries,
}: ContractsViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [empFilter, setEmpFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<'all' | ContractKind>('all');

  const [lastTrigger, setLastTrigger] = useState(createTrigger);
  const [creatingNew, setCreatingNew] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('dados');

  // Form states (for editing selectedContract or creating new)
  const [fFornecedor, setFFornecedor] = useState('');
  const [fCnpj, setFCnpj] = useState('');
  const [fObjeto, setFObjeto] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fEmpresa, setFEmpresa] = useState('');
  const [fDepto, setFDepto] = useState('');
  const [fResp, setFResp] = useState('');
  const [fInicio, setFInicio] = useState('');
  const [fFim, setFFim] = useState('');
  const [fRenovAuto, setFRenovAuto] = useState(false);
  const [fAvisoDias, setFAvisoDias] = useState('30');
  const [fValorMensal, setFValorMensal] = useState('0');
  const [fValorTotal, setFValorTotal] = useState('0');
  const [fIndice, setFIndice] = useState<AdjustmentIndex>('IPCA');
  const [fMesBase, setFMesBase] = useState('1');
  const [fFormaPgto, setFFormaPgto] = useState('Boleto bancário');
  const [fDiaVenc, setFDiaVenc] = useState('10');
  const [fLinkDoc, setFLinkDoc] = useState('');
  const [fStatus, setFStatus] = useState<ContractStatus | ProposalStatus>('Ativo');
  const [fTipo, setFTipo] = useState<ContractKind>('contrato');
  const [fObs, setFObs] = useState('');
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Adjustment form state
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjPct, setAdjPct] = useState('4.5');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjIndice, setAdjIndice] = useState<string>('IPCA');
  const [adjLoading, setAdjLoading] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Link entries feedback
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null);

  const selectedContract = useMemo(
    () => state.contracts.find((c) => c.id === selectedContractId) || null,
    [state.contracts, selectedContractId]
  );

  const populateFormFromContract = (c: Contract) => {
    setFFornecedor(c.fornecedor);
    setFCnpj(c.cnpj);
    setFObjeto(c.objeto);
    setFCategoria(c.categoria);
    setFEmpresa(c.empresa);
    setFDepto(c.departamento);
    setFResp(c.responsavel);
    setFInicio(c.inicio);
    setFFim(c.fim);
    setFRenovAuto(c.renovacaoAutomatica);
    setFAvisoDias(String(c.avisoPrevioDias));
    setFValorMensal(String(c.valorMensal));
    setFValorTotal(String(c.valorTotal));
    setFIndice(c.indiceReajuste);
    setFMesBase(String(c.mesDataBase));
    setFFormaPgto(c.formaPagamento);
    setFDiaVenc(String(c.diaVencimento));
    setFLinkDoc(c.linkDocumento);
    setFStatus(c.status);
    setFTipo(isProposal(c) ? 'proposta' : 'contrato');
    setFObs(c.obs);
    setAdjIndice(c.indiceReajuste);
    setFormMsg(null);
    setLinkFeedback(null);
  };

  useEffect(() => {
    if (selectedContract) {
      setCreatingNew(false);
      populateFormFromContract(selectedContract);
    }
  }, [selectedContract]);

  const openNewContract = (kind: ContractKind = 'contrato') => {
    onSelectContract(null);
    setCreatingNew(true);
    setDetailTab('dados');
    setFTipo(kind);
    setFFornecedor('');
    setFCnpj('');
    setFObjeto('');
    setFCategoria(state.registries.categorias[0]?.nome || '');
    setFEmpresa(state.registries.empresas[0]?.nome || '');
    setFDepto(state.registries.departamentos[0]?.nome || '');
    setFResp('DHO Buddha Spa');
    // proposta nasce sem datas; contrato mantém os padrões de antes
    setFInicio(kind === 'proposta' ? '' : `${activeYear}-01-01`);
    setFFim(kind === 'proposta' ? '' : `${activeYear + 1}-12-31`);
    setFRenovAuto(false);
    setFAvisoDias('30');
    setFValorMensal('0');
    setFValorTotal('0');
    setFIndice('IPCA');
    setFMesBase('1');
    setFFormaPgto('Boleto bancário');
    setFDiaVenc('10');
    setFLinkDoc('');
    setFStatus(kind === 'proposta' ? 'Em análise' : 'Ativo');
    setFObs('');
    setFormMsg(null);
  };

  if (createTrigger !== lastTrigger) {
    setLastTrigger(createTrigger);
    if (canEdit) openNewContract('contrato');
  }

  // Paid in year per contract
  const paidByContractInYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of state.entries) {
      if (!e.contratoId || e.status === 'Cancelado') continue;
      if (!e.competencia.startsWith(`${activeYear}-`)) continue;
      map.set(e.contratoId, (map.get(e.contratoId) || 0) + e.realizado);
    }
    return map;
  }, [state.entries, activeYear]);

  const summary = useMemo(() => {
    // propostas ficam fora dos totais de contratos
    const onlyContracts = state.contracts.filter((c) => !isProposal(c));
    const active = onlyContracts.filter(
      (c) => c.status === 'Ativo' || c.status === 'A completar' || c.status === 'Em negociação'
    );
    const proposalsOpen = state.contracts.filter(
      (c) => isProposal(c) && c.status === 'Em análise'
    ).length;
    const monthly = active.reduce((s, c) => s + c.valorMensal, 0);
    const expiring90 = active.filter((c) => daysUntil(c.fim) <= 90).length;
    const adjustmentDue45 = active.filter((c) => {
      const days = daysUntilDataBase(c.mesDataBase);
      return days >= 0 && days <= 45;
    }).length;
    const toComplete = onlyContracts.filter((c) => c.status === 'A completar').length;
    return {
      activeCount: active.length,
      monthly,
      expiring90,
      adjustmentDue45,
      toComplete,
      proposalsOpen,
    };
  }, [state.contracts]);

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.contracts.filter((c) => {
      if (kindFilter === 'contrato' && isProposal(c)) return false;
      if (kindFilter === 'proposta' && !isProposal(c)) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (empFilter !== 'all' && c.empresa !== empFilter) return false;
      if (q) {
        return (
          c.fornecedor.toLowerCase().includes(q) ||
          c.objeto.toLowerCase().includes(q) ||
          c.cnpj.toLowerCase().includes(q) ||
          c.empresa.toLowerCase().includes(q) ||
          c.departamento.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.contracts, kindFilter, statusFilter, empFilter, search]);

  const getContractSituation = (c: Contract): { severity: AlertSeverity; label: string } => {
    if (isProposal(c)) return { severity: 'ok', label: c.status };
    if (c.status === 'Encerrado' || c.status === 'Suspenso') {
      return { severity: 'ok', label: c.status };
    }
    const daysLeft = daysUntil(c.fim);
    const noticeCutoff = subtractDaysISO(c.fim, c.avisoPrevioDias);
    const daysToNotice = daysUntil(noticeCutoff);
    const daysAdj = daysUntilDataBase(c.mesDataBase);

    if (daysLeft < 0) return { severity: 'critico', label: 'Vencido' };
    if (daysAdj >= 0 && daysAdj <= 45) {
      return {
        severity: daysAdj <= 15 ? 'critico' : 'atencao',
        label: daysAdj === 0 ? 'Reajuste neste mês!' : `Reajuste em ${daysAdj}d`,
      };
    }
    if (daysLeft <= 30) return { severity: 'critico', label: `Vence em ${daysLeft}d` };
    if (daysToNotice <= 30) return { severity: 'atencao', label: 'Aviso prévio' };
    if (daysLeft <= 90) return { severity: 'atencao', label: `Vence em ${daysLeft}d` };
    if (c.status === 'A completar') return { severity: 'atencao', label: 'A completar' };
    return { severity: 'ok', label: 'OK' };
  };

  const saveForm = async (convertToContract: boolean) => {
    setFormMsg(null);
    if (!fFornecedor.trim() || !fObjeto.trim() || !fEmpresa || !fDepto) {
      setFormMsg('Preencha fornecedor, objeto, empresa e departamento.');
      return;
    }
    if (convertToContract && (!fInicio || !fFim)) {
      setFormMsg('Para converter em contrato, informe as datas de início e fim da vigência.');
      return;
    }
    if (fInicio && fFim && fFim < fInicio) {
      setFormMsg('A data de fim não pode ser anterior à data de início.');
      return;
    }

    const tipo: ContractKind = convertToContract ? 'contrato' : fTipo;
    const status: ContractStatus | ProposalStatus = convertToContract
      ? 'Ativo'
      : tipo === 'proposta'
      ? PROPOSAL_STATUSES.includes(fStatus as ProposalStatus)
        ? fStatus
        : 'Em análise'
      : fStatus;

    setSaving(true);
    try {
      const vm = Math.max(0, parseBRNumber(fValorMensal));
      const vt = Math.max(0, parseBRNumber(fValorTotal));
      const payload: Partial<Contract> = {
        fornecedor: fFornecedor.trim(),
        cnpj: fCnpj.trim(),
        objeto: fObjeto.trim(),
        categoria: fCategoria,
        empresa: fEmpresa,
        departamento: fDepto,
        responsavel: fResp.trim(),
        inicio: fInicio,
        fim: fFim,
        renovacaoAutomatica: fRenovAuto,
        avisoPrevioDias: Math.max(0, parseInt(fAvisoDias, 10) || 30),
        valorMensal: vm,
        // proposta não assume 12 meses: o total é o que foi informado
        valorTotal: vt > 0 || tipo === 'proposta' ? vt : Math.round(vm * 12 * 100) / 100,
        indiceReajuste: fIndice,
        mesDataBase: Math.min(12, Math.max(1, parseInt(fMesBase, 10) || 1)),
        formaPagamento: fFormaPgto.trim(),
        diaVencimento: Math.min(31, Math.max(1, parseInt(fDiaVenc, 10) || 10)),
        linkDocumento: fLinkDoc.trim(),
        status,
        tipo,
        obs: fObs.trim(),
      };

      if (creatingNew) {
        await onCreateContract(payload);
        setCreatingNew(false);
      } else if (selectedContract) {
        await onUpdateContract(selectedContract.id, payload);
        setFormMsg(
          convertToContract
            ? 'Proposta convertida em contrato.'
            : tipo === 'proposta'
            ? 'Dados da proposta atualizados.'
            : 'Dados do contrato atualizados.'
        );
        if (convertToContract) setFTipo('contrato');
      }
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveContract = (e: React.FormEvent) => {
    e.preventDefault();
    return saveForm(false);
  };

  const handleApplyAdj = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setAdjLoading(true);
    try {
      const pct = parseBRNumber(adjPct);
      await onApplyAdjustment(selectedContract.id, {
        percentual: pct,
        data: adjDate,
        indice: adjIndice,
      });
      setAdjOpen(false);
    } finally {
      setAdjLoading(false);
    }
  };

  const linkedEntries = useMemo(() => {
    if (!selectedContract) return [];
    return state.entries.filter((e) => e.contratoId === selectedContract.id);
  }, [state.entries, selectedContract]);

  const unlinkedSupplierEntries = useMemo(() => {
    if (!selectedContract) return [];
    return state.entries.filter(
      (e) =>
        !e.contratoId &&
        e.fornecedor.toUpperCase() === selectedContract.fornecedor.toUpperCase()
    );
  }, [state.entries, selectedContract]);

  const handleLinkAllUnlinked = async () => {
    if (!selectedContract) return;
    const res = await onLinkEntries(
      selectedContract.id,
      unlinkedSupplierEntries.map((e) => e.id)
    );
    setLinkFeedback(`${res.linkedCount} lançamento(s) vinculado(s) a este contrato.`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteContract(deleteTarget.id);
      if (selectedContractId === deleteTarget.id) onSelectContract(null);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const drawerVisible = creatingNew || Boolean(selectedContract);
  const formIsProposal = fTipo === 'proposta';
  const kindLabel = formIsProposal ? 'Proposta' : 'Contrato';

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Contratos Ativos</div>
          <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
            {summary.activeCount}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Valor Mensal Comprometido</div>
          <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
            {formatBRL(summary.monthly)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Reajustes em até 45 dias</div>
          <div
            className={`font-mono text-xl font-semibold tabular-nums mt-1 ${
              summary.adjustmentDue45 > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {summary.adjustmentDue45}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Vencem em até 90 dias</div>
          <div
            className={`font-mono text-xl font-semibold tabular-nums mt-1 ${
              summary.expiring90 > 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {summary.expiring90}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Contratos "A completar"</div>
          <div
            className={`font-mono text-xl font-semibold tabular-nums mt-1 ${
              summary.toComplete > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {summary.toComplete}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Propostas em análise</div>
          <div className="font-mono text-xl font-semibold text-violet-700 dark:text-violet-400 tabular-nums mt-1">
            {summary.proposalsOpen}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fornecedor, objeto, CNPJ, empresa..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | ContractKind)}
            aria-label="Filtrar por tipo (contrato ou proposta)"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2.5 py-1.5"
          >
            <option value="all">Contratos e Propostas</option>
            <option value="contrato">Somente Contratos</option>
            <option value="proposta">Somente Propostas</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrar por status"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2.5 py-1.5"
          >
            <option value="all">Todos Status</option>
            {[
              ...(kindFilter === 'proposta' ? [] : CONTRACT_STATUSES),
              ...(kindFilter === 'contrato' ? [] : PROPOSAL_STATUSES),
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
            aria-label="Filtrar por empresa"
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2.5 py-1.5"
          >
            <option value="all">Todas Empresas</option>
            {state.registries.empresas.map((emp) => (
              <option key={emp.id} value={emp.nome}>
                {emp.nome}
              </option>
            ))}
          </select>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openNewContract('proposta')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-950 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Nova Proposta</span>
            </button>
            <button
              type="button"
              onClick={() => openNewContract('contrato')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Novo Contrato</span>
            </button>
          </div>
        )}
      </div>

      {/* Contracts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4 whitespace-nowrap">Fornecedor & Objeto</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Empresa · Depto</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Valor Mensal</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Vigência</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Reajuste</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">
                  Pago {activeYear} vs. Esperado
                </th>
                <th className="py-2.5 px-4 whitespace-nowrap">Situação</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap sticky right-0 bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredContracts.map((c) => {
                const daysLeft = daysUntil(c.fim);
                const paidYear = paidByContractInYear.get(c.id) || 0;
                const elapsedMonths = elapsedContractMonthsInYear(c.inicio, c.fim, activeYear);
                const expectedYear = c.valorMensal * elapsedMonths;
                const sit = getContractSituation(c);
                const prop = isProposal(c);

                return (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setDetailTab('dados');
                      onSelectContract(c.id);
                    }}
                    className={`cursor-pointer transition-colors ${
                      selectedContractId === c.id
                        ? 'bg-blue-50/60 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {prop && (
                          <span className="mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 align-middle">
                            Proposta
                          </span>
                        )}
                        {c.fornecedor}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {c.objeto}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-800 dark:text-slate-200">{c.empresa}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.departamento}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      {prop && c.valorMensal === 0 && c.valorTotal > 0 ? (
                        <span title="Valor total da proposta">{formatBRL(c.valorTotal)}</span>
                      ) : (
                        formatBRL(c.valorMensal)
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {prop && !c.inicio && !c.fim ? (
                        <div className="text-slate-400 dark:text-slate-500">Sem vigência definida</div>
                      ) : (
                        <>
                          <div className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                            {formatDateBR(c.inicio)} → {formatDateBR(c.fim)}
                          </div>
                          {c.inicio && c.fim && c.status !== 'Encerrado' && c.status !== 'Suspenso' && (
                            <TermCounter inicio={c.inicio} fim={c.fim} />
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {prop ? (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      ) : (
                        <>
                          <div>{c.indiceReajuste}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Data-base: {MONTH_LABELS[(c.mesDataBase - 1) % 12]}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {prop ? (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      ) : (
                        <>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {formatBRL(paidYear)}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Esp.: {formatBRL(expectedYear)} ({elapsedMonths}m)
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <ContractStatusChip status={c.status} />
                        {sit.label !== c.status && (
                          <HealthChip severity={sit.severity} label={sit.label} />
                        )}
                      </div>
                    </td>
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailTab('dados');
                            onSelectContract(c.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded"
                          title={canEdit ? 'Editar contrato' : 'Visualizar contrato'}
                          aria-label={`Editar ${c.fornecedor}`}
                        >
                          <Edit3 className="w-3 h-3" aria-hidden="true" />
                          <span>{canEdit ? 'Editar' : 'Detalhes'}</span>
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded"
                            title="Excluir contrato"
                            aria-label={`Excluir ${c.fornecedor}`}
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                            <span>Excluir</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredContracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    {state.contracts.length === 0 ? (
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-10 h-10 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-700 dark:text-blue-400">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          Nenhum contrato cadastrado
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          A base de contratos está limpa. Você pode cadastrar seus contratos reais com fornecedores, valores mensais, reajustes e alertas.
                        </p>
                        {canEdit && (
                          <div className="flex justify-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => openNewContract('contrato')}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Novo Contrato</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      'Nenhum contrato encontrado para os filtros aplicados.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Detail / Create Drawer with 3 Tabs */}
      {drawerVisible && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 dark:bg-black/70">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {creatingNew
                      ? `Nov${formIsProposal ? 'a' : 'o'} ${kindLabel}`
                      : `${formIsProposal ? 'Proposta · ' : ''}${selectedContract?.empresa} · ${selectedContract?.departamento}`}
                  </div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {creatingNew
                      ? formIsProposal
                        ? 'Cadastrar Proposta DHO'
                        : 'Cadastrar Contrato DHO'
                      : selectedContract?.fornecedor}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNew(false);
                    onSelectContract(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!creatingNew && !formIsProposal && (
                <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'dados', label: 'Dados' },
                      { id: 'reajustes', label: 'Valores e reajustes' },
                      {
                        id: 'lancamentos',
                        label: `Lançamentos vinculados (${linkedEntries.length})`,
                      },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDetailTab(t.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        detailTab === t.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 text-xs flex-1 space-y-5">
              {/* TAB 1: DADOS */}
              {(creatingNew || formIsProposal || detailTab === 'dados') && (
                <form onSubmit={handleSaveContract} className="space-y-4">
                  {formMsg && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-900 dark:text-blue-200">
                      {formMsg}
                    </div>
                  )}

                  {!creatingNew &&
                    selectedContract?.inicio &&
                    selectedContract?.fim &&
                    selectedContract.status !== 'Encerrado' &&
                    selectedContract.status !== 'Suspenso' && (
                      <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">Prazo</div>
                        <TermCounter inicio={selectedContract.inicio} fim={selectedContract.fim} variant="full" />
                      </div>
                    )}

                  <fieldset disabled={!canEdit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Fornecedor *
                        </label>
                        <input
                          type="text"
                          required
                          list="ctr-fornecedores"
                          value={fFornecedor}
                          onChange={(e) => setFFornecedor(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                        <datalist id="ctr-fornecedores">
                          {state.registries.fornecedores.map((f) => (
                            <option key={f.id} value={f.nome} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          CNPJ
                        </label>
                        <input
                          type="text"
                          value={fCnpj}
                          onChange={(e) => setFCnpj(e.target.value)}
                          placeholder="00.000.000/0001-00"
                          className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Objeto {formIsProposal ? 'da Proposta' : 'do Contrato'} *
                      </label>
                      <input
                        type="text"
                        required
                        value={fObjeto}
                        onChange={(e) => setFObjeto(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Categoria
                        </label>
                        <select
                          value={fCategoria}
                          onChange={(e) => setFCategoria(e.target.value)}
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
                          Empresa *
                        </label>
                        <select
                          value={fEmpresa}
                          onChange={(e) => setFEmpresa(e.target.value)}
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
                          value={fDepto}
                          onChange={(e) => setFDepto(e.target.value)}
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

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Início{formIsProposal ? ' (opcional)' : ''}
                        </label>
                        <input
                          type="date"
                          value={fInicio}
                          onChange={(e) => setFInicio(e.target.value)}
                          className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Fim{formIsProposal ? ' (opcional)' : ''}
                        </label>
                        <input
                          type="date"
                          value={fFim}
                          onChange={(e) => setFFim(e.target.value)}
                          className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      {!formIsProposal && (
                        <>
                          <div>
                            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Aviso Prévio (dias)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={fAvisoDias}
                              onChange={(e) => setFAvisoDias(e.target.value)}
                              className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div className="flex items-end pb-2">
                            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={fRenovAuto}
                                onChange={(e) => setFRenovAuto(e.target.checked)}
                                className="rounded border-slate-300 text-blue-700"
                              />
                              <span>Renovação auto</span>
                            </label>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Valor Mensal (R$)
                        </label>
                        <input
                          type="text"
                          value={fValorMensal}
                          onChange={(e) => setFValorMensal(e.target.value)}
                          className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Valor Total (R$)
                        </label>
                        <input
                          type="text"
                          value={fValorTotal}
                          onChange={(e) => setFValorTotal(e.target.value)}
                          className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className={formIsProposal ? 'hidden' : ''}>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Índice Reajuste
                        </label>
                        <select
                          value={fIndice}
                          onChange={(e) => setFIndice(e.target.value as AdjustmentIndex)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        >
                          {ADJUSTMENT_INDICES.map((idx) => (
                            <option key={idx} value={idx}>
                              {idx}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={formIsProposal ? 'hidden' : ''}>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Mês Data-Base (1-12)
                        </label>
                        <select
                          value={fMesBase}
                          onChange={(e) => setFMesBase(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        >
                          {MONTH_LABELS.map((m, i) => (
                            <option key={m} value={i + 1}>
                              {i + 1} · {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Responsável
                        </label>
                        <input
                          type="text"
                          value={fResp}
                          onChange={(e) => setFResp(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Forma de Pagamento
                        </label>
                        <input
                          type="text"
                          value={fFormaPgto}
                          onChange={(e) => setFFormaPgto(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className={formIsProposal ? 'hidden' : ''}>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Dia Vencimento
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={fDiaVenc}
                          onChange={(e) => setFDiaVenc(e.target.value)}
                          className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Status
                        </label>
                        <select
                          value={fStatus}
                          onChange={(e) => setFStatus(e.target.value as ContractStatus | ProposalStatus)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        >
                          {(formIsProposal ? PROPOSAL_STATUSES : CONTRACT_STATUSES).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Link para o Documento (Drive / SharePoint)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={fLinkDoc}
                          onChange={(e) => setFLinkDoc(e.target.value)}
                          placeholder="https://..."
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                        {/^https?:\/\//i.test(fLinkDoc.trim()) && (
                          <a
                            href={fLinkDoc.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            title="Abrir documento"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Observações
                      </label>
                      <textarea
                        rows={2}
                        value={fObs}
                        onChange={(e) => setFObs(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </fieldset>

                  {selectedContract && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                      <div>
                        Criado por <strong>{selectedContract.criadoPor}</strong> em{' '}
                        {formatDateTimeBR(selectedContract.criadoEm)}
                      </div>
                      <div>
                        Última alteração por <strong>{selectedContract.atualizadoPor}</strong> em{' '}
                        {formatDateTimeBR(selectedContract.atualizadoEm)}
                      </div>
                    </div>
                  )}

                  {canEdit && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                      {!creatingNew && selectedContract ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(selectedContract)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Excluir {kindLabel}</span>
                        </button>
                      ) : (
                        <span />
                      )}

                      <div className="flex items-center gap-2">
                        {!creatingNew && formIsProposal && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => saveForm(true)}
                            title="Transforma a proposta em contrato ativo (exige datas de início e fim)"
                            className="px-4 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950 disabled:opacity-60"
                          >
                            Converter em Contrato
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingNew(false);
                            onSelectContract(null);
                          }}
                          className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          Fechar
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                        >
                          {saving
                            ? 'Salvando...'
                            : creatingNew
                            ? `Cadastrar ${kindLabel}`
                            : 'Salvar Alterações'}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {/* TAB 2: VALORES E REAJUSTES */}
              {!creatingNew && !formIsProposal && selectedContract && detailTab === 'reajustes' && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">Valor Mensal Atual</div>
                      <div className="font-mono text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatBRL(selectedContract.valorMensal)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Índice: {selectedContract.indiceReajuste} · Data-base:{' '}
                        {MONTH_LABELS[(selectedContract.mesDataBase - 1) % 12]}
                      </div>
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setAdjOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                      >
                        <Percent className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Aplicar reajuste</span>
                      </button>
                    )}
                  </div>

                  {adjOpen && canEdit && (
                    <form
                      onSubmit={handleApplyAdj}
                      className="p-4 border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl space-y-3"
                    >
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        Novo Reajuste Contratual
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Percentual (%) *
                          </label>
                          <input
                            type="text"
                            required
                            value={adjPct}
                            onChange={(e) => setAdjPct(e.target.value)}
                            className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Data do Reajuste *
                          </label>
                          <input
                            type="date"
                            required
                            value={adjDate}
                            onChange={(e) => setAdjDate(e.target.value)}
                            className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Índice
                          </label>
                          <input
                            type="text"
                            value={adjIndice}
                            onChange={(e) => setAdjIndice(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                          Novo valor:{' '}
                          <strong>
                            {formatBRL(
                              Math.round(
                                selectedContract.valorMensal *
                                  (1 + parseBRNumber(adjPct) / 100) *
                                  100
                              ) / 100
                            )}
                          </strong>
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAdjOpen(false)}
                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={adjLoading}
                            className="px-4 py-1.5 font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60"
                          >
                            {adjLoading ? 'Aplicando...' : 'Confirmar Reajuste'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-slate-200">
                      Histórico de Reajustes ({selectedContract.reajustes.length})
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedContract.reajustes.map((r) => (
                        <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {r.indice} · {formatPercent(r.percentual, 2, true)}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Aplicado em {formatDateBR(r.data)} por {r.aplicadoPor}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums">
                            <div className="text-slate-500 line-through text-[11px]">
                              {formatBRL(r.valorAnterior)}
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatBRL(r.valorNovo)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {selectedContract.reajustes.length === 0 && (
                        <div className="p-6 text-center text-slate-500 dark:text-slate-400">
                          Nenhum reajuste aplicado neste contrato ainda.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LANÇAMENTOS VINCULADOS */}
              {!creatingNew && !formIsProposal && selectedContract && detailTab === 'lancamentos' && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400">
                        Total Realizado Vinculado (todos os anos)
                      </div>
                      <div className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatBRL(
                          linkedEntries
                            .filter((e) => e.status !== 'Cancelado')
                            .reduce((s, e) => s + e.realizado, 0)
                        )}
                      </div>
                    </div>

                    {canEdit && unlinkedSupplierEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={handleLinkAllUnlinked}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100"
                      >
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          Vincular {unlinkedSupplierEntries.length} lançamento(s) de{' '}
                          {selectedContract.fornecedor}
                        </span>
                      </button>
                    )}
                  </div>

                  {linkFeedback && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 rounded-lg text-emerald-800 dark:text-emerald-300">
                      {linkFeedback}
                    </div>
                  )}

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          <th className="py-2.5 px-3">Comp.</th>
                          <th className="py-2.5 px-3">Descrição</th>
                          <th className="py-2.5 px-3 text-right">Orçado</th>
                          <th className="py-2.5 px-3 text-right">Realizado</th>
                          <th className="py-2.5 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {linkedEntries.map((e) => (
                          <tr key={e.id}>
                            <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                              {formatCompetenciaBR(e.competencia)}
                            </td>
                            <td className="py-2.5 px-3">{e.descricao}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {formatBRL(e.orcado)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                              {formatBRL(e.realizado)}
                            </td>
                            <td className="py-2.5 px-3">
                              <EntryStatusChip status={e.status} />
                            </td>
                          </tr>
                        ))}
                        {linkedEntries.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="py-6 text-center text-slate-500 dark:text-slate-400"
                            >
                              Nenhum lançamento vinculado a este contrato ainda.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget && isProposal(deleteTarget) ? 'Excluir Proposta' : 'Excluir Contrato'}
        description={
          deleteTarget
            ? isProposal(deleteTarget)
              ? `Confirma a exclusão da proposta de ${deleteTarget.fornecedor} (${deleteTarget.empresa})?`
              : `Confirma a exclusão do contrato com ${deleteTarget.fornecedor} (${deleteTarget.empresa})? Os lançamentos vinculados a ele serão automaticamente desvinculados.`
            : ''
        }
        confirmLabel="Excluir e Desvincular"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
