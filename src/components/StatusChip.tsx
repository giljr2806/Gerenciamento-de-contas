import { AlertTriangle, CheckCircle2, Clock, PauseCircle, XCircle } from 'lucide-react';
import { AlertSeverity, ContractStatus, EntryStatus, ProposalStatus } from '../types/buddha';

export function HealthChip({
  severity,
  label,
}: {
  severity: AlertSeverity;
  label: string;
}) {
  if (severity === 'critico') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900 whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (severity === 'atencao') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 whitespace-nowrap">
        <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900 whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function EntryStatusChip({ status }: { status: EntryStatus }) {
  switch (status) {
    case 'Pago':
      return <HealthChip severity="ok" label="Pago" />;
    case 'Aprovado':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900 whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Aprovado</span>
        </span>
      );
    case 'Previsto':
      return <HealthChip severity="atencao" label="Previsto" />;
    case 'Cancelado':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
          <XCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Cancelado</span>
        </span>
      );
  }
}

export function ContractStatusChip({ status }: { status: ContractStatus | ProposalStatus }) {
  switch (status) {
    case 'Em análise':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900 whitespace-nowrap">
          <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Em análise</span>
        </span>
      );
    case 'Aprovada':
      return <HealthChip severity="ok" label="Aprovada" />;
    case 'Recusada':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
          <XCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Recusada</span>
        </span>
      );
    case 'Ativo':
      return <HealthChip severity="ok" label="Ativo" />;
    case 'A completar':
      return <HealthChip severity="atencao" label="A completar" />;
    case 'Em negociação':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900 whitespace-nowrap">
          <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Em negociação</span>
        </span>
      );
    case 'Suspenso':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
          <PauseCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Suspenso</span>
        </span>
      );
    case 'Encerrado':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
          <XCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Encerrado</span>
        </span>
      );
  }
}
