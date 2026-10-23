// Modelo de datos de la plataforma.
// Cada registro conserva su origen (archivo, hoja, fila) para trazabilidad.

export type CompanyId = string;

export interface Company {
  id: CompanyId;
  name: string;
  city?: string;
  shortName: string;
  color: string; // hex
  links?: { label: string; url: string }[];
  note?: string;
}

/** Período mensual en formato YYYY-MM */
export type Period = string;

export interface Provenance {
  kind: 'import' | 'manual' | 'demo';
  file?: string;
  sheet?: string;
  row?: number;
  at: string; // ISO
}

export interface MonthlyRecord {
  id: string; // companyId:period
  companyId: CompanyId;
  period: Period;
  visitas?: number;
  clics?: number;
  consultas?: number;
  ventas?: number;
  ingresos?: number;
  clientesNuevos?: number;
  clientesRecurrentes?: number;
  /** Conversión tal como venía en el archivo (solo para validar, no para cálculos) */
  conversionArchivo?: number;
  /** Ticket promedio tal como venía en el archivo (solo para validar) */
  ticketArchivo?: number;
  source: Provenance;
}

export type MonthlyField = Exclude<keyof MonthlyRecord, 'id' | 'companyId' | 'period' | 'source'>;

export interface ChannelRecord {
  id: string;
  companyId: CompanyId;
  /** null = acumulado del archivo sin desglose mensual */
  period: Period | null;
  canal: string;
  visitas?: number;
  clics?: number;
  consultas?: number;
  ventas?: number;
  ingresos?: number;
  clientesNuevos?: number;
  /** Los ingresos por red se estimaron con cerrados × ticket del mes */
  ingresosEstimados?: boolean;
  source: Provenance;
}

export type ChannelField = 'visitas' | 'clics' | 'consultas' | 'ventas' | 'ingresos' | 'clientesNuevos';

export interface SocialRecord {
  id: string;
  companyId: CompanyId;
  period: Period;
  platform: string;
  tipo: 'organico' | 'pagado' | 'total';
  /** Calculado a partir del reporte (no viene del administrador de anuncios) */
  estimado?: boolean;
  alcance?: number;
  impresiones?: number;
  reproducciones?: number;
  interacciones?: number;
  seguidores?: number;
  nuevosSeguidores?: number;
  clicsEnlace?: number;
  consultas?: number;
  leads?: number;
  conversiones?: number;
  inversion?: number;
  ingresosAtribuidos?: number;
  source: Provenance;
}

export type SocialField = Exclude<keyof SocialRecord, 'id' | 'companyId' | 'period' | 'platform' | 'tipo' | 'source'>;

export interface SocialPost {
  id: string;
  companyId: CompanyId;
  platform: string;
  fecha: string;
  titulo: string;
  url?: string;
  tipo?: 'organico' | 'pagado';
  alcance?: number;
  interacciones?: number;
  clics?: number;
  reproducciones?: number;
  source: Provenance;
}

export interface Goal {
  id: string;
  companyId: CompanyId;
  period: Period;
  metric: 'ingresos' | 'ventas' | 'clientesNuevos';
  target: number;
}

export interface ImportLogEntry {
  id: string;
  at: string;
  companyId: CompanyId;
  file: string;
  kind: ImportKind;
  inserted: number;
  updated: number;
  skipped: number;
  note?: string;
}

export type ImportKind = 'monthly' | 'channels' | 'social' | 'posts' | 'costs' | 'report';

/**
 * Inversión o costo de marketing. `period` null = acumulado del mismo período que los datos por canal.
 * `canal` null = costo total del mes (no asignado a un canal).
 */
export interface CostRecord {
  id: string;
  companyId: CompanyId;
  period: Period | null;
  canal: string | null;
  inversion: number;
  concepto?: string;
  source: Provenance;
}

/** Corte diario de leads por fuente (por ejemplo, el reporte que se comparte por WhatsApp) */
export interface LeadSnapshotRow {
  fuente: string;
  /** Leads recibidos ese día */
  dia?: number;
  /** Leads acumulados a la fecha del corte */
  acumulado?: number;
  /** Leads cerrados (ventas) acumulados */
  cerrados?: number;
}

export interface LeadSnapshot {
  id: string; // companyId:fecha
  companyId: CompanyId;
  fecha: string; // YYYY-MM-DD
  /** Desde cuándo cuenta el acumulado “a la fecha”; si no se sabe, queda vacío */
  desde?: string;
  rows: LeadSnapshotRow[];
  source: Provenance;
}

export interface CompanySettings {
  /** Margen bruto (0–1) para calcular el ROI sobre utilidad en lugar de sobre ingresos */
  margen?: number;
}

export interface Dataset {
  version: number;
  companies: Company[];
  monthly: MonthlyRecord[];
  channels: ChannelRecord[];
  social: SocialRecord[];
  posts: SocialPost[];
  goals: Goal[];
  costs: CostRecord[];
  leadSnapshots: LeadSnapshot[];
  settings: Record<CompanyId, CompanySettings>;
  /** Versión de los datos base cargados automáticamente */
  seedVersion?: number;
  log: ImportLogEntry[];
}

export type CompanyScope = CompanyId | 'consolidado';

export interface DateRange {
  from: Period;
  to: Period;
}
