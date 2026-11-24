import {
  Check,
  Edit2,
  KeyRound,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DevAuthStatus } from '../hooks/useBuddhaStore';
import {
  getDefaultPermissionsForRole,
  ROLE_LABELS,
  UserPermissions,
  UserProfile,
  UserRole,
} from '../types/buddha';
import { formatDateBR } from '../utils/format';

interface UsersViewProps {
  users: UserProfile[];
  currentUser: UserProfile;
  isDeveloper: boolean;
  devAuthStatus: DevAuthStatus;
  createTrigger: number;
  onSelectUser: (userId: string) => void;
  onSetupDeveloperKey: (passcode: string) => Promise<unknown>;
  onUnlockDeveloperAccess: (passcode: string) => Promise<unknown>;
  onLockDeveloperAccess: () => Promise<void>;
  onChangeDeveloperKey: (currentPasscode: string, newPasscode: string) => Promise<unknown>;
  onCreateUser: (
    payload: Omit<UserProfile, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>
  ) => Promise<unknown>;
  onUpdateUser: (id: string, payload: Partial<UserProfile>) => Promise<unknown>;
  onDeleteUser: (id: string) => Promise<unknown>;
}

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  developer: 'Acesso completo a todos os módulos, configurações avançadas e criação/gestão de usuários.',
  admin: 'Gerencia Planejamento (Tetos), Cadastros, Contratos, Lançamentos e Relatórios.',
  editor: 'Cria e edita Lançamentos, Contratos e Fornecedores sem alterar tetos globais.',
  viewer: 'Consulta Painel, Analytics, Lançamentos, Contratos e Relatórios em modo leitura.',
};

const PERMISSION_ITEMS: Array<{
  key: keyof UserPermissions;
  label: string;
  desc: string;
}> = [
  { key: 'painelAnalytics', label: 'Painel & Analytics', desc: 'Visualizar KPIs, gráficos e tendências' },
  { key: 'lancamentos', label: 'Lançamentos', desc: 'Criar, editar e importar lançamentos' },
  { key: 'contratos', label: 'Contratos', desc: 'Gerenciar contratos, reajustes e vínculos' },
  { key: 'planejamento', label: 'Planejamento (Tetos)', desc: 'Definir e salvar tetos mensais anuais' },
  { key: 'cadastros', label: 'Cadastros', desc: 'Gerenciar categorias, empresas, deptos e fornecedores' },
  { key: 'relatorios', label: 'Relatórios', desc: 'Visualizar e exportar relatórios gerenciais' },
  {
    key: 'gerenciarUsuarios',
    label: 'Gerenciar Usuários (Dev)',
    desc: 'Exclusivo do nível Desenvolvedor',
  },
];

export function UsersView({
  users,
  currentUser,
  isDeveloper,
  devAuthStatus,
  createTrigger,
  onSelectUser,
  onSetupDeveloperKey,
  onUnlockDeveloperAccess,
  onLockDeveloperAccess,
  onChangeDeveloperKey,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}: UsersViewProps) {
  const isUnlocked = isDeveloper && devAuthStatus.unlocked;

  // Developer auth gate inputs
  const [setupPass, setSetupPass] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Change developer key panel
  const [changeKeyOpen, setChangeKeyOpen] = useState(false);
  const [currKey, setCurrKey] = useState('');
  const [nextKey, setNextKey] = useState('');

  // List filter & search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  // Create / Edit User Drawer/Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCargo, setFormCargo] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('editor');
  const [formAtivo, setFormAtivo] = useState(true);
  const [formPerms, setFormPerms] = useState<UserPermissions>(getDefaultPermissionsForRole('editor'));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Inline developer authorization inside modal when not yet unlocked
  const [modalDevKey, setModalDevKey] = useState('');
  const [modalDevConfirm, setModalDevConfirm] = useState('');

  const openCreateModal = () => {
    setEditingUser(null);
    setFormNome('');
    setFormEmail('');
    setFormCargo('');
    setFormRole('editor');
    setFormAtivo(true);
    setFormPerms(getDefaultPermissionsForRole('editor'));
    setModalDevKey('');
    setModalDevConfirm('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (u: UserProfile) => {
    if (!isUnlocked) return;
    setEditingUser(u);
    setFormNome(u.nome);
    setFormEmail(u.email);
    setFormCargo(u.cargo);
    setFormRole(u.role);
    setFormAtivo(u.ativo !== false);
    setFormPerms({ ...u.permissoes });
    setModalDevKey('');
    setModalDevConfirm('');
    setFormError(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (createTrigger > 0) {
      openCreateModal();
    }
  }, [createTrigger]);

  const handleSelectRoleInForm = (nextRole: UserRole) => {
    setFormRole(nextRole);
    setFormPerms(getDefaultPermissionsForRole(nextRole));
  };

  const handleSetupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthFeedback(null);
    if (setupPass.trim().length < 10) {
      setAuthError('A chave do desenvolvedor precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (setupPass !== setupConfirm) {
      setAuthError('As chaves digitadas não conferem.');
      return;
    }
    setAuthBusy(true);
    try {
      await onSetupDeveloperKey(setupPass.trim());
      setSetupPass('');
      setSetupConfirm('');
      setAuthFeedback('Chave do desenvolvedor configurada e sessão desbloqueada.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao configurar chave.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleUnlockSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthFeedback(null);
    if (!unlockPass.trim()) {
      setAuthError('Digite a chave de permissão do desenvolvedor.');
      return;
    }
    setAuthBusy(true);
    try {
      await onUnlockDeveloperAccess(unlockPass.trim());
      setUnlockPass('');
      setAuthFeedback('Permissão do desenvolvedor desbloqueada para esta sessão.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Chave inválida.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleChangeKeySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthFeedback(null);
    if (nextKey.trim().length < 10) {
      setAuthError('A nova chave deve ter pelo menos 10 caracteres.');
      return;
    }
    setAuthBusy(true);
    try {
      await onChangeDeveloperKey(currKey.trim(), nextKey.trim());
      setCurrKey('');
      setNextKey('');
      setChangeKeyOpen(false);
      setAuthFeedback('Chave de permissão do desenvolvedor atualizada com sucesso.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Não foi possível alterar a chave.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formNome.trim() || !formEmail.trim()) {
      setFormError('Informe nome completo e e-mail do usuário.');
      return;
    }

    setSaving(true);
    try {
      // If developer session is not yet unlocked, authorize first right from this flow
      if (!isUnlocked) {
        const key = modalDevKey.trim();
        if (!key) {
          setFormError('Informe a Chave de Permissão do Desenvolvedor para criar o usuário.');
          setSaving(false);
          return;
        }
        if (!isDeveloper) {
          if (!activeDeveloperAccount) {
            setFormError('Nenhum usuário com nível Desenvolvedor ativo encontrado.');
            setSaving(false);
            return;
          }
          onSelectUser(activeDeveloperAccount.id);
        }

        if (!devAuthStatus.configured) {
          if (key.length < 10) {
            setFormError('A Chave de Desenvolvedor deve ter pelo menos 10 caracteres.');
            setSaving(false);
            return;
          }
          if (key !== modalDevConfirm.trim()) {
            setFormError('A confirmação da Chave de Desenvolvedor não confere.');
            setSaving(false);
            return;
          }
          await onSetupDeveloperKey(key);
        } else {
          await onUnlockDeveloperAccess(key);
        }
      }

      const payload = {
        nome: formNome.trim(),
        email: formEmail.trim().toLowerCase(),
        cargo: formCargo.trim(),
        role: formRole,
        ativo: formAtivo,
        permissoes: {
          ...formPerms,
          gerenciarUsuarios: formRole === 'developer',
        },
      };
      if (editingUser) {
        await onUpdateUser(editingUser.id, payload);
        setAuthFeedback(`Usuário "${payload.nome}" atualizado com sucesso.`);
      } else {
        await onCreateUser(payload);
        setAuthFeedback(`Usuário "${payload.nome}" criado com sucesso e disponível no menu lateral.`);
      }
      setModalDevKey('');
      setModalDevConfirm('');
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    if (!isUnlocked) return;
    try {
      await onUpdateUser(u.id, { ativo: !u.ativo });
    } catch {
      // actionError surfaced by store banner
    }
  };

  const handleConfirmDelete = async (id: string) => {
    if (!isUnlocked) return;
    try {
      await onDeleteUser(id);
      setConfirmDeleteId(null);
    } catch {
      // actionError surfaced by store banner
    }
  };

  const stats = useMemo(() => {
    const active = users.filter((u) => u.ativo !== false).length;
    const inactive = users.length - active;
    const byRole: Record<UserRole, number> = {
      developer: 0,
      admin: 0,
      editor: 0,
      viewer: 0,
    };
    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
    }
    return { active, inactive, byRole };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.nome.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.cargo.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const activeDeveloperAccount = useMemo(
    () => users.find((u) => u.role === 'developer' && u.ativo !== false),
    [users]
  );

  return (
    <div className="space-y-6">
      {/* 1. HEADER & DEVELOPER STATUS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold tracking-wider uppercase text-[11px] text-blue-700 dark:text-blue-400">
              Governança & Segurança
            </span>
            <span aria-hidden="true">·</span>
            <span>Permissão exclusiva do Desenvolvedor</span>
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <span>Usuários & Níveis de Acesso</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Crie usuários, defina níveis hierárquicos (Desenvolvedor, Administrador, Editor, Visualizador) e controle permissões granulares por módulo com validação no servidor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isUnlocked && (
            <>
              {devAuthStatus.source === 'local' && (
                <button
                  type="button"
                  onClick={() => {
                    setChangeKeyOpen((prev) => !prev);
                    setAuthError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Alterar Chave Dev</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void onLockDeveloperAccess()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Bloquear Permissão</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {authFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{authFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setAuthFeedback(null)}
            className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded"
            aria-label="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. DEVELOPER AUTHORIZATION GATE OR CHANGE-KEY PANEL */}
      {!isDeveloper && (
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Criação e edição restritas à Permissão do Desenvolvedor
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
                Você está conectado como <strong>{currentUser.nome}</strong> ({ROLE_LABELS[currentUser.role]}). Para criar novos usuários, alterar níveis de acesso ou modificar permissões, é necessário utilizar um perfil <strong>Desenvolvedor</strong> e informar a chave de autorização.
              </p>
            </div>
          </div>

          {activeDeveloperAccount && (
            <button
              type="button"
              onClick={() => onSelectUser(activeDeveloperAccount.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Alternar para {activeDeveloperAccount.nome}</span>
            </button>
          )}
        </div>
      )}

      {isDeveloper && !devAuthStatus.loading && !devAuthStatus.configured && (
        <form
          onSubmit={handleSetupSubmit}
          className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/70 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Configurar Chave de Permissão do Desenvolvedor (Primeiro Acesso)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
                Defina uma senha/chave exclusiva de desenvolvedor (mínimo 10 caracteres). Ela será armazenada com criptografia no servidor e exigida sempre que você for criar, editar ou remover usuários e permissões.
              </p>
            </div>
          </div>

          {authError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium" role="alert">
              {authError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nova Chave de Desenvolvedor
              </label>
              <input
                type="password"
                value={setupPass}
                onChange={(e) => setSetupPass(e.target.value)}
                placeholder="Mínimo 10 caracteres"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirmar Chave
              </label>
              <input
                type="password"
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                placeholder="Repita a chave"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                required
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {authBusy ? 'Salvando...' : 'Salvar Chave & Desbloquear'}
            </button>
          </div>
        </form>
      )}

      {isDeveloper && !devAuthStatus.loading && devAuthStatus.configured && !devAuthStatus.unlocked && (
        <form
          onSubmit={handleUnlockSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Desbloquear Permissão do Desenvolvedor
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Informe a chave do desenvolvedor para liberar criação de usuários, edição de níveis de acesso e gerenciamento de permissões.
              </p>
            </div>
          </div>

          {authError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium" role="alert">
              {authError}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Chave do Desenvolvedor
              </label>
              <input
                type="password"
                value={unlockPass}
                onChange={(e) => setUnlockPass(e.target.value)}
                placeholder="Digite a chave de autorização"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                required
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>{authBusy ? 'Verificando...' : 'Desbloquear Acesso'}</span>
            </button>
          </div>
        </form>
      )}

      {isUnlocked && changeKeyOpen && (
        <form
          onSubmit={handleChangeKeySubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Alterar Chave de Permissão do Desenvolvedor
            </h3>
            <button
              type="button"
              onClick={() => setChangeKeyOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {authError && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {authError}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Chave Atual
              </label>
              <input
                type="password"
                value={currKey}
                onChange={(e) => setCurrKey(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nova Chave (mín. 10 caracteres)
              </label>
              <input
                type="password"
                value={nextKey}
                onChange={(e) => setNextKey(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                required
              />
            </div>
            <button
              type="submit"
              disabled={authBusy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              Atualizar Chave
            </button>
          </div>
        </form>
      )}

      {/* 3. SUMMARY METRICS */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Resumo de Usuários">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Usuários Cadastrados</span>
            <Users className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {users.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {stats.active} ativo(s) · {stats.inactive} inativo(s)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Distribuição por Nível</span>
            <UserCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 pt-1">
            {stats.byRole.developer} Dev · {stats.byRole.admin} Admin · {stats.byRole.editor} Edt · {stats.byRole.viewer} Vis
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Perfis ativos sincronizam no menu lateral
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Modo de Segurança</span>
            {isUnlocked ? (
              <Unlock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div
            className={`text-sm font-bold pt-1 ${
              isUnlocked
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {isUnlocked ? 'Permissão Dev Desbloqueada' : 'Somente Leitura (Bloqueado)'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Perfil em uso: {currentUser.nome}
          </div>
        </div>
      </section>

      {/* 4. USERS TABLE */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, e-mail ou cargo..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 w-64"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
              aria-label="Filtrar por nível de acesso"
              className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
            >
              <option value="all">Todos os Níveis</option>
              <option value="developer">Desenvolvedor</option>
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Visualizador</option>
            </select>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar Novo Usuário</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">Usuário</th>
                <th className="py-2.5 px-4">Nível de Acesso</th>
                <th className="py-2.5 px-4">Módulos Liberados</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Atualizado</th>
                {isUnlocked && <th className="py-2.5 px-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredUsers.map((u) => {
                const enabledCount = PERMISSION_ITEMS.filter((p) => u.permissoes?.[p.key]).length;
                const isSelf = u.id === currentUser.id;
                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                      u.ativo === false ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {u.nome}
                        {isSelf && (
                          <span className="ml-2 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                            (Em uso)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {u.email}
                        {u.cargo ? ` · ${u.cargo}` : ''}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          u.role === 'developer'
                            ? 'text-blue-700 dark:text-blue-400'
                            : u.role === 'admin'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : u.role === 'editor'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {enabledCount}/{PERMISSION_ITEMS.length}
                      </span>{' '}
                      módulos ·{' '}
                      {PERMISSION_ITEMS.filter((p) => u.permissoes?.[p.key])
                        .map((p) => p.label.replace(' (Dev)', '').replace(' (Tetos)', ''))
                        .slice(0, 3)
                        .join(', ')}
                      {enabledCount > 3 ? ` +${enabledCount - 3}` : ''}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          u.ativo !== false
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {u.ativo !== false ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {u.atualizadoEm ? formatDateBR(u.atualizadoEm.slice(0, 10)) : '—'}
                    </td>

                    {isUnlocked && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === u.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleConfirmDelete(u.id)}
                              className="px-2 py-1 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              title="Editar usuário e permissões"
                              className="p-1.5 text-slate-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleActive(u)}
                              title={u.ativo !== false ? 'Desativar usuário' : 'Reativar usuário'}
                              className="p-1.5 text-slate-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                            >
                              {u.ativo !== false ? (
                                <UserX className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(u.id)}
                                title="Excluir usuário"
                                className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={isUnlocked ? 6 : 5}
                    className="py-8 text-center text-slate-500 dark:text-slate-400"
                  >
                    Nenhum usuário encontrado para os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. ROLE COMPARISON MATRIX */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
            Matriz Padrão dos Níveis de Acesso
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Referência das permissões aplicadas por padrão a cada perfil (customizáveis por usuário pelo Desenvolvedor).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">Módulo / Capacidade</th>
                <th className="py-2.5 px-4 text-center text-blue-700 dark:text-blue-400">
                  Desenvolvedor
                </th>
                <th className="py-2.5 px-4 text-center">Administrador</th>
                <th className="py-2.5 px-4 text-center">Editor</th>
                <th className="py-2.5 px-4 text-center">Visualizador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {PERMISSION_ITEMS.map((perm) => (
                <tr key={perm.key}>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{perm.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{perm.desc}</div>
                  </td>
                  {(['developer', 'admin', 'editor', 'viewer'] as UserRole[]).map((r) => {
                    const allowed = getDefaultPermissionsForRole(r)[perm.key];
                    return (
                      <td key={r} className="py-2.5 px-4 text-center">
                        {allowed ? (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. CREATE / EDIT USER MODAL */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSaveUser}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3
                  id="user-modal-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {editingUser ? `Editar Usuário · ${editingUser.nome}` : 'Criar Novo Usuário'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure os dados, nível de acesso e módulos autorizados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {formError && (
                <div
                  className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-medium"
                  role="alert"
                >
                  {formError}
                </div>
              )}

              {!isUnlocked && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/40 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <KeyRound className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {!devAuthStatus.configured
                          ? 'Permissão do Desenvolvedor (Definir Chave & Autorizar)'
                          : 'Autorização do Desenvolvedor Necessária'}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {!devAuthStatus.configured
                          ? 'Como este é o primeiro cadastro, defina a chave de autorização do desenvolvedor (mín. 10 caracteres) para confirmar a criação do usuário.'
                          : `Informe a chave do desenvolvedor${
                              !isDeveloper && activeDeveloperAccount
                                ? ` (${activeDeveloperAccount.nome})`
                                : ''
                            } para confirmar a criação do usuário.`}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`grid grid-cols-1 ${
                      !devAuthStatus.configured ? 'sm:grid-cols-2' : ''
                    } gap-3`}
                  >
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {!devAuthStatus.configured
                          ? 'Nova Chave do Desenvolvedor *'
                          : 'Chave do Desenvolvedor *'}
                      </label>
                      <input
                        type="password"
                        value={modalDevKey}
                        onChange={(e) => setModalDevKey(e.target.value)}
                        placeholder="Mínimo 10 caracteres"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        required
                      />
                    </div>

                    {!devAuthStatus.configured && (
                      <div>
                        <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Confirmar Chave *
                        </label>
                        <input
                          type="password"
                          value={modalDevConfirm}
                          onChange={(e) => setModalDevConfirm(e.target.value)}
                          placeholder="Repita a chave"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                          required
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome completo *
                  </label>
                  <input
                    type="text"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    placeholder="Ex.: Mariana Souza"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail corporativo *
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="mariana@buddhaspa.com.br"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cargo / Descrição
                  </label>
                  <input
                    type="text"
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    placeholder="Ex.: Coordenadora de DHO"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>

                <label className="inline-flex items-center gap-2 py-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formAtivo}
                    onChange={(e) => setFormAtivo(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Usuário ativo (pode acessar o sistema)
                  </span>
                </label>
              </div>

              {/* Access Level Selector */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-800 dark:text-slate-200">
                  Nível de Acesso
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(['developer', 'admin', 'editor', 'viewer'] as UserRole[]).map((r) => {
                    const selected = formRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleSelectRoleInForm(r)}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 dark:border-blue-500'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-semibold ${
                              selected
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {ROLE_LABELS[r]}
                          </span>
                          {selected && <Check className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                          {ROLE_DESCRIPTIONS[r]}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Module Permissions */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-800 dark:text-slate-200">
                  Permissões por Módulo
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_ITEMS.map((perm) => {
                    const isDevOnly = perm.key === 'gerenciarUsuarios';
                    const checked = isDevOnly ? formRole === 'developer' : formPerms[perm.key];
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 ${
                          isDevOnly ? 'bg-slate-50/80 dark:bg-slate-800/40 opacity-80' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isDevOnly}
                          onChange={(e) =>
                            setFormPerms((prev) => ({
                              ...prev,
                              [perm.key]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 rounded border-slate-300 text-blue-700"
                        />
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {perm.label}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {perm.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                {saving ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
