import type { ChannelRecord, MonthlyRecord, Provenance } from '../types';
import { toPeriod } from './periods';

/**
 * Datos de EJEMPLO, sintéticos y deterministas.
 * Sirven solo para recorrer la interfaz mientras no se importa el archivo real.
 * Todos llevan source.kind = 'demo' y la interfaz los marca como ficticios.
 */
export function demoCopicentro(companyId: string): { monthly: MonthlyRecord[]; channels: ChannelRecord[] } {
  const at = new Date().toISOString();
  const src: Provenance = { kind: 'demo', file: 'Datos de ejemplo (ficticios)', at };
  const base = [
    [1180, 640, 168, 92, 11960, 31],
    [1265, 702, 181, 101, 13332, 35],
    [1410, 760, 205, 118, 15930, 40],
    [1342, 731, 192, 109, 14388, 33],
    [1560, 845, 236, 131, 18209, 44],
    [1495, 820, 221, 124, 16740, 38],
    [1688, 930, 255, 140, 19880, 47],
    [1802, 990, 248, 133, 18753, 41],
    [1935, 1062, 287, 158, 23226, 52],
  ];
  const monthly: MonthlyRecord[] = base.map(([visitas, clics, consultas, ventas, ingresos, clientesNuevos], i) => {
    const period = toPeriod(2026, i + 1);
    return {
      id: `${companyId}:${period}`,
      companyId,
      period,
      visitas,
      clics,
      consultas,
      ventas,
      ingresos,
      clientesNuevos,
      source: { ...src, row: i + 2 },
    };
  });
  const ch: [string, number, number, number, number][] = [
    ['Facebook / Instagram', 5120, 742, 398, 51870],
    ['Google', 4380, 486, 262, 37115],
    ['WhatsApp', 1210, 520, 301, 38920],
    ['Clientes recurrentes', 1640, 210, 151, 22460],
    ['Referidos', 690, 132, 74, 9840],
  ];
  const channels: ChannelRecord[] = ch.map(([canal, visitas, consultas, ventas, ingresos], i) => ({
    id: `${companyId}:total:${canal}`,
    companyId,
    period: null,
    canal,
    visitas,
    consultas,
    ventas,
    ingresos,
    source: { ...src, sheet: 'Fuentes_Trafico', row: i + 2 },
  }));
  return { monthly, channels };
}
