import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, firebaseConfigured } from '../lib/firebase';
import { DEFAULT_USERS } from '../shared/seedBuddha';
import {
  Contract,
  DatabaseState,
  Entry,
  RegistryType,
  UserPermissions,
  UserProfile,
} from '../types/buddha';

export const USER_PROFILES: UserProfile[] = DEFAULT_USERS;

const THEME_KEY = 'buddha_dho_theme';
const POLL_INTERVAL_MS = 15000;

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-email'
  ) {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  if (code === 'auth/user-disabled') return 'Este acesso está desativado.';
  if (code === 'auth/network-request-failed') return 'Sem conexão. Verifique sua internet.';
  return 'Não foi possível entrar. Tente novamente.';
}

export interface DevAuthStatus {
  configured: boolean;
  source: 'env' | 'local' | 'none';
  unlocked: boolean;
  loading: boolean;
}

export function useBuddhaStore() {
  const [state, setState] = useState<DatabaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeClients, setActiveClients] = useState(1);
  const [realtimeStatus, setRealtimeStatus] = useState<'conectado' | 'reconectando'>('reconectando');

  // Developer session token held strictly in memory (never in localStorage/sessionStorage)
  const [devToken, setDevToken] = useState<string | null>(null);
  const devTokenRef = useRef<string | null>(null);
  devTokenRef.current = devToken;

  const [devAuthStatus, setDevAuthStatus] = useState<DevAuthStatus>({
    configured: false,
    source: 'none',
    unlocked: false,
    loading: true,
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // undefined = ainda verificando sessão; null = deslogado
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);

  const users = useMemo<UserProfile[]>(() => {
    if (state?.users && state.users.length > 0) {
      return state.users;
    }
    return DEFAULT_USERS;
  }, [state?.users]);

  const activeUsers = useMemo<UserProfile[]>(
    () => users.filter((u) => u.ativo !== false),
    [users]
  );

  // O perfil vem do e-mail autenticado no Firebase (o servidor valida o mesmo e-mail).
  const currentUser = useMemo<UserProfile>(() => {
    const email = authUser?.email?.toLowerCase();
    const matched = email ? users.find((u) => u.email.toLowerCase() === email) : undefined;
    return matched || DEFAULT_USERS[3];
  }, [users, authUser]);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const refreshDevStatus = useCallback(async (tokenOverride?: string | null) => {
    try {
      const activeToken = tokenOverride !== undefined ? tokenOverride : devTokenRef.current;
      const res = await fetch('/api/dev/status', {
        headers: {
          ...(await authHeaders()),
          ...(activeToken ? { 'x-dev-token': activeToken } : {}),
        },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        configured: boolean;
        source: 'env' | 'local' | 'none';
        unlocked: boolean;
      };
      if (!json.unlocked && activeToken) {
        setDevToken(null);
      }
      setDevAuthStatus({
        configured: Boolean(json.configured),
        source: json.source || 'none',
        unlocked: Boolean(json.unlocked),
        loading: false,
      });
    } catch {
      setDevAuthStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  // O perfil agora é definido pelo login (Firebase). Mantido só por compatibilidade com a UI.
  const selectUser = useCallback((_userId: string) => {}, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw new Error(friendlyAuthError(err));
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    devTokenRef.current = null;
    setDevToken(null);
    setState(null);
    await signOut(auth);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const loadState = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch('/api/state', {
        signal: controller.signal,
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data && typeof data.error === 'string' && data.error) ||
            `Servidor respondeu com erro (${res.status}).`
        );
      }
      const json = (await res.json()) as { state: DatabaseState; activeClients: number };
      setState(json.state);
      setActiveClients(json.activeClients || 1);
      setRealtimeStatus('conectado');
      void refreshDevStatus();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setLoadError(
          'Tempo limite atingido ao carregar os dados. Verifique a conexão e tente novamente.'
        );
      } else {
        setLoadError(
          err instanceof Error
            ? `Não foi possível carregar os dados: ${err.message}`
            : 'Não foi possível carregar os dados. Tente recarregar a página.'
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [refreshDevStatus]);

  // Sessão do Firebase
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setAuthUser(u));
  }, []);

  // Carrega os dados quando há usuário logado
  useEffect(() => {
    if (!authUser) {
      if (authUser === null) setLoading(false);
      return;
    }
    void loadState();
  }, [authUser, loadState]);

  // Atualização periódica (substitui o antigo SSE, que não funciona em ambiente serverless)
  useEffect(() => {
    if (!authUser) return;
    let stopped = false;

    const tick = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch('/api/state', { headers: await authHeaders() });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { state: DatabaseState };
        if (stopped) return;
        setState((prev) => (prev && prev.version === json.state.version ? prev : json.state));
        setRealtimeStatus('conectado');
      } catch {
        if (!stopped) setRealtimeStatus('reconectando');
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authUser]);

  const apiRequest = useCallback(
    async <T,>(url: string, method: string, body?: unknown): Promise<T> => {
      setActionError(null);
      const token = devTokenRef.current;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(await authHeaders()),
        };
        if (token) {
          headers['x-dev-token'] = token;
        }

        const res = await fetch(url, {
          method,
          signal: controller.signal,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            (data && typeof data.error === 'string' && data.error) ||
            'Não foi possível concluir a operação. Tente novamente.';
          setActionError(msg);
          if (res.status === 403 && url.startsWith('/api/users')) {
            void refreshDevStatus();
          }
          throw new Error(msg);
        }
        if (data && data.state) {
          setState(data.state);
        }
        return data as T;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          const msg =
            'A solicitação demorou demais para responder. Verifique sua conexão e tente novamente.';
          setActionError(msg);
          throw new Error(msg);
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [refreshDevStatus]
  );

  // Developer Permission & User Management APIs
  const setupDeveloperKey = useCallback(async (passcode: string) => {
    const res = await apiRequest<{
      configured: boolean;
      source: 'env' | 'local' | 'none';
      unlocked: boolean;
      token: string;
    }>('/api/dev/setup', 'POST', { passcode });
    devTokenRef.current = res.token;
    setDevToken(res.token);
    setDevAuthStatus({
      configured: res.configured,
      source: res.source,
      unlocked: res.unlocked,
      loading: false,
    });
    return res;
  }, [apiRequest]);

  const unlockDeveloperAccess = useCallback(async (passcode: string) => {
    const res = await apiRequest<{
      configured: boolean;
      source: 'env' | 'local' | 'none';
      unlocked: boolean;
      token: string;
    }>('/api/dev/unlock', 'POST', { passcode });
    devTokenRef.current = res.token;
    setDevToken(res.token);
    setDevAuthStatus({
      configured: res.configured,
      source: res.source,
      unlocked: res.unlocked,
      loading: false,
    });
    return res;
  }, [apiRequest]);

  const lockDeveloperAccess = useCallback(async () => {
    const token = devTokenRef.current;
    devTokenRef.current = null;
    setDevToken(null);
    setDevAuthStatus((prev) => ({ ...prev, unlocked: false }));
    if (token) {
      await fetch('/api/dev/lock', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'x-dev-token': token },
      }).catch(() => {});
    }
  }, []);

  const changeDeveloperKey = useCallback(
    (currentPasscode: string, newPasscode: string) =>
      apiRequest<{ message: string }>('/api/dev/change-key', 'POST', {
        currentPasscode,
        newPasscode,
      }),
    [apiRequest]
  );

  const createUser = useCallback(
    (payload: Omit<UserProfile, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>) =>
      apiRequest<{ user: UserProfile }>('/api/users', 'POST', payload),
    [apiRequest]
  );

  const updateUser = useCallback(
    (id: string, payload: Partial<UserProfile>) =>
      apiRequest<{ user: UserProfile }>(`/api/users/${id}`, 'PUT', payload),
    [apiRequest]
  );

  const deleteUser = useCallback(
    (id: string) => apiRequest<void>(`/api/users/${id}`, 'DELETE'),
    [apiRequest]
  );

  // Entry APIs
  const createEntry = useCallback(
    (payload: Partial<Entry>) => apiRequest<{ entry: Entry }>('/api/entries', 'POST', payload),
    [apiRequest]
  );

  const updateEntry = useCallback(
    (id: string, payload: Partial<Entry>) =>
      apiRequest<{ entry: Entry }>(`/api/entries/${id}`, 'PUT', payload),
    [apiRequest]
  );

  const deleteEntry = useCallback(
    (id: string) => apiRequest<void>(`/api/entries/${id}`, 'DELETE'),
    [apiRequest]
  );

  const generateRecurringEntries = useCallback(
    (sourceCompetencia: string, targetCompetencia: string) =>
      apiRequest<{ createdCount: number; skippedCount: number }>(
        '/api/entries/recurring',
        'POST',
        { sourceCompetencia, targetCompetencia }
      ),
    [apiRequest]
  );

  const importEntriesBatch = useCallback(
    (
      entries: Array<
        Omit<Entry, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>
      >
    ) => apiRequest<{ importedCount: number }>('/api/entries/import', 'POST', { entries }),
    [apiRequest]
  );

  // Contract APIs
  const createContract = useCallback(
    (payload: Partial<Contract>) =>
      apiRequest<{ contract: Contract }>('/api/contracts', 'POST', payload),
    [apiRequest]
  );

  const updateContract = useCallback(
    (id: string, payload: Partial<Contract>) =>
      apiRequest<{ contract: Contract }>(`/api/contracts/${id}`, 'PUT', payload),
    [apiRequest]
  );

  const deleteContract = useCallback(
    (id: string) => apiRequest<void>(`/api/contracts/${id}`, 'DELETE'),
    [apiRequest]
  );

  const applyContractAdjustment = useCallback(
    (id: string, payload: { percentual: number; data: string; indice?: string }) =>
      apiRequest<{ contract: Contract }>(`/api/contracts/${id}/adjust`, 'POST', payload),
    [apiRequest]
  );

  const linkContractEntries = useCallback(
    (id: string, entryIds?: string[]) =>
      apiRequest<{ linkedCount: number }>(`/api/contracts/${id}/link-entries`, 'POST', {
        entryIds,
      }),
    [apiRequest]
  );

  // Annual Plan API
  const saveAnnualPlan = useCallback(
    (year: number, tetos: Record<string, number[]>) =>
      apiRequest<void>(`/api/plans/${year}`, 'PUT', { tetos }),
    [apiRequest]
  );

  // Registries APIs
  const createRegistryItem = useCallback(
    (type: RegistryType, nome: string, apelidos: string[] = []) =>
      apiRequest<void>(`/api/registries/${type}`, 'POST', { nome, apelidos }),
    [apiRequest]
  );

  const updateRegistryItem = useCallback(
    (type: RegistryType, id: string, nome: string, apelidos: string[]) =>
      apiRequest<void>(`/api/registries/${type}/${id}`, 'PUT', { nome, apelidos }),
    [apiRequest]
  );

  const mergeRegistryItems = useCallback(
    (type: RegistryType, sourceId: string, targetId: string) =>
      apiRequest<void>(`/api/registries/${type}/merge`, 'POST', { sourceId, targetId }),
    [apiRequest]
  );

  const deleteRegistryItem = useCallback(
    (type: RegistryType, id: string) =>
      apiRequest<void>(`/api/registries/${type}/${id}`, 'DELETE'),
    [apiRequest]
  );

  const clearAllData = useCallback(
    () => apiRequest<{ message: string }>('/api/admin/clear-data', 'POST'),
    [apiRequest]
  );

  const isDeveloper = currentUser.role === 'developer' && currentUser.ativo !== false;
  const isAdmin =
    (currentUser.role === 'admin' || currentUser.role === 'developer') &&
    currentUser.ativo !== false;
  const canEdit =
    (currentUser.role === 'developer' ||
      currentUser.role === 'admin' ||
      currentUser.role === 'editor') &&
    currentUser.ativo !== false;

  const hasPermission = useCallback(
    (perm: keyof UserPermissions) => Boolean(currentUser.permissoes?.[perm]),
    [currentUser]
  );

  return {
    state,
    users,
    activeUsers,
    loading,
    loadError,
    actionError,
    clearActionError: () => setActionError(null),
    reload: loadState,
    activeClients,
    realtimeStatus,
    theme,
    toggleTheme,
    currentUser,
    selectUser,
    authUser,
    authConfigured: firebaseConfigured,
    login,
    resetPassword,
    logout,
    isDeveloper,
    isAdmin,
    canEdit,
    hasPermission,
    devAuthStatus,
    refreshDevStatus,
    setupDeveloperKey,
    unlockDeveloperAccess,
    lockDeveloperAccess,
    changeDeveloperKey,
    createUser,
    updateUser,
    deleteUser,
    createEntry,
    updateEntry,
    deleteEntry,
    generateRecurringEntries,
    importEntriesBatch,
    createContract,
    updateContract,
    deleteContract,
    applyContractAdjustment,
    linkContractEntries,
    saveAnnualPlan,
    createRegistryItem,
    updateRegistryItem,
    mergeRegistryItems,
    deleteRegistryItem,
    clearAllData,
  };
}
