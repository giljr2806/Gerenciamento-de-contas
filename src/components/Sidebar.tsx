import {
  CalendarRange,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  FolderCog,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sun,
  TrendingUp,
  UserPlus,
  X,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { ROLE_LABELS, UserProfile } from '../types/buddha';
import { clampYearToAllowedRange, isYearInAllowedRange } from '../utils/years';

export type BuddhaTab =
  | 'dashboard'
  | 'analytics'
  | 'entries'
  | 'contracts'
  | 'planning'
  | 'reports'
  | 'registries'
  | 'users';

interface SidebarProps {
  activeTab: BuddhaTab;
  onSelectTab: (tab: BuddhaTab) => void;
  activeYear: number;
  availableYears: number[];
  onChangeYear: (year: number) => void;
  alertCounts: {
    total: number;
    contracts: number;
    entries: number;
    planning: number;
  };
  users: UserProfile[];
  currentUser: UserProfile;
  onSelectUser: (userId: string) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: BuddhaTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'entries', label: 'Lançamentos', icon: FileSpreadsheet },
  { id: 'contracts', label: 'Contratos', icon: FileText },
  { id: 'planning', label: 'Planejamento', icon: CalendarRange },
  { id: 'reports', label: 'Relatórios', icon: FileBarChart2 },
  { id: 'registries', label: 'Cadastros', icon: FolderCog },
  { id: 'users', label: 'Usuários & Acessos', icon: ShieldCheck },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  activeYear,
  availableYears,
  onChangeYear,
  alertCounts,
  users,
  currentUser,
  onSelectUser: _onSelectUser,
  onLogout,
  theme,
  onToggleTheme,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [yearError, setYearError] = useState<string | null>(null);

  const minAllowedYear = availableYears[0];
  const maxAllowedYear = availableYears[availableYears.length - 1];
  const safeActiveYear = clampYearToAllowedRange(activeYear, availableYears);

  const handleYearChange = (rawValue: string) => {
    const parsed = Number(rawValue);
    if (!isYearInAllowedRange(parsed, availableYears)) {
      const clamped = clampYearToAllowedRange(parsed, availableYears);
      setYearError(`Selecione um ano entre ${minAllowedYear} e ${maxAllowedYear}.`);
      onChangeYear(clamped);
      return;
    }
    setYearError(null);
    onChangeYear(parsed);
  };

  const getAlertBadge = (tab: BuddhaTab): number => {
    if (tab === 'dashboard') return alertCounts.total;
    if (tab === 'contracts') return alertCounts.contracts;
    if (tab === 'entries') return alertCounts.entries;
    if (tab === 'planning') return alertCounts.planning;
    return 0;
  };

  const renderSidebarBody = (isCompact: boolean) => (
    <div
      className={`flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 select-none transition-all duration-200 ${
        isCompact ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Brand + Collapse Button */}
      <div
        className={`h-16 border-b border-slate-200 dark:border-slate-800 flex items-center shrink-0 ${
          isCompact ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {!isCompact && (
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className="flex items-center gap-2.5 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 min-w-0"
          >
            <span className="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-950/70 border border-amber-300/80 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current" aria-hidden="true">
                <path d="M12 3c-1.8 2.6-2.7 5.2-2.7 7.6 0 1.6.5 3.1 1.3 4.3-.9-.5-2.1-1.3-3.1-2.5-1.3-1.6-2-3.4-2.2-5.1-1.7 1.9-2.5 4.4-2.1 6.9.4 2.5 2 4.6 4.4 5.7 1.3.6 2.8.9 4.4.9s3.1-.3 4.4-.9c2.4-1.1 4-3.2 4.4-5.7.4-2.5-.4-5-2.1-6.9-.2 1.7-.9 3.5-2.2 5.1-1 1.2-2.2 2-3.1 2.5.8-1.2 1.3-2.7 1.3-4.3C14.7 8.2 13.8 5.6 12 3z" />
              </svg>
            </span>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
              Buddha Spa · DHO
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:inline-flex p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title={isCompact ? 'Expandir menu lateral' : 'Recuar menu lateral'}
          aria-label={isCompact ? 'Expandir menu lateral' : 'Recuar menu lateral'}
        >
          {isCompact ? (
            <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Year Selector (dynamic range validated Select) */}
      {isCompact ? (
        <div className="px-2 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-center">
          <select
            aria-label="Ano de Referência"
            title={`Ano de referência: ${safeActiveYear} (${minAllowedYear}–${maxAllowedYear})`}
            value={safeActiveYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="w-full py-1.5 px-1 text-center text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="sidebar-year-select"
              className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Ano de Referência
            </label>
            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
              {minAllowedYear}–{maxAllowedYear}
            </span>
          </div>
          <select
            id="sidebar-year-select"
            aria-label="Ano de Referência"
            aria-invalid={yearError ? 'true' : 'false'}
            value={safeActiveYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className={`w-full py-2 px-3 text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-600 ${
              yearError
                ? 'border-rose-500 dark:border-rose-500'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
          {yearError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400" role="alert">
              {yearError}
            </p>
          )}
        </div>
      )}

      {/* Navigation Links with Alert Counters */}
      <nav
        className={`flex-1 overflow-y-auto py-4 space-y-1 ${isCompact ? 'px-2' : 'px-3'}`}
        aria-label="Navegação principal"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badge = getAlertBadge(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              title={isCompact ? `${item.label}${badge > 0 ? ` (${badge} alertas)` : ''}` : undefined}
              aria-label={item.label}
              className={`relative w-full flex items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isCompact ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5 text-left'
              } ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 font-medium'
              }`}
            >
              <span className={`flex items-center min-w-0 ${isCompact ? '' : 'gap-3'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                {!isCompact && <span className="text-sm truncate">{item.label}</span>}
              </span>
              {badge > 0 &&
                (isCompact ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                ) : (
                  <span className="ml-2 px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 tabular-nums shrink-0">
                    {badge}
                  </span>
                ))}
            </button>
          );
        })}
      </nav>

      {/* Role Switcher & Theme Toggle */}
      {isCompact ? (
        <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onLogout}
            title={`Sair (${currentUser.nome} · ${ROLE_LABELS[currentUser.role]})`}
            className="w-10 h-9 flex items-center justify-center text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'}
            aria-label="Alternar tema"
            className="w-10 h-9 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-500" aria-hidden="true" />
            )}
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3">
          <div>
            <div className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Usuário conectado
            </div>
            <div className="w-full px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 truncate">
              {currentUser.nome} ({ROLE_LABELS[currentUser.role]})
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400 hover:underline"
            >
              <LogOut className="w-3 h-3" aria-hidden="true" />
              <span>Sair</span>
            </button>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
              {currentUser.cargo || ROLE_LABELS[currentUser.role]}
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectTab('users');
                onCloseMobile();
              }}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
            >
              <UserPlus className="w-3 h-3" aria-hidden="true" />
              <span>Criar ou gerenciar usuários</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <span>{theme === 'dark' ? 'Tema Escuro Ativo' : 'Tema Claro Ativo'}</span>
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{renderSidebarBody(collapsed)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full">{renderSidebarBody(false)}</div>
        </div>
      )}
    </>
  );
}
