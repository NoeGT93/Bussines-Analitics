import * as XLSX from 'xlsx';
import type { ChannelRecord, CostRecord, ImportKind, MonthlyRecord, Provenance, SocialPost, SocialRecord } from '../types';
import { coercePeriod, labelLong } from './periods';
import { normalizeChannel } from './metrics';

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export interface RawSheet {
  name: string;
  rows: unknown[][];
}

export async function readFile(file: File): Promise<RawSheet[]> {
  const buf = await file.arrayBuffer();
  const isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', cellDates: true, raw: false })
    : XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }),
  }));
}

/* ------------------------------------------------------------------ */
/* Campos por tipo de importación                                      */
/* ------------------------------------------------------------------ */

export interface FieldSpec {
  key: string;
  label: string;
  required?: boolean;
  kind: 'period' | 'number' | 'percent' | 'money' | 'text' | 'date';
  match: (h: string) => boolean;
}

const has = (h: string, ...xs: string[]) => xs.some((x) => h.includes(x));

const periodSpec: FieldSpec = { key: 'period', label: 'Mes / período', required: true, kind: 'period', match: (h) => /^(mes|periodo|fecha|month|mes\/ano|ano-mes)\b/.test(h) || h === 'mes' };

export const FIELD_SPECS = {
  monthly: [
    periodSpec,
    { key: 'visitas', label: 'Visitas web', kind: 'number', match: (h) => has(h, 'visita', 'sesion', 'trafico web') },
    { key: 'clics', label: 'Clics', kind: 'number', match: (h) => has(h, 'clic', 'click') && !has(h, 'tasa', '%', 'ctr') },
    { key: 'consultas', label: 'Consultas', kind: 'number', match: (h) => has(h, 'consulta', 'mensaje', 'cotizac', 'inquir') && !has(h, 'tasa', '%') },
    { key: 'ventas', label: 'Ventas / tickets', kind: 'number', match: (h) => (has(h, 'venta', 'transacc', 'pedido', 'orden', 'cierre') || h === 'tickets') && !isMoney(h) && !has(h, 'tasa', '%', 'promedio', 'mensual') },
    { key: 'ingresos', label: 'Ingresos (Q)', kind: 'money', match: (h) => has(h, 'ingreso', 'facturac', 'revenue', 'ventas mensuales', 'venta mensual') || (has(h, 'venta', 'monto') && isMoney(h)) },
    { key: 'clientesNuevos', label: 'Clientes nuevos', kind: 'number', match: (h) => has(h, 'cliente') && has(h, 'nuevo') },
    { key: 'clientesRecurrentes', label: 'Clientes recurrentes', kind: 'number', match: (h) => has(h, 'cliente') && has(h, 'recurrent', 'repetid') },
    { key: 'conversionArchivo', label: 'Conversión (del archivo)', kind: 'percent', match: (h) => has(h, 'conversion', 'conv.') || h === 'conv' },
    { key: 'ticketArchivo', label: 'Ticket promedio (del archivo)', kind: 'money', match: (h) => has(h, 'ticket') && has(h, 'promedio', 'medio', 'avg') },
  ],
  channels: [
    { key: 'canal', label: 'Canal / fuente', required: true, kind: 'text', match: (h) => has(h, 'canal', 'fuente', 'origen', 'source', 'medio') },
    { ...periodSpec, required: false, label: 'Mes (opcional)' },
    { key: 'visitas', label: 'Visitas', kind: 'number', match: (h) => has(h, 'visita', 'sesion', 'trafico') && !has(h, '%') },
    { key: 'clics', label: 'Clics', kind: 'number', match: (h) => has(h, 'clic', 'click') && !has(h, 'tasa', '%') },
    { key: 'consultas', label: 'Consultas', kind: 'number', match: (h) => has(h, 'consulta', 'mensaje', 'lead', 'cotizac') && !has(h, 'tasa', '%') },
    { key: 'ventas', label: 'Ventas', kind: 'number', match: (h) => (has(h, 'venta', 'transacc', 'pedido', 'cierre') || h === 'tickets') && !isMoney(h) && !has(h, '%', 'tasa', 'mensual') },
    { key: 'ingresos', label: 'Ingresos (Q)', kind: 'money', match: (h) => has(h, 'ingreso', 'facturac', 'revenue', 'ventas mensuales', 'venta mensual') || (has(h, 'venta', 'monto') && isMoney(h)) },
    { key: 'clientesNuevos', label: 'Clientes nuevos', kind: 'number', match: (h) => has(h, 'cliente') && has(h, 'nuevo') },
  ],
  social: [
    periodSpec,
    { key: 'platform', label: 'Plataforma', required: true, kind: 'text', match: (h) => has(h, 'plataforma', 'red social', 'platform', 'red') },
    { key: 'tipo', label: 'Tipo (orgánico / pagado)', kind: 'text', match: (h) => has(h, 'tipo', 'organico', 'pagado') },
    { key: 'alcance', label: 'Alcance', kind: 'number', match: (h) => has(h, 'alcance', 'reach') },
    { key: 'impresiones', label: 'Impresiones', kind: 'number', match: (h) => has(h, 'impresion', 'impression') },
    { key: 'reproducciones', label: 'Reproducciones', kind: 'number', match: (h) => has(h, 'reproduc', 'views', 'vistas de video') },
    { key: 'interacciones', label: 'Interacciones', kind: 'number', match: (h) => has(h, 'interacc', 'engagement') && !has(h, 'rate', 'tasa', '%') },
    { key: 'seguidores', label: 'Seguidores (total)', kind: 'number', match: (h) => has(h, 'seguidor', 'follower') && !has(h, 'nuevo', 'crec', 'gan') },
    { key: 'nuevosSeguidores', label: 'Nuevos seguidores', kind: 'number', match: (h) => has(h, 'seguidor', 'follower') && has(h, 'nuevo', 'crec', 'gan') },
    { key: 'clicsEnlace', label: 'Clics a enlaces', kind: 'number', match: (h) => has(h, 'clic', 'click') },
    { key: 'consultas', label: 'Consultas', kind: 'number', match: (h) => has(h, 'consulta', 'mensaje') },
    { key: 'leads', label: 'Leads', kind: 'number', match: (h) => has(h, 'lead') },
    { key: 'conversiones', label: 'Conversiones', kind: 'number', match: (h) => has(h, 'conversion') && !has(h, 'tasa', '%', 'costo') },
    { key: 'inversion', label: 'Inversión (Q)', kind: 'money', match: (h) => has(h, 'inversion', 'gasto', 'spend', 'presupuesto') },
    { key: 'ingresosAtribuidos', label: 'Ingresos atribuidos (Q)', kind: 'money', match: (h) => has(h, 'ingreso', 'revenue') },
  ],
  posts: [
    { key: 'fecha', label: 'Fecha', required: true, kind: 'date', match: (h) => has(h, 'fecha', 'date') },
    { key: 'platform', label: 'Plataforma', required: true, kind: 'text', match: (h) => has(h, 'plataforma', 'red', 'platform') },
    { key: 'titulo', label: 'Publicación', required: true, kind: 'text', match: (h) => has(h, 'titulo', 'publicacion', 'post', 'descripcion', 'texto') },
    { key: 'url', label: 'Enlace', kind: 'text', match: (h) => has(h, 'url', 'enlace', 'link') },
    { key: 'tipo', label: 'Tipo', kind: 'text', match: (h) => has(h, 'tipo') },
    { key: 'alcance', label: 'Alcance', kind: 'number', match: (h) => has(h, 'alcance', 'reach') },
    { key: 'interacciones', label: 'Interacciones', kind: 'number', match: (h) => has(h, 'interacc', 'engagement') },
    { key: 'clics', label: 'Clics', kind: 'number', match: (h) => has(h, 'clic', 'click') },
    { key: 'reproducciones', label: 'Reproducciones', kind: 'number', match: (h) => has(h, 'reproduc', 'views') },
  ],
} as Record<ImportKind, FieldSpec[]>;

FIELD_SPECS.costs = [
  { key: 'inversion', label: 'Inversión / costo (Q)', required: true, kind: 'money', match: (h) => has(h, 'inversion', 'gasto', 'costo', 'presupuesto', 'pauta', 'spend', 'invertido') && !has(h, 'por ', 'tasa', '%') },
  { ...periodSpec, required: false, label: 'Mes (opcional)' },
  { key: 'canal', label: 'Canal (opcional)', kind: 'text', match: (h) => has(h, 'canal', 'fuente', 'origen', 'medio', 'plataforma') },
  { key: 'concepto', label: 'Concepto', kind: 'text', match: (h) => has(h, 'concepto', 'descripcion', 'detalle', 'nota') },
];

FIELD_SPECS.report = [];

export const KIND_LABEL: Record<ImportKind, string> = {
  monthly: 'Datos mensuales',
  channels: 'Fuentes de tráfico',
  social: 'Redes sociales (mensual)',
  posts: 'Publicaciones',
  costs: 'Inversión y costos',
  report: 'Reporte mensual por bloques',
};

function isMoney(h: string) {
  return /(\(q\)|\bq\b|quetzal|monto|gtq|\$)/.test(h);
}

export function normHeader(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Detección                                                           */
/* ------------------------------------------------------------------ */

export type Mapping = Record<string, number>; // fieldKey -> índice de columna (-1 = sin asignar)

export interface ReportBlock {
  /** Celda donde está la etiqueta MES (fila y columna, base 0) */
  r: number;
  c: number;
  rawMonth: unknown;
  inversion?: number;
  venta?: number;
  ticket?: number;
  redes: { red: string; recibidos?: number; cerrados?: number; row: number }[];
  total?: { recibidos?: number; cerrados?: number; row: number };
}

export interface SheetAnalysis {
  sheet: RawSheet;
  blocks?: ReportBlock[];
  /** Título del cuadro (texto encima de los encabezados), si lo hay */
  title?: string;
  headerRow: number;
  headers: string[];
  kind: ImportKind | null;
  mapping: Mapping;
  score: number;
  reason?: string;
}

function autoMap(kind: ImportKind, headers: string[]): Mapping {
  const specs = FIELD_SPECS[kind];
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const spec of specs) {
    mapping[spec.key] = -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const h = normHeader(headers[i]);
      if (h && spec.match(h)) {
        mapping[spec.key] = i;
        used.add(i);
        break;
      }
    }
  }
  return mapping;
}

function scoreMapping(kind: ImportKind, m: Mapping) {
  const specs = FIELD_SPECS[kind];
  const reqOk = specs.filter((s) => s.required).every((s) => m[s.key] >= 0);
  const n = specs.filter((s) => m[s.key] >= 0).length;
  return reqOk ? n : 0;
}

export function analyzeSheet(sheet: RawSheet, forced?: ImportKind): SheetAnalysis {
  const name = normHeader(sheet.name);
  let best: SheetAnalysis = { sheet, headerRow: 0, headers: [], kind: null, mapping: {}, score: 0 };
  const kinds: ImportKind[] = forced ? [forced] : ['monthly', 'channels', 'social', 'posts', 'costs'];
  const limit = Math.min(sheet.rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const row = sheet.rows[r] ?? [];
    const textCells = row.filter((c) => typeof c === 'string' && c.trim()).length;
    if (textCells < 2) continue;
    const headers = row.map((c) => (c === null || c === undefined ? '' : String(c)));
    for (const kind of kinds) {
      const mapping = autoMap(kind, headers);
      let score = scoreMapping(kind, mapping);
      // Pistas por nombre de hoja
      if (kind === 'channels' && has(name, 'fuente', 'trafico', 'canal')) score += 3;
      if (kind === 'monthly' && has(name, 'mensual', 'datos')) score += 3;
      if (kind === 'social' && has(name, 'social', 'redes')) score += 3;
      if (kind === 'posts' && has(name, 'publicac', 'post')) score += 3;
      if (kind === 'costs' && has(name, 'costo', 'inversion', 'roi', 'gasto')) score += 3;
      // Mensual requiere al menos un indicador
      if (kind === 'monthly' && mapping.canal === undefined && Object.entries(mapping).filter(([k, v]) => k !== 'period' && v >= 0).length === 0) score = 0;
      if (score > best.score) best = { sheet, headerRow: r, headers, kind, mapping, score };
    }
  }
  if (!forced && has(name, 'dashboard', 'resumen', 'grafic')) {
    return { ...best, kind: null, score: 0, reason: 'Hoja de resumen o gráficos: sus valores se derivan de las otras hojas, no se importa.' };
  }
  if (!best.kind) best.reason = 'No se reconocieron columnas de mes, canal o plataforma.';
  return best;
}

/**
 * Una hoja puede traer varios cuadros (por ejemplo: resumen mensual, medios de comunicación y % de participación).
 * Se detecta cada fila de encabezados y se analiza cada cuadro por separado.
 */
/**
 * Formato “reporte por bloques”: cada mes es un bloque con MES, INVERSIÓN, VENTA (+ TICKET) y una tabla
 * RED / RECIBIDOS / CERRADOS que termina en TOTAL. Los bloques pueden estar lado a lado.
 */
export function findBlocks(sheet: RawSheet): ReportBlock[] {
  const rows = sheet.rows;
  const cell = (r: number, c: number) => rows[r]?.[c];
  const label = (r: number, c: number) => normHeader(cell(r, c));
  const blocks: ReportBlock[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (label(r, c) !== 'mes') continue;
      const rawMonth = cell(r, c + 1);
      if (!coercePeriod(rawMonth, 2000)) continue;
      const b: ReportBlock = { r, c, rawMonth, redes: [] };
      let rr = r + 1;
      for (; rr < Math.min(rows.length, r + 6); rr++) {
        const l = label(rr, c);
        if (l.startsWith('inversion') || l.startsWith('gasto') || l.startsWith('presupuesto')) b.inversion = toNumber(cell(rr, c + 1));
        else if (l.startsWith('venta') || l.startsWith('ingreso')) {
          b.venta = toNumber(cell(rr, c + 1));
          if (label(rr, c + 2).startsWith('ticket')) b.ticket = toNumber(cell(rr, c + 3));
        } else if (l === 'red' || l === 'redes' || l === 'canal' || l === 'fuente') break;
      }
      if (!['red', 'redes', 'canal', 'fuente'].includes(label(rr, c))) continue;
      for (let k = rr + 1; k < Math.min(rows.length, rr + 30); k++) {
        const name = toText(cell(k, c));
        if (!name) break;
        if (TOTAL_ROW.test(name)) {
          b.total = { recibidos: toNumber(cell(k, c + 1)), cerrados: toNumber(cell(k, c + 2)), row: k + 1 };
          break;
        }
        b.redes.push({ red: name, recibidos: toNumber(cell(k, c + 1)), cerrados: toNumber(cell(k, c + 2)), row: k + 1 });
      }
      if (b.redes.length) blocks.push(b);
    }
  }
  return blocks;
}

export function findTables(sheet: RawSheet): SheetAnalysis[] {
  const name = normHeader(sheet.name);
  const blocks = findBlocks(sheet);
  if (blocks.length) {
    return [
      {
        sheet,
        blocks,
        headerRow: blocks[0].r,
        headers: [],
        kind: 'report',
        mapping: {},
        score: 10,
        title: `${blocks.length} ${blocks.length === 1 ? 'bloque mensual' : 'bloques mensuales'} (inversión, venta y leads por red)`,
      },
    ];
  }
  if (has(name, 'dashboard', 'resumen', 'grafic') && !has(name, 'datos')) {
    return [{ sheet, headerRow: 0, headers: [], kind: null, mapping: {}, score: 0, reason: 'Hoja de resumen o gráficos: sus valores se derivan de las otras hojas, no se importa.' }];
  }
  const kinds: ImportKind[] = ['monthly', 'channels', 'social', 'posts', 'costs'];
  const found: SheetAnalysis[] = [];
  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    if (row.filter((c) => typeof c === 'string' && c.trim()).length < 3) continue;
    const headers = row.map((c) => (c === null || c === undefined ? '' : String(c)));
    let best: { kind: ImportKind; mapping: Mapping; score: number } | null = null;
    for (const kind of kinds) {
      const mapping = autoMap(kind, headers);
      const score = scoreMapping(kind, mapping);
      const useful = Object.entries(mapping).filter(([, v]) => v >= 0).length;
      if (score >= 3 && useful >= 3 && (!best || score > best.score)) best = { kind, mapping, score };
    }
    if (!best) continue;
    // Título: primer texto en las dos filas de arriba
    let title: string | undefined;
    for (const t of [r - 1, r - 2]) {
      const txt = (sheet.rows[t] ?? []).find((c) => typeof c === 'string' && c.trim());
      if (txt) {
        title = String(txt).trim();
        break;
      }
    }
    const a: SheetAnalysis = { sheet, headerRow: r, headers, kind: best.kind, mapping: best.mapping, score: best.score, title };
    if (isPercentTable(a)) {
      a.kind = null;
      a.reason = 'Cuadro de porcentajes de participación: se deriva de otro cuadro y la plataforma lo recalcula, así que no se importa.';
    }
    found.push(a);
  }
  if (!found.length) return [analyzeSheet(sheet)];
  return found;
}

function isPercentTable(a: SheetAnalysis) {
  const t = normHeader(a.title ?? '');
  if (has(t, '%', 'particip', 'porcentaje')) return true;
  const nums: number[] = [];
  for (let r = a.headerRow + 1; r < Math.min(a.sheet.rows.length, a.headerRow + 12); r++) {
    const row = a.sheet.rows[r] ?? [];
    if (row.every((c) => c === null || c === '')) break;
    for (const c of row) if (typeof c === 'number') nums.push(c);
  }
  return nums.length >= 4 && nums.every((n) => n >= 0 && n <= 1.0001);
}

export function remap(a: SheetAnalysis, kind: ImportKind): SheetAnalysis {
  if (!a.headers.length) return { ...analyzeSheet(a.sheet, kind) };
  return { ...a, kind, mapping: autoMap(kind, a.headers), score: 1 };
}

/* ------------------------------------------------------------------ */
/* Conversión de valores                                               */
/* ------------------------------------------------------------------ */

export function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).trim();
  if (!s || /^(n\/?a|-|—|s\/d|sin dato)$/i.test(s)) return undefined;
  const isPct = s.includes('%');
  s = s.replace(/[Qq$%\s]|GTQ/g, '');
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return isPct ? n / 100 : n;
}

function toPercent(v: unknown): number | undefined {
  const n = toNumber(v);
  if (n === undefined) return undefined;
  const isStrPct = typeof v === 'string' && v.includes('%');
  return !isStrPct && n > 1 ? n / 100 : n;
}

function toText(v: unknown) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = toText(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Construcción de registros + validación                              */
/* ------------------------------------------------------------------ */

export interface Issue {
  row?: number;
  level: 'error' | 'warn' | 'info';
  msg: string;
}

export interface BuildResult {
  kind: ImportKind;
  records: (MonthlyRecord | ChannelRecord | SocialRecord | SocialPost | CostRecord)[];
  issues: Issue[];
  skippedRows: number;
}

const TOTAL_ROW = /^(total|totales|suma|promedio|acumulado|grand total)\b/i;

export function buildRecords(
  a: SheetAnalysis,
  opts: { companyId: string; year: number; file: string },
): BuildResult {
  const kind = a.kind!;
  const specs = FIELD_SPECS[kind];
  const issues: Issue[] = [];
  const records: BuildResult['records'] = [];
  let skippedRows = 0;
  const at = new Date().toISOString();

  if (kind === 'report') return buildReport(a, opts);
  for (const spec of specs.filter((s) => s.required)) {
    if ((a.mapping[spec.key] ?? -1) < 0) issues.push({ level: 'error', msg: `Falta asignar la columna obligatoria “${spec.label}”.` });
  }
  if (issues.some((i) => i.level === 'error')) return { kind, records, issues, skippedRows };

  const get = (row: unknown[], key: string) => {
    const idx = a.mapping[key];
    return idx === undefined || idx < 0 ? undefined : row[idx];
  };

  for (let r = a.headerRow + 1; r < a.sheet.rows.length; r++) {
    const row = a.sheet.rows[r] ?? [];
    const excelRow = r + 1;
    if (row.every((c) => c === null || c === '')) continue;
    const first = toText(get(row, kind === 'channels' ? 'canal' : kind === 'posts' ? 'titulo' : 'period'));
    const endOfTable = (why: string) => {
      const rest = a.sheet.rows.slice(r).filter((x) => x && x.some((c) => c !== null && c !== '')).length;
      issues.push({ row: excelRow, level: 'info', msg: `${why} Las ${rest} filas restantes de la hoja (notas, resúmenes o tablas derivadas) no se importan.` });
    };
    if (TOTAL_ROW.test(first) || TOTAL_ROW.test(toText(row[0]))) {
      skippedRows++;
      if (records.length) {
        for (const sp of specs) {
          if (sp.kind !== 'number' && sp.kind !== 'money') continue;
          const fileTotal = toNumber(get(row, sp.key));
          const sum = (records as unknown as Record<string, unknown>[]).reduce((acc, rec) => acc + (typeof rec[sp.key] === 'number' ? (rec[sp.key] as number) : 0), 0);
          if (fileTotal !== undefined && sum > 0 && Math.abs(fileTotal - sum) / sum > 0.005) {
            issues.push({
              row: excelRow,
              level: 'warn',
              msg: `La fila de totales dice ${fileTotal.toLocaleString('es-GT')} en “${a.headers[a.mapping[sp.key]]}”, pero la suma de las filas es ${sum.toLocaleString('es-GT')}. Revisa la fórmula de esa celda; la plataforma usa la suma correcta.`,
            });
          }
        }
        endOfTable(`Fila de totales (“${(first || toText(row[0])).trim()}”): fin de la tabla. Los totales se recalculan en la plataforma.`);
        break;
      }
      continue;
    }
    // Una fila que repite los encabezados indica que empieza otra tabla
    const repeatsHeader = Object.values(a.mapping).some((idx) => idx >= 0 && toText(row[idx]) && normHeader(row[idx]) === normHeader(a.headers[idx]));
    if (repeatsHeader && records.length) {
      endOfTable('Comienza otra tabla con los mismos encabezados.');
      break;
    }
    if (kind !== 'posts') {
      const anyNumber = specs.some((sp) => (sp.kind === 'number' || sp.kind === 'money') && toNumber(get(row, sp.key)) !== undefined);
      if (!anyNumber) {
        if (records.length) {
          endOfTable('Fila sin valores numéricos: fin de la tabla.');
          break;
        }
        skippedRows++;
        continue;
      }
    }
    const source: Provenance = { kind: 'import', file: opts.file, sheet: a.sheet.name, row: excelRow, at };
    const nums: Record<string, number | undefined> = {};
    for (const spec of specs) {
      if (spec.kind === 'number' || spec.kind === 'money') nums[spec.key] = toNumber(get(row, spec.key));
      if (spec.kind === 'percent') nums[spec.key] = toPercent(get(row, spec.key));
      const v = nums[spec.key];
      if (v !== undefined && v < 0) issues.push({ row: excelRow, level: 'warn', msg: `${spec.label} negativo (${v}).` });
      if (spec.kind === 'number' && v !== undefined && !Number.isInteger(v) && spec.key !== 'visitas') {
        issues.push({ row: excelRow, level: 'info', msg: `${spec.label} con decimales (${v}); se conserva tal cual.` });
      }
    }
    const rawPeriod = get(row, 'period');
    const period = rawPeriod !== undefined ? coercePeriod(rawPeriod, opts.year) : null;

    if (kind === 'monthly' || kind === 'social') {
      if (!period) {
        skippedRows++;
        if (records.length && typeof rawPeriod === 'string' && rawPeriod.trim().length > 12) {
          endOfTable(`“${rawPeriod.trim().slice(0, 40)}” no es un mes: fin de la tabla.`);
          break;
        }
        issues.push({ row: excelRow, level: 'warn', msg: `Mes no reconocido (“${toText(rawPeriod)}”). Fila omitida.` });
        continue;
      }
    }

    if (kind === 'monthly') {
      const rec: MonthlyRecord = { id: `${opts.companyId}:${period}`, companyId: opts.companyId, period: period!, source };
      for (const k of ['visitas', 'clics', 'consultas', 'ventas', 'ingresos', 'clientesNuevos', 'clientesRecurrentes', 'conversionArchivo', 'ticketArchivo'] as const) {
        if (nums[k] !== undefined) rec[k] = nums[k];
      }
      records.push(rec);
    } else if (kind === 'channels') {
      const canal = toText(get(row, 'canal'));
      if (!canal) {
        skippedRows++;
        continue;
      }
      const name = normalizeChannel(canal);
      const rec: ChannelRecord = { id: `${opts.companyId}:${period ?? 'total'}:${name}`, companyId: opts.companyId, period: period ?? null, canal: name, source };
      for (const k of ['visitas', 'clics', 'consultas', 'ventas', 'ingresos', 'clientesNuevos'] as const) if (nums[k] !== undefined) rec[k] = nums[k];
      records.push(rec);
    } else if (kind === 'social') {
      const platform = toText(get(row, 'platform'));
      if (!platform) {
        skippedRows++;
        continue;
      }
      const t = normHeader(get(row, 'tipo'));
      const tipo: SocialRecord['tipo'] = t.startsWith('pag') || t.includes('paid') || t.includes('anunc') ? 'pagado' : t.startsWith('org') ? 'organico' : 'total';
      const plat = platform.charAt(0).toUpperCase() + platform.slice(1);
      const rec: SocialRecord = { id: `${opts.companyId}:${period}:${plat}:${tipo}`, companyId: opts.companyId, period: period!, platform: plat, tipo, source };
      for (const k of ['alcance', 'impresiones', 'reproducciones', 'interacciones', 'seguidores', 'nuevosSeguidores', 'clicsEnlace', 'consultas', 'leads', 'conversiones', 'inversion', 'ingresosAtribuidos'] as const) {
        if (nums[k] !== undefined) rec[k] = nums[k];
      }
      records.push(rec);
    } else if (kind === 'costs') {
      const inversion = nums.inversion;
      if (inversion === undefined) {
        skippedRows++;
        continue;
      }
      const canalRaw = toText(get(row, 'canal'));
      const canal = canalRaw ? normalizeChannel(canalRaw) : null;
      if (!canal && !period) {
        skippedRows++;
        issues.push({ row: excelRow, level: 'warn', msg: 'Costo sin mes ni canal: no se puede asignar. Fila omitida.' });
        continue;
      }
      const rec: CostRecord = {
        id: `${opts.companyId}:${period ?? 'total'}:${canal ?? 'total'}`,
        companyId: opts.companyId,
        period: period ?? null,
        canal,
        inversion,
        concepto: toText(get(row, 'concepto')) || undefined,
        source,
      };
      records.push(rec);
    } else {
      const fecha = toDate(get(row, 'fecha'));
      const titulo = toText(get(row, 'titulo'));
      if (!fecha || !titulo) {
        skippedRows++;
        issues.push({ row: excelRow, level: 'warn', msg: 'Publicación sin fecha válida o sin título. Fila omitida.' });
        continue;
      }
      const platform = toText(get(row, 'platform')) || 'Sin plataforma';
      const t = normHeader(get(row, 'tipo'));
      const rec: SocialPost = {
        id: `${opts.companyId}:${platform}:${fecha}:${titulo.slice(0, 40)}`,
        companyId: opts.companyId,
        platform,
        fecha,
        titulo,
        url: toText(get(row, 'url')) || undefined,
        tipo: t.startsWith('pag') ? 'pagado' : t.startsWith('org') ? 'organico' : undefined,
        source,
      };
      for (const k of ['alcance', 'interacciones', 'clics', 'reproducciones'] as const) if (nums[k] !== undefined) rec[k] = nums[k];
      records.push(rec);
    }
  }

  // Duplicados dentro del archivo
  const ids = new Map<string, number>();
  for (const rec of records) ids.set(rec.id, (ids.get(rec.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) issues.push({ level: 'warn', msg: `Registro repetido ${n} veces en el archivo (${id.split(':').slice(1).join(' · ')}). Solo se importará el primero.` });

  for (const sp of specs) {
    const idx = a.mapping[sp.key] ?? -1;
    if (idx < 0) continue;
    const h = normHeader(a.headers[idx]);
    if (sp.key === 'clics' && h.includes('clic') && h.includes('consulta')) {
      issues.push({ level: 'warn', msg: `La columna “${a.headers[idx]}” combina clics y consultas. Se guarda como Clics; la etapa Consultas del embudo queda sin datos hasta que se registren por separado.` });
    }
  }
  if (kind === 'monthly') issues.push(...validateMonthly(records as MonthlyRecord[]));
  if (!records.length) issues.push({ level: 'error', msg: 'No se encontraron filas válidas para importar.' });
  return { kind, records, issues, skippedRows };
}

const colName = (c: number) => String.fromCharCode(65 + c);

function buildReport(a: SheetAnalysis, opts: { companyId: string; year: number; file: string }): BuildResult {
  const issues: Issue[] = [];
  const records: BuildResult['records'] = [];
  const at = new Date().toISOString();
  const seen = new Set<string>();
  const months: MonthlyRecord[] = [];
  const invs: number[] = [];
  for (const b of a.blocks ?? []) {
    const cellRef = `${colName(b.c)}${b.r + 1}`;
    const period = coercePeriod(b.rawMonth, opts.year);
    if (!period) {
      issues.push({ row: b.r + 1, level: 'warn', msg: `Bloque ${cellRef}: mes no reconocido (“${toText(b.rawMonth)}”).` });
      continue;
    }
    if (seen.has(period)) {
      issues.push({ row: b.r + 1, level: 'warn', msg: `Bloque ${cellRef}: ${labelLong(period)} aparece más de una vez; se usa el primero.` });
      continue;
    }
    seen.add(period);
    const source: Provenance = { kind: 'import', file: opts.file, sheet: `${a.sheet.name} (bloque ${cellRef})`, row: b.r + 1, at };
    const leads = b.redes.reduce((s, x) => s + (x.recibidos ?? 0), 0);
    const cerrados = b.redes.reduce((s, x) => s + (x.cerrados ?? 0), 0);
    for (const x of b.redes) {
      if (x.cerrados !== undefined && x.recibidos !== undefined && x.cerrados > x.recibidos) {
        issues.push({ row: x.row, level: 'warn', msg: `${labelLong(period)}, ${x.red.trim()}: más cerrados (${x.cerrados}) que recibidos (${x.recibidos}).` });
      }
      const canal = normalizeChannel(x.red);
      const rec: ChannelRecord = { id: `${opts.companyId}:${period}:${canal}`, companyId: opts.companyId, period, canal, source: { ...source, row: x.row } };
      if (x.recibidos !== undefined) rec.consultas = x.recibidos;
      if (x.cerrados !== undefined) rec.ventas = x.cerrados;
      records.push(rec);
    }
    if (b.total) {
      if (b.total.recibidos !== undefined && Math.abs(b.total.recibidos - leads) > 0.5)
        issues.push({ row: b.total.row, level: 'warn', msg: `${labelLong(period)}: el TOTAL de recibidos dice ${b.total.recibidos}, pero la suma por red es ${leads}.` });
      if (b.total.cerrados !== undefined && Math.abs(b.total.cerrados - cerrados) > 0.5)
        issues.push({ row: b.total.row, level: 'warn', msg: `${labelLong(period)}: el TOTAL de cerrados dice ${b.total.cerrados}, pero la suma por red es ${cerrados}.` });
    }
    const m: MonthlyRecord = { id: `${opts.companyId}:${period}`, companyId: opts.companyId, period, consultas: leads, ventas: cerrados, source };
    if (b.venta !== undefined) m.ingresos = b.venta;
    if (b.ticket !== undefined) m.ticketArchivo = b.ticket;
    else if (b.venta !== undefined && cerrados) m.ticketArchivo = b.venta / cerrados;
    if (b.venta === undefined) issues.push({ row: b.r + 1, level: 'warn', msg: `${labelLong(period)}: el bloque no tiene VENTA.` });
    records.push(m);
    months.push(m);
    if (b.inversion !== undefined) {
      invs.push(b.inversion);
      const cost: CostRecord = { id: `${opts.companyId}:${period}:total`, companyId: opts.companyId, period, canal: null, inversion: b.inversion, concepto: 'Inversión del mes (reporte)', source };
      records.push(cost);
    } else issues.push({ row: b.r + 1, level: 'info', msg: `${labelLong(period)}: el bloque no tiene INVERSIÓN; ese mes no tendrá ROI.` });
  }
  if (invs.length >= 3 && invs.every((x) => x === invs[0])) {
    issues.push({ level: 'info', msg: `La inversión es la misma todos los meses (Q ${invs[0].toLocaleString('es-GT')}). Si es un presupuesto fijo está bien; si el gasto real varió, conviene registrarlo para que el ROI y el CPL sean exactos.` });
  }
  months.sort((x, y) => x.period.localeCompare(y.period));
  issues.push(...validateMonthly(months).filter((i) => !i.msg.includes('visitas')));
  if (!records.length) issues.push({ level: 'error', msg: 'No se encontraron bloques mensuales válidos.' });
  return { kind: 'report', records, issues, skippedRows: 0 };
}

/** Comprueba coherencia interna de los datos mensuales sin modificarlos */
export function validateMonthly(recs: MonthlyRecord[]): Issue[] {
  const out: Issue[] = [];
  let convDef: 'visitas' | 'consultas' | 'clics' | null = null;
  let convMismatch = 0;
  let ticketMismatch = 0;
  for (const r of recs) {
    if (r.ticketArchivo !== undefined && r.ingresos !== undefined && r.ventas) {
      const calc = r.ingresos / r.ventas;
      if (Math.abs(calc - r.ticketArchivo) / calc > 0.02) ticketMismatch++;
    }
    if (r.conversionArchivo !== undefined && r.ventas !== undefined) {
      const candidates = (['visitas', 'consultas', 'clics'] as const).filter((d) => r[d]);
      const match = candidates.find((d) => Math.abs(r.ventas! / r[d]! - r.conversionArchivo!) < 0.0051);
      if (match) convDef = convDef ?? match;
      else convMismatch++;
    }
    if (r.ventas !== undefined && r.visitas !== undefined && r.ventas > r.visitas) {
      out.push({ row: r.source.row, level: 'warn', msg: `${r.period}: hay más ventas (${r.ventas}) que visitas web (${r.visitas}). Probablemente incluyen ventas en tienda; la conversión web se verá inflada.` });
    }
  }
  // Valores idénticos en meses consecutivos: posible dato de relleno
  for (const k of ['ingresos', 'ventas', 'visitas', 'clientesNuevos'] as const) {
    const vals = recs.map((r) => r[k]);
    let run = 1;
    let maxRun = 1;
    let at = 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== undefined && vals[i] === vals[i - 1]) {
        run++;
        if (run > maxRun) {
          maxRun = run;
          at = i;
        }
      } else run = 1;
    }
    if (maxRun >= 3) {
      out.push({ level: 'warn', msg: `${k === 'clientesNuevos' ? 'Clientes nuevos' : k.charAt(0).toUpperCase() + k.slice(1)}: el mismo valor (${vals[at]?.toLocaleString('es-GT')}) se repite ${maxRun} meses seguidos. Confirma que no sea un dato de relleno.` });
    }
  }
  // Ventas e ingresos en direcciones opuestas
  const withBoth = recs.filter((r) => r.ventas && r.ingresos !== undefined);
  if (withBoth.length >= 3) {
    const f = withBoth[0];
    const l = withBoth[withBoth.length - 1];
    const dv = l.ventas! / f.ventas! - 1;
    const di = l.ingresos! / f.ingresos! - 1;
    if (dv > 0.1 && di < -0.1) {
      out.push({ level: 'warn', msg: `Las ventas suben ${(dv * 100).toFixed(0)} % y los ingresos bajan ${(Math.abs(di) * 100).toFixed(0)} % entre ${labelLong(f.period)} y ${labelLong(l.period)}; el ticket promedio pasa de Q ${(f.ingresos! / f.ventas!).toFixed(2)} a Q ${(l.ingresos! / l.ventas!).toFixed(2)}. Verifica las cifras de ingresos.` });
    }
  }
  const conv = recs.filter((r) => r.ventas !== undefined && r.visitas);
  if (conv.length && conv.every((r) => r.ventas! / r.visitas! > 0.15)) {
    out.push({ level: 'info', msg: `La conversión ventas ÷ visitas web supera 15 % en todos los meses (hasta ${(Math.max(...conv.map((r) => r.ventas! / r.visitas!)) * 100).toFixed(1)} %). Es alta para tráfico web: probablemente las ventas incluyen clientes de mostrador que no visitaron el sitio.` });
  }
  if (convDef && convDef !== 'visitas') {
    out.push({ level: 'info', msg: `La conversión del archivo parece calcularse como ventas ÷ ${convDef}. La plataforma usa ventas ÷ visitas como “Conversión” y muestra ventas ÷ consultas como “Cierre de consultas”.` });
  }
  if (convMismatch) out.push({ level: 'warn', msg: `${convMismatch} mes(es) con una conversión en el archivo que no coincide con ningún cálculo (ventas ÷ visitas, consultas o clics). Se recalcula desde los datos base.` });
  if (ticketMismatch) out.push({ level: 'warn', msg: `${ticketMismatch} mes(es) donde el ticket promedio del archivo difiere más de 2 % de ingresos ÷ ventas. Se usa el valor recalculado.` });
  return out;
}

/** Compara totales de fuentes de tráfico con los datos mensuales, sin consolidarlos */
export function crossCheck(monthly: MonthlyRecord[], channels: ChannelRecord[]): Issue[] {
  const out: Issue[] = [];
  const totals = channels.filter((c) => c.period === null);
  if (!totals.length || !monthly.length) return out;
  for (const k of ['visitas', 'consultas', 'ventas', 'ingresos'] as const) {
    const a = monthly.reduce((s, r) => s + (r[k] ?? 0), 0);
    const b = totals.reduce((s, r) => s + (r[k] ?? 0), 0);
    if (!a || !b) continue;
    const diff = (b - a) / a;
    if (Math.abs(diff) > 0.005) {
      out.push({
        level: 'warn',
        msg: `${k.charAt(0).toUpperCase() + k.slice(1)}: la suma por canales (${Math.round(b).toLocaleString('es-GT')}) difiere ${(diff * 100).toFixed(1)} % de la suma mensual (${Math.round(a).toLocaleString('es-GT')}). Se muestran por separado y no se consolidan.`,
      });
    }
  }
  const tm = monthly.reduce((s, r) => s + (r.ingresos ?? 0), 0) / Math.max(1, monthly.reduce((s, r) => s + (r.ventas ?? 0), 0));
  const tc = totals.reduce((s, r) => s + (r.ingresos ?? 0), 0) / Math.max(1, totals.reduce((s, r) => s + (r.ventas ?? 0), 0));
  if (tm > 0 && tc > 0 && Math.abs(tc / tm - 1) > 0.25) {
    out.push({ level: 'warn', msg: `El ticket promedio por canales (Q ${tc.toFixed(2)}) y el de los datos mensuales (Q ${tm.toFixed(2)}) son muy distintos: las dos hojas no parecen describir las mismas ventas.` });
  }
  for (const c of totals) {
    if (c.clics !== undefined && c.visitas !== undefined && c.clics > c.visitas) {
      out.push({ level: 'info', msg: `${c.canal}: registra más clics/consultas (${c.clics.toLocaleString('es-GT')}) que visitas (${c.visitas.toLocaleString('es-GT')}).` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Plantillas                                                          */
/* ------------------------------------------------------------------ */

export const TEMPLATES: Record<ImportKind, { headers: string[]; example: (string | number)[] }> = {
  monthly: {
    headers: ['Mes', 'Visitas web', 'Clics', 'Consultas', 'Ventas', 'Ingresos (Q)', 'Clientes nuevos', 'Clientes recurrentes'],
    example: ['2026-01', '', '', '', '', '', '', ''],
  },
  channels: {
    headers: ['Canal', 'Mes', 'Visitas', 'Consultas', 'Ventas', 'Ingresos (Q)'],
    example: ['Facebook / Instagram', '2026-01', '', '', '', ''],
  },
  social: {
    headers: ['Mes', 'Plataforma', 'Tipo', 'Alcance', 'Impresiones', 'Reproducciones', 'Interacciones', 'Seguidores', 'Nuevos seguidores', 'Clics a enlaces', 'Consultas', 'Leads', 'Conversiones', 'Inversión (Q)', 'Ingresos atribuidos (Q)'],
    example: ['2026-01', 'Facebook', 'Orgánico', '', '', '', '', '', '', '', '', '', '', '', ''],
  },
  posts: {
    headers: ['Fecha', 'Plataforma', 'Publicación', 'Enlace', 'Tipo', 'Alcance', 'Interacciones', 'Clics', 'Reproducciones'],
    example: ['2026-01-15', 'Instagram', 'Título o descripción breve', 'https://', 'Orgánico', '', '', '', ''],
  },
  costs: {
    headers: ['Mes', 'Canal', 'Inversión (Q)', 'Concepto'],
    example: ['2026-01', 'Facebook / Instagram', '', 'Pauta pagada'],
  },
  report: {
    headers: ['MES', 'OCTUBRE'],
    example: [],
  },
};

export function downloadTemplate(kind: ImportKind) {
  if (kind === 'report') {
    const aoa = [
      ['MES', 'OCTUBRE'],
      ['INVERSION', ''],
      ['VENTA', '', 'TICKET', ''],
      ['RED', 'RECIBIDOS', 'CERRADOS', '%CERRADOS'],
      ['INSTAGRAM', '', '', ''],
      ['FACEBOOK', '', '', ''],
      ['WHATSAPP', '', '', ''],
      ['TIK TOK', '', '', ''],
      ['TOTAL', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, 'plantilla-reporte-mensual.xlsx');
    return;
  }
  const t = TEMPLATES[kind];
  const ws = XLSX.utils.aoa_to_sheet([t.headers, t.example]);
  ws['!cols'] = t.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, KIND_LABEL[kind].slice(0, 30));
  XLSX.writeFile(wb, `plantilla-${kind}.xlsx`);
}
