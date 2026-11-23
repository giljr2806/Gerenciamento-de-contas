import { HelpCircle } from 'lucide-react';
import { ReactNode, useId, useState } from 'react';

export interface KpiCalculationTooltip {
  title: string;
  description: string;
  formula: string;
  liveBreakdown?: string;
}

interface KpiCardWithTooltipProps {
  tooltip: KpiCalculationTooltip;
  children: ReactNode;
  className?: string;
  /** Horizontal alignment of the popover relative to the card */
  align?: 'left' | 'center' | 'right';
  /** Vertical placement relative to the card */
  placement?: 'top' | 'bottom';
}

export function KpiCardWithTooltip({
  tooltip,
  children,
  className = '',
  align = 'center',
  placement = 'bottom',
}: KpiCardWithTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  const horizontalClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  const verticalClass = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <div
      className={`relative group ${className}`}
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}

      {/* Subtle visual indicator in bottom-right or hover state via small info dot/icon */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity text-blue-600 dark:text-blue-400"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </span>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute z-40 w-72 sm:w-80 max-w-[calc(100vw-2rem)] ${verticalClass} ${horizontalClass} rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 text-slate-100 p-3.5 shadow-xl`}
        >
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
                Como é calculado · {tooltip.title}
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              {tooltip.description}
            </p>

            <div className="rounded-lg bg-slate-950/70 dark:bg-slate-900/80 border border-slate-700/70 px-2.5 py-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Fórmula
              </div>
              <div className="font-mono text-[11px] text-amber-300 leading-snug">
                {tooltip.formula}
              </div>
            </div>

            {tooltip.liveBreakdown && (
              <div className="text-[11px] text-slate-300 font-mono tabular-nums leading-snug pt-0.5">
                {tooltip.liveBreakdown}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
