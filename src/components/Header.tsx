import { Lock, Menu, PanelLeftClose, PanelLeftOpen, Plus, Users } from 'lucide-react';
import { UserProfile } from '../types/buddha';
import { BuddhaTab } from './Sidebar';

interface HeaderProps {
  activeTab: BuddhaTab;
  activeYear: number;
  currentUser: UserProfile;
  activeClients: number;
  realtimeStatus: 'conectado' | 'reconectando';
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

const TAB_TITLES: Record<BuddhaTab, string> = {
  dashboard: 'Painel Executivo',
  analytics: 'Analytics & Inteligência DHO',
  entries: 'Lançamentos Orçamentários',
  contracts: 'Contratos & Vigências',
  planning: 'Planejamento Anual (Tetos)',
  reports: 'Relatórios & Exportações',
  registries: 'Cadastros & Padronização',
  users: 'Usuários & Níveis de Acesso',
};

export function Header({
  activeTab,
  activeYear,
  currentUser,
  activeClients,
  realtimeStatus,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileMenu,
  primaryActionLabel,
  onPrimaryAction,
}: HeaderProps) {
  const isReadOnly = currentUser.role === 'viewer';

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 -ml-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
          title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recuar menu lateral'}
          aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recuar menu lateral'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          )}
          <span className="hidden xl:inline">
            {sidebarCollapsed ? 'Expandir menu' : 'Recuar menu'}
          </span>
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
            DHO Buddha Spa
          </span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {TAB_TITLES[activeTab]}
          </h1>
          <span className="text-slate-300 dark:text-slate-700 hidden md:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 hidden md:inline whitespace-nowrap">
            {activeYear}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Real-time shared DB indicator */}
        <div
          className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
          title="Sincronização em tempo real com o banco compartilhado"
        >
          <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <span className="tabular-nums">
            {realtimeStatus === 'conectado'
              ? `Tempo real (${activeClients} ativo${activeClients > 1 ? 's' : ''})`
              : 'Reconectando...'}
          </span>
        </div>

        {isReadOnly ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg whitespace-nowrap">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Somente leitura</span>
          </div>
        ) : (
          primaryActionLabel &&
          onPrimaryAction && (
            <button
              type="button"
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{primaryActionLabel}</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}
