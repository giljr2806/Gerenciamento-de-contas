import { getTermInfo } from '../utils/format';

interface TermCounterProps {
  inicio: string;
  fim: string;
  /** compact = linha da tabela; full = gaveta de detalhes. */
  variant?: 'compact' | 'full';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function TermCounter({ inicio, fim, variant = 'compact' }: TermCounterProps) {
  const t = getTermInfo(inicio, fim);
  if (t.state === 'none') return null;

  let text: string;
  let tone = 'text-slate-500 dark:text-slate-400';
  let bar = 'bg-blue-600 dark:bg-blue-500';

  if (t.state === 'future') {
    text =
      t.offsetMonths >= 1
        ? `Inicia em ${plural(t.offsetMonths, 'mês', 'meses')}`
        : `Inicia em ${plural(t.offsetDays, 'dia', 'dias')}`;
    bar = 'bg-slate-400 dark:bg-slate-500';
  } else if (t.state === 'ended') {
    text =
      t.offsetMonths >= 1
        ? `Encerrado há ${plural(t.offsetMonths, 'mês', 'meses')}`
        : `Encerrado há ${plural(t.offsetDays, 'dia', 'dias')}`;
    tone = 'text-red-700 dark:text-red-400 font-semibold';
    bar = 'bg-red-600 dark:bg-red-500';
  } else {
    const falta = t.daysLeft < 31 ? plural(t.daysLeft, 'dia', 'dias') : plural(t.remainingMonths, 'mês', 'meses');
    text = `${t.elapsedMonths} de ${t.totalMonths} ${t.totalMonths === 1 ? 'mês' : 'meses'} · faltam ${falta}`;
    if (t.remainingMonths <= 3) {
      tone = 'text-amber-700 dark:text-amber-400';
      bar = 'bg-amber-500';
    }
  }

  const label =
    t.state === 'active'
      ? `${t.pct.toFixed(0)}% do prazo decorrido`
      : t.state === 'ended'
      ? 'Prazo concluído'
      : 'Ainda não iniciou';

  return (
    <div className={variant === 'full' ? 'space-y-1.5' : 'mt-1 min-w-[170px]'}>
      <div className={`${variant === 'full' ? 'text-xs' : 'text-[11px]'} tabular-nums ${tone}`}>{text}</div>
      <div
        className="h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden"
        role="img"
        aria-label={label}
      >
        <div className={`h-full ${bar}`} style={{ width: `${t.state === 'future' ? 0 : t.pct}%` }} />
      </div>
      {variant === 'full' && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          Prazo total: {plural(t.totalMonths, 'mês', 'meses')} · {label}
        </div>
      )}
    </div>
  );
}
