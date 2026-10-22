import { DatabaseZap, FlaskConical, Upload } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Button, Card, Empty, Tag } from '../ui';
import type { Insight } from '../../lib/insights';
import { cx } from '../ui';
import { METRICS, type Row, type SeriesMetric } from '../../lib/metrics';
import { fmt } from '../../lib/format';
import { labelLong } from '../../lib/periods';

export function NoData({ context }: { context?: string }) {
  const { setPage, loadDemo, scope, ds } = useStore();
  const name = scope === 'consolidado' ? null : ds.companies.find((c) => c.id === scope)?.name;
  const isFirst = scope === ds.companies[0]?.id;
  return (
    <Card>
      <Empty
        icon={<DatabaseZap size={18} />}
        title={scope === 'consolidado' ? 'No hay indicadores que se puedan consolidar' : `${name} todavía no tiene datos en este período`}
        body={
          scope === 'consolidado'
            ? 'La vista consolidada solo suma indicadores que todas las empresas tienen para los mismos meses. Importa los datos de cada empresa o cambia el período.'
            : context ?? 'Importa un archivo Excel o CSV con datos mensuales, o cambia el período en la parte superior.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setPage('data')}>
              <Upload size={15} /> Importar datos
            </Button>
            {isFirst && (
              <Button variant="outline" onClick={loadDemo}>
                <FlaskConical size={15} /> Restaurar reporte inicial
              </Button>
            )}
          </div>
        }
      />
    </Card>
  );
}

const TONE: Record<Insight['tone'], { dot: string; tag: 'up' | 'down' | 'neutral' | 'warn' }> = {
  positive: { dot: 'bg-up', tag: 'up' },
  negative: { dot: 'bg-down', tag: 'down' },
  neutral: { dot: 'bg-faint', tag: 'neutral' },
  attention: { dot: 'bg-warn', tag: 'warn' },
};

export function InsightItem({ ins, showBasis }: { ins: Insight; showBasis?: boolean }) {
  const t = TONE[ins.tone];
  return (
    <div className="flex gap-3">
      <span className={cx('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', t.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium leading-snug text-ink">{ins.title}</p>
          <span className="shrink-0">
            <Tag tone={t.tag}>{ins.figure}</Tag>
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{ins.body}</p>
        {showBasis && <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">Cálculo: {ins.basis}</p>}
      </div>
    </div>
  );
}

/** Tabla mensual compacta, filas clicables para abrir el detalle */
export function MonthTable({ rows, metrics }: { rows: Row[]; metrics: SeriesMetric[] }) {
  const openDetail = useStore((s) => s.openDetail);
  const shown = metrics.filter((m) => rows.some((r) => r.values[m] !== undefined));
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-left text-faint">
            <th className="px-5 py-2 font-medium">Mes</th>
            {shown.map((m) => (
              <th key={m} className="px-3 py-2 text-right font-medium">
                {METRICS[m].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period} onClick={() => openDetail({ period: r.period })} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-sunken">
              <td className="px-5 py-2.5 text-ink">{labelLong(r.period)}</td>
              {shown.map((m) => (
                <td key={m} className="tnum px-3 py-2.5 text-right text-ink">
                  {fmt(r.values[m], METRICS[m].unit)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="px-5 pb-1 text-[11.5px] leading-snug text-faint">{children}</p>;
}
