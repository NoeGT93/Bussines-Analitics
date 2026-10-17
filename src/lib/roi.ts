import type { CompanyScope, Dataset, DateRange, Period } from '../types';
import { channelsFor, companyIdsFor, rowsFor } from './metrics';
import { monthsBetween } from './periods';

/**
 * ROI y costos de retorno.
 * Fórmulas (todas en quetzales):
 *  - Retorno = ingresos × margen bruto (si se define margen); si no, se usan los ingresos completos.
 *  - ROI = (retorno − inversión) ÷ inversión
 *  - ROAS = ingresos ÷ inversión
 *  - Costo por venta (CPA) = inversión ÷ ventas
 *  - Costo por cliente nuevo (CAC) = inversión ÷ clientes nuevos
 *  - Costo por consulta = inversión ÷ clics/consultas
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
}

function compute(inv: number | undefined, x: { ingresos?: number; ventas?: number; clientes?: number; consultas?: number }, margen?: number): RoiMetrics {
  const m = margen ?? 1;
  const out: RoiMetrics = { inversion: inv, ingresos: x.ingresos, ventas: x.ventas };
  if (x.ingresos !== undefined) out.retorno = x.ingresos * m;
  if (!inv || inv <= 0) return out;
  if (x.ingresos !== undefined) {
    out.roi = (x.ingresos * m - inv) / inv;
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
}

export function roiByChannel(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  const margen = marginFor(ds, scope);
  const ch = channelsFor(ds, scope, range);
  const costs = ds.costs.filter((c) => ids.has(c.companyId) && c.canal && (c.period === null || months.has(c.period)));
  const rows: ChannelRoi[] = ch.channels.map((c) => {
    const own = costs.filter((x) => x.canal === c.canal);
    const inv = own.length ? own.reduce((s, x) => s + x.inversion, 0) : undefined;
    return {
      canal: c.canal,
      consultas: c.values.clics ?? c.values.consultas,
      ...compute(inv, { ingresos: c.values.ingresos, ventas: c.values.ventas, consultas: c.values.clics ?? c.values.consultas }, margen),
    };
  });
  // Costos de canales que no existen en los datos por canal
  const known = new Set(ch.channels.map((c) => c.canal));
  const orphan = [...new Set(costs.filter((c) => !known.has(c.canal!)).map((c) => c.canal!))];
  return { rows, mode: ch.mode, margen, orphan };
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

export const ROI_GLOSSARY: { term: string; formula: string; reading: string }[] = [
  { term: 'Inversión', formula: 'Lo que se pagó en publicidad, pauta, diseño o comisiones', reading: 'Es el costo que se quiere recuperar. Sin este dato no existe ROI.' },
  { term: 'ROI', formula: '(Retorno − inversión) ÷ inversión', reading: '50 % significa que por cada Q 1 invertido se recuperó Q 1 y se ganaron Q 0.50 extra. Negativo = no se recuperó la inversión.' },
  { term: 'ROAS', formula: 'Ingresos ÷ inversión', reading: '4× significa Q 4 de ingresos por cada Q 1 de publicidad. No descuenta costos del producto.' },
  { term: 'Costo por quetzal generado', formula: 'Inversión ÷ ingresos', reading: 'Q 0.25 significa que cada quetzal vendido costó 25 centavos de publicidad. Es el inverso del ROAS.' },
  { term: 'Costo por venta (CPA)', formula: 'Inversión ÷ ventas', reading: 'Cuánto cuesta en publicidad conseguir cada venta.' },
  { term: 'Costo por cliente nuevo (CAC)', formula: 'Inversión ÷ clientes nuevos', reading: 'Cuánto cuesta atraer a cada cliente que compra por primera vez.' },
  { term: 'Costo por consulta', formula: 'Inversión ÷ clics o consultas', reading: 'Cuánto cuesta cada persona que pregunta o hace clic.' },
  { term: 'Ventas para recuperar la inversión', formula: 'Inversión ÷ (ticket promedio × margen)', reading: 'Punto de equilibrio: cuántas ventas hacen falta para pagar lo invertido.' },
  { term: 'Margen bruto', formula: '(Precio − costo del producto o servicio) ÷ precio', reading: 'Si se define, el ROI se calcula sobre la utilidad y no sobre los ingresos completos, que es lo correcto.' },
];
