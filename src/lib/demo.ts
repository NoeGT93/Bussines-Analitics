import type { ChannelRecord, CostRecord, LeadSnapshot, MonthlyRecord, Provenance, SocialRecord } from '../types';
import { toPeriod } from './periods';
import { estimateSocial } from './estimates';

/**
 * Datos base de Spartan Gym (Quetzaltenango).
 *
 * Excel_actualizado.xlsx, Hoja1: un bloque por mes (enero a septiembre de 2026) con
 *  - INVERSIÓN (Q) del mes y la INVERSIÓN POR RED,
 *  - VENTA (Q) del mes y el COSTO DE PRODUCTO (venta ÷ cerrados = ticket),
 *  - leads RECIBIDOS y CERRADOS por red: Instagram, Facebook, WhatsApp y TikTok.
 *
 * Datos reales: inversión por red, leads, cerrados y venta del mes.
 * Datos estimados (ver estimates.ts): ingresos por red, impresiones, alcance, clics, interacciones,
 * reproducciones y seguidores.
 *
 * Corte de leads compartido por WhatsApp el 20 de octubre de 2026: leads del día, a la fecha y cerrados por fuente.
 */
export const SEED_FILE = 'Excel_actualizado.xlsx';
export const SEED_VERSION = 4;

const NETS = ['Instagram', 'Facebook', 'WhatsApp', 'TikTok'] as const;
// Inversión por red, igual todos los meses en el reporte
const INV_RED = [10000, 20000, 10000, 10000];

// [mes, venta, [recibidos, cerrados] × Instagram, Facebook, WhatsApp, TikTok, celda del bloque en Excel]
const MONTHS: [number, number, [number, number][], string][] = [
  [1, 502500, [[635, 95], [605, 90], [595, 135], [78, 8]], 'A4'],
  [2, 463275, [[608, 78], [375, 99], [397, 102], [55, 7]], 'A24'],
  [3, 403200, [[588, 87], [581, 88], [388, 92], [47, 9]], 'A44'],
  [4, 336900, [[695, 91], [486, 81], [236, 79], [44, 5]], 'A64'],
  [5, 294275, [[567, 72], [500, 78], [118, 49], [49, 3]], 'G4'],
  [6, 355350, [[710, 89], [415, 93], [144, 61], [37, 1]], 'G24'],
  [7, 647150, [[799, 105], [492, 117], [382, 99], [69, 17]], 'G44'],
  [8, 235200, [[459, 55], [560, 59], [320, 68], [39, 4]], 'G64'],
  [9, 293200, [[268, 58], [251, 61], [264, 72], [37, 3]], 'G84'],
];

export function seedSpartan(companyId: string): {
  monthly: MonthlyRecord[];
  channels: ChannelRecord[];
  costs: CostRecord[];
  social: SocialRecord[];
  snapshots: LeadSnapshot[];
} {
  const at = new Date().toISOString();
  const src = (cell: string, file = SEED_FILE): Provenance => ({ kind: 'import', file, sheet: `Hoja1 (bloque ${cell})`, row: Number(cell.slice(1)), at });
  const monthly: MonthlyRecord[] = [];
  const channels: ChannelRecord[] = [];
  const costs: CostRecord[] = [];
  const social: SocialRecord[] = [];
  for (const [m, venta, nets, cell] of MONTHS) {
    const period = toPeriod(2026, m);
    const leads = nets.reduce((s, n) => s + n[0], 0);
    const cerrados = nets.reduce((s, n) => s + n[1], 0);
    const ticket = venta / cerrados;
    monthly.push({
      id: `${companyId}:${period}`,
      companyId,
      period,
      consultas: leads,
      ventas: cerrados,
      ingresos: venta,
      ticketArchivo: ticket,
      source: src(cell),
    });
    nets.forEach(([rec, cer], i) => {
      const canal = NETS[i];
      channels.push({ id: `${companyId}:${period}:${canal}`, companyId, period, canal, consultas: rec, ventas: cer, ingresos: cer * ticket, ingresosEstimados: true, source: src(cell) });
      costs.push({ id: `${companyId}:${period}:${canal}`, companyId, period, canal, inversion: INV_RED[i], concepto: 'Inversión por red (reporte)', source: src(cell) });
      social.push(estimateSocial({ companyId, period, canal, inversion: INV_RED[i], leads: rec, cerrados: cer, ticket, source: src(cell, `Estimado a partir de ${SEED_FILE}`) }));
    });
  }
  const snapshots: LeadSnapshot[] = [
    {
      id: `${companyId}:2026-10-20`,
      companyId,
      fecha: '2026-10-20',
      rows: [
        { fuente: 'Formulario Instagram', dia: 12, acumulado: 357, cerrados: 3 },
        { fuente: 'Formulario Facebook', dia: 9, acumulado: 312, cerrados: 5 },
        { fuente: 'Instagram', dia: 7, acumulado: 301, cerrados: 19 },
        { fuente: 'Messenger', dia: 11, acumulado: 76, cerrados: 1 },
        { fuente: 'WhatsApp', dia: 27, acumulado: 109, cerrados: 7 },
      ],
      source: { kind: 'import', file: 'Captura de WhatsApp, 20 oct 2026 9:45 p. m.', at },
    },
  ];
  return { monthly, channels, costs, social, snapshots };
}
