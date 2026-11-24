/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { AnnualPlanView } from './components/AnnualPlanView';
import { ContractsView } from './components/ContractsView';
import { DashboardView } from './components/DashboardView';
import { EntriesView } from './components/EntriesView';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { RegistriesView } from './components/RegistriesView';
import { ReportsView } from './components/ReportsView';
import { BuddhaTab, Sidebar } from './components/Sidebar';
import { UsersView } from './components/UsersView';
import { useBuddhaStore } from './hooks/useBuddhaStore';
import { AlertItem } from './types/buddha';
import { computeSystemAlerts } from './utils/alerts';
import { clampYearToAllowedRange, getAvailableYears } from './utils/years';

export default function App() {
  const store = useBuddhaStore();
  const [activeTab, setActiveTab] = useState<BuddhaTab>('dashboard');
  const [activeYear, setActiveYear] = useState<number>(() => new Date().getFullYear());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('buddha_dho_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('buddha_dho_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [entrySpecialFilter, setEntrySpecialFilter] = useState<string | null>(null);
  const [entryCreateTrigger, setEntryCreateTrigger] = useState(0);
  const [contractCreateTrigger, setContractCreateTrigger] = useState(0);
  const [userCreateTrigger, setUserCreateTrigger] = useState(0);

  const availableYears = useMemo(
    () => getAvailableYears(store.state, activeYear),
    [store.state, activeYear]
  );

  const handleChangeYear = (yr: number) => {
    setActiveYear(clampYearToAllowedRange(yr, availableYears));
  };

  const alerts = useMemo(() => {
    if (!store.state) return [];
    return computeSystemAlerts(store.state, activeYear);
  }, [store.state, activeYear]);

  const alertCounts = useMemo(() => {
    let contracts = 0;
    let entries = 0;
    let planning = 0;
    for (const a of alerts) {
      if (a.targetTab === 'contracts') contracts++;
      else if (a.targetTab === 'entries') entries++;
      else if (a.targetTab === 'planning') planning++;
    }
    return {
      total: alerts.length,
      contracts,
      entries,
      planning,
    };
  }, [alerts]);

  const handleAlertClick = (alert: AlertItem) => {
    setActiveTab(alert.targetTab);
    if (alert.targetTab === 'contracts' && alert.targetId) {
      setSelectedContractId(alert.targetId);
    } else if (alert.targetTab === 'entries' && alert.specialFilter) {
      setEntrySpecialFilter(alert.specialFilter);
    }
  };

  let primaryActionLabel: string | undefined;
  let onPrimaryAction: (() => void) | undefined;

  if (activeTab === 'users') {
    primaryActionLabel = 'Novo Usuário';
    onPrimaryAction = () => setUserCreateTrigger((n) => n + 1);
  } else if (store.canEdit) {
    if (activeTab === 'dashboard' && store.hasPermission('lancamentos')) {
      primaryActionLabel = 'Novo Lançamento';
      onPrimaryAction = () => {
        setActiveTab('entries');
        setEntryCreateTrigger((n) => n + 1);
      };
    } else if (activeTab === 'entries' && store.hasPermission('lancamentos')) {
      primaryActionLabel = 'Novo Lançamento';
      onPrimaryAction = () => setEntryCreateTrigger((n) => n + 1);
    } else if (activeTab === 'contracts' && store.hasPermission('contratos')) {
      primaryActionLabel = 'Novo Contrato';
      onPrimaryAction = () => setContractCreateTrigger((n) => n + 1);
    }
  }

  if (store.authUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-10 h-10 rounded-full border-2 border-blue-700 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (store.authUser === null) {
    return (
      <LoginView
        configured={store.authConfigured}
        onLogin={store.login}
        onResetPassword={store.resetPassword}
      />
    );
  }

  if (store.loading && !store.state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-10 h-10 mx-auto rounded-full border-2 border-blue-700 border-t-transparent animate-spin" />
          <div>
            <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Buddha Spa · DHO
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Carregando orçamentos e contratos compartilhados...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!store.state || store.loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-xl p-8 max-w-md w-full space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Falha ao carregar os dados
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {store.loadError || 'Não foi possível conectar ao banco compartilhado.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={store.reload}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Tentar novamente</span>
          </button>
          <button
            type="button"
            onClick={store.logout}
            className="w-full px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Sair e entrar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeYear={activeYear}
        availableYears={availableYears}
        onChangeYear={handleChangeYear}
        alertCounts={alertCounts}
        users={store.activeUsers}
        currentUser={store.currentUser}
        onSelectUser={store.selectUser}
        onLogout={store.logout}
        theme={store.theme}
        onToggleTheme={store.toggleTheme}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeTab={activeTab}
          activeYear={activeYear}
          currentUser={store.currentUser}
          activeClients={store.activeClients}
          realtimeStatus={store.realtimeStatus}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          primaryActionLabel={primaryActionLabel}
          onPrimaryAction={onPrimaryAction}
        />

        {store.actionError && (
          <div className="bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-rose-700 dark:text-rose-300 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{store.actionError}</span>
            </div>
            <button
              type="button"
              onClick={store.clearActionError}
              className="p-1 text-rose-600 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-200 rounded"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                state={store.state}
                activeYear={activeYear}
                onChangeYear={handleChangeYear}
                alerts={alerts}
                onAlertClick={handleAlertClick}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                state={store.state}
                activeYear={activeYear}
                onChangeYear={handleChangeYear}
                onNavigateToTab={(tab, options) => {
                  if (options?.contractId) setSelectedContractId(options.contractId);
                  if (options?.entryFilter) setEntrySpecialFilter(options.entryFilter);
                  setActiveTab(tab);
                }}
              />
            )}

            {activeTab === 'entries' && (
              <EntriesView
                state={store.state}
                activeYear={activeYear}
                canEdit={store.canEdit && store.hasPermission('lancamentos')}
                initialSpecialFilter={entrySpecialFilter}
                onClearInitialFilter={() => setEntrySpecialFilter(null)}
                createTrigger={entryCreateTrigger}
                onCreateEntry={store.createEntry}
                onUpdateEntry={store.updateEntry}
                onDeleteEntry={store.deleteEntry}
                onGenerateRecurring={store.generateRecurringEntries}
                onImportEntries={store.importEntriesBatch}
              />
            )}

            {activeTab === 'contracts' && (
              <ContractsView
                state={store.state}
                activeYear={activeYear}
                canEdit={store.canEdit && store.hasPermission('contratos')}
                selectedContractId={selectedContractId}
                onSelectContract={setSelectedContractId}
                createTrigger={contractCreateTrigger}
                onCreateContract={store.createContract}
                onUpdateContract={store.updateContract}
                onDeleteContract={store.deleteContract}
                onApplyAdjustment={store.applyContractAdjustment}
                onLinkEntries={store.linkContractEntries}
              />
            )}

            {activeTab === 'planning' && (
              <AnnualPlanView
                state={store.state}
                activeYear={activeYear}
                isAdmin={store.isAdmin && store.hasPermission('planejamento')}
                onSavePlan={store.saveAnnualPlan}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                state={store.state}
                activeYear={activeYear}
                onChangeYear={handleChangeYear}
              />
            )}

            {activeTab === 'registries' && (
              <RegistriesView
                state={store.state}
                isAdmin={store.isAdmin && store.hasPermission('cadastros')}
                canEdit={store.canEdit && store.hasPermission('cadastros')}
                onCreateRegistry={store.createRegistryItem}
                onUpdateRegistry={store.updateRegistryItem}
                onMergeRegistry={store.mergeRegistryItems}
                onDeleteRegistry={store.deleteRegistryItem}
                onImportEntries={store.importEntriesBatch}
                onClearAllData={store.clearAllData}
              />
            )}

            {activeTab === 'users' && (
              <UsersView
                users={store.users}
                currentUser={store.currentUser}
                isDeveloper={store.isDeveloper}
                devAuthStatus={store.devAuthStatus}
                createTrigger={userCreateTrigger}
                onSelectUser={store.selectUser}
                onSetupDeveloperKey={store.setupDeveloperKey}
                onUnlockDeveloperAccess={store.unlockDeveloperAccess}
                onLockDeveloperAccess={store.lockDeveloperAccess}
                onChangeDeveloperKey={store.changeDeveloperKey}
                onCreateUser={store.createUser}
                onUpdateUser={store.updateUser}
                onDeleteUser={store.deleteUser}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
