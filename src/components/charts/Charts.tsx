import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject, type MutableRefObject } from 'react';
import { useCursor } from '../../lib/live';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
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
  const [w, setW] = useState(0);
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
  if (pts.length < 2) return <div ref={ref} style={{ height }} className={className} />;
  const idx = si ? pts.findIndex((p) => p.i === si.dataIndex) : P.length - 1;
  const [cx0, cy0] = P[idx < 0 ? P.length - 1 : idx];

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
          </defs>
          <path d={`${d} L${P[P.length - 1][0]},${H} L${P[0][0]},${H} Z`} fill={`url(#${gid})`} />
          <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={cx0} cy={cy0} r={2.6} fill={color} stroke="rgb(var(--surface))" strokeWidth={1.4} />
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

/* Dibujo de líneas ------------------------------------------------------ */
const DRAW_MS = 1700;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Punto de una curva SVG para una x dada (las curvas avanzan de izquierda a derecha) */
function pointAtX(path: SVGPathElement, x: number) {
  const total = path.getTotalLength();
  let lo = 0;
  let hi = total;
  for (let k = 0; k < 22; k++) {
    const mid = (lo + hi) / 2;
    if (path.getPointAtLength(mid).x < x) lo = mid;
    else hi = mid;
  }
  return path.getPointAtLength((lo + hi) / 2);
}

/**
 * Al montarse (cada vez que cambia el mes o el período, porque la tarjeta del gráfico se vuelve a montar),
 * la línea se dibuja de izquierda a derecha una sola vez y en la punta corre un número que
 * sube o baja siguiendo la inclinación de la curva.
 */
function useLineDraw(opts: {
  wrap: RefObject<HTMLDivElement>;
  clipRect: RefObject<SVGRectElement>;
  labels: MutableRefObject<Record<string, HTMLDivElement | null>>;
  series: { key: string; values: (number | undefined)[]; unit: Unit }[];
  enabled: boolean;
}) {
  const [done, setDone] = useState(!opts.enabled);
  const [fade, setFade] = useState(!opts.enabled);
  const seriesRef = useRef(opts.series);
  seriesRef.current = opts.series;
  useEffect(() => {
    if (!opts.enabled) return;
    let raf = 0;
    let tm = 0;
    // requestAnimationFrame se pausa si la ventana no se está pintando; el temporizador garantiza que el dibujo avance y termine
    const next = () => {
      let fired = false;
      raf = requestAnimationFrame((now) => {
        fired = true;
        window.clearTimeout(tm);
        frame(now);
      });
      tm = window.setTimeout(() => {
        if (fired) return;
        cancelAnimationFrame(raf);
        frame(performance.now());
      }, 40);
    };
    const born = performance.now();
    let start = 0;
    let fadeTimer = 0;
    const frame = (now: number) => {
      const wrap = opts.wrap.current;
      const rect = opts.clipRect.current;
      const list = seriesRef.current;
      const paths = list.map((sr) => wrap?.querySelector<SVGPathElement>(`.ba-s-${sr.key} .recharts-area-curve, .ba-s-${sr.key} .recharts-line-curve`) ?? null);
      // Esperamos a que el gráfico tenga tamaño y trazos
      if (!wrap || !rect || !paths[0] || !paths[0].getTotalLength()) {
        // Si el gráfico no llega a tener trazos, se muestra completo sin animación
        if (now - born > 3000) {
          setDone(true);
          setFade(true);
          return;
        }
        next();
        return;
      }
      if (!start) start = now;
      const t = Math.min(1, (now - start) / DRAW_MS);
      const p = easeInOut(t);
      // Extensión horizontal de todas las líneas visibles
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const ph of paths) {
        if (!ph) continue;
        const b = ph.getBBox();
        x0 = Math.min(x0, b.x);
        x1 = Math.max(x1, b.x + b.width);
      }
      const tipX = x0 + p * (x1 - x0);
      rect.setAttribute('width', String(Math.max(0, tipX + 6)));
      list.forEach((sr, i) => {
        const el = opts.labels.current[sr.key];
        const ph = paths[i];
        if (!el) return;
        const present = sr.values.map((v, j) => (v === undefined ? -1 : j)).filter((j) => j >= 0);
        if (!ph || present.length < 2) {
          el.style.opacity = '0';
          return;
        }
        const b = ph.getBBox();
        const x = Math.min(Math.max(tipX, b.x), b.x + b.width);
        const pt = pointAtX(ph, x);
        // Valor: interpolado entre los meses vecinos según la posición en x
        const f = b.width ? (x - b.x) / b.width : 1;
        const pos = present[0] + f * (present[present.length - 1] - present[0]);
        const a = Math.floor(pos);
        const c2 = Math.min(Math.ceil(pos), sr.values.length - 1);
        const va = sr.values[a] ?? sr.values[c2] ?? 0;
        const vb = sr.values[c2] ?? va;
        const v = va + (vb - va) * (pos - a);
        el.style.opacity = '1';
        el.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
        const txt = el.querySelector('[data-v]');
        if (txt) txt.textContent = fmt(v, sr.unit);
      });
      if (t < 1) next();
      else {
        setDone(true);
        fadeTimer = window.setTimeout(() => setFade(true), 1400);
      }
    };
    next();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tm);
      window.clearTimeout(fadeTimer);
    };
    // Solo al montar: el dibujo ocurre una vez por cambio de mes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { done, fade };
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
  highlight,
}: {
  /** Mes resaltado (vista de un mes) */
  highlight?: string | null;
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
  const reduce = useReducedMotion();
  const [active, setActive] = useState<Set<string>>(new Set(initial));
  const uid = `td${useId().replace(/:/g, '')}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [compare, setCompare] = useState(false);
  const [brush, setBrush] = useState<{ start: number; end: number } | null>(null);
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

  const draw = useLineDraw({
    wrap: wrapRef,
    clipRect: clipRef,
    labels: labelRefs,
    series: shown.map((m) => ({ key: m, values: rows.map((r) => r.values[m]), unit: METRICS[m].unit })),
    enabled: !reduce && rows.length > 1,
  });

  if (!available.length) return null;

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
      <div ref={wrapRef} style={{ height }} className={cx('relative w-full', uid)}>
        {!draw.done && <style>{`.${uid} .ba-main { clip-path: url(#${uid}-clip); }`}</style>}
        {!draw.fade &&
          shown.map((m) => (
            <div
              key={m}
              ref={(el) => {
                labelRefs.current[m] = el;
              }}
              aria-hidden
              data-noexport="1"
              className={cx('pointer-events-none absolute left-0 top-0 z-10 transition-opacity duration-500', draw.done && '!opacity-0 delay-700')}
              style={{ opacity: 0, willChange: 'transform' }}
            >
              <span className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full border-2" style={{ background: colorOf(m), borderColor: c.surface }} />
              <span
                data-v
                className="tnum absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold text-white shadow-pop"
                style={{ background: colorOf(m) }}
              />
            </div>
          ))}
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: counts.length && leftIsMoney ? 4 : 16, left: 0, bottom: 0 }}
            onClick={(s) => {
              if (s?.activeLabel) onPointClick?.(String(s.activeLabel));
            }}
            style={{ cursor: onPointClick ? 'pointer' : undefined }}
          >
            <defs>
              <clipPath id={`${uid}-clip`}>
                <rect ref={clipRef} x={0} y={-50} width={draw.done ? 99999 : 0} height={4000} />
              </clipPath>
              {shown.map((m) => (
                <linearGradient key={m} id={`g-${m}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colorOf(m)} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={colorOf(m)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="period" tickFormatter={(p) => labelShort(p, rows.length > 12)} {...axisProps(c)} dy={6} minTickGap={12} />
            {highlight && <ReferenceLine yAxisId="left" x={highlight} stroke={c.electric} strokeWidth={2} strokeOpacity={0.35} label={{ value: labelShort(highlight), position: 'top', fill: c.electric, fontSize: 11, fontWeight: 600 }} />}
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
                // El dibujo lo hace useLineDraw; la animación propia de Recharts se apaga para no duplicarla
                isAnimationActive: false,
                className: `ba-main ba-s-${m}`,
                dot: { r: 2.5, fill: c.surface, stroke: color, strokeWidth: 1.5 },
                activeDot: { r: 5.5, fill: color, stroke: c.surface, strokeWidth: 2 },
                name: METRICS[m].label,
              };
              return i === 0 ? <Area {...common} fill={`url(#g-${m})`} /> : <Line {...common} />;
            })}
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
