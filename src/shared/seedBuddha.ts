import {
  AnnualPlan,
  DatabaseState,
  getDefaultPermissionsForRole,
  Registries,
  RegistryItem,
  UserProfile,
} from '../types/buddha';

const SYSTEM_AUTHOR = 'Desenvolvedor DHO';
const SEED_TIMESTAMP = new Date().toISOString();

export const DEFAULT_USERS: UserProfile[] = [
  {
    id: 'usr-dev',
    nome: 'Desenvolvedor DHO',
    email: 'showdetreinamento@gmail.com',
    role: 'developer',
    cargo: 'Desenvolvedor · Controle total e gestão de acessos',
    ativo: true,
    permissoes: getDefaultPermissionsForRole('developer'),
    criadoPor: SYSTEM_AUTHOR,
    criadoEm: SEED_TIMESTAMP,
    atualizadoPor: SYSTEM_AUTHOR,
    atualizadoEm: SEED_TIMESTAMP,
  },
  {
    id: 'usr-admin',
    nome: 'Analista DHO (Admin)',
    email: 'admin.dho@buddhaspa.com.br',
    role: 'admin',
    cargo: 'Administrador · Gestão orçamentária e cadastros',
    ativo: true,
    permissoes: getDefaultPermissionsForRole('admin'),
    criadoPor: SYSTEM_AUTHOR,
    criadoEm: SEED_TIMESTAMP,
    atualizadoPor: SYSTEM_AUTHOR,
    atualizadoEm: SEED_TIMESTAMP,
  },
  {
    id: 'usr-editor',
    nome: 'Equipe DHO (Editor)',
    email: 'equipe.dho@buddhaspa.com.br',
    role: 'editor',
    cargo: 'Editor · Lançamentos e Contratos',
    ativo: true,
    permissoes: getDefaultPermissionsForRole('editor'),
    criadoPor: SYSTEM_AUTHOR,
    criadoEm: SEED_TIMESTAMP,
    atualizadoPor: SYSTEM_AUTHOR,
    atualizadoEm: SEED_TIMESTAMP,
  },
  {
    id: 'usr-viewer',
    nome: 'Gestor (Leitura)',
    email: 'gestor@buddhaspa.com.br',
    role: 'viewer',
    cargo: 'Visualizador · Consulta sem edição',
    ativo: true,
    permissoes: getDefaultPermissionsForRole('viewer'),
    criadoPor: SYSTEM_AUTHOR,
    criadoEm: SEED_TIMESTAMP,
    atualizadoPor: SYSTEM_AUTHOR,
    atualizadoEm: SEED_TIMESTAMP,
  },
];

function makeItem(id: string, nome: string, apelidos: string[] = []): RegistryItem {
  return {
    id,
    nome,
    apelidos,
    criadoPor: SYSTEM_AUTHOR,
    criadoEm: SEED_TIMESTAMP,
    atualizadoPor: SYSTEM_AUTHOR,
    atualizadoEm: SEED_TIMESTAMP,
  };
}

export function createInitialDatabase(): DatabaseState {
  const registries: Registries = {
    categorias: [
      makeItem('cat-1', 'Benefícios & Saúde', ['Benefícios', 'Saúde', 'VT/VR']),
      makeItem('cat-2', 'Folha, Encargos & Obrigações', ['Folha', 'Obrigações Acessórias', 'DCTF']),
      makeItem('cat-3', 'Recrutamento & Seleção', ['R&S', 'Atração', 'Vagas']),
      makeItem('cat-4', 'Treinamento & Desenvolvimento', [
        'T&D',
        'Educação Corporativa',
        'Treinamentos',
        'EAD & Plataformas',
      ]),
      makeItem('cat-5', 'Cultura, Clima & Eventos', [
        'Endomarketing',
        'Endomarketing & Eventos',
        'Eventos DHO',
        'Cultura',
      ]),
      makeItem('cat-6', 'Sistemas & HRTech', [
        'Sistemas RH',
        'Softwares DHO',
        'SaaS',
        'Tecnologia & Sistemas de RH',
      ]),
      makeItem('cat-7', 'Consultorias & Contabilidade', [
        'Consultoria',
        'Assessoria Contábil',
        'Consultorias & Serviços Terceirizados',
      ]),
    ],
    empresas: [
      makeItem('emp-1', 'JG PARTNERS LTDA', [
        'JG Parthners',
        'Jg Partners ltda',
        'JG Partners',
        'JG PARTNERS',
        'JG Parthnersq',
        'JG',
        'Catho',
      ]),
      makeItem('emp-2', 'BUDDHA SPA COLLEGE', ['Buddha College', 'College']),
      makeItem('emp-3', 'BUDDHA LAB LTDA', ['Buddha Lab', 'Lab', 'BUDDHA LAB LTDA.']),
      makeItem('emp-4', 'POMANDER', ['Pomander Aromaterapia']),
    ],
    departamentos: [
      makeItem('dep-1', 'Gente & Gestão', ['G&G', 'Gente & Gestão.', 'DHO', 'RH']),
      makeItem('dep-2', 'College - Técnico', ['Técnico College', 'College Técnico']),
      makeItem('dep-3', 'Operações', ['Operacoes', 'Lojas / Franquias']),
    ],
    fornecedores: [],
  };

  const tetos: Record<string, number[]> = {};
  for (const cat of registries.categorias) {
    tetos[cat.nome] = Array(12).fill(0);
  }

  const plan2026: AnnualPlan = {
    year: 2026,
    tetos,
    criadoPor: SYSTEM_AUTHOR,
    criadoEm: SEED_TIMESTAMP,
    atualizadoPor: SYSTEM_AUTHOR,
    atualizadoEm: SEED_TIMESTAMP,
  };

  return {
    version: 1,
    entries: [],
    contracts: [],
    plans: { '2026': plan2026 },
    registries,
    users: DEFAULT_USERS,
  };
}
