import type { CompanyScope, Dataset, DateRange } from '../types';
import { channelsFor, METRICS, rowsFor, totalOf, type SeriesMetric } from './metrics';
import { fmt, pct, pp } from './format';
import { labelLong, labelRange, previousRange } from './periods';
import { roiByChannel, roiByMonth, roiTotal } from './roi';

export type InsightTone = 'positive' | 'negative' | 'neutral' | 'attention';
export type InsightCategory = 'Ingresos' | 'Ventas' | 'Ticket' | 'Tráfico' | 'Conversión' | 'Canales' | 'ROI' | 'Datos';

export interface Insight {
  id: string;
  tone: InsightTone;
  category: InsightCategory;
  title: string;
  figure: string;
  body: string;
  /** Cómo se calculó: transparente y verificable */
  basis: string;
  weight: number; // para ordenar por relevancia
}

export interface InsightContext {
  ds: Dataset;
  scope: CompanyScope;
  range: DateRange;
}

/**
 * Proveedor de hallazgos. Hoy: reglas analíticas transparentes.
 * Para integrar IA más adelante, crea otro proveedor que implemente esta interfaz
 * (por ejemplo, enviando las filas agregadas a un endpoint) y agrégalo a `providers`.
 * Los hallazgos de IA deben mostrarse etiquetados como tales.
 */
export interface InsightProvider {
  id: string;
  label: string;
  generate(ctx: InsightContext): Insight[];
}

const pctChange = (a?: number, b?: number) => (a !== undefined && b !== undefined && a !== 0 ? (b - a) / Math.abs(a) : undefined);

export const rulesProvider: InsightProvider = {
  id: 'rules',
  label: 'Reglas analíticas',
  generate({ ds, scope, range }) {
    const out: Insight[] = [];
    const rows = rowsFor(ds, scope, range);
    const withData = rows.filter((r) => Object.keys(r.values).length > 0);
    if (!withData.length) return out;
    const prevRange = previousRange(range);
    const prevRows = rowsFor(ds, scope, prevRange);

    // 1. Ingresos vs período anterior
    const ing = totalOf(rows, 'ingresos');
    const ingPrev = totalOf(prevRows, 'ingresos');
    if (ing.value !== undefined && ingPrev.value !== undefined && ing.coverage.have === ing.coverage.total && ingPrev.coverage.have === ingPrev.coverage.total) {
      const d = pctChange(ingPrev.value, ing.value)!;
      out.push({
        id: 'ing-prev',
        tone: d >= 0 ? 'positive' : 'negative',
        category: 'Ingresos',
        title: d >= 0 ? 'Ingresos por encima del período anterior' : 'Ingresos por debajo del período anterior',
        figure: pct(d),
        body: `${fmt(ing.value, 'Q')} en ${labelRange(range)} frente a ${fmt(ingPrev.value, 'Q')} en ${labelRange(prevRange)}.`,
        basis: 'Suma de ingresos del rango ÷ suma del rango anterior de igual duración − 1.',
        weight: 10 + Math.abs(d) * 10,
      });
    }

    // 2. Último mes vs mes anterior
    const last = withData[withData.length - 1];
    const prevIdx = rows.indexOf(last) - 1;
    const before = prevIdx >= 0 ? rows[prevIdx] : undefined;
    if (before && last.values.ingresos !== undefined && before.values.ingresos !== undefined) {
      const d = pctChange(before.values.ingresos, last.values.ingresos)!;
      if (Math.abs(d) >= 0.05) {
        out.push({
          id: 'ing-mom',
          tone: d >= 0 ? 'positive' : 'negative',
          category: 'Ingresos',
          title: `${labelLong(last.period)}: ${d >= 0 ? 'subida' : 'caída'} de ingresos frente al mes anterior`,
          figure: pct(d),
          body: `${fmt(last.values.ingresos, 'Q')} contra ${fmt(before.values.ingresos, 'Q')} en ${labelLong(before.period)}.`,
          basis: 'Comparación directa de ingresos entre los dos últimos meses del rango. Se reporta si la variación es de 5 % o más.',
          weight: 8 + Math.abs(d) * 10,
        });
      }
    }

    // 3. Mejor y peor mes
    const byIng = withData.filter((r) => r.values.ingresos !== undefined);
    if (byIng.length >= 3) {
      const best = byIng.reduce((a, b) => (b.values.ingresos! > a.values.ingresos! ? b : a));
      const worst = byIng.reduce((a, b) => (b.values.ingresos! < a.values.ingresos! ? b : a));
      const avg = byIng.reduce((s, r) => s + r.values.ingresos!, 0) / byIng.length;
      out.push({
        id: 'best-month',
        tone: 'neutral',
        category: 'Ingresos',
        title: `${labelLong(best.period)} fue el mes con más ingresos`,
        figure: fmt(best.values.ingresos, 'Q'),
        body: `${pct(best.values.ingresos! / avg - 1)} sobre el promedio mensual del rango (${fmt(avg, 'Q')}). El mes más bajo fue ${labelLong(worst.period)} con ${fmt(worst.values.ingresos, 'Q')}.`,
        basis: 'Máximo y mínimo de ingresos mensuales dentro del rango seleccionado.',
        weight: 6,
      });
    }

    // 4. Ticket promedio: primer vs último mes
    const tk = withData.filter((r) => r.values.ticket !== undefined);
    if (tk.length >= 2) {
      const a = tk[0];
      const b = tk[tk.length - 1];
      const d = pctChange(a.values.ticket, b.values.ticket)!;
      out.push({
        id: 'ticket',
        tone: Math.abs(d) < 0.03 ? 'neutral' : d > 0 ? 'positive' : 'attention',
        category: 'Ticket',
        title: Math.abs(d) < 0.03 ? 'Ticket promedio estable' : d > 0 ? 'El ticket promedio subió' : 'El ticket promedio bajó',
        figure: pct(d),
        body: `De ${fmt(a.values.ticket, 'Q2')} en ${labelLong(a.period)} a ${fmt(b.values.ticket, 'Q2')} en ${labelLong(b.period)}.`,
        basis: 'Ticket = ingresos ÷ ventas de cada mes. Se compara el primer y el último mes con datos.',
        weight: 5 + Math.abs(d) * 10,
      });
    }

    // 5. Tráfico vs resultado comercial
    const pair = (m: SeriesMetric) => {
      const xs = withData.filter((r) => r.values[m] !== undefined);
      return xs.length >= 2 ? pctChange(xs[0].values[m], xs[xs.length - 1].values[m]) : undefined;
    };
    const dv = pair('visitas');
    const ds_ = pair('ventas');
    if (dv !== undefined && ds_ !== undefined) {
      const gap = ds_ - dv;
      const aligned = Math.abs(gap) < 0.05;
      out.push({
        id: 'traffic-vs-sales',
        tone: aligned ? 'neutral' : gap > 0 ? 'positive' : 'attention',
        category: 'Tráfico',
        title: aligned
          ? 'Tráfico y ventas crecieron a ritmo similar'
          : gap > 0
            ? 'Las ventas crecieron más que el tráfico'
            : 'El tráfico creció más que las ventas',
        figure: `${pct(dv, 0)} / ${pct(ds_, 0)}`,
        body: `Visitas web ${pct(dv)} y ventas ${pct(ds_)} entre el primer y el último mes del rango. ${
          aligned ? '' : gap > 0 ? 'Cada visita está coincidiendo con más ventas.' : 'Conviene revisar qué ocurre entre la visita y la venta.'
        }`.trim(),
        basis: 'Variación del primer al último mes con datos para visitas y para ventas. Es una comparación, no una relación causal.',
        weight: 7 + Math.abs(gap) * 8,
      });
    }

    // 5b. Ventas e ingresos en direcciones opuestas
    const di = pair('ingresos');
    if (ds_ !== undefined && di !== undefined && Math.sign(ds_) !== Math.sign(di) && Math.abs(ds_ - di) > 0.15) {
      out.push({
        id: 'sales-vs-revenue',
        tone: 'attention',
        category: 'Ventas',
        title: ds_ > 0 ? 'Más ventas, pero menos ingresos' : 'Menos ventas, pero más ingresos',
        figure: `${pct(ds_, 0)} / ${pct(di, 0)}`,
        body: `Ventas ${pct(ds_)} e ingresos ${pct(di)} entre el primer y el último mes del rango. Ocurre cuando baja el ticket promedio; también puede indicar un error de registro en los ingresos.`,
        basis: 'Variación del primer al último mes con datos, para ventas y para ingresos.',
        weight: 14,
      });
    }

    // 6. Cambios de conversión
    for (const m of ['conversion', 'cierre'] as const) {
      const xs = withData.filter((r) => r.values[m] !== undefined);
      if (xs.length < 3) continue;
      const lastV = xs[xs.length - 1].values[m]!;
      const avg = totalOf(rows, m).value!;
      const diff = lastV - avg;
      if (Math.abs(diff) >= 0.01) {
        out.push({
          id: `rate-${m}`,
          tone: diff > 0 ? 'positive' : 'attention',
          category: 'Conversión',
          title: `${METRICS[m].label} de ${labelLong(xs[xs.length - 1].period)} ${diff > 0 ? 'sobre' : 'bajo'} el promedio del rango`,
          figure: pp(diff),
          body: `${fmt(lastV, '%')} contra ${fmt(avg, '%')} acumulado del rango.`,
          basis: `${METRICS[m].help} Se reporta si la diferencia es de 1 punto porcentual o más.`,
          weight: 6 + Math.abs(diff) * 100,
        });
      }
    }

    // 7. Canales
    const ch = channelsFor(ds, scope, range);
    if (ch.channels.length >= 2) {
      const note = ch.mode === 'acumulado' ? ' Datos acumulados del archivo, no filtrados por fecha.' : '';
      const totalIng = ch.channels.reduce((s, c) => s + (c.values.ingresos ?? 0), 0);
      const byIngC = [...ch.channels].filter((c) => c.values.ingresos !== undefined).sort((a, b) => b.values.ingresos! - a.values.ingresos!);
      if (byIngC.length && totalIng) {
        const top = byIngC[0];
        out.push({
          id: 'ch-ing',
          tone: 'neutral',
          category: 'Canales',
          title: `${top.canal} aporta la mayor parte de los ingresos`,
          figure: fmt(top.values.ingresos! / totalIng, '%'),
          body: `${fmt(top.values.ingresos, 'Q')} de ${fmt(totalIng, 'Q')} atribuidos por canal.${note}`,
          basis: 'Ingresos del canal ÷ suma de ingresos de todos los canales.',
          weight: 7,
        });
      }
      const byVentas = [...ch.channels].filter((c) => c.values.ventas !== undefined).sort((a, b) => b.values.ventas! - a.values.ventas!);
      if (byVentas.length && byIngC.length && byVentas[0].canal !== byIngC[0].canal) {
        out.push({
          id: 'ch-ventas',
          tone: 'neutral',
          category: 'Canales',
          title: `${byVentas[0].canal} genera más ventas, aunque no más ingresos`,
          figure: fmt(byVentas[0].values.ventas, 'n'),
          body: `Su ticket promedio es ${fmt(byVentas[0].ticket, 'Q2')} frente a ${fmt(byIngC[0].ticket, 'Q2')} de ${byIngC[0].canal}.${note}`,
          basis: 'Orden de canales por número de ventas comparado con el orden por ingresos.',
          weight: 6,
        });
      }
      // Leads y cierre por red (cuando los datos son leads recibidos y cerrados)
      const totalLeads = ch.channels.reduce((s, c) => s + (c.values.consultas ?? 0), 0);
      const byLeads = [...ch.channels].filter((c) => c.values.consultas !== undefined).sort((a, b) => b.values.consultas! - a.values.consultas!);
      const byCierre = [...ch.channels].filter((c) => c.cierre !== undefined && (c.values.consultas ?? 0) >= 30).sort((a, b) => b.cierre! - a.cierre!);
      if (byLeads.length >= 2 && byCierre.length >= 2 && totalLeads) {
        const top = byLeads[0];
        const best = byCierre[0];
        const worst = byCierre[byCierre.length - 1];
        if (top.canal !== best.canal) {
          out.push({
            id: 'ch-leads-vs-cierre',
            tone: 'attention',
            category: 'Canales',
            title: `${top.canal} trae más leads, pero ${best.canal} cierra mejor`,
            figure: `${fmt(top.cierre, '%')} / ${fmt(best.cierre, '%')}`,
            body: `${top.canal} aporta ${fmt(top.values.consultas! / totalLeads, '%')} de los leads y cierra ${fmt(top.cierre, '%')}; ${best.canal} cierra ${fmt(best.cierre, '%')} de los suyos.${note}`,
            basis: 'Leads recibidos y ventas cerradas por red en el rango. Tasa de cierre = cerrados ÷ recibidos.',
            weight: 10,
          });
        } else {
          out.push({
            id: 'ch-best',
            tone: 'positive',
            category: 'Canales',
            title: `${best.canal} trae más leads y además cierra mejor`,
            figure: fmt(best.cierre, '%'),
            body: `${fmt(best.values.consultas)} leads, ${fmt(best.values.ventas)} cerrados.${note}`,
            basis: 'Tasa de cierre = cerrados ÷ recibidos, por red.',
            weight: 9,
          });
        }
        if (worst.cierre! < (best.cierre ?? 0) / 2) {
          out.push({
            id: 'ch-worst',
            tone: 'attention',
            category: 'Canales',
            title: `${worst.canal} tiene el cierre más bajo`,
            figure: fmt(worst.cierre, '%'),
            body: `${fmt(worst.values.ventas)} cerrados de ${fmt(worst.values.consultas)} leads en el período, menos de la mitad que ${best.canal}.${note}`,
            basis: 'Tasa de cierre por red; solo redes con 30 leads o más.',
            weight: 7,
          });
        }
      }
      const byConv = [...ch.channels].filter((c) => c.conversion !== undefined && (c.values.visitas ?? 0) >= 50).sort((a, b) => b.conversion! - a.conversion!);
      if (byConv.length >= 2) {
        out.push({
          id: 'ch-conv',
          tone: 'positive',
          category: 'Canales',
          title: `${byConv[0].canal} tiene la mejor conversión por visita`,
          figure: fmt(byConv[0].conversion, '%'),
          body: `${fmt(byConv[0].values.ventas)} ventas de ${fmt(byConv[0].values.visitas)} visitas. El canal con menor conversión es ${byConv[byConv.length - 1].canal} (${fmt(byConv[byConv.length - 1].conversion, '%')}).${note}`,
          basis: 'Ventas ÷ visitas por canal. Solo canales con 50 visitas o más.',
          weight: 6,
        });
      }
    }

    // 7b. ROI
    const rt = roiTotal(ds, scope, range);
    if (!rt.hasCosts) {
      out.push({
        id: 'roi-missing',
        tone: 'attention',
        category: 'ROI',
        title: 'Falta la inversión para calcular el ROI',
        figure: 'Sin costos',
        body: 'Los datos no incluyen cuánto se invirtió en publicidad ni en cada canal. Regístralo en la sección ROI y costos para ver el retorno, el costo por venta y el costo por cliente nuevo.',
        basis: 'ROI = (retorno − inversión) ÷ inversión. Sin inversión no se puede calcular.',
        weight: 8,
      });
    } else {
      if (rt.roi !== undefined) {
        out.push({
          id: 'roi-total',
          tone: rt.roi >= 0 ? 'positive' : 'negative',
          category: 'ROI',
          title: rt.roi >= 0 ? 'La inversión del período se recuperó' : 'La inversión del período no se recuperó',
          figure: fmt(rt.roi, '%'),
          body: `Inversión ${fmt(rt.inversion, 'Q')} y ventas de ${fmt(rt.ingresos, 'Q')}: beneficio neto de ${fmt(rt.beneficio, 'Q')}. Cada lead costó ${fmt(rt.costoConsulta, 'Q2')} y cada venta cerrada ${fmt(rt.cpa, 'Q2')}.`,
          basis: 'ROI = beneficio neto ÷ inversión × 100. Sin margen definido, beneficio neto = ventas − inversión (no descuenta otros gastos).',
          weight: 12,
        });
      }
      const rm = roiByMonth(ds, scope, range).filter((m) => m.costoConsulta !== undefined);
      if (rm.length >= 3) {
        const f = rm[0];
        const l = rm[rm.length - 1];
        const d = l.costoConsulta! / f.costoConsulta! - 1;
        if (Math.abs(d) >= 0.15) {
          out.push({
            id: 'cpl-trend',
            tone: d > 0 ? 'negative' : 'positive',
            category: 'ROI',
            title: d > 0 ? 'Cada lead cuesta más que al inicio' : 'Cada lead cuesta menos que al inicio',
            figure: pct(d),
            body: `CPL de ${fmt(f.costoConsulta, 'Q2')} en ${labelLong(f.period)} a ${fmt(l.costoConsulta, 'Q2')} en ${labelLong(l.period)}; el CPA pasó de ${fmt(f.cpa, 'Q2')} a ${fmt(l.cpa, 'Q2')}.`,
            basis: 'CPL = inversión del mes ÷ leads recibidos. CPA = inversión ÷ ventas cerradas.',
            weight: 11,
          });
        }
        const best = rm.reduce((a, b) => ((b.roi ?? -Infinity) > (a.roi ?? -Infinity) ? b : a));
        const worst = rm.reduce((a, b) => ((b.roi ?? Infinity) < (a.roi ?? Infinity) ? b : a));
        if (best.roi !== undefined && worst.roi !== undefined && best.period !== worst.period) {
          out.push({
            id: 'roi-months',
            tone: 'neutral',
            category: 'ROI',
            title: `${labelLong(best.period)} fue el mes más rentable`,
            figure: fmt(best.roi, '%'),
            body: `Con la misma inversión, ${labelLong(worst.period)} tuvo el ROI más bajo (${fmt(worst.roi, '%')}).`,
            basis: 'ROI mensual = (ventas − inversión) ÷ inversión, o con margen si está definido.',
            weight: 9,
          });
        }
      }
      const rc = roiByChannel(ds, scope, range).rows.filter((r) => r.roi !== undefined).sort((a, b) => b.roi! - a.roi!);
      if (rc.length >= 2) {
        const best = rc[0];
        const worst = rc[rc.length - 1];
        out.push({
          id: 'roi-channels',
          tone: 'neutral',
          category: 'ROI',
          title: `${best.canal} devuelve más por cada quetzal invertido`,
          figure: fmt(best.roi, '%'),
          body: `Costo por venta ${fmt(best.cpa, 'Q2')}. El menor retorno es ${worst.canal} (${fmt(worst.roi, '%')}, costo por venta ${fmt(worst.cpa, 'Q2')}).`,
          basis: 'ROI por canal con los ingresos atribuidos a cada canal en el archivo. Es atribución declarada, no causal.',
          weight: 11,
        });
      }
    }

    // 8. Cobertura de datos
    const missing = rows.filter((r) => Object.keys(r.values).length === 0);
    if (missing.length && missing.length < rows.length) {
      out.push({
        id: 'coverage',
        tone: 'attention',
        category: 'Datos',
        title: `${missing.length} ${missing.length === 1 ? 'mes sin datos' : 'meses sin datos'} en el rango`,
        figure: `${rows.length - missing.length}/${rows.length}`,
        body: `Sin registros para ${missing.map((r) => labelLong(r.period)).join(', ')}. Los totales usan solo los meses disponibles.`,
        basis: 'Meses del rango sin ningún indicador registrado.',
        weight: 4,
      });
    }
    const blocked = new Set(rows.flatMap((r) => r.blocked));
    if (scope === 'consolidado' && blocked.size) {
      out.push({
        id: 'blocked',
        tone: 'attention',
        category: 'Datos',
        title: 'Algunos indicadores no se consolidan',
        figure: String(blocked.size),
        body: `${[...blocked].map((m) => METRICS[m].label).join(', ')}: al menos una empresa no tiene el dato para todos los meses, así que no se suman.`,
        basis: 'La vista consolidada solo suma un indicador cuando todas las empresas lo tienen en ese mes.',
        weight: 9,
      });
    }

    return out.sort((a, b) => b.weight - a.weight);
  },
};

export const providers: InsightProvider[] = [rulesProvider];

export function generateInsights(ctx: InsightContext): Insight[] {
  return providers.flatMap((p) => p.generate(ctx));
}
