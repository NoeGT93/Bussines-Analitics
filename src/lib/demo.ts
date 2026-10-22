import type { ChannelRecord, CostRecord, LeadSnapshot, MonthlyRecord, Provenance } from '../types';
import { toPeriod } from './periods';

/**
 * Datos base de Spartan Gym (Quetzaltenango).
 *
 * REPORTE_DASHABOARD.xlsx, Hoja1: un bloque por mes (enero a septiembre de 2026) con
 *  - INVERSIÓN (Q) del mes,
 *  - VENTA (Q) del mes,
 *  - leads RECIBIDOS y CERRADOS por red: Instagram, Facebook, WhatsApp y TikTok.
 * El ticket del archivo = venta ÷ total de cerrados.
 *
 * Corte de leads compartido por WhatsApp el 20 de octubre de 2026: leads del día, a la fecha y cerrados por fuente.
 *
 * Mapeo al modelo: ingresos = venta, ventas = cerrados, consultas = leads recibidos, inversión = costo del mes.
 */
export const SEED_FILE = 'REPORTE_DASHABOARD.xlsx';
export const SEED_VERSION = 3;

const NETS = ['Instagram', 'Facebook', 'WhatsApp', 'TikTok'] as const;

// [mes, inversión, venta, [recibidos, cerrados] × Instagram, Facebook, WhatsApp, TikTok, fila del bloque en Excel]
const MONTHS: [number, number, number, [number, number][], string][] = [
  [1, 50000, 502500, [[635, 95], [605, 90], [595, 135], [78, 8]], 'A4'],
  [2, 50000, 463275, [[608, 78], [375, 99], [397, 102], [55, 7]], 'A14'],
  [3, 50000, 403200, [[588, 87], [581, 88], [388, 92], [47, 9]], 'A24'],
  [4, 50000, 336900, [[695, 91], [486, 81], [236, 79], [44, 5]], 'A34'],
  [5, 50000, 294275, [[567, 72], [500, 78], [118, 49], [49, 3]], 'F4'],
  [6, 50000, 355350, [[710, 89], [415, 93], [144, 61], [37, 1]], 'F14'],
  [7, 50000, 647150, [[799, 105], [492, 117], [382, 99], [69, 17]], 'F24'],
  [8, 50000, 235200, [[459, 55], [560, 59], [320, 68], [39, 4]], 'F34'],
  [9, 50000, 293200, [[268, 58], [251, 61], [264, 72], [37, 3]], 'F45'],
];

export function seedSpartan(companyId: string): {
  monthly: MonthlyRecord[];
  channels: ChannelRecord[];
  costs: CostRecord[];
  snapshots: LeadSnapshot[];
} {
  const at = new Date().toISOString();
  const src = (cell: string, sheet = 'Hoja1'): Provenance => ({ kind: 'import', file: SEED_FILE, sheet: `${sheet} (bloque ${cell})`, row: Number(cell.slice(1)), at });
  const monthly: MonthlyRecord[] = [];
  const channels: ChannelRecord[] = [];
  const costs: CostRecord[] = [];
  for (const [m, inversion, venta, nets, cell] of MONTHS) {
    const period = toPeriod(2026, m);
    const leads = nets.reduce((s, n) => s + n[0], 0);
    const cerrados = nets.reduce((s, n) => s + n[1], 0);
    monthly.push({
      id: `${companyId}:${period}`,
      companyId,
      period,
      consultas: leads,
      ventas: cerrados,
      ingresos: venta,
      ticketArchivo: venta / cerrados,
      source: src(cell),
    });
    nets.forEach(([rec, cer], i) => {
      channels.push({ id: `${companyId}:${period}:${NETS[i]}`, companyId, period, canal: NETS[i], consultas: rec, ventas: cer, source: src(cell) });
    });
    costs.push({ id: `${companyId}:${period}:total`, companyId, period, canal: null, inversion, concepto: 'Inversión del mes (reporte)', source: src(cell) });
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
  return { monthly, channels, costs, snapshots };
}
