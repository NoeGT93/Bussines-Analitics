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
  ventas: { key: 'ventas', label: 'Ventas cerradas', unit: 'n', help: 'Número de ventas cerradas (leads que se convirtieron en clientes) en el período.', higherIsBetter: true },
  visitas: { key: 'visitas', label: 'Visitas web', unit: 'n', help: 'Visitas al sitio web registradas en el período.', higherIsBetter: true },
  clics: { key: 'clics', label: 'Clics', unit: 'n', help: 'Clics registrados (anuncios, enlaces o botones de contacto según el origen del archivo).', higherIsBetter: true },
  consultas: { key: 'consultas', label: 'Leads', unit: 'n', help: 'Leads o consultas recibidos por cualquier canal (mensajes, formularios, llamadas).', higherIsBetter: true },
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
    help: 'Ingresos ÷ ventas cerradas. Se recalcula desde los totales, no se promedian los tickets mensuales.',
    ratio: { num: 'ingresos', den: 'ventas' },
    higherIsBetter: true,
  },
  tasaConsulta: {
    key: 'tasaConsulta',
    label: 'Visitas que consultan',
    unit: '%',
    help: 'Leads ÷ visitas web.',
    ratio: { num: 'consultas', den: 'visitas' },
    higherIsBetter: true,
  },
  cierre: {
    key: 'cierre',
    label: 'Tasa de cierre',
    unit: '%',
    help: 'Ventas cerradas ÷ leads recibidos. Qué proporción de los leads termina en venta.',
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

export function kpi(ds: Dataset, scope: CompanyScope, range: DateRange, metric: SeriesMetric, cmp: DateRange | null = previousRange(range)): KpiResult {
  const rows = rowsFor(ds, scope, range);
  const prevRows = cmp ? rowsFor(ds, scope, cmp) : [];
  const cur = totalOf(rows, metric);
  const prev = totalOf(prevRows, metric);
  const isRate = METRICS[metric].unit === '%';
  // Solo comparamos si ambos períodos están completos, para no comparar 3 meses con 1
  const comparable = !!cmp && cur.coverage.have === cur.coverage.total && prev.coverage.total > 0 && prev.coverage.have === prev.coverage.total;
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

/* Meta: Facebook, Instagram y WhatsApp se trabajan como una sola estrategia ------ */
export const META_LABEL = 'Meta';
export const META_HELP = 'Meta = Facebook + Instagram + WhatsApp (y Messenger y formularios). Se suman porque la pauta se maneja como una sola estrategia.';
const META_RE = /^(instagram|facebook|whatsapp|messenger|formulario (instagram|facebook)|facebook \/ instagram)$/i;

/** ¿La empresa (o todas en el consolidado) agrupa las redes de Meta? Por defecto, sí */
export function groupsMeta(ds: Dataset, scope: CompanyScope) {
  return companyIdsFor(ds, scope).every((id) => ds.settings[id]?.agruparMeta !== false);
}

export function channelGroup(canal: string, meta: boolean) {
  return meta && META_RE.test(canal.trim()) ? META_LABEL : canal;
}

/** `group` fuerza agrupar (true) o desglosar (false) Meta; si se omite, se usa la preferencia de la empresa */
export function channelsFor(ds: Dataset, scope: CompanyScope, range: DateRange, group?: boolean): ChannelResult {
  const meta = group ?? groupsMeta(ds, scope);
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
      const key = channelGroup(normalizeChannel(r.canal), meta);
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
  const s = name.trim().replace(/\s+/g, ' ');
  const low = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const platform = (l: string) =>
    /instagram|\big\b/.test(l) ? 'Instagram' : /facebook|\bfb\b/.test(l) ? 'Facebook' : /tik ?tok/.test(l) ? 'TikTok' : /whats ?app?|whatsap|\bwa\b/.test(l) ? 'WhatsApp' : null;
  if (low.includes('formulario') || low.includes('lead form')) {
    const p = platform(low);
    return p ? `Formulario ${p}` : 'Formulario';
  }
  if (/(facebook|instagram|meta)/.test(low) && /(\/| y |&|\+)/.test(low)) return 'Facebook / Instagram';
  if (low.includes('messenger')) return 'Messenger';
  const p = platform(low);
  if (p) return p;
  if (low.includes('google')) return 'Google';
  if (low.includes('recurrente')) return 'Clientes recurrentes';
  if (low.includes('referid') || low.includes('recomend')) return 'Referidos';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Redes sociales                                                      */
/* ------------------------------------------------------------------ */

type SocialDerived = 'engagement' | 'cpr' | 'roas' | 'ctr' | 'cpc' | 'cpm';

export const SOCIAL_DEFS: { key: SocialField | SocialDerived; label: string; unit: Unit; help: string }[] = [
  { key: 'alcance', label: 'Alcance', unit: 'n', help: 'Cuántas personas distintas vieron el anuncio al menos una vez.' },
  { key: 'impresiones', label: 'Impresiones', unit: 'n', help: 'Cuántas veces en total se mostró el anuncio. Una misma persona puede verlo varias veces.' },
  { key: 'reproducciones', label: 'Reproducciones', unit: 'n', help: 'Veces que alguien reprodujo un video del anuncio.' },
  { key: 'interacciones', label: 'Interacciones', unit: 'n', help: 'Me gusta, comentarios, compartidos y guardados que recibió el anuncio.' },
  { key: 'engagement', label: 'Engagement', unit: '%', help: 'De cada 100 personas que vieron el anuncio, cuántas reaccionaron. Mide si el contenido conecta. Más alto es mejor.' },
  { key: 'nuevosSeguidores', label: 'Nuevos seguidores', unit: 'n', help: 'Personas que empezaron a seguir la cuenta.' },
  { key: 'clicsEnlace', label: 'Clics', unit: 'n', help: 'Veces que alguien tocó el anuncio para escribir, llenar el formulario o ver más.' },
  { key: 'ctr', label: 'CTR', unit: '%', help: 'De cada 100 veces que se mostró el anuncio, cuántas lo tocaron. Mide si el anuncio llama la atención. Más alto es mejor.' },
  { key: 'leads', label: 'Leads', unit: 'n', help: 'Personas interesadas que escribieron o dejaron sus datos para pedir información.' },
  { key: 'conversiones', label: 'Ventas cerradas', unit: 'n', help: 'Leads que terminaron inscribiéndose al gimnasio.' },
  { key: 'inversion', label: 'Inversión', unit: 'Q', help: 'Lo que se pagó en publicidad en esa red durante el período.' },
  { key: 'cpm', label: 'CPM', unit: 'Q2', help: 'Cuánto cuesta que el anuncio se muestre 1,000 veces. Dice qué tan cara es la red para aparecer. Más bajo es mejor.' },
  { key: 'cpc', label: 'CPC', unit: 'Q2', help: 'Cuánto cuesta cada vez que alguien toca el anuncio. Más bajo es mejor.' },
  { key: 'cpr', label: 'Costo por venta', unit: 'Q2', help: 'Cuánto costó en publicidad conseguir cada inscripción (inversión ÷ ventas cerradas). Más bajo es mejor.' },
  { key: 'roas', label: 'ROAS', unit: 'n', help: 'Cuántos quetzales se vendieron por cada quetzal de publicidad. 6× = Q 6 de venta por cada Q 1. Más alto es mejor.' },
];

const SOCIAL_FIELDS: SocialField[] = [
  'alcance', 'impresiones', 'reproducciones', 'interacciones', 'seguidores', 'nuevosSeguidores',
  'clicsEnlace', 'consultas', 'leads', 'conversiones', 'inversion', 'ingresosAtribuidos',
];

export type SocialAgg = Partial<Record<SocialField | SocialDerived, number>>;

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
  if (out.clicsEnlace !== undefined && out.impresiones) out.ctr = out.clicsEnlace / out.impresiones;
  if (out.inversion !== undefined && out.clicsEnlace) out.cpc = out.inversion / out.clicsEnlace;
  if (out.inversion !== undefined && out.impresiones) out.cpm = (out.inversion / out.impresiones) * 1000;
  return out;
}

export function socialFor(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  // Evitamos doble conteo: si hay 'organico'/'pagado' para una plataforma-mes, se ignora el 'total'
  const meta = groupsMeta(ds, scope);
  const recs = ds.social
    .filter((r) => ids.has(r.companyId) && months.has(r.period))
    .map((r) => (meta ? { ...r, platform: channelGroup(r.platform, true) } : r));
  const split = new Set(recs.filter((r) => r.tipo !== 'total').map((r) => `${r.companyId}:${r.period}:${r.platform}`));
  const clean = recs.filter((r) => r.tipo !== 'total' || !split.has(`${r.companyId}:${r.period}:${r.platform}`));
  const platforms = [...new Set(clean.map((r) => r.platform))].sort();
  const tipos = new Set(clean.map((r) => r.tipo));
  return { recs: clean, platforms, hasSplit: tipos.has('organico') && tipos.has('pagado'), estimado: clean.some((r) => r.estimado) };
}
