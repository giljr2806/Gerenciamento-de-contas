import { DatabaseState } from '../types/buddha';

export const PAST_YEARS_OFFSET = 2;
export const FUTURE_YEARS_OFFSET = 5;

export function getAllowedYearBounds(referenceDate: Date = new Date()): {
  currentYear: number;
  minYear: number;
  maxYear: number;
} {
  const currentYear = referenceDate.getFullYear();
  return {
    currentYear,
    minYear: currentYear - PAST_YEARS_OFFSET,
    maxYear: currentYear + FUTURE_YEARS_OFFSET,
  };
}

/**
 * Validates and clamps a year selection within the dynamically allowed range
 * (current year - 2 past years up to current year + 5 future years).
 */
export function clampYearToAllowedRange(
  year: number,
  availableYears?: number[]
): number {
  const { currentYear, minYear, maxYear } = getAllowedYearBounds();
  const min = availableYears && availableYears.length > 0 ? availableYears[0] : minYear;
  const max =
    availableYears && availableYears.length > 0
      ? availableYears[availableYears.length - 1]
      : maxYear;

  if (!Number.isFinite(year)) {
    return currentYear;
  }

  const intYear = Math.trunc(year);
  if (intYear < min) return min;
  if (intYear > max) return max;
  return intYear;
}

export function isYearInAllowedRange(
  year: number,
  availableYears?: number[]
): boolean {
  if (!Number.isInteger(year)) return false;
  const { minYear, maxYear } = getAllowedYearBounds();
  const min = availableYears && availableYears.length > 0 ? availableYears[0] : minYear;
  const max =
    availableYears && availableYears.length > 0
      ? availableYears[availableYears.length - 1]
      : maxYear;
  return year >= min && year <= max;
}

/**
 * Generates dynamically a continuous interval of years containing:
 * - 2 past years
 * - the current calendar year
 * - 5 future years
 */
export function getAvailableYears(
  _state?: Pick<DatabaseState, 'entries' | 'plans' | 'contracts'> | null,
  _activeYear?: number
): number[] {
  const { minYear, maxYear } = getAllowedYearBounds();
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    years.push(y);
  }
  return years;
}
