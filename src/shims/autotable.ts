// Solo para la compilación "single": jspdf-autotable cargado desde CDN se registra en jsPDF.API.
import type { jsPDF } from 'jspdf';

export default function autoTable(doc: jsPDF, options: Record<string, unknown>) {
  const d = doc as unknown as { autoTable?: (o: Record<string, unknown>) => void };
  if (typeof d.autoTable === 'function') return d.autoTable(options);
  const g = globalThis as unknown as { default?: (doc: jsPDF, o: Record<string, unknown>) => void };
  if (typeof g.default === 'function') return g.default(doc, options);
  throw new Error('jspdf-autotable no está disponible');
}
