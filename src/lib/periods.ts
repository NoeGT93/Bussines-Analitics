import type { DateRange, Period } from '../types';

export const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function toPeriod(y: number, m: number): Period {
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function parsePeriod(p: Period): { y: number; m: number } {
  const [y, m] = p.split('-').map(Number);
  return { y, m };
}

export function shift(p: Period, months: number): Period {
  const { y, m } = parsePeriod(p);
  const idx = y * 12 + (m - 1) + months;
  return toPeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

export function monthsBetween(range: DateRange): Period[] {
  const out: Period[] = [];
  let p = range.from;
  let guard = 0;
  while (p <= range.to && guard < 600) {
    out.push(p);
    p = shift(p, 1);
    guard++;
  }
  return out;
}

export function rangeLength(range: DateRange) {
  return monthsBetween(range).length;
}

/** Período anterior de igual duración, inmediatamente previo */
export function previousRange(range: DateRange): DateRange {
  const n = rangeLength(range);
  return { from: shift(range.from, -n), to: shift(range.from, -1) };
}

export type CompareMode = 'prev' | 'yoy' | 'custom' | 'none';

/** Período contra el que se compara el rango seleccionado (null = sin comparación) */
export function compareRangeFor(range: DateRange, mode: CompareMode, custom?: DateRange | null): DateRange | null {
  if (mode === 'none') return null;
  if (mode === 'yoy') return { from: shift(range.from, -12), to: shift(range.to, -12) };
  if (mode === 'custom' && custom) return custom;
  return previousRange(range);
}

export function labelShort(p: Period, withYear = false) {
  const { y, m } = parsePeriod(p);
  return withYear ? `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}` : MONTHS_SHORT[m - 1];
}

export function labelLong(p: Period) {
  const { y, m } = parsePeriod(p);
  return `${MONTHS_ES[m - 1]} ${y}`;
}

export function labelRange(r: DateRange) {
  if (r.from === r.to) return labelLong(r.from);
  const a = parsePeriod(r.from);
  const b = parsePeriod(r.to);
  if (a.y === b.y) return `${MONTHS_SHORT[a.m - 1]} – ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
  return `${MONTHS_SHORT[a.m - 1]} ${a.y} – ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
}

const MONTH_LOOKUP: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

/**
 * Interpreta un valor de mes proveniente de Excel/CSV.
 * Acepta: "Enero", "ene-26", "Enero 2026", "2026-01", "01/2026", fechas de Excel (número serial) y Date.
 */
export function coercePeriod(value: unknown, fallbackYear: number): Period | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toPeriod(value.getFullYear(), value.getMonth() + 1);
  }
  if (typeof value === 'number') {
    if (value >= 1 && value <= 12 && Number.isInteger(value)) return toPeriod(fallbackYear, value);
    if (value > 20000 && value < 80000) {
      // número serial de Excel
      const d = new Date(Math.round((value - 25569) * 86400 * 1000));
      return toPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1);
    }
    return null;
  }
  const s = String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return toPeriod(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return toPeriod(+m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); // dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return toPeriod(y, +m[2]);
  }
  m = s.match(/^([a-z]+)[\s\-/.]*(\d{2,4})?$/);
  if (m && MONTH_LOOKUP[m[1]]) {
    const y = m[2] ? (m[2].length === 2 ? 2000 + +m[2] : +m[2]) : fallbackYear;
    return toPeriod(y, MONTH_LOOKUP[m[1]]);
  }
  m = s.match(/^([a-z]+)\s+(de\s+)?(\d{4})$/);
  if (m && MONTH_LOOKUP[m[1]]) return toPeriod(+m[3], MONTH_LOOKUP[m[1]]);
  return null;
}
