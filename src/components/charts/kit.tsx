import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, ImageDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useReducedMotion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { Button, Card, CardHeader, cx } from '../ui';
import { fmt, type Unit } from '../../lib/format';
import { download } from '../../lib/exporter';

export interface ChartColors {
  ink: string;
  muted: string;
  faint: string;
  line: string;
  grid: string;
  surface: string;
  electric: string;
  deep: string;
  up: string;
  down: string;
  warn: string;
  series: string[];
}

function read(name: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `rgb(${v.split(' ').join(',')})`;
}

/** Colores reales (no variables CSS) para Recharts; se recalculan al cambiar de tema */
export function useChartColors(): ChartColors {
  const theme = useStore((s) => s.theme);
  const [c, setC] = useState<ChartColors>(() => compute());
  useEffect(() => setC(compute()), [theme]);
  return c;
}

function compute(): ChartColors {
  const dark = document.documentElement.classList.contains('dark');
  return {
    ink: read('--ink'),
    muted: read('--muted'),
    faint: read('--faint'),
    line: read('--line'),
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(14,23,38,0.06)',
    surface: read('--surface'),
    electric: read('--electric'),
    deep: read('--deep'),
    up: read('--up'),
    down: read('--down'),
    warn: read('--warn'),
    // Paleta secuencial discreta: azules + un verde azulado y un ámbar de apoyo
    series: dark
      ? ['#6284FF', '#A0B8FF', '#3CC7B0', '#8E9AB5', '#F0B040', '#C08CFF']
      : ['#2F5BFF', '#0B2A6F', '#0E9F8E', '#8C97AD', '#D9952A', '#7A5AF8'],
  };
}

export function useAnimDuration(base = 500) {
  const reduce = useReducedMotion();
  return reduce ? 0 : base;
}

export const axisProps = (c: ChartColors) => ({
  stroke: c.faint,
  tick: { fill: c.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
});

/* Tooltip ------------------------------------------------------------- */
export interface TipRow {
  label: string;
  value?: number;
  unit: Unit;
  color: string;
  dashed?: boolean;
  extra?: ReactNode;
}

export function ChartTip({ title, rows, footer }: { title: ReactNode; rows: TipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-[180px] rounded-xl border border-line bg-surface/95 px-3 py-2.5 text-[12px] shadow-pop backdrop-blur">
      <div className="mb-1.5 font-medium text-ink">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-muted">
              <span
                className="inline-block h-[3px] w-3 rounded-full"
                style={r.dashed ? { backgroundImage: `linear-gradient(90deg, ${r.color} 50%, transparent 50%)`, backgroundSize: '4px 3px' } : { background: r.color }}
              />
              {r.label}
            </span>
            <span className="tnum font-medium text-ink">
              {fmt(r.value, r.unit)}
              {r.extra}
            </span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-2 border-t border-line pt-1.5 text-[11px] text-faint">{footer}</div>}
    </div>
  );
}

/* Tarjeta de gráfico con exportación a PNG ---------------------------- */
export function ChartCard({
  title,
  subtitle,
  help,
  actions,
  children,
  className,
  exportName,
  bodyClass,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  help?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  exportName?: string;
  bodyClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const notify = useStore((s) => s.notify);
  const exportPng = async () => {
    if (!ref.current) return;
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
      const data = await toPng(ref.current, { pixelRatio: 2, backgroundColor: `rgb(${bg.split(' ').join(',')})`, filter: (n) => !(n as HTMLElement).dataset?.noexport });
      const blob = await (await fetch(data)).blob();
      download(blob, `${exportName ?? 'grafico'}.png`);
    } catch {
      notify('No se pudo exportar la imagen del gráfico.', 'error');
    }
  };
  return (
    <Card className={cx('flex min-w-0 flex-col', className)}>
      <div ref={ref} className="flex min-w-0 flex-1 flex-col bg-surface rounded-card">
        <CardHeader
          title={title}
          subtitle={subtitle}
          help={help}
          actions={
            <div className="flex items-center gap-1.5" data-noexport="1">
              {actions}
              {exportName && (
                <Button size="icon" className="h-8 w-8" onClick={exportPng} aria-label="Descargar imagen del gráfico" title="Descargar PNG">
                  <ImageDown size={15} />
                </Button>
              )}
            </div>
          }
        />
        <div className={cx('min-w-0 flex-1 px-3 pb-4 pt-3', bodyClass)}>{children}</div>
      </div>
    </Card>
  );
}

export { Download };

/** Leyenda interactiva: activa/desactiva series */
export function SeriesToggle({ items, active, onToggle }: { items: { key: string; label: string; color: string }[]; active: Set<string>; onToggle: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const on = active.has(it.key);
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(it.key)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
              on ? 'border-line bg-surface text-ink' : 'border-transparent bg-sunken text-faint hover:text-muted',
            )}
          >
            <span className="h-2 w-2 rounded-full transition-opacity" style={{ background: it.color, opacity: on ? 1 : 0.35 }} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
