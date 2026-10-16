import type { ChannelRecord, MonthlyRecord, Provenance } from '../types';
import { toPeriod } from './periods';

/**
 * Datos base de Copicentro OVNI, tomados tal cual de Dashboard_Copicentro.xlsx
 * (hojas Datos_Mensuales y Fuentes_Trafico). El propio archivo indica que son
 * "ejemplos simulados": se cargan con source.kind = 'demo' y la interfaz los marca
 * como cifras demostrativas, nunca como datos verificados.
 *
 * Nota: la columna "Clics / consultas" del archivo combina ambos conceptos; se guarda
 * como `clics` y no se usa como etapa "Consultas" del embudo.
 */
export const SEED_FILE = 'Dashboard_Copicentro.xlsx';

export function demoCopicentro(companyId: string): { monthly: MonthlyRecord[]; channels: ChannelRecord[] } {
  const at = new Date().toISOString();
  // [visitas, clics/consultas, ventas, ingresos, clientesNuevos]
  const rows: [number, number, number, number, number][] = [
    [2800, 950, 980, 18000, 225],
    [3050, 1020, 1045, 18000, 225],
    [3400, 1180, 1190, 18000, 225],
    [3250, 1120, 1115, 12000, 238],
    [3750, 1320, 1280, 13000, 275],
    [4100, 1450, 1390, 15000, 238],
    [4350, 1510, 1465, 15000, 312],
    [4700, 1660, 1580, 15000, 238],
    [5150, 1840, 1725, 12000, 238],
  ];
  const monthly: MonthlyRecord[] = rows.map(([visitas, clics, ventas, ingresos, clientesNuevos], i) => {
    const period = toPeriod(2026, i + 1);
    const source: Provenance = { kind: 'demo', file: SEED_FILE, sheet: 'Datos_Mensuales', row: i + 2, at };
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
  // [canal, visitas, clics/consultas, ventas, ingresos] — acumulado, sin desglose mensual
  const ch: [string, number, number, number, number][] = [
    ['Facebook / Instagram', 3500, 5150, 1260, 51800],
    ['Google', 4000, 4380, 1115, 46600],
    ['WhatsApp', 9800, 3920, 1460, 63200],
    ['Clientes recurrentes', 8700, 0, 1705, 75900],
    ['Referidos', 5500, 0, 935, 40200],
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
    source: { kind: 'demo', file: SEED_FILE, sheet: 'Fuentes_Trafico', row: i + 2, at },
  }));
  return { monthly, channels };
}
