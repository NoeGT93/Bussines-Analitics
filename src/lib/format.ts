const nf0 = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
// El símbolo se arma a mano: algunos navegadores (Android) muestran "GTQ" en lugar de "Q"
const nf2 = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const money = (v: number, f: Intl.NumberFormat) => `${v < 0 ? '−' : ''}Q ${f.format(Math.abs(v))}`;

export type Unit = 'Q' | 'n' | '%' | 'Q2';

export function fmt(value: number | undefined | null, unit: Unit = 'n'): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  switch (unit) {
    case 'Q':
      return money(value, nf0);
    case 'Q2':
      return money(value, nf2);
    case '%':
      return `${nf1.format(value * 100)} %`;
    default:
      return nf0.format(value);
  }
}

/** Formato compacto para ejes: 12.4 k, 1.2 M */
export function compact(value: number, unit: Unit = 'n'): string {
  const abs = Math.abs(value);
  const prefix = unit === 'Q' || unit === 'Q2' ? 'Q' : '';
  if (unit === '%') return `${Math.round(value * 1000) / 10}%`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1).replace('.0', '')} M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(1).replace('.0', '')} k`;
  return `${prefix}${Math.round(value)}`;
}

export function pct(delta: number | undefined, digits = 1): string {
  if (delta === undefined || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta * 100).toFixed(digits)} %`;
}

/** Diferencia en puntos porcentuales para tasas */
export function pp(delta: number | undefined): string {
  if (delta === undefined || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta * 100).toFixed(1)} pp`;
}
