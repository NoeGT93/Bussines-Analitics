import type {
  ChannelField,
  ChannelRecord,
  CompanyScope,
  Dataset,
  DateRange,
  MonthlyRecord,
  Period,
  SocialField,
  SocialRecord,
} from '../types';
import type { Unit } from './format';
import { monthsBetween, previousRange } from './periods';

/* ------------------------------------------------------------------ */
/* Definiciones de indicadores                                         */
/* ------------------------------------------------------------------ */

export type BaseMetric = 'ingresos' | 'ventas' | 'visitas' | 'clics' | 'consultas' | 'clientesNuevos' | 'clientesRecurrentes';
export type DerivedMetric = 'conversion' | 'ticket' | 'tasaConsulta' | 'cierre';
export type SeriesMetric = BaseMetric | DerivedMetric;

export const BASE_METRICS: BaseMetric[] = ['ingresos', 'ventas', 'visitas', 'clics', 'consultas', 'clientesNuevos', 'clientesRecurrentes'];

export interface MetricDef {
  key: SeriesMetric;
  label: string;
  unit: Unit;
  help: string;
  /** Para métricas derivadas: numerador / denominador */
  ratio?: { num: BaseMetric; den: BaseMetric };
  higherIsBetter: boolean;
}

export const METRICS: Record<SeriesMetric, MetricDef> = {
  ingresos: { key: 'ingresos', label: 'Ingresos', unit: 'Q', help: 'Suma de ingresos registrados en el período, en quetzales.', higherIsBetter: true },
  ventas: { key: 'ventas', label: 'Ventas', unit: 'n', help: 'Número de ventas o tickets realizados en el período.', higherIsBetter: true },
  visitas: { key: 'visitas', label: 'Visitas web', unit: 'n', help: 'Visitas al sitio web registradas en el período.', higherIsBetter: true },
  clics: { key: 'clics', label: 'Clics', unit: 'n', help: 'Clics registrados (anuncios, enlaces o botones de contacto según el origen del archivo).', higherIsBetter: true },
  consultas: { key: 'consultas', label: 'Consultas', unit: 'n', help: 'Consultas recibidas por cualquier canal (mensajes, llamadas, formularios).', higherIsBetter: true },
  clientesNuevos: { key: 'clientesNuevos', label: 'Clientes nuevos', unit: 'n', help: 'Clientes que compraron por primera vez en el período.', higherIsBetter: true },
  clientesRecurrentes: { key: 'clientesRecurrentes', label: 'Clientes recurrentes', unit: 'n', help: 'Clientes que ya habían comprado antes.', higherIsBetter: true },
  conversion: {
    key: 'conversion',
    label: 'Conversión',
    unit: '%',
    help: 'Ventas ÷ visitas web. Se calcula solo con los meses que tienen ambos datos.',
    ratio: { num: 'ventas', den: 'visitas' },
    higherIsBetter: true,
  },
  ticket: {
    key: 'ticket',
    label: 'Ticket promedio',
    unit: 'Q2',
    help: 'Ingresos ÷ ventas. Se recalcula desde los totales, no se promedian los tickets mensuales.',
    ratio: { num: 'ingresos', den: 'ventas' },
    higherIsBetter: true,
  },
  tasaConsulta: {
    key: 'tasaConsulta',
    label: 'Visitas que consultan',
    unit: '%',
    help: 'Consultas ÷ visitas web.',
    ratio: { num: 'consultas', den: 'visitas' },
    higherIsBetter: true,
  },
  cierre: {
    key: 'cierre',
    label: 'Cierre de consultas',
    unit: '%',
    help: 'Ventas ÷ consultas. Mide qué proporción de consultas termina en venta.',
    ratio: { num: 'ventas', den: 'consultas' },
    higherIsBetter: true,
  },
};

/* ------------------------------------------------------------------ */
/* Filas mensuales por alcance (empresa o consolidado)                 */
/* ------------------------------------------------------------------ */

export interface Row {
  period: Period;
  values: Partial<Record<SeriesMetric, number>>;
  /** Métricas que no pudieron consolidarse por falta de datos en alguna empresa */
  blocked: BaseMetric[];
  records: MonthlyRecord[];
}

function derive(values: Partial<Record<SeriesMetric, number>>) {
  for (const def of Object.values(METRICS)) {
    if (!def.ratio) continue;
    const n = values[def.ratio.num];
    const d = values[def.ratio.den];
    if (n !== undefined && d !== undefined && d > 0) values[def.key] = n / d;
  }
  return values;
}

export function companyIdsFor(ds: Dataset, scope: CompanyScope): string[] {
  return scope === 'consolidado' ? ds.companies.map((c) => c.id) : [scope];
}

export function rowsFor(ds: Dataset, scope: CompanyScope, range: DateRange): Row[] {
  const ids = companyIdsFor(ds, scope);
  const index = new Map(ds.monthly.map((r) => [r.id, r]));
  return monthsBetween(range).map((period) => {
    const recs = ids.map((id) => index.get(`${id}:${period}`));
    const values: Partial<Record<SeriesMetric, number>> = {};
    const blocked: BaseMetric[] = [];
    for (const m of BASE_METRICS) {
      const vals = recs.map((r) => r?.[m]);
      const present = vals.filter((v): v is number => typeof v === 'number');
      if (present.length === ids.length && present.length > 0) {
        values[m] = present.reduce((a, b) => a + b, 0);
      } else if (present.length > 0) {
        blocked.push(m);
      }
    }
    return { period, values: derive(values), blocked, records: recs.filter(Boolean) as MonthlyRecord[] };
  });
}

/* ------------------------------------------------------------------ */
/* Totales y KPIs                                                      */
/* ------------------------------------------------------------------ */

export interface Total {
  value?: number;
  /** meses con dato / meses del rango */
  coverage: { have: number; total: number };
}

export function totalOf(rows: Row[], metric: SeriesMetric): Total {
  const def = METRICS[metric];
  if (def.ratio) {
    const { num, den } = def.ratio;
    let n = 0;
    let d = 0;
    let have = 0;
    for (const r of rows) {
      const a = r.values[num];
      const b = r.values[den];
      if (a !== undefined && b !== undefined) {
        n += a;
        d += b;
        have++;
      }
    }
    return { value: have && d > 0 ? n / d : undefined, coverage: { have, total: rows.length } };
  }
  let sum = 0;
  let have = 0;
  for (const r of rows) {
    const v = r.values[metric];
    if (v !== undefined) {
      sum += v;
      have++;
    }
  }
  return { value: have ? sum : undefined, coverage: { have, total: rows.length } };
}

export interface KpiResult {
  metric: SeriesMetric;
  value?: number;
  prev?: number;
  /** Variación relativa para montos; diferencia absoluta para tasas */
  delta?: number;
  deltaKind: 'rel' | 'pp';
  coverage: Total['coverage'];
  prevCoverage: Total['coverage'];
  spark: (number | null)[];
  sparkPeriods: Period[];
}

export function kpi(ds: Dataset, scope: CompanyScope, range: DateRange, metric: SeriesMetric): KpiResult {
  const rows = rowsFor(ds, scope, range);
  const prevRows = rowsFor(ds, scope, previousRange(range));
  const cur = totalOf(rows, metric);
  const prev = totalOf(prevRows, metric);
  const isRate = METRICS[metric].unit === '%';
  // Solo comparamos si ambos períodos están completos, para no comparar 3 meses con 1
  const comparable = cur.coverage.have === cur.coverage.total && prev.coverage.have === prev.coverage.total;
  let delta: number | undefined;
  if (comparable && cur.value !== undefined && prev.value !== undefined) {
    delta = isRate ? cur.value - prev.value : prev.value !== 0 ? (cur.value - prev.value) / Math.abs(prev.value) : undefined;
  }
  // Sparkline: si el rango es de un mes, mostramos los 6 meses que terminan en él
  const sparkRows = rows.length >= 3 ? rows : rowsFor(ds, scope, { from: shiftBack(range.to, 5), to: range.to });
  return {
    metric,
    value: cur.value,
    prev: comparable ? prev.value : undefined,
    delta,
    deltaKind: isRate ? 'pp' : 'rel',
    coverage: cur.coverage,
    prevCoverage: prev.coverage,
    spark: sparkRows.map((r) => r.values[metric] ?? null),
    sparkPeriods: sparkRows.map((r) => r.period),
  };
}

function shiftBack(p: Period, n: number) {
  const [y, m] = p.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Variación mes a mes de una serie */
export function momSeries(rows: Row[], metric: SeriesMetric): (number | null)[] {
  return rows.map((r, i) => {
    if (i === 0) return null;
    const a = rows[i - 1].values[metric];
    const b = r.values[metric];
    if (a === undefined || b === undefined || a === 0) return null;
    return (b - a) / Math.abs(a);
  });
}

/* ------------------------------------------------------------------ */
/* Canales                                                             */
/* ------------------------------------------------------------------ */

export interface ChannelAgg {
  canal: string;
  values: Partial<Record<ChannelField, number>>;
  conversion?: number; // ventas / visitas
  cierre?: number; // ventas / consultas
  ticket?: number; // ingresos / ventas
}

export interface ChannelResult {
  /** 'mensual' = filtrado por el rango; 'acumulado' = el archivo no trae meses, no responde al filtro */
  mode: 'mensual' | 'acumulado' | 'vacio';
  channels: ChannelAgg[];
  /** Empresas sin datos de canal (bloquean la vista consolidada) */
  missing: string[];
  sourceNote?: string;
}

const CH_FIELDS: ChannelField[] = ['visitas', 'clics', 'consultas', 'ventas', 'ingresos', 'clientesNuevos'];

export function channelsFor(ds: Dataset, scope: CompanyScope, range: DateRange): ChannelResult {
  const ids = companyIdsFor(ds, scope);
  const months = new Set(monthsBetween(range));
  const perCompany = ids.map((id) => {
    const all = ds.channels.filter((c) => c.companyId === id);
    const monthly = all.filter((c) => c.period && months.has(c.period));
    if (monthly.length) return { id, mode: 'mensual' as const, recs: monthly };
    const totals = all.filter((c) => c.period === null);
    if (totals.length) return { id, mode: 'acumulado' as const, recs: totals };
    return { id, mode: 'vacio' as const, recs: [] as ChannelRecord[] };
  });
  const missing = perCompany.filter((p) => p.mode === 'vacio').map((p) => p.id);
  if (missing.length === ids.length) return { mode: 'vacio', channels: [], missing };
  if (scope === 'consolidado' && missing.length) return { mode: 'vacio', channels: [], missing };
  const modes = new Set(perCompany.map((p) => p.mode));
  if (modes.size > 1) {
    // No mezclamos acumulados con datos mensuales
    return { mode: 'vacio', channels: [], missing: [], sourceNote: 'Las empresas tienen canales con granularidad distinta (mensual vs. acumulado); no se consolidan.' };
  }
  const mode = perCompany[0].mode;
  const map = new Map<string, ChannelAgg>();
  for (const p of perCompany) {
    for (const r of p.recs) {
      const key = normalizeChannel(r.canal);
      const agg = map.get(key) ?? { canal: key, values: {} };
      for (const f of CH_FIELDS) {
        const v = r[f];
        if (typeof v === 'number') agg.values[f] = (agg.values[f] ?? 0) + v;
      }
      map.set(key, agg);
    }
  }
  const channels = [...map.values()].map((c) => {
    const v = c.values;
    return {
      ...c,
      conversion: v.ventas !== undefined && v.visitas ? v.ventas / v.visitas : undefined,
      cierre: v.ventas !== undefined && v.consultas ? v.ventas / v.consultas : undefined,
      ticket: v.ingresos !== undefined && v.ventas ? v.ingresos / v.ventas : undefined,
    };
  });
  channels.sort((a, b) => (b.values.ingresos ?? b.values.ventas ?? 0) - (a.values.ingresos ?? a.values.ventas ?? 0));
  return {
    mode,
    channels,
    missing,
    sourceNote: mode === 'acumulado' ? 'Los datos por canal son acumulados del archivo y no cambian con el filtro de fechas.' : undefined,
  };
}

export function normalizeChannel(name: string) {
  const s = name.trim();
  const low = s.toLowerCase();
  if (/(facebook|instagram|meta|fb|ig)/.test(low) && /(\/|y|&|\+)/.test(low)) return 'Facebook / Instagram';
  if (low === 'facebook' || low === 'fb') return 'Facebook';
  if (low === 'instagram' || low === 'ig') return 'Instagram';
  if (low.includes('google')) return 'Google';
  if (low.includes('whatsapp') || low === 'wa') return 'WhatsApp';
  if (low.includes('recurrente')) return 'Clientes recurrentes';
  if (low.includes('referid') || low.includes('recomend')) return 'Referidos';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------ */
/* Redes sociales                                                      */
/* ------------------------------------------------------------------ */

export const SOCIAL_DEFS: { key: SocialField | 'engagement' | 'cpr' | 'roas'; label: string; unit: Unit; help: string }[] = [
  { key: 'alcance', label: 'Alcance', unit: 'n', help: 'Personas únicas que vieron el contenido.' },
  { key: 'impresiones', label: 'Impresiones', unit: 'n', help: 'Veces que se mostró el contenido.' },
  { key: 'reproducciones', label: 'Reproducciones', unit: 'n', help: 'Reproducciones de video.' },
  { key: 'interacciones', label: 'Interacciones', unit: 'n', help: 'Reacciones, comentarios, compartidos y guardados.' },
  { key: 'engagement', label: 'Engagement rate', unit: '%', help: 'Interacciones ÷ alcance.' },
  { key: 'nuevosSeguidores', label: 'Nuevos seguidores', unit: 'n', help: 'Seguidores ganados en el período.' },
  { key: 'clicsEnlace', label: 'Clics a enlaces', unit: 'n', help: 'Clics en enlaces de publicaciones o anuncios.' },
  { key: 'consultas', label: 'Consultas generadas', unit: 'n', help: 'Mensajes o consultas iniciadas desde la red social.' },
  { key: 'leads', label: 'Leads', unit: 'n', help: 'Contactos calificados registrados.' },
  { key: 'conversiones', label: 'Conversiones atribuidas', unit: 'n', help: 'Ventas atribuidas a la plataforma.' },
  { key: 'inversion', label: 'Inversión publicitaria', unit: 'Q', help: 'Gasto en anuncios.' },
  { key: 'cpr', label: 'Costo por resultado', unit: 'Q2', help: 'Inversión ÷ conversiones atribuidas (o leads si no hay conversiones).' },
  { key: 'roas', label: 'ROAS', unit: 'n', help: 'Ingresos atribuidos ÷ inversión. Requiere ambos datos.' },
];

const SOCIAL_FIELDS: SocialField[] = [
  'alcance', 'impresiones', 'reproducciones', 'interacciones', 'seguidores', 'nuevosSeguidores',
  'clicsEnlace', 'consultas', 'leads', 'conversiones', 'inversion', 'ingresosAtribuidos',
];

export type SocialAgg = Partial<Record<SocialField | 'engagement' | 'cpr' | 'roas', number>>;

export function aggSocial(recs: SocialRecord[]): SocialAgg {
  const out: SocialAgg = {};
  for (const r of recs) {
    for (const f of SOCIAL_FIELDS) {
      const v = r[f];
      if (typeof v === 'number') {
        // Seguidores es un saldo: tomamos el último valor, no se suma
        out[f] = f === 'seguidores' ? v : (out[f] ?? 0) + v;
      }
    }
  }
  if (out.interacciones !== undefined && out.alcance) out.engagement = out.interacciones / out.alcance;
  const res = out.conversiones ?? out.leads;
  if (out.inversion !== undefined && res) out.cpr = out.inversion / res;
  if (out.ingresosAtribuidos !== undefined && out.inversion) out.roas = out.ingresosAtribuidos / out.inversion;
  return out;
}

export function socialFor(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  // Evitamos doble conteo: si hay 'organico'/'pagado' para una plataforma-mes, se ignora el 'total'
  const recs = ds.social.filter((r) => ids.has(r.companyId) && months.has(r.period));
  const split = new Set(recs.filter((r) => r.tipo !== 'total').map((r) => `${r.companyId}:${r.period}:${r.platform}`));
  const clean = recs.filter((r) => r.tipo !== 'total' || !split.has(`${r.companyId}:${r.period}:${r.platform}`));
  const platforms = [...new Set(clean.map((r) => r.platform))].sort();
  return { recs: clean, platforms, hasSplit: split.size > 0 };
}
