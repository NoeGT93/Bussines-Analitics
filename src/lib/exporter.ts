import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanyScope, Dataset, DateRange } from '../types';
import { channelsFor, kpi, METRICS, rowsFor, type SeriesMetric } from './metrics';
import { generateInsights } from './insights';
import { fmt, pct, pp } from './format';
import { labelLong, labelRange } from './periods';

function scopeName(ds: Dataset, scope: CompanyScope) {
  return scope === 'consolidado' ? 'Vista consolidada' : ds.companies.find((c) => c.id === scope)?.name ?? scope;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const COLS: SeriesMetric[] = ['visitas', 'clics', 'consultas', 'ventas', 'ingresos', 'clientesNuevos', 'conversion', 'cierre', 'ticket'];

function monthlyTable(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const rows = rowsFor(ds, scope, range);
  const header = ['Mes', ...COLS.map((c) => METRICS[c].label + (METRICS[c].unit === 'Q' || METRICS[c].unit === 'Q2' ? ' (Q)' : ''))];
  const body = rows.map((r) => [
    r.period,
    ...COLS.map((c) => {
      const v = r.values[c];
      if (v === undefined) return '';
      return METRICS[c].unit === '%' ? Math.round(v * 10000) / 10000 : Math.round(v * 100) / 100;
    }),
  ]);
  return { header, body };
}

export function exportCsv(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const { header, body } = monthlyTable(ds, scope, range);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '\ufeff' + [header, ...body].map((r) => r.map(esc).join(',')).join('\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug(scopeName(ds, scope))}-${range.from}_${range.to}.csv`);
}

export function exportXlsx(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const wb = XLSX.utils.book_new();
  const { header, body } = monthlyTable(ds, scope, range);
  const info = [
    ['Empresa', scopeName(ds, scope)],
    ['Período', labelRange(range)],
    ['Generado', new Date().toLocaleString('es-GT')],
    ['Nota', 'Conversión = ventas ÷ visitas. Cierre = ventas ÷ consultas. Ticket = ingresos ÷ ventas. Las tasas están en formato decimal.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Resumen');
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = header.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Datos_Mensuales');
  const ch = channelsFor(ds, scope, range);
  if (ch.channels.length) {
    const h = ['Canal', 'Visitas', 'Consultas', 'Ventas', 'Ingresos (Q)', 'Conversión', 'Ticket (Q)'];
    const b = ch.channels.map((c) => [c.canal, c.values.visitas ?? '', c.values.consultas ?? '', c.values.ventas ?? '', c.values.ingresos ?? '', c.conversion ?? '', c.ticket ?? '']);
    const chWs = XLSX.utils.aoa_to_sheet([h, ...b, [], [ch.mode === 'acumulado' ? 'Acumulado del archivo; no filtrado por fecha.' : `Filtrado: ${labelRange(range)}`]]);
    XLSX.utils.book_append_sheet(wb, chWs, 'Fuentes_Trafico');
  }
  XLSX.writeFile(wb, `${slug(scopeName(ds, scope))}-${range.from}_${range.to}.xlsx`);
}

/** Respaldo completo de todos los datos (para restaurar o migrar) */
export function exportBackup(ds: Dataset) {
  download(new Blob([JSON.stringify(ds, null, 2)], { type: 'application/json' }), `respaldo-business-analytics-${new Date().toISOString().slice(0, 10)}.json`);
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------------------------------------------ */
/* Reporte ejecutivo PDF                                               */
/* ------------------------------------------------------------------ */

const KPI_ORDER: SeriesMetric[] = ['ingresos', 'ventas', 'visitas', 'consultas', 'conversion', 'ticket', 'clientesNuevos'];

export function exportPdf(ds: Dataset, scope: CompanyScope, range: DateRange, chartImage?: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 44;
  const ink: [number, number, number] = [14, 23, 38];
  const muted: [number, number, number] = [91, 101, 119];
  const blue: [number, number, number] = [47, 91, 255];
  const demo = ds.monthly.some((r) => r.source.kind === 'demo' && (scope === 'consolidado' || r.companyId === scope));

  doc.setFillColor(...blue);
  doc.rect(0, 0, W, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ink);
  doc.setFontSize(20);
  doc.text(scopeName(ds, scope), M, 62);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...muted);
  doc.text(`Reporte ejecutivo · ${labelRange(range)}`, M, 80);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - M, 80, { align: 'right' });

  let y = 100;
  if (demo) {
    doc.setFillColor(255, 244, 222);
    doc.roundedRect(M, y, W - 2 * M, 26, 4, 4, 'F');
    doc.setTextColor(140, 90, 10);
    doc.setFontSize(9);
    doc.text('Contiene datos de ejemplo ficticios. No usar para decisiones.', M + 10, y + 16);
    y += 38;
  }

  // KPIs
  const cardW = (W - 2 * M - 3 * 10) / 4;
  KPI_ORDER.forEach((m, i) => {
    const k = kpi(ds, scope, range, m);
    const cx = M + (i % 4) * (cardW + 10);
    const cy = y + Math.floor(i / 4) * 66;
    doc.setDrawColor(228, 231, 236);
    doc.roundedRect(cx, cy, cardW, 56, 6, 6, 'S');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(METRICS[m].label, cx + 10, cy + 16);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ink);
    doc.text(fmt(k.value, METRICS[m].unit), cx + 10, cy + 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (k.delta !== undefined) {
      const good = k.delta >= 0;
      doc.setTextColor(...(good ? ([12, 140, 100] as [number, number, number]) : ([214, 58, 64] as [number, number, number])));
      doc.text(`${k.deltaKind === 'pp' ? pp(k.delta) : pct(k.delta)} vs. período anterior`, cx + 10, cy + 48);
    } else {
      doc.setTextColor(...muted);
      doc.text('Sin período anterior comparable', cx + 10, cy + 48);
    }
  });
  y += 2 * 66 + 10;

  if (chartImage) {
    const imgW = W - 2 * M;
    const imgH = imgW * 0.36;
    doc.addImage(chartImage, 'PNG', M, y, imgW, imgH);
    y += imgH + 14;
  }

  // Tabla mensual
  const rows = rowsFor(ds, scope, range);
  autoTable(doc, {
    startY: y,
    head: [['Mes', 'Visitas', 'Consultas', 'Ventas', 'Ingresos', 'Conversión', 'Ticket']],
    body: rows.map((r) => [
      labelLong(r.period),
      fmt(r.values.visitas),
      fmt(r.values.consultas),
      fmt(r.values.ventas),
      fmt(r.values.ingresos, 'Q'),
      fmt(r.values.conversion, '%'),
      fmt(r.values.ticket, 'Q2'),
    ]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, textColor: ink, cellPadding: 5 },
    headStyles: { textColor: muted, fontStyle: 'bold', lineWidth: { bottom: 0.6 }, lineColor: [228, 231, 236] },
    bodyStyles: { lineWidth: { bottom: 0.3 }, lineColor: [238, 240, 243] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: M, right: M },
  });

  // Hallazgos
  const insights = generateInsights({ ds, scope, range }).slice(0, 6);
  if (insights.length) {
    // @ts-expect-error lastAutoTable lo agrega el plugin
    let iy = (doc.lastAutoTable?.finalY ?? y) + 28;
    if (iy > 700) {
      doc.addPage();
      iy = 60;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text('Hallazgos', M, iy);
    iy += 16;
    for (const ins of insights) {
      const lines = doc.splitTextToSize(ins.body, W - 2 * M - 70);
      const h = 16 + lines.length * 11 + 6;
      if (iy + h > 800) {
        doc.addPage();
        iy = 60;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...ink);
      doc.text(ins.title, M, iy + 10);
      doc.text(ins.figure, W - M, iy + 10, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(lines, M, iy + 23);
      iy += h + 6;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text('Conversión = ventas ÷ visitas · Ticket = ingresos ÷ ventas · Cifras según los datos cargados en la plataforma.', M, 820);
    doc.text(`${p} / ${pages}`, W - M, 820, { align: 'right' });
  }
  doc.save(`reporte-${slug(scopeName(ds, scope))}-${range.from}_${range.to}.pdf`);
}
