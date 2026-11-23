export const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

export const MONTH_FULL_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export function formatBRL(value: number, compact = false): string {
  if (!Number.isFinite(value)) return 'R$ 0,00';
  if (compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000) {
      return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} mi`;
    }
    if (abs >= 10_000) {
      return `${sign}R$ ${(abs / 1_000).toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} mil`;
    }
  }
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumberBR(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0,00';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number, decimals = 1, showPlus = false): string {
  if (!Number.isFinite(value)) return '0,0%';
  const prefix = showPlus && value > 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate) return '—';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDateTimeBR(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCompetenciaBR(comp: string): string {
  if (!comp || comp.length < 7) return comp || '—';
  const year = comp.slice(0, 4);
  const monthIdx = parseInt(comp.slice(5, 7), 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return comp;
  return `${MONTH_LABELS[monthIdx]}/${year}`;
}

export function daysUntil(isoDate: string, refDate = new Date()): number {
  if (!isoDate) return 9999;
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 9999;
  const base = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  return Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}

export function subtractDaysISO(isoDate: string, days: number): string {
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return '';
  target.setDate(target.getDate() - days);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes how many months a contract was active in the target year up to refDate.
 */
export function elapsedContractMonthsInYear(
  inicio: string,
  fim: string,
  year: number,
  refDate = new Date()
): number {
  const start = new Date(`${inicio}T00:00:00`);
  const end = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const yearStart = new Date(year, 0, 1);
  const refLimit =
    refDate.getFullYear() === year
      ? new Date(year, refDate.getMonth(), 28)
      : refDate.getFullYear() > year
      ? new Date(year, 11, 31)
      : new Date(year - 1, 11, 31);

  const effectiveStart = start > yearStart ? start : yearStart;
  const effectiveEnd = end < refLimit ? end : refLimit;

  if (effectiveEnd < effectiveStart) return 0;

  const months =
    (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 +
    (effectiveEnd.getMonth() - effectiveStart.getMonth()) +
    1;
  return Math.max(0, Math.min(12, months));
}

/**
 * Days until the next annual data-base month (1..12) from refDate.
 */
export function daysUntilDataBase(mesDataBase: number, refDate = new Date()): number {
  const monthIdx = Math.min(11, Math.max(0, mesDataBase - 1));
  const base = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  let candidate = new Date(refDate.getFullYear(), monthIdx, 1);
  if (candidate < base) {
    // If we are already inside the data-base month, treat as 0 days if within same month
    if (refDate.getMonth() === monthIdx) return 0;
    candidate = new Date(refDate.getFullYear() + 1, monthIdx, 1);
  }
  return Math.round((candidate.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}

export function sumArray(arr: number[]): number {
  return arr.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}
