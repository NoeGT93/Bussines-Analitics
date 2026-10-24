/**
 * Glosario único del tablero: qué es cada indicador, qué significa su sigla y cómo se calcula.
 * Lo usan las tarjetas flotantes (al pasar el mouse) y las (i) de las tablas.
 */
export interface GlossEntry {
  label: string;
  /** Sigla: abreviatura, nombre en inglés y traducción */
  sigla?: { abbr: string; en: string; es: string };
  que: string;
  formula: string;
  /** El dato viene tal cual del Excel */
  real?: boolean;
}

export const GLOSSARY: Record<string, GlossEntry> = {
  ingresos: { label: 'Ingresos', que: 'Dinero que entró por inscripciones en el período.', formula: 'Suma de la VENTA de cada mes', real: true },
  ventas: { label: 'Ventas cerradas', que: 'Personas interesadas que terminaron inscribiéndose.', formula: 'Suma de los CERRADOS de cada red', real: true },
  consultas: {
    label: 'Leads',
    sigla: { abbr: 'Lead', en: 'Lead', es: 'contacto o prospecto' },
    que: 'Personas interesadas que escribieron o dejaron sus datos para pedir información.',
    formula: 'Suma de los RECIBIDOS de cada red',
    real: true,
  },
  cierre: { label: 'Tasa de cierre', que: 'De cada 100 interesados, cuántos se inscribieron. Más alto es mejor.', formula: 'Ventas cerradas ÷ leads × 100' },
  ticket: { label: 'Ticket promedio', que: 'Lo que dejó, en promedio, cada inscripción.', formula: 'Ingresos ÷ ventas cerradas' },
  inversion: { label: 'Inversión', que: 'Lo que se pagó en anuncios en el período.', formula: 'Suma de la inversión de cada red', real: true },
  beneficio: { label: 'Venta menos inversión', que: 'Lo que queda de la venta después de pagar la publicidad. No descuenta renta ni planilla.', formula: 'Ingresos − inversión' },
  roi: {
    label: 'ROI',
    sigla: { abbr: 'ROI', en: 'Return On Investment', es: 'retorno de la inversión' },
    que: 'Qué parte de la venta se fue en publicidad, calculado como en el Excel. Más bajo es mejor.',
    formula: 'Inversión ÷ venta × 100',
  },
  roas: {
    label: 'ROAS',
    sigla: { abbr: 'ROAS', en: 'Return On Ad Spend', es: 'retorno de la inversión en anuncios' },
    que: 'Quetzales vendidos por cada quetzal de publicidad. Más alto es mejor.',
    formula: 'Venta ÷ inversión',
  },
  cpl: {
    label: 'CPL',
    sigla: { abbr: 'CPL', en: 'Cost Per Lead', es: 'costo por lead o por interesado' },
    que: 'Cuánto costó en publicidad cada persona interesada. Más bajo es mejor.',
    formula: 'Inversión ÷ leads',
  },
  cpa: {
    label: 'CPA',
    sigla: { abbr: 'CPA', en: 'Cost Per Acquisition', es: 'costo por adquisición, es decir, por cliente conseguido' },
    que: 'Lo que costó en publicidad conseguir cada inscripción. Más bajo es mejor.',
    formula: 'Inversión ÷ ventas cerradas',
  },
  cpc: {
    label: 'CPC',
    sigla: { abbr: 'CPC', en: 'Cost Per Click', es: 'costo por clic' },
    que: 'Cuánto cuesta cada vez que alguien toca el anuncio. Más bajo es mejor.',
    formula: 'Inversión ÷ clics',
  },
  cpm: {
    label: 'CPM',
    sigla: { abbr: 'CPM', en: 'Cost Per Mille', es: 'costo por mil impresiones ("mille" es "mil" en latín)' },
    que: 'Cuánto cuesta que el anuncio se muestre 1,000 veces. Más bajo es mejor.',
    formula: 'Inversión ÷ impresiones × 1,000',
  },
  ctr: {
    label: 'CTR',
    sigla: { abbr: 'CTR', en: 'Click-Through Rate', es: 'tasa de clics' },
    que: 'De cada 100 veces que se mostró el anuncio, cuántas lo tocaron. Mide si llama la atención.',
    formula: 'Clics ÷ impresiones × 100',
  },
  engagement: {
    label: 'Engagement',
    sigla: { abbr: 'Engagement', en: 'Engagement', es: 'interacción o nivel de conexión' },
    que: 'De cada 100 personas que vieron el anuncio, cuántas reaccionaron.',
    formula: 'Interacciones ÷ alcance × 100',
  },
  alcance: { label: 'Alcance', que: 'Cuántas personas distintas vieron el anuncio.', formula: 'Impresiones ÷ veces que cada persona lo ve' },
  impresiones: { label: 'Impresiones', que: 'Cuántas veces se mostró el anuncio en pantalla.', formula: 'Inversión ÷ CPM × 1,000' },
  clics: { label: 'Clics', que: 'Veces que tocaron el anuncio para escribir, llenar el formulario o ver más.', formula: 'Leads ÷ porcentaje de clics que se vuelven lead' },
  interacciones: { label: 'Interacciones', que: 'Me gusta, comentarios, compartidos y guardados.', formula: 'Alcance × porcentaje que reacciona' },
  reproducciones: { label: 'Reproducciones', que: 'Veces que alguien reprodujo un video del anuncio.', formula: 'Impresiones × porcentaje que reproduce el video' },
  seguidores: { label: 'Nuevos seguidores', que: 'Personas que empezaron a seguir la cuenta.', formula: 'Interacciones × porcentaje que sigue la cuenta' },
};

/** Clave del glosario para los nombres internos de Alcance y clics */
export const SOCIAL_TO_GLOSS: Record<string, string> = {
  clicsEnlace: 'clics',
  conversiones: 'ventas',
  leads: 'consultas',
  cpr: 'cpa',
  nuevosSeguidores: 'seguidores',
};

/** Texto corto para las (i) de las tablas: sigla, qué es y fórmula */
export function glossText(key: string): string {
  const g = GLOSSARY[SOCIAL_TO_GLOSS[key] ?? key];
  if (!g) return '';
  const s = g.sigla && g.sigla.abbr !== g.sigla.en ? `${g.sigla.abbr} = ${g.sigla.en} (${g.sigla.es}). ` : g.sigla ? `${g.sigla.abbr}: en inglés, ${g.sigla.es}. ` : '';
  return `${s}${g.que} Fórmula: ${g.formula}.`;
}
