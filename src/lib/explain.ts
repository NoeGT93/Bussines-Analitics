import type { SocialAgg } from './metrics';
import { PLATFORM_MODELS } from './estimates';
import { fmt } from './format';

/**
 * Explicación de cada indicador de Alcance y clics: qué es, cómo se calcula (con los números del período)
 * y de dónde sale el dato. Se muestra al pasar el mouse sobre la tarjeta.
 */
export interface Explanation {
  que: string;
  formula: string;
  calculo?: string;
  fuente: string;
  /** El dato viene tal cual del Excel */
  real: boolean;
}

const models = Object.entries(PLATFORM_MODELS);
const rango = (pick: (m: (typeof models)[number][1]) => number, f: (v: number) => string) => {
  const vals = models.map(([, m]) => pick(m)).filter((v) => v > 0);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return lo === hi ? f(lo) : `${f(lo)} a ${f(hi)}`;
};
const q = (v: number) => `Q ${v.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`;
const pc = (v: number) => `${(v * 100).toLocaleString('es-GT', { maximumFractionDigits: 1 })} %`;
const x = (v: number) => v.toLocaleString('es-GT', { maximumFractionDigits: 1 });
const n = (v?: number) => fmt(v);

export function explainSocial(key: string, a: SocialAgg, estimado: boolean): Explanation {
  const est = (como: string) => (estimado ? `Estimado. ${como} Se reemplaza por el dato real al importar el reporte de Meta Ads o TikTok Ads.` : 'Dato importado del administrador de anuncios.');
  switch (key) {
    case 'inversion':
      return { que: 'Lo que se pagó en anuncios en el período.', formula: 'Suma de la inversión de cada red', calculo: `= ${fmt(a.inversion, 'Q')}`, fuente: 'Dato real del Excel (inversión por red).', real: true };
    case 'leads':
      return { que: 'Personas interesadas que escribieron o dejaron sus datos.', formula: 'Suma de los leads recibidos de cada red', calculo: `= ${n(a.leads)}`, fuente: 'Dato real del Excel (columna RECIBIDOS).', real: true };
    case 'conversiones':
      return { que: 'Leads que terminaron inscribiéndose.', formula: 'Suma de los cerrados de cada red', calculo: `= ${n(a.conversiones)}`, fuente: 'Dato real del Excel (columna CERRADOS).', real: true };
    case 'impresiones':
      return {
        que: 'Cuántas veces se mostró el anuncio en pantalla.',
        formula: 'Inversión de cada red ÷ costo por mil impresiones (CPM) de referencia × 1,000',
        calculo: `${fmt(a.inversion, 'Q')} con CPM de ${rango((m) => m.cpm, q)} según la red = ${n(a.impresiones)}`,
        fuente: est('El CPM de referencia es lo que suele costar mostrar 1,000 veces un anuncio en cada red en Guatemala.'),
        real: false,
      };
    case 'alcance':
      return {
        que: 'Cuántas personas distintas vieron el anuncio.',
        formula: 'Impresiones ÷ frecuencia (veces que cada persona ve el anuncio)',
        calculo: a.impresiones && a.alcance ? `${n(a.impresiones)} ÷ ${x(a.impresiones / a.alcance)} veces por persona = ${n(a.alcance)}` : undefined,
        fuente: est(`Frecuencia de referencia: ${rango((m) => m.frecuencia, x)} veces por persona según la red.`),
        real: false,
      };
    case 'reproducciones':
      return {
        que: 'Veces que alguien reprodujo un video del anuncio.',
        formula: 'Impresiones × porcentaje de personas que reproducen el video',
        calculo: a.impresiones && a.reproducciones ? `${n(a.impresiones)} × ${pc(a.reproducciones / a.impresiones)} = ${n(a.reproducciones)}` : undefined,
        fuente: est(`Porcentaje de referencia: ${rango((m) => m.video, pc)} según la red (WhatsApp no tiene video).`),
        real: false,
      };
    case 'interacciones':
      return {
        que: 'Me gusta, comentarios, compartidos y guardados.',
        formula: 'Alcance × porcentaje de personas que reaccionan',
        calculo: a.alcance && a.interacciones ? `${n(a.alcance)} × ${pc(a.interacciones / a.alcance)} = ${n(a.interacciones)}` : undefined,
        fuente: est(`Porcentaje de referencia: ${rango((m) => m.interaccion, pc)} según la red.`),
        real: false,
      };
    case 'engagement':
      return {
        que: 'De cada 100 personas que vieron el anuncio, cuántas reaccionaron.',
        formula: 'Interacciones ÷ alcance',
        calculo: a.interacciones !== undefined && a.alcance ? `${n(a.interacciones)} ÷ ${n(a.alcance)} = ${fmt(a.engagement, '%')}` : undefined,
        fuente: estimado ? 'Calculado con interacciones y alcance estimados.' : 'Calculado con datos importados.',
        real: false,
      };
    case 'nuevosSeguidores':
      return {
        que: 'Personas que empezaron a seguir la cuenta.',
        formula: 'Interacciones × porcentaje que termina siguiendo la cuenta',
        calculo: a.interacciones && a.nuevosSeguidores ? `${n(a.interacciones)} × ${pc(a.nuevosSeguidores / a.interacciones)} = ${n(a.nuevosSeguidores)}` : undefined,
        fuente: est(`Porcentaje de referencia: ${rango((m) => m.seguimiento, pc)} según la red.`),
        real: false,
      };
    case 'clicsEnlace':
      return {
        que: 'Veces que tocaron el anuncio para escribir, llenar el formulario o ver más.',
        formula: 'Leads de cada red ÷ porcentaje de clics que se vuelven lead',
        calculo: a.leads && a.clicsEnlace ? `${n(a.leads)} leads ÷ ${pc(a.leads / a.clicsEnlace)} en promedio = ${n(a.clicsEnlace)}` : undefined,
        fuente: est(`El porcentaje de clics que se vuelven lead va de ${rango((m) => m.leadPorClic, pc)} según la red (TikTok el más bajo, WhatsApp el más alto).`),
        real: false,
      };
    case 'ctr':
      return {
        que: 'De cada 100 veces que se mostró el anuncio, cuántas lo tocaron. Mide si llama la atención.',
        formula: 'Clics ÷ impresiones',
        calculo: a.clicsEnlace !== undefined && a.impresiones ? `${n(a.clicsEnlace)} ÷ ${n(a.impresiones)} = ${fmt(a.ctr, '%')}` : undefined,
        fuente: estimado ? 'Calculado con clics e impresiones estimados.' : 'Calculado con datos importados.',
        real: false,
      };
    case 'cpm':
      return {
        que: 'Cuánto cuesta que el anuncio se muestre 1,000 veces. Más bajo es mejor.',
        formula: 'Inversión ÷ impresiones × 1,000',
        calculo: a.inversion !== undefined && a.impresiones ? `${fmt(a.inversion, 'Q')} ÷ ${n(a.impresiones)} × 1,000 = ${fmt(a.cpm, 'Q2')}` : undefined,
        fuente: estimado ? 'Inversión real del Excel; impresiones estimadas.' : 'Calculado con datos importados.',
        real: false,
      };
    case 'cpc':
      return {
        que: 'Cuánto cuesta cada vez que alguien toca el anuncio. Más bajo es mejor.',
        formula: 'Inversión ÷ clics',
        calculo: a.inversion !== undefined && a.clicsEnlace ? `${fmt(a.inversion, 'Q')} ÷ ${n(a.clicsEnlace)} = ${fmt(a.cpc, 'Q2')}` : undefined,
        fuente: estimado ? 'Inversión real del Excel; clics estimados.' : 'Calculado con datos importados.',
        real: false,
      };
    case 'cpr':
      return {
        que: 'Lo que costó en publicidad conseguir cada inscripción. Más bajo es mejor.',
        formula: 'Inversión ÷ ventas cerradas',
        calculo: a.inversion !== undefined && a.conversiones ? `${fmt(a.inversion, 'Q')} ÷ ${n(a.conversiones)} = ${fmt(a.cpr, 'Q2')}` : undefined,
        fuente: 'Calculado con datos reales del Excel.',
        real: true,
      };
    case 'roas':
      return {
        que: 'Quetzales vendidos por cada quetzal de publicidad. Más alto es mejor.',
        formula: 'Venta ÷ inversión',
        calculo: a.ingresosAtribuidos !== undefined && a.inversion ? `${fmt(a.ingresosAtribuidos, 'Q')} ÷ ${fmt(a.inversion, 'Q')} = ${a.roas?.toFixed(2)}×` : undefined,
        fuente: estimado ? 'Inversión real; la venta de cada red se estima como cerrados × ticket promedio del mes (el total coincide con la venta del Excel).' : 'Calculado con datos importados.',
        real: false,
      };
    default:
      return { que: '', formula: '', fuente: '', real: false };
  }
}
