export type UserRole = 'developer' | 'admin' | 'editor' | 'viewer';

export interface UserPermissions {
  painelAnalytics: boolean;
  lancamentos: boolean;
  contratos: boolean;
  planejamento: boolean;
  cadastros: boolean;
  relatorios: boolean;
  gerenciarUsuarios: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  developer: 'Desenvolvedor',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
};

export function getDefaultPermissionsForRole(role: UserRole): UserPermissions {
  if (role === 'developer') {
    return {
      painelAnalytics: true,
      lancamentos: true,
      contratos: true,
      planejamento: true,
      cadastros: true,
      relatorios: true,
      gerenciarUsuarios: true,
    };
  }
  if (role === 'admin') {
    return {
      painelAnalytics: true,
      lancamentos: true,
      contratos: true,
      planejamento: true,
      cadastros: true,
      relatorios: true,
      gerenciarUsuarios: false,
    };
  }
  if (role === 'editor') {
    return {
      painelAnalytics: true,
      lancamentos: true,
      contratos: true,
      planejamento: false,
      cadastros: true,
      relatorios: true,
      gerenciarUsuarios: false,
    };
  }
  return {
    painelAnalytics: true,
    lancamentos: false,
    contratos: false,
    planejamento: false,
    cadastros: false,
    relatorios: true,
    gerenciarUsuarios: false,
  };
}

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  cargo: string;
  ativo: boolean;
  permissoes: UserPermissions;
  criadoPor?: string;
  criadoEm?: string;
  atualizadoPor?: string;
  atualizadoEm?: string;
}

export type EntryStatus = 'Previsto' | 'Aprovado' | 'Pago' | 'Cancelado';

export const ENTRY_STATUSES: EntryStatus[] = ['Previsto', 'Aprovado', 'Pago', 'Cancelado'];

export type ContractStatus =
  | 'Ativo'
  | 'A completar'
  | 'Em negociação'
  | 'Suspenso'
  | 'Encerrado';

export const CONTRACT_STATUSES: ContractStatus[] = [
  'Ativo',
  'A completar',
  'Em negociação',
  'Suspenso',
  'Encerrado',
];

/** Propostas (orçamentos de fornecedores ainda não fechados): datas e reajuste são opcionais. */
export type ContractKind = 'contrato' | 'proposta';

export type ProposalStatus = 'Em análise' | 'Aprovada' | 'Recusada';

export const PROPOSAL_STATUSES: ProposalStatus[] = ['Em análise', 'Aprovada', 'Recusada'];

export type AdjustmentIndex = 'IPCA' | 'IGP-M' | 'INPC' | 'Fixo' | 'Sem reajuste';

export const ADJUSTMENT_INDICES: AdjustmentIndex[] = [
  'IPCA',
  'IGP-M',
  'INPC',
  'Fixo',
  'Sem reajuste',
];

export interface AuditMeta {
  criadoPor: string;
  criadoEm: string;
  atualizadoPor: string;
  atualizadoEm: string;
}

export interface Entry extends AuditMeta {
  id: string;
  competencia: string; // AAAA-MM
  dataPagamento: string; // YYYY-MM-DD or ''
  categoria: string;
  descricao: string;
  fornecedor: string;
  empresa: string;
  departamento: string;
  recorrente: boolean;
  orcado: number;
  realizado: number;
  saldo: number; // orcado - realizado
  status: EntryStatus;
  contratoId?: string;
  obs: string;
}

export interface ContractAdjustment {
  id: string;
  data: string; // YYYY-MM-DD
  indice: AdjustmentIndex | string;
  percentual: number;
  valorAnterior: number;
  valorNovo: number;
  aplicadoPor: string;
}

export interface Contract extends AuditMeta {
  id: string;
  fornecedor: string;
  cnpj: string;
  objeto: string;
  categoria: string;
  empresa: string;
  departamento: string;
  responsavel: string;
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
  renovacaoAutomatica: boolean;
  avisoPrevioDias: number;
  valorMensal: number;
  valorTotal: number;
  indiceReajuste: AdjustmentIndex;
  mesDataBase: number; // 1..12
  formaPagamento: string;
  diaVencimento: number;
  linkDocumento: string;
  status: ContractStatus | ProposalStatus;
  /** Ausente em registros antigos = 'contrato'. */
  tipo?: ContractKind;
  obs: string;
  reajustes: ContractAdjustment[];
}

export function isProposal(c: { tipo?: ContractKind }): boolean {
  return c.tipo === 'proposta';
}

export interface AnnualPlan extends AuditMeta {
  year: number;
  tetos: Record<string, number[]>; // category name -> 12 monthly ceilings
}

export type RegistryType = 'categorias' | 'empresas' | 'departamentos' | 'fornecedores';

export interface RegistryItem extends AuditMeta {
  id: string;
  nome: string;
  apelidos: string[];
}

export interface Registries {
  categorias: RegistryItem[];
  empresas: RegistryItem[];
  departamentos: RegistryItem[];
  fornecedores: RegistryItem[];
}

export interface DatabaseState {
  version: number;
  entries: Entry[];
  contracts: Contract[];
  plans: Record<string, AnnualPlan>;
  registries: Registries;
  users: UserProfile[];
}

export type AlertSeverity = 'ok' | 'atencao' | 'critico';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  categoryLabel: string;
  title: string;
  detail: string;
  targetTab: 'contracts' | 'entries' | 'planning';
  targetId?: string;
  specialFilter?: string;
}
