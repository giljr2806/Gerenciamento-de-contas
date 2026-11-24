import { RegistryItem } from '../types/buddha.js';

export const NON_SUPPLIER_DESCRIPTIONS = [
  'BOLO ANIVERSARIANTES',
  'CUSTO POR NOVA CONTRATACAO',
  'DIA DAS MAES',
  'CONVENCAO INTERNA',
  'DCTF',
  'PREMIACAO INOVA BUDDHA',
  'OUTRAS DESPESAS',
];

export function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizes text for matching: uppercase, removes accents, punctuation,
 * corporate suffixes (LTDA, ME, S.A., SA, EPP, EIRELI), and collapses spaces.
 */
export function normalizeForMatch(raw: string): string {
  if (!raw) return '';
  let s = stripAccents(String(raw)).toUpperCase();
  // Remove punctuation
  s = s.replace(/[.,;:/\\\-()[\]{}"'!?&]/g, ' ');
  // Remove corporate suffixes as standalone tokens
  s = s.replace(/\b(LTDA|ME|EPP|EIRELI|S\s*A|SA|S\s*S|SS)\b/g, ' ');
  // Collapse whitespace
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeStandardUppercase(raw: string): string {
  if (!raw) return '';
  return String(raw).replace(/\s+/g, ' ').trim().toUpperCase();
}

export function isNonSupplierText(raw: string): boolean {
  const norm = normalizeForMatch(raw);
  if (!norm) return true;
  return NON_SUPPLIER_DESCRIPTIONS.some(
    (desc) => norm === desc || norm.includes(desc)
  );
}

/**
 * Computes Levenshtein similarity in range [0, 100].
 */
export function similarityPercent(aRaw: string, bRaw: string): number {
  const a = normalizeForMatch(aRaw);
  const b = normalizeForMatch(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const lenA = a.length;
  const lenB = b.length;
  const dp: number[][] = Array.from({ length: lenA + 1 }, () =>
    Array(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const dist = dp[lenA][lenB];
  const maxLen = Math.max(lenA, lenB);
  return Math.round(((maxLen - dist) / maxLen) * 100);
}

export interface MatchResult {
  original: string;
  oficial: string;
  matchType: 'exato' | 'apelido' | 'similaridade' | 'novo' | 'vazio';
  similarity: number;
}

export function matchAgainstRegistry(
  raw: string,
  items: RegistryItem[],
  opts?: { uppercaseNew?: boolean; emptyIfNonSupplier?: boolean }
): MatchResult {
  const trimmed = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return { original: '', oficial: '', matchType: 'vazio', similarity: 0 };
  }

  if (opts?.emptyIfNonSupplier && isNonSupplierText(trimmed)) {
    return { original: trimmed, oficial: '', matchType: 'vazio', similarity: 0 };
  }

  const normInput = normalizeForMatch(trimmed);

  // 1. Exact match on official name
  for (const item of items) {
    if (
      item.nome.toLowerCase() === trimmed.toLowerCase() ||
      normalizeForMatch(item.nome) === normInput
    ) {
      return { original: trimmed, oficial: item.nome, matchType: 'exato', similarity: 100 };
    }
  }

  // 2. Alias dictionary match
  for (const item of items) {
    for (const alias of item.apelidos) {
      if (
        alias.toLowerCase() === trimmed.toLowerCase() ||
        (normInput && normalizeForMatch(alias) === normInput)
      ) {
        return { original: trimmed, oficial: item.nome, matchType: 'apelido', similarity: 100 };
      }
    }
  }

  // 3. Similarity >= 80% against official names and aliases
  let bestItem: RegistryItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    const scoreMain = similarityPercent(trimmed, item.nome);
    if (scoreMain > bestScore) {
      bestScore = scoreMain;
      bestItem = item;
    }
    for (const alias of item.apelidos) {
      const scoreAlias = similarityPercent(trimmed, alias);
      if (scoreAlias > bestScore) {
        bestScore = scoreAlias;
        bestItem = item;
      }
    }
  }

  if (bestItem && bestScore >= 80) {
    return {
      original: trimmed,
      oficial: bestItem.nome,
      matchType: 'similaridade',
      similarity: bestScore,
    };
  }

  // 4. New item
  return {
    original: trimmed,
    oficial: opts?.uppercaseNew ? normalizeStandardUppercase(trimmed) : trimmed,
    matchType: 'novo',
    similarity: bestScore,
  };
}

export function parseBRNumber(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw === null || raw === undefined) return 0;
  let str = String(raw).trim();
  if (!str) return 0;

  let negative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    negative = true;
    str = str.slice(1, -1);
  }
  if (str.includes('-')) negative = true;

  str = str.replace(/[^0-9.,]/g, '');
  if (!str) return 0;

  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma > lastDot) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const parts = str.split('.');
    if (lastComma === -1 && parts.length > 1 && parts[parts.length - 1].length === 3 && parts[0].length <= 3) {
      str = str.replace(/\./g, '');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    str = str.replace(',', '.');
  }

  const parsed = parseFloat(str);
  if (Number.isNaN(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function excelSerialToDate(serial: number): Date {
  // Excel epoch starts 1899-12-30
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

export function parseBRDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number' && raw > 25000 && raw < 90000) {
    const d = excelSerialToDate(raw);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const day = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const str = String(raw).trim();
  if (!str) return '';

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const br = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    let year = br[3];
    if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return '';
}

const PT_MONTH_MAP: Record<string, string> = {
  jan: '01',
  janeiro: '01',
  fev: '02',
  fevereiro: '02',
  mar: '03',
  marco: '03',
  abr: '04',
  abril: '04',
  mai: '05',
  maio: '05',
  jun: '06',
  junho: '06',
  jul: '07',
  julho: '07',
  ago: '08',
  agosto: '08',
  set: '09',
  setembro: '09',
  out: '10',
  outubro: '10',
  nov: '11',
  novembro: '11',
  dez: '12',
  dezembro: '12',
};

export function parseCompetencia(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number' && raw > 25000 && raw < 90000) {
    const d = excelSerialToDate(raw);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  const str = stripAccents(String(raw).trim()).toLowerCase();
  if (!str) return '';

  // YYYY-MM or YYYY/MM
  const ym = str.match(/^(\d{4})[\/\-](\d{1,2})/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}`;

  // DD/MM/YYYY -> YYYY-MM
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s.*)?$/);
  if (dmy) {
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${dmy[2].padStart(2, '0')}`;
  }

  // MM/YYYY or MM-YYYY
  const my = str.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (my) {
    let year = my[2];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${my[1].padStart(2, '0')}`;
  }

  // jan/2026 or jan-26
  const txt = str.match(/^([a-z]+)[\/\-\s]+(\d{2,4})$/);
  if (txt && PT_MONTH_MAP[txt[1]]) {
    let year = txt[2];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${PT_MONTH_MAP[txt[1]]}`;
  }

  return '';
}
