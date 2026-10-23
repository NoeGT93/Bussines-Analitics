import type { CompanyScope, Dataset, DateRange, Period } from '../types';
import { channelGroup, channelsFor, companyIdsFor, groupsMeta, META_LABEL, rowsFor } from './metrics';
import { monthsBetween } from './periods';

/**
 * ROI y costos de retorno.
 * Fórmulas (todas en quetzales):
 *  - ROI = inversión ÷ total de venta × 100, como en el Excel del negocio (más bajo es mejor)
 *  - Beneficio neto = ventas × margen bruto − inversión. Sin margen definido: ventas − inversión
 *    (no descuenta renta, planilla ni otros gastos).
 *  - ROAS = ingresos ÷ inversión
 *  - Costo por venta (CPA) = inversión ÷ ventas
 *  - Costo por cliente nuevo (CAC) = inversión ÷ clientes nuevos
 *  - CPL (costo por lead) = inversión ÷ leads recibidos
 *  - CPM = inversión en anuncios ÷ impresiones × 1,000; CPC = inversión ÷ clics; CTR = clics ÷ impresiones
 *  - Costo por quetzal generado = inversión ÷ ingresos
 *  - Ventas para recuperar la inversión = inversión ÷ (ticket promedio × margen)
 */

export interface RoiMetrics {
  inversion?: number;
  ingresos?: number;
  retorno?: number;
  roi?: number;
  roas?: number;
  cpa?: number;
  cac?: number;
  costoConsulta?: number;
  costoPorQuetzal?: number;
  ventasEquilibrio?: number;
  ventas?: number;
  leads?: number;
  /** Beneficio neto = retorno − inversión */
  beneficio?: number;
}

function compute(inv: number | undefined, x: { ingresos?: number; ventas?: number; clientes?: number; consultas?: number }, margen?: number): RoiMetrics {
  const m = margen ?? 1;
  const out: RoiMetrics = { inversion: inv, ingresos: x.ingresos, ventas: x.ventas, leads: x.consultas };
  if (x.ingresos !== undefined) out.retorno = x.ingresos * m;
  if (!inv || inv <= 0) return out;
  if (out.retorno !== undefined) out.beneficio = out.retorno - inv;
  if (x.ingresos !== undefined) {
    // ROI del reporte: inversión ÷ total de venta
    if (x.ingresos > 0) out.roi = inv / x.ingresos;
    out.roas = x.ingresos / inv;
    if (x.ingresos > 0) out.costoPorQuetzal = inv / x.ingresos;
  }
  if (x.ventas) {
    out.cpa = inv / x.ventas;
    if (x.ingresos !== undefined && x.ingresos > 0) out.ventasEquilibrio = inv / ((x.ingresos / x.ventas) * m);
  }
  if (x.clientes) out.cac = inv / x.clientes;
  if (x.consultas) out.costoConsulta = inv / x.consultas;
  return out;
}

export function marginFor(ds: Dataset, scope: CompanyScope): number | undefined {
  if (scope === 'consolidado') {
    const ms = ds.companies.map((c) => ds.settings[c.id]?.margen);
    return ms.every((x) => x !== undefined && x === ms[0]) ? ms[0] : undefined;
  }
  return ds.settings[scope]?.margen;
}

export interface ChannelRoi extends RoiMetrics {
  canal: string;
  consultas?: number;
  cierre?: number;
}

export function roiByChannel(ds: Dataset, scope: CompanyScope, range: DateRange, group?: boolean) {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  const margen = marginFor(ds, scope);
  const meta = group ?? groupsMeta(ds, scope);
  const ch = channelsFor(ds, scope, range, meta);
  const costs = ds.costs
    .filter((c) => ids.has(c.companyId) && c.canal && (c.period === null || months.has(c.period)))
    .map((c) => (meta ? { ...c, canal: channelGroup(c.canal!, true) } : c));
  const rows: ChannelRoi[] = ch.channels.map((c) => {
    const own = costs.filter((x) => x.canal === c.canal);
    const inv = own.length ? own.reduce((s, x) => s + x.inversion, 0) : undefined;
    return {
      canal: c.canal,
      consultas: c.values.consultas ?? c.values.clics,
      cierre: c.cierre,
      ...compute(inv, { ingresos: c.values.ingresos, ventas: c.values.ventas, consultas: c.values.consultas ?? c.values.clics }, margen),
    };
  });
  // Costos de canales que no existen en los datos por canal
  const known = new Set(ch.channels.map((c) => c.canal));
  const orphan = [...new Set(costs.filter((c) => !known.has(c.canal!)).map((c) => c.canal!))];
  return { rows, mode: ch.mode, margen, orphan };
}

/** Redes que forman Meta (Facebook, Instagram, WhatsApp…) con sus propios indicadores, para desplegarlas bajo la fila Meta */
export function metaBranches(ds: Dataset, scope: CompanyScope, range: DateRange): ChannelRoi[] {
  return roiByChannel(ds, scope, range, false).rows.filter((r) => channelGroup(r.canal, true) === META_LABEL);
}

export interface MonthRoi extends RoiMetrics {
  period: Period;
}

/** ROI mensual con la inversión total del mes (todas las líneas de costo de ese mes, con o sin canal) */
export function roiByMonth(ds: Dataset, scope: CompanyScope, range: DateRange): MonthRoi[] {
  const ids = new Set(companyIdsFor(ds, scope));
  const margen = marginFor(ds, scope);
  return rowsFor(ds, scope, range).map((r) => {
    const own = ds.costs.filter((c) => ids.has(c.companyId) && c.period === r.period);
    const inv = own.length ? own.reduce((s, x) => s + x.inversion, 0) : undefined;
    return {
      period: r.period,
      ...compute(inv, { ingresos: r.values.ingresos, ventas: r.values.ventas, clientes: r.values.clientesNuevos, consultas: r.values.consultas ?? r.values.clics }, margen),
    };
  });
}

/** Totales del período: inversión de todas las líneas (mensuales del rango + acumuladas) */
export function roiTotal(ds: Dataset, scope: CompanyScope, range: DateRange): RoiMetrics & { hasCosts: boolean } {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  const margen = marginFor(ds, scope);
  const costs = ds.costs.filter((c) => ids.has(c.companyId) && (c.period === null || months.has(c.period)));
  const inv = costs.length ? costs.reduce((s, x) => s + x.inversion, 0) : undefined;
  const rows = rowsFor(ds, scope, range);
  const sum = (k: 'ingresos' | 'ventas' | 'clientesNuevos' | 'consultas' | 'clics') => {
    const v = rows.map((r) => r.values[k]).filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) : undefined;
  };
  return {
    hasCosts: costs.length > 0,
    ...compute(inv, { ingresos: sum('ingresos'), ventas: sum('ventas'), clientes: sum('clientesNuevos'), consultas: sum('consultas') ?? sum('clics') }, margen),
  };
}

/** Métricas de anuncios: requieren impresiones y clics (Meta Ads, TikTok Ads) importados en Redes sociales */
export function adMetrics(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  const recs = ds.social.filter((r) => ids.has(r.companyId) && months.has(r.period));
  const sum = (k: 'impresiones' | 'clicsEnlace' | 'inversion') => {
    const v = recs.map((r) => r[k]).filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) : undefined;
  };
  const imp = sum('impresiones');
  const clics = sum('clicsEnlace');
  const inv = sum('inversion');
  return {
    impresiones: imp,
    clics,
    inversion: inv,
    cpm: inv !== undefined && imp ? (inv / imp) * 1000 : undefined,
    cpc: inv !== undefined && clics ? inv / clics : undefined,
    ctr: clics !== undefined && imp ? clics / imp : undefined,
  };
}

export const ROI_GLOSSARY: { term: string; formula: string; reading: string; needs?: string }[] = [
  { term: 'ROI', formula: 'Inversión ÷ total de venta × 100', reading: 'Como en el Excel: qué parte de la venta se fue en publicidad. 9.95 % = de cada Q 100 vendidos, Q 9.95 fueron publicidad. Más bajo es mejor.' },
  { term: 'CPL', formula: 'Inversión ÷ leads recibidos', reading: 'Costo por contacto: cuánto cuesta cada persona que escribe, llena un formulario o pregunta.' },
  { term: 'CPA', formula: 'Inversión ÷ ventas cerradas', reading: 'Costo por acción o conversión: cuánto cuesta cada lead que termina inscribiéndose.' },
  { term: 'CPM', formula: 'Inversión en anuncios ÷ impresiones × 1,000', reading: 'Costo por mil impresiones: cuánto cuesta que el anuncio se muestre mil veces.', needs: 'Impresiones del administrador de anuncios' },
  { term: 'CPC', formula: 'Inversión en anuncios ÷ clics', reading: 'Costo por clic en el anuncio.', needs: 'Clics del administrador de anuncios' },
  { term: 'CTR', formula: 'Clics ÷ impresiones', reading: 'Qué porcentaje de quienes vieron el anuncio hizo clic.', needs: 'Impresiones y clics' },
  { term: 'ROAS', formula: 'Ventas ÷ inversión', reading: 'Quetzales vendidos por cada quetzal invertido. 6× = Q 6 de venta por cada Q 1 de publicidad.' },
  { term: 'Ventas para recuperar la inversión', formula: 'Inversión ÷ (ticket promedio × margen)', reading: 'Punto de equilibrio: cuántas inscripciones hacen falta para pagar lo invertido.' },
];
