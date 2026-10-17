import type { ChannelRecord, MonthlyRecord, Provenance } from '../types';
import { toPeriod } from './periods';

/**
 * Datos base de Copicentro OVNI, tomados de Dashboard_Copicentro.xlsx (versión revisada por el equipo).
 * Hoja Datos_Mensuales, con tres cuadros:
 *  1. Resumen mensual (filas 3–11): visitas web/otros, clics/consultas, cierre de ventas (n.º de ventas),
 *     ventas mensuales (ingresos en Q) y clientes nuevos.
 *  2. Medios de comunicación y ventas aportadas (filas 17–21): acumulado por canal.
 *  3. % de participación (filas 27–31): se deriva del cuadro 2, por eso no se guarda; la plataforma lo recalcula.
 *
 * Se cargan con source.kind = 'demo' y la interfaz las marca como cifras sin verificar.
 */
export const SEED_FILE = 'Dashboard_Copicentro.xlsx';
export const SEED_VERSION = 2;

export function demoCopicentro(companyId: string): { monthly: MonthlyRecord[]; channels: ChannelRecord[] } {
  const at = new Date().toISOString();
  // [visitas, clics/consultas, cierre de ventas, ventas mensuales (Q), clientes nuevos]
  const rows: [number, number, number, number, number][] = [
    [2800, 950, 850, 31525, 225],
    [3050, 1020, 700, 38075, 225],
    [3400, 1180, 875, 48300, 225],
    [3250, 1120, 900, 25200, 238],
    [3750, 1320, 888, 35150, 275],
    [4100, 1450, 1102, 20200, 238],
    [4350, 1510, 1275, 25750, 312],
    [4700, 1660, 1390, 32325, 238],
    [5150, 1840, 1625, 21175, 238],
  ];
  const monthly: MonthlyRecord[] = rows.map(([visitas, clics, ventas, ingresos, clientesNuevos], i) => {
    const period = toPeriod(2026, i + 1);
    const source: Provenance = { kind: 'demo', file: SEED_FILE, sheet: 'Datos_Mensuales', row: i + 3, at };
    return {
      id: `${companyId}:${period}`,
      companyId,
      period,
      visitas,
      clics,
      ventas,
      ingresos,
      clientesNuevos,
      conversionArchivo: ventas / visitas,
      ticketArchivo: ingresos / ventas,
      source,
    };
  });
  // [canal, visitas, clics/consultas, cierre de ventas, ingresos (Q)] — acumulado
  const ch: [string, number, number, number, number][] = [
    ['Facebook / Instagram', 9500, 5400, 3202, 51800],
    ['Google', 7800, 4900, 3280, 46600],
    ['WhatsApp', 12900, 5990, 3400, 63200],
    ['Clientes recurrentes', 9700, 0, 1800, 75900],
    ['Referidos', 6700, 0, 1500, 40200],
  ];
  const channels: ChannelRecord[] = ch.map(([canal, visitas, clics, ventas, ingresos], i) => ({
    id: `${companyId}:total:${canal}`,
    companyId,
    period: null,
    canal,
    visitas,
    clics,
    ventas,
    ingresos,
    source: { kind: 'demo', file: SEED_FILE, sheet: 'Datos_Mensuales', row: i + 17, at },
  }));
  return { monthly, channels };
}
