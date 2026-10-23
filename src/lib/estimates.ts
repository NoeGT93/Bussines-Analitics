import type { Period, Provenance, SocialRecord } from '../types';

/**
 * Métricas de anuncios ESTIMADAS a partir de los resultados reales del Excel.
 *
 * El reporte trae, por red y por mes: inversión, leads recibidos y cerrados, y la venta del mes.
 * Lo que no trae (impresiones, alcance, clics, interacciones…) se estima con una cadena lógica:
 *
 *   impresiones   = inversión ÷ CPM de referencia × 1,000      (la pauta compra impresiones)
 *   clics         = leads ÷ tasa de lead por clic               (los leads salen de los clics)
 *   alcance       = impresiones ÷ frecuencia                    (personas únicas)
 *   interacciones = alcance × tasa de interacción
 *   reproducciones= impresiones × tasa de reproducción          (formatos de video)
 *   seguidores    = interacciones × tasa de seguimiento
 *   conversiones  = cerrados (dato real)
 *   ingresos      = cerrados × ticket del mes                   (venta del mes ÷ cerrados del mes)
 *
 * Los parámetros son referencias de pauta en Meta y TikTok para Guatemala (gimnasios / servicios locales).
 * Un ajuste mensual pequeño y determinista evita que todos los meses salgan idénticos con la misma inversión.
 * Cuando se importen los datos reales del administrador de anuncios, reemplazan a estos.
 */
export interface PlatformModel {
  /** Costo por mil impresiones en quetzales */
  cpm: number;
  /** Proporción de clics que se vuelven lead (mensaje, formulario) */
  leadPorClic: number;
  /** Impresiones por persona alcanzada */
  frecuencia: number;
  /** Interacciones ÷ alcance */
  interaccion: number;
  /** Reproducciones ÷ impresiones (0 = sin video) */
  video: number;
  /** Nuevos seguidores ÷ interacciones (0 = no aplica) */
  seguimiento: number;
}

export const PLATFORM_MODELS: Record<string, PlatformModel> = {
  Instagram: { cpm: 16, leadPorClic: 0.075, frecuencia: 2.4, interaccion: 0.028, video: 0.35, seguimiento: 0.06 },
  Facebook: { cpm: 14, leadPorClic: 0.09, frecuencia: 2.8, interaccion: 0.016, video: 0.22, seguimiento: 0.03 },
  // Anuncios de Meta que abren un chat de WhatsApp: el clic inicia la conversación
  WhatsApp: { cpm: 15, leadPorClic: 0.18, frecuencia: 2.2, interaccion: 0.008, video: 0, seguimiento: 0 },
  TikTok: { cpm: 9, leadPorClic: 0.012, frecuencia: 1.6, interaccion: 0.045, video: 0.85, seguimiento: 0.08 },
};

const DEFAULT_MODEL: PlatformModel = { cpm: 15, leadPorClic: 0.08, frecuencia: 2.3, interaccion: 0.02, video: 0.2, seguimiento: 0.04 };

/** Variación de ±6 % según mes y red, siempre la misma para el mismo mes */
function wobble(period: Period, canal: string) {
  const m = Number(period.slice(5, 7));
  const k = [...canal].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 7;
  return 1 + 0.06 * Math.sin(m * 1.7 + k);
}

export function estimateSocial(input: {
  companyId: string;
  period: Period;
  canal: string;
  inversion: number;
  leads: number;
  cerrados: number;
  /** Venta del mes ÷ cerrados del mes */
  ticket?: number;
  source: Provenance;
}): SocialRecord {
  const p = PLATFORM_MODELS[input.canal] ?? DEFAULT_MODEL;
  const w = wobble(input.period, input.canal);
  const impresiones = Math.round(((input.inversion / p.cpm) * 1000) * w);
  // Nunca menos clics que leads, ni más clics que impresiones
  const clics = Math.min(impresiones, Math.max(input.leads, Math.round(input.leads / (p.leadPorClic * (2 - w)))));
  const alcance = Math.round(impresiones / p.frecuencia);
  const interacciones = Math.round(alcance * p.interaccion * w);
  return {
    id: `${input.companyId}:${input.period}:${input.canal}:pagado`,
    companyId: input.companyId,
    period: input.period,
    platform: input.canal,
    tipo: 'pagado',
    estimado: true,
    alcance,
    impresiones,
    reproducciones: p.video ? Math.round(impresiones * p.video) : undefined,
    interacciones,
    nuevosSeguidores: p.seguimiento ? Math.round(interacciones * p.seguimiento) : undefined,
    clicsEnlace: clics,
    consultas: input.leads,
    leads: input.leads,
    conversiones: input.cerrados,
    inversion: input.inversion,
    ingresosAtribuidos: input.ticket !== undefined ? Math.round(input.cerrados * input.ticket) : undefined,
    source: input.source,
  };
}
