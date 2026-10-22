import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useCursor, useLiveEnabled } from '../../lib/live';
import { PlaybackControls } from './Playback';
import { channelsFor, METRICS, rowsFor, type SeriesMetric } from '../../lib/metrics';
import { fmt, pct, pp } from '../../lib/format';
import { labelShort } from '../../lib/periods';
import { cx } from '../ui';

interface Item {
  key: string;
  label: string;
  value: string;
  delta?: number;
  rate?: boolean;
  note?: string;
}

const TICKER_METRICS: SeriesMetric[] = ['ingresos', 'ventas', 'ticket', 'visitas', 'clics', 'consultas', 'conversion', 'cierre', 'clientesNuevos'];

/**
 * Cinta continua al estilo de un tablero de bolsa. Muestra el último mes con datos del
 * rango contra el mes anterior, más el reparto por canal. Son datos del archivo, no
 * cotizaciones en tiempo real: la etiqueta de la izquierda indica qué mes se muestra.
 */
export function MarketTicker() {
  const { ds, scope, range, page, openDetail } = useStore();
  const live = useLiveEnabled();
  const { period: cursor } = useCursor();

  const { items, last, prevPeriod } = useMemo(() => {
    const rows = rowsFor(ds, scope, range).filter((r) => Object.keys(r.values).length);
    const ci = Math.max(0, rows.findIndex((r) => r.period === cursor));
    const lastRow = rows.length ? rows[cursor ? ci : rows.length - 1] : undefined;
    const prevRow = lastRow ? rows[rows.indexOf(lastRow) - 1] : undefined;
    const out: Item[] = [];
    if (lastRow) {
      for (const m of TICKER_METRICS) {
        const v = lastRow.values[m];
        if (v === undefined) continue;
        const p = prevRow?.values[m];
        const rate = METRICS[m].unit === '%';
        out.push({
          key: m,
          label: METRICS[m].label,
          value: fmt(v, METRICS[m].unit),
          delta: p !== undefined ? (rate ? v - p : p ? (v - p) / Math.abs(p) : undefined) : undefined,
          rate,
        });
      }
    }
    const ch = channelsFor(ds, scope, range);
    const totalVentas = ch.channels.reduce((s, c) => s + (c.values.ventas ?? 0), 0);
    // Para el mes seleccionado, si hay datos por red de ese mes se muestran esos
    const monthCh = lastRow ? channelsFor(ds, scope, { from: lastRow.period, to: lastRow.period }) : null;
    if (monthCh && monthCh.mode === 'mensual') {
      for (const c of monthCh.channels) {
        out.push({
          key: `ch-${c.canal}`,
          label: c.canal,
          value: `${fmt(c.values.consultas)} leads`,
          note: `${fmt(c.values.ventas)} cerrados${c.cierre !== undefined ? `, ${fmt(c.cierre, '%')}` : ''}`,
        });
      }
      return { items: out, last: lastRow?.period, prevPeriod: prevRow?.period };
    }
    for (const c of ch.channels) {
      if (c.values.ventas === undefined || !totalVentas) continue;
      out.push({
        key: `ch-${c.canal}`,
        label: c.canal,
        value: `${fmt(c.values.ventas)} ventas`,
        note: `${fmt(c.values.ventas / totalVentas, '%')} del total${c.cierre !== undefined ? `, cierre ${fmt(c.cierre, '%')}` : c.conversion !== undefined ? `, conv. ${fmt(c.conversion, '%')}` : ''}`,
      });
    }
    return { items: out, last: lastRow?.period, prevPeriod: prevRow?.period };
  }, [ds, scope, range, cursor]);

  if (!items.length || page === 'data') return null;

  const strip = (dup: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup || undefined}>
      {items.map((it) => {
        const up = it.delta !== undefined && it.delta > 0.0005;
        const down = it.delta !== undefined && it.delta < -0.0005;
        return (
          <button
            key={`${dup ? 'b' : 'a'}-${it.key}`}
            type="button"
            tabIndex={dup ? -1 : 0}
            onClick={() => last && !it.key.startsWith('ch-') && openDetail({ period: last, metric: it.key })}
            className="tnum flex items-center gap-2 whitespace-nowrap border-r border-line/70 px-4 text-[12px] hover:bg-sunken/60"
          >
            <span className="text-muted">{it.label}</span>
            <span className="font-semibold text-ink">{it.value}</span>
            {it.delta !== undefined && (
              <span className={cx('font-medium', up ? 'text-up' : down ? 'text-down' : 'text-faint')}>
                {up ? '▲' : down ? '▼' : '■'} {(it.rate ? pp(Math.abs(it.delta)) : pct(Math.abs(it.delta))).replace('+', '')}
              </span>
            )}
            {it.note && <span className="text-faint">{it.note}</span>}
          </button>
        );
      })}
    </div>
  );

  // Duración proporcional al contenido para que la velocidad sea pareja
  const duration = Math.max(28, items.length * 5.5);

  return (
    <div className="flex h-8 items-stretch border-t border-line bg-surface/70" role="region" aria-label="Cinta de indicadores">
      <div className="flex shrink-0 items-center gap-1.5 border-r border-line bg-surface pl-1.5 pr-3">
        <PlaybackControls compact />
        {prevPeriod && <span className="tnum hidden whitespace-nowrap text-[11.5px] text-faint sm:inline">vs. {labelShort(prevPeriod, true)}</span>}
      </div>
      <div className={cx('ba-marquee-wrap relative min-w-0 flex-1', live ? 'overflow-hidden' : 'scroll-thin overflow-x-auto')}>
        <div
          className={cx('flex h-full w-max items-center', live && 'ba-marquee')}
          style={{ ['--ba-marquee-duration' as string]: `${duration}s` }}
        >
          {strip(false)}
          {live && strip(true)}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />
      </div>
    </div>
  );
}
