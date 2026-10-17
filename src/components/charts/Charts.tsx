import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCursor, useLiveEnabled } from '../../lib/live';
import { useStore } from '../../store/useStore';
import { PlaybackControls } from '../layout/Playback';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Filter } from 'lucide-react';
import type { Row, SeriesMetric } from '../../lib/metrics';
import { METRICS } from '../../lib/metrics';
import { compact, fmt, pct, type Unit } from '../../lib/format';
import { labelLong, labelShort } from '../../lib/periods';
import { axisProps, ChartTip, SeriesToggle, useAnimDuration, useChartColors, type TipRow } from './kit';
import { Button, cx } from '../ui';

/* Sparkline ----------------------------------------------------------- */
/**
 * Minigráfico en vivo: se dibuja a su tamaño real (sin deformar puntos), un destello
 * recorre la curva de forma continua y un punto salta de mes en mes al ritmo del reloj
 * compartido. `activeIndex` permite que la tarjeta muestre el mismo dato en texto.
 */
export function Sparkline({ data, periods, color, height = 34, className }: { data: (number | null)[]; periods?: string[]; color: string; height?: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [w, setW] = useState(0);
  const [len, setLen] = useState(0);
  const live = useLiveEnabled();
  const si = useSparkIndex(data, periods);
  const gid = `sp-${useId().replace(/:/g, '')}`;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = data.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const H = height;
  const pad = 4;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const P = pts.map((p) => [x(p.i), y(p.v)]);
  let d = P.length ? `M${P[0][0]},${P[0][1]}` : '';
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  useLayoutEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, [d]);

  if (pts.length < 2) return <div ref={ref} style={{ height }} className={className} />;
  const idx = si ? pts.findIndex((p) => p.i === si.dataIndex) : P.length - 1;
  const [cx0, cy0] = P[idx < 0 ? P.length - 1 : idx];
  const seg = Math.max(18, len * 0.22);

  return (
    <div ref={ref} className={cx('relative w-full', className)} style={{ height }} aria-hidden>
      {w > 0 && (
        <motion.svg
          width={w}
          height={H}
          className="overflow-visible"
          initial={reduce ? false : { clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.18" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <filter id={`${gid}-glow`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
          </defs>
          <path d={`${d} L${P[P.length - 1][0]},${H} L${P[0][0]},${H} Z`} fill={`url(#${gid})`} />
          <path ref={pathRef} d={d} fill="none" stroke={color} strokeOpacity={live ? 0.75 : 1} strokeWidth={1.6} strokeLinecap="round" />
          {live && len > 0 && (
            <>
              {/* destello que recorre la curva sin parar */}
              <motion.path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={3.2}
                strokeLinecap="round"
                filter={`url(#${gid}-glow)`}
                strokeDasharray={`${seg} ${len + seg}`}
                initial={{ strokeDashoffset: seg }}
                animate={{ strokeDashoffset: -len }}
                transition={{ duration: 2.6, ease: 'linear', repeat: Infinity, repeatDelay: 0.4 }}
              />
              <motion.path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={`${seg} ${len + seg}`}
                initial={{ strokeDashoffset: seg }}
                animate={{ strokeDashoffset: -len }}
                transition={{ duration: 2.6, ease: 'linear', repeat: Infinity, repeatDelay: 0.4 }}
              />
            </>
          )}
          {<motion.line y1={0} y2={H} stroke={color} strokeOpacity={0.18} strokeDasharray="2 3" animate={{ x1: cx0, x2: cx0 }} transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }} />}
          <motion.g animate={{ x: cx0, y: cy0 }} initial={false} transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}>
            {live && <circle r={3} fill={color} className="ba-ping" />}
            <circle r={2.6} fill={color} stroke="rgb(var(--surface))" strokeWidth={1.4} />
          </motion.g>
        </motion.svg>
      )}
    </div>
  );
}

/** Punto que corresponde al mes seleccionado en el recorrido (o el último con dato) */
export function useSparkIndex(data: (number | null)[], periods?: string[]) {
  const { period } = useCursor();
  const pts = data.map((v, i) => ({ v, i })).filter((p) => p.v !== null);
  if (!pts.length) return null;
  let k = pts.length - 1;
  if (periods && period) {
    const target = periods.indexOf(period);
    if (target >= 0) {
      const found = pts.map((p) => p.i).filter((i) => i <= target);
      if (found.length) k = pts.findIndex((p) => p.i === found[found.length - 1]);
    }
  }
  return { dataIndex: pts[k].i, prevIndex: k > 0 ? pts[k - 1].i : null };
}

/* Tendencia principal -------------------------------------------------- */
const TREND_METRICS: SeriesMetric[] = ['ingresos', 'ventas', 'visitas', 'consultas'];

export function TrendChart({
  rows,
  prevRows,
  onPointClick,
  onApplyRange,
  height = 320,
  initial = ['ingresos'],
  metrics = TREND_METRICS,
}: {
  rows: Row[];
  prevRows?: Row[];
  onPointClick?: (period: string) => void;
  onApplyRange?: (from: string, to: string) => void;
  height?: number;
  initial?: SeriesMetric[];
  metrics?: SeriesMetric[];
}) {
  const c = useChartColors();
  const dur = useAnimDuration(650);
  const [active, setActive] = useState<Set<string>>(new Set(initial));
  const [compare, setCompare] = useState(false);
  const [brush, setBrush] = useState<{ start: number; end: number } | null>(null);
  const live = useLiveEnabled();
  const { period: cursorPeriod } = useCursor();
  const setCursor = useStore((st) => st.setCursor);
  const colorOf = (m: SeriesMetric) => c.series[metrics.indexOf(m) % c.series.length];

  const data = useMemo(
    () =>
      rows.map((r, i) => {
        const o: Record<string, number | string | undefined> = { period: r.period };
        for (const m of metrics) {
          o[m] = r.values[m];
          o[`prev_${m}`] = prevRows?.[i]?.values[m];
        }
        o.prevPeriod = prevRows?.[i]?.period;
        return o;
      }),
    [rows, prevRows, metrics],
  );

  const available = metrics.filter((m) => rows.some((r) => r.values[m] !== undefined));
  const shown = available.filter((m) => active.has(m));
  const money = shown.filter((m) => METRICS[m].unit === 'Q' || METRICS[m].unit === 'Q2');
  const counts = shown.filter((m) => !money.includes(m));
  const leftIsMoney = money.length > 0;
  const hasPrev = !!prevRows?.some((r) => Object.keys(r.values).length);
  const toggle = (k: string) =>
    setActive((s) => {
      const n = new Set(s);
      if (n.has(k)) {
        if (n.size > 1) n.delete(k);
      } else n.add(k);
      return n;
    });

  if (!available.length) return null;

  // Recorrido automático: un cursor avanza mes a mes mientras nadie interactúa con el gráfico
  const scanIdx = rows.findIndex((r) => r.period === cursorPeriod);
  const scan = scanIdx >= 0 && shown.some((m) => rows[scanIdx].values[m] !== undefined) ? { r: rows[scanIdx], i: scanIdx } : null;
  const scanPrev = scan ? rows[scan.i - 1] : undefined;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2" data-noexport="1">
        <SeriesToggle items={available.map((m) => ({ key: m, label: METRICS[m].label, color: colorOf(m) }))} active={active} onToggle={toggle} />
        <div className="flex items-center gap-1.5">
          {hasPrev && (
            <button
              type="button"
              aria-pressed={compare}
              onClick={() => setCompare((v) => !v)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
                compare ? 'border-electric/40 bg-electric/10 text-electric' : 'border-line text-muted hover:text-ink',
              )}
            >
              Período anterior
            </button>
          )}
          {brush && onApplyRange && (brush.start > 0 || brush.end < rows.length - 1) && (
            <Button size="sm" variant="outline" onClick={() => onApplyRange(rows[brush.start].period, rows[brush.end].period)}>
              <Filter size={12} /> Filtrar {labelShort(rows[brush.start].period)}–{labelShort(rows[brush.end].period)}
            </Button>
          )}
        </div>
      </div>
      {(
        <div className="mb-1 flex h-7 items-center gap-3 overflow-hidden px-1 text-[12px]" aria-live="off">
          <PlaybackControls compact className="border-r border-line pr-2" />
          <AnimatePresence mode="popLayout" initial={false}>
            {scan && (
              <motion.div
                key={scan.r.period}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
                className="tnum flex min-w-0 items-center gap-4 whitespace-nowrap"
              >
                {shown.map((m) => {
                  const v = scan.r.values[m];
                  const p = scanPrev?.values[m];
                  const d = v !== undefined && p ? (v - p) / Math.abs(p) : undefined;
                  return (
                    <span key={m} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: colorOf(m) }} />
                      <span className="text-ink">{fmt(v, METRICS[m].unit)}</span>
                      {d !== undefined && (
                        <span className={d > 0.0005 ? 'text-up' : d < -0.0005 ? 'text-down' : 'text-faint'}>
                          {d > 0.0005 ? '▲' : d < -0.0005 ? '▼' : '■'} {pct(Math.abs(d)).replace('+', '')}
                        </span>
                      )}
                    </span>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: counts.length && leftIsMoney ? 4 : 16, left: 0, bottom: 0 }}
            onClick={(s) => {
              if (!s?.activeLabel) return;
              setCursor(String(s.activeLabel));
              onPointClick?.(String(s.activeLabel));
            }}
            style={{ cursor: onPointClick ? 'pointer' : undefined }}
          >
            <defs>
              {shown.map((m) => (
                <linearGradient key={m} id={`g-${m}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colorOf(m)} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={colorOf(m)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="period" tickFormatter={(p) => labelShort(p, rows.length > 12)} {...axisProps(c)} dy={6} minTickGap={12} />
            <YAxis
              yAxisId="left"
              width={56}
              tickFormatter={(v) => compact(v, leftIsMoney ? 'Q' : 'n')}
              {...axisProps(c)}
            />
            {leftIsMoney && counts.length > 0 && <YAxis yAxisId="right" orientation="right" width={44} tickFormatter={(v) => compact(v)} {...axisProps(c)} />}
            <Tooltip
              cursor={{ stroke: c.faint, strokeDasharray: '3 3' }}
              content={({ active: a, payload, label }) => {
                if (!a || !payload?.length) return null;
                const d = payload[0].payload as Record<string, number | string | undefined>;
                const tipRows: TipRow[] = shown.map((m) => ({
                  label: METRICS[m].label,
                  value: d[m] as number | undefined,
                  unit: METRICS[m].unit,
                  color: colorOf(m),
                  extra:
                    compare && d[`prev_${m}`] !== undefined && d[m] !== undefined ? (
                      <span className="ml-1.5 text-[11px] font-normal text-faint">{pct(((d[m] as number) - (d[`prev_${m}`] as number)) / (d[`prev_${m}`] as number))}</span>
                    ) : undefined,
                }));
                return (
                  <ChartTip
                    title={labelLong(String(label))}
                    rows={tipRows}
                    footer={
                      <>
                        {compare && d.prevPeriod ? `Comparado con ${labelLong(String(d.prevPeriod))}. ` : ''}
                        {onPointClick ? 'Clic para ver el detalle del mes.' : ''}
                      </>
                    }
                  />
                );
              }}
            />
            {shown.map((m, i) => {
              const axis = leftIsMoney ? (money.includes(m) ? 'left' : 'right') : 'left';
              const color = colorOf(m);
              const common = {
                key: m,
                yAxisId: axis,
                dataKey: m,
                type: 'monotone' as const,
                stroke: color,
                strokeWidth: 2,
                connectNulls: false,
                animationDuration: dur,
                animationEasing: 'ease-out' as const,
                dot: { r: 2.5, fill: c.surface, stroke: color, strokeWidth: 1.5 },
                activeDot: { r: 5.5, fill: color, stroke: c.surface, strokeWidth: 2 },
                name: METRICS[m].label,
              };
              return i === 0 ? <Area {...common} fill={`url(#g-${m})`} /> : <Line {...common} />;
            })}
            {live &&
              shown.map((m) => (
                <Line
                  key={`comet_${m}`}
                  yAxisId={leftIsMoney ? (money.includes(m) ? 'left' : 'right') : 'left'}
                  dataKey={m}
                  type="monotone"
                  stroke={colorOf(m)}
                  strokeWidth={3}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  className="ba-comet"
                  style={{ color: colorOf(m) }}
                  legendType="none"
                  tooltipType="none"
                />
              ))}
            {scan && <ReferenceLine yAxisId="left" x={scan.r.period} stroke={c.faint} strokeDasharray="3 4" ifOverflow="extendDomain" />}
            {scan &&
              shown.map((m) =>
                scan.r.values[m] !== undefined ? (
                  <ReferenceDot
                    key={`scan_${m}`}
                    yAxisId={leftIsMoney ? (money.includes(m) ? 'left' : 'right') : 'left'}
                    x={scan.r.period}
                    y={scan.r.values[m]}
                    r={5}
                    fill={colorOf(m)}
                    stroke={c.surface}
                    strokeWidth={2}
                  />
                ) : null,
              )}
            {compare &&
              shown.map((m) => (
                <Line
                  key={`prev_${m}`}
                  yAxisId={leftIsMoney ? (money.includes(m) ? 'left' : 'right') : 'left'}
                  dataKey={`prev_${m}`}
                  type="monotone"
                  stroke={colorOf(m)}
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  animationDuration={dur}
                  isAnimationActive
                />
              ))}
            {rows.length > 5 && onApplyRange && (
              <Brush
                dataKey="period"
                height={22}
                travellerWidth={8}
                stroke={c.line}
                fill={c.surface}
                tickFormatter={(p) => labelShort(p)}
                onChange={(r) => setBrush({ start: r.startIndex ?? 0, end: r.endIndex ?? rows.length - 1 })}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* Donut ---------------------------------------------------------------- */
export function Donut({
  data,
  unit,
  centerLabel,
  height = 200,
  stack = false,
}: {
  data: { name: string; value: number }[];
  unit: Unit;
  centerLabel: string;
  height?: number;
  stack?: boolean;
}) {
  const c = useChartColors();
  const dur = useAnimDuration(700);
  const [idx, setIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const focus = idx !== null ? data[idx] : null;
  return (
    <div className={cx('flex flex-col items-center gap-4', !stack && 'sm:flex-row sm:items-center')}>
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              animationDuration={dur}
              activeIndex={idx ?? undefined}
              activeShape={(p: any) => <Sector {...p} outerRadius={p.outerRadius + 4} />}
              onMouseEnter={(_, i) => setIdx(i)}
              onMouseLeave={() => setIdx(null)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={c.series[i % c.series.length]} opacity={idx === null || idx === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="tnum text-[17px] font-semibold text-ink">{focus ? fmt(focus.value / total, '%') : fmt(total, unit)}</div>
            <div className="mt-0.5 max-w-[110px] truncate text-[11px] text-muted">{focus ? focus.name : centerLabel}</div>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li
            key={d.name}
            onMouseEnter={() => setIdx(i)}
            onMouseLeave={() => setIdx(null)}
            className={cx('flex items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] transition-colors', idx === i && 'bg-sunken')}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.series[i % c.series.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted">{d.name}</span>
            <span className="tnum whitespace-nowrap text-ink">{fmt(d.value / total, '%')}</span>
            <span className="tnum hidden w-16 whitespace-nowrap text-right text-faint sm:inline">{compact(d.value, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Embudo --------------------------------------------------------------- */
export function Funnel({ stages }: { stages: { label: string; value?: number; note?: string }[] }) {
  const c = useChartColors();
  const reduce = useReducedMotion();
  const valid = stages.filter((s) => s.value !== undefined) as { label: string; value: number; note?: string }[];
  const max = Math.max(...valid.map((s) => s.value), 1);
  const broken = valid.find((s, i) => i > 0 && s.value > valid[i - 1].value);
  const brokenPrev = broken ? valid[valid.indexOf(broken) - 1] : undefined;
  return (
    <div className="space-y-2.5">
      {broken && brokenPrev && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-[12px] leading-snug text-warn">
          {broken.label} ({fmt(broken.value)}) supera a {brokenPrev.label.toLowerCase()} ({fmt(brokenPrev.value)}): las etapas no son compatibles como embudo. Probablemente las ventas incluyen clientes que no pasaron por esa etapa.
        </p>
      )}
      {stages.map((s, i) => {
        const prev = stages.slice(0, i).reverse().find((x) => x.value !== undefined)?.value;
        const rate = s.value !== undefined && prev ? s.value / prev : undefined;
        const w = s.value !== undefined ? Math.max(4, (s.value / max) * 100) : 0;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-muted">{s.label}</span>
              <span className="tnum font-medium text-ink">
                {fmt(s.value)}
                {rate !== undefined && rate <= 1 && <span className="ml-2 text-[11.5px] font-normal text-faint">{fmt(rate, '%')} de la etapa previa con datos</span>}
              </span>
            </div>
            <div className="h-7 overflow-hidden rounded-md bg-sunken">
              {s.value !== undefined ? (
                <motion.div
                  className="h-full rounded-md"
                  style={{ background: c.series[0], opacity: 1 - i * 0.18 }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                />
              ) : (
                <div className="flex h-full items-center px-3 text-[11.5px] text-faint">{s.note ?? 'Sin datos de esta etapa'}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Heatmap: meses × indicadores, color por variación mensual ------------ */
export function Heatmap({ rows, metrics, onCell }: { rows: Row[]; metrics: SeriesMetric[]; onCell?: (period: string) => void }) {
  const c = useChartColors();
  const cells = metrics.map((m) =>
    rows.map((r, i) => {
      const v = r.values[m];
      const p = i > 0 ? rows[i - 1].values[m] : undefined;
      const isRate = METRICS[m].unit === '%';
      const d = v !== undefined && p !== undefined ? (isRate ? v - p : p ? (v - p) / p : undefined) : undefined;
      return { v, d, isRate };
    }),
  );
  const maxAbs = Math.max(0.05, ...cells.flat().map((x) => Math.abs(x.d ?? 0)));
  const bg = (d?: number) => {
    if (d === undefined) return 'transparent';
    const a = Math.min(1, Math.abs(d) / maxAbs) * 0.55 + 0.06;
    const col = d >= 0 ? c.up : c.down;
    return col.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  };
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-[11.5px]">
        <thead>
          <tr>
            <th className="w-32" />
            {rows.map((r) => (
              <th key={r.period} className="pb-1 text-center font-medium text-faint">
                {labelShort(r.period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, mi) => (
            <tr key={m}>
              <td className="pr-2 text-muted">{METRICS[m].label}</td>
              {cells[mi].map((cell, i) => (
                <td key={i} className="p-0">
                  <button
                    type="button"
                    onClick={() => onCell?.(rows[i].period)}
                    title={cell.d !== undefined ? `${METRICS[m].label} · ${labelLong(rows[i].period)}: ${cell.isRate ? '' : ''}${fmt(cell.v, METRICS[m].unit)}` : 'Sin comparación'}
                    className="tnum h-9 w-full rounded-md text-center font-medium text-ink transition-transform hover:scale-[1.04]"
                    style={{ background: cell.d === undefined ? undefined : bg(cell.d) }}
                  >
                    {cell.d === undefined ? <span className="text-faint">·</span> : heatLabel(cell.d, cell.isRate)}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-[11px] text-faint">Variación frente al mes anterior. Las tasas se expresan en puntos porcentuales.</p>
    </div>
  );
}

function heatLabel(d: number, isRate: boolean) {
  const v = Math.abs(d * 100);
  const txt = isRate ? v.toFixed(1) : v.toFixed(0);
  if (Number(txt) === 0) return isRate ? '0.0' : '0%';
  return `${d >= 0 ? '+' : '−'}${txt}${isRate ? '' : '%'}`;
}
