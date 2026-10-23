import type { CompanyScope, Dataset, DateRange } from '../types';
import { metaBranches, roiByChannel, roiByMonth, roiTotal } from './roi';
import { aggSocial, rowsFor, socialFor, totalOf } from './metrics';
import { fmt } from './format';
import { labelLong, labelRange } from './periods';

/**
 * Hallazgos en lenguaje sencillo: qué pasó, qué significa y qué hacer.
 * Cada regla usa solo datos del período elegido (y de la comparación, si hay datos).
 */
export interface Finding {
  id: string;
  tone: 'good' | 'bad' | 'info';
  tema: 'Dinero' | 'Redes' | 'Leads' | 'Tendencia' | 'Seguimiento';
  title: string;
  figure: string;
  meaning: string;
  action: string;
}

const p0 = (x: number) => `${Math.round(x * 100)} %`;

export function buildFindings(ds: Dataset, scope: CompanyScope, range: DateRange, cmp: DateRange | null, trend: DateRange): Finding[] {
  const out: Finding[] = [];
  const t = roiTotal(ds, scope, range);
  const prevT = cmp ? roiTotal(ds, scope, cmp) : null;
  const prev = prevT && prevT.ingresos !== undefined && prevT.inversion !== undefined ? prevT : null;
  const ch = roiByChannel(ds, scope, range).rows.filter((r) => r.inversion !== undefined && r.ventas);
  const byCpa = [...ch].sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  const months = roiByMonth(ds, scope, trend).filter((m) => m.ingresos !== undefined && m.inversion !== undefined);

  // 1. ¿La publicidad se paga sola?
  if (t.inversion && t.ingresos !== undefined) {
    const porQ = t.ingresos / t.inversion;
    out.push({
      id: 'retorno',
      tone: porQ >= 3 ? 'good' : porQ >= 1 ? 'info' : 'bad',
      tema: 'Dinero',
      title: `Por cada Q 1 en publicidad entraron Q ${porQ.toFixed(2)} en ventas`,
      figure: fmt(t.roi, '%2'),
      meaning: `Se invirtieron ${fmt(t.inversion, 'Q')} y se vendieron ${fmt(t.ingresos, 'Q')}. La publicidad se comió ${fmt(t.roi, '%2')} de lo vendido (eso es el ROI del Excel); el resto, ${fmt(t.ingresos - t.inversion, 'Q')}, queda para cubrir los demás gastos del gimnasio.`,
      action: porQ >= 3 ? 'La pauta sí se paga sola. El reto no es gastar menos, sino gastar mejor (ver los hallazgos por red).' : 'La pauta apenas se paga. Antes de subir presupuesto, revisar qué red trae ventas.',
    });
  }

  // 2. Red más cara por venta
  if (byCpa.length >= 2) {
    const best = byCpa[0];
    const worst = byCpa[byCpa.length - 1];
    const invT = ch.reduce((s, r) => s + (r.inversion ?? 0), 0);
    const venT = ch.reduce((s, r) => s + (r.ventas ?? 0), 0);
    if (best.cpa && worst.cpa && worst.cpa > best.cpa * 1.3) {
      out.push({
        id: 'red-cara',
        tone: 'bad',
        tema: 'Redes',
        title: `${worst.canal} se lleva ${p0((worst.inversion ?? 0) / invT)} del dinero y trae ${p0((worst.ventas ?? 0) / venT)} de las ventas`,
        figure: `${Math.round(worst.cpa / best.cpa)}×`,
        meaning: `Cada inscripción por ${worst.canal} costó ${fmt(worst.cpa, 'Q2')}; por ${best.canal}, ${fmt(best.cpa, 'Q2')}. Es decir, ${worst.canal} es ${Math.round(worst.cpa / best.cpa)} veces más caro para conseguir el mismo cliente.`,
        action: `Bajar la inversión en ${worst.canal} o cambiar su objetivo (por ejemplo, solo marca y alcance) y pasar ese dinero a ${best.canal}.`,
      });
    }
  }

  // 3. Dentro de Meta: qué red cierra mejor
  const br = metaBranches(ds, scope, range).filter((r) => r.cierre !== undefined && r.consultas);
  if (br.length >= 2) {
    const s = [...br].sort((a, b) => (b.cierre ?? 0) - (a.cierre ?? 0));
    const hi = s[0];
    const lo = s[s.length - 1];
    if ((hi.cierre ?? 0) - (lo.cierre ?? 0) > 0.04) {
      out.push({
        id: 'cierre-meta',
        tone: 'info',
        tema: 'Leads',
        title: `En ${hi.canal} se inscribe 1 de cada ${Math.round(1 / (hi.cierre ?? 1))} interesados; en ${lo.canal}, 1 de cada ${Math.round(1 / (lo.cierre ?? 1))}`,
        figure: fmt(hi.cierre, '%'),
        meaning: `${hi.canal} cierra ${fmt(hi.cierre, '%')} de sus leads y ${lo.canal} ${fmt(lo.cierre, '%')}. ${lo.canal} trae ${(lo.consultas ?? 0) > (hi.consultas ?? 0) ? 'más' : 'menos'} interesados (${fmt(lo.consultas)}), pero se convierten menos.`,
        action: `Llevar a los interesados de ${lo.canal} a una conversación directa (como en ${hi.canal}) y revisar qué tan rápido se les responde.`,
      });
    }
  }

  // 4. Cambio frente al período comparado
  if (prev && prev.ingresos && t.ingresos !== undefined) {
    const dv = (t.ingresos - prev.ingresos) / prev.ingresos;
    const mismaInv = prev.inversion === t.inversion;
    out.push({
      id: 'vs-comparado',
      tone: dv >= 0 ? 'good' : 'bad',
      tema: 'Tendencia',
      title: `La venta ${dv >= 0 ? 'subió' : 'bajó'} ${p0(Math.abs(dv))} frente a ${labelRange(cmp!)}`,
      figure: `${dv >= 0 ? '+' : '−'}${p0(Math.abs(dv))}`,
      meaning: `Pasó de ${fmt(prev.ingresos, 'Q')} a ${fmt(t.ingresos, 'Q')}${mismaInv ? ' con la misma inversión' : ''}. El ROI pasó de ${fmt(prev.roi, '%2')} a ${fmt(t.roi, '%2')} (más bajo es mejor).`,
      action: dv >= 0 ? 'Identificar qué se hizo distinto este período (promociones, contenido, seguimiento) para repetirlo.' : 'Revisar si bajaron los leads o el cierre: el problema no fue el gasto, que se mantuvo.',
    });
  }

  // 5. Mejor y peor mes
  if (months.length >= 3) {
    const bm = months.reduce((a, b) => ((b.roi ?? Infinity) < (a.roi ?? Infinity) ? b : a));
    const wm = months.reduce((a, b) => ((b.roi ?? -Infinity) > (a.roi ?? -Infinity) ? b : a));
    if (bm.period !== wm.period) {
      out.push({
        id: 'mejor-mes',
        tone: 'info',
        tema: 'Tendencia',
        title: `${labelLong(bm.period)} fue el mejor mes y ${labelLong(wm.period)} el peor`,
        figure: fmt(bm.ingresos, 'Q'),
        meaning: `Con inversión parecida, ${labelLong(bm.period)} vendió ${fmt(bm.ingresos, 'Q')} y ${labelLong(wm.period)} ${fmt(wm.ingresos, 'Q')}. La diferencia la hizo la venta, no el gasto en publicidad.`,
        action: `Preparar con anticipación campañas para meses como ${labelLong(bm.period).split(' ')[0]} y reforzar el seguimiento en meses flojos como ${labelLong(wm.period).split(' ')[0]}.`,
      });
    }
  }

  // 6. Costo por lead en el tiempo
  if (months.length >= 2) {
    const f = months[0];
    const l = months[months.length - 1];
    if (f.costoConsulta && l.costoConsulta && Math.abs(l.costoConsulta / f.costoConsulta - 1) >= 0.15) {
      const sube = l.costoConsulta > f.costoConsulta;
      out.push({
        id: 'cpl',
        tone: sube ? 'bad' : 'good',
        tema: 'Leads',
        title: `Conseguir un interesado ${sube ? 'cuesta más' : 'cuesta menos'} que al inicio del año`,
        figure: `${fmt(f.costoConsulta, 'Q2')} → ${fmt(l.costoConsulta, 'Q2')}`,
        meaning: `En ${labelLong(f.period)} cada lead costó ${fmt(f.costoConsulta, 'Q2')} y en ${labelLong(l.period)} ${fmt(l.costoConsulta, 'Q2')}. Con la misma inversión ${sube ? 'llegan menos personas interesadas' : 'llegan más personas interesadas'}.`,
        action: sube ? 'Renovar los anuncios (imágenes, videos y ofertas): el público ya se cansó de los actuales.' : 'Mantener los anuncios que están funcionando y medir qué formato trae más leads.',
      });
    }
  }

  // 7. Clics baratos que no venden
  const soc = socialFor(ds, scope, range);
  if (byCpa.length >= 2 && soc.platforms.length >= 2) {
    const cpc = (canal: string) => aggSocial(soc.recs.filter((r) => r.platform === canal)).cpc;
    const best = byCpa[0];
    const worst = byCpa[byCpa.length - 1];
    const cw = cpc(worst.canal);
    const cb = cpc(best.canal);
    if (cw !== undefined && cb !== undefined && cw < cb) {
      out.push({
        id: 'clics-baratos',
        tone: 'info',
        tema: 'Redes',
        title: `${worst.canal} consigue clics baratos, pero casi no se convierten en inscripciones`,
        figure: `${fmt(cw, 'Q2')} por clic`,
        meaning: `Un clic en ${worst.canal} cuesta ${fmt(cw, 'Q2')} contra ${fmt(cb, 'Q2')} en ${best.canal}, pero cada venta sale en ${fmt(worst.cpa, 'Q2')} contra ${fmt(best.cpa, 'Q2')}. Mucha gente mira; pocos se inscriben.${soc.estimado ? ' (Clics estimados.)' : ''}`,
        action: `Usar ${worst.canal} para dar a conocer el gimnasio y medirlo por alcance, no por ventas; o agregar un llamado directo a escribir por WhatsApp.`,
      });
    }
  }

  // 8. Ticket promedio
  const rows = rowsFor(ds, scope, range);
  const ticket = totalOf(rows, 'ticket').value;
  if (ticket !== undefined && cmp) {
    const tp = totalOf(rowsFor(ds, scope, cmp), 'ticket').value;
    if (tp !== undefined && Math.abs(ticket / tp - 1) >= 0.05) {
      const sube = ticket > tp;
      out.push({
        id: 'ticket',
        tone: sube ? 'good' : 'bad',
        tema: 'Dinero',
        title: `Cada inscripción dejó ${sube ? 'más' : 'menos'} dinero que en ${labelRange(cmp)}`,
        figure: fmt(ticket, 'Q2'),
        meaning: `El ticket promedio (venta ÷ inscripciones) pasó de ${fmt(tp, 'Q2')} a ${fmt(ticket, 'Q2')}. ${sube ? 'Se vendieron planes más largos o con menos descuento.' : 'Se vendieron planes más cortos o con más descuento.'}`,
        action: sube ? 'Seguir empujando los planes que suben el ticket (trimestral, semestral o anual).' : 'Revisar descuentos y promociones: traen clientes, pero cada uno deja menos.',
      });
    }
  }

  // 9. Corte diario vs. reporte mensual
  const snaps = ds.leadSnapshots.filter((s) => scope === 'consolidado' || s.companyId === scope).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const snap = snaps[0];
  const cierreMes = totalOf(rows, 'cierre').value;
  if (snap && cierreMes !== undefined) {
    const acum = snap.rows.reduce((s, r) => s + (r.acumulado ?? 0), 0);
    const cer = snap.rows.reduce((s, r) => s + (r.cerrados ?? 0), 0);
    if (acum > 0 && cer / acum < cierreMes / 2) {
      out.push({
        id: 'corte',
        tone: 'bad',
        tema: 'Seguimiento',
        title: 'El corte diario muestra muy pocos cierres registrados',
        figure: fmt(cer / acum, '%'),
        meaning: `En el corte del ${new Date(snap.fecha + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'long' })} hay ${cer} cerrados de ${acum.toLocaleString('es-GT')} leads (${fmt(cer / acum, '%')}), contra ${fmt(cierreMes, '%')} en el reporte mensual. O los cierres no se están anotando a tiempo, o se está dejando de dar seguimiento.`,
        action: 'Confirmar con el equipo de ventas que cada inscripción se marque como cerrada el mismo día.',
      });
    }
  }

  return out;
}
