import { useMemo, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, Target } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useCompareRange, useTrendRange } from '../../lib/hooks';
import { roiByChannel, roiByMonth, roiTotal } from '../../lib/roi';
import { aggSocial, socialFor } from '../../lib/metrics';
import { compact, fmt } from '../../lib/format';
import { labelLong, labelRange, labelShort, monthsBetween, MONTHS_ES } from '../../lib/periods';
import { axisProps, ChartCard, ChartTip, useChartColors } from '../charts/kit';
import { Card, cx, Delta, InfoTip } from '../ui';

/**
 * Página Hallazgos: 1 · KPI clave, 2 · Comparaciones, 3 · Gráficos, 4 · Hallazgos (lista que recibe como hijos)
 * y 5 · Decisión con plazo. Todo se calcula con el período y la comparación elegidos en los filtros.
 */
export function ExecutiveBrief({ children }: { children?: ReactNode }) {
  const { ds, scope, range } = useStore();
  const { cmp, label: cmpLabel } = useCompareRange();
  const { trend, highlight } = useTrendRange();
  const c = useChartColors();

  const d = useMemo(() => {
    const t = roiTotal(ds, scope, range);
    const p = cmp ? roiTotal(ds, scope, cmp) : null;
    const prev = p && p.ingresos !== undefined && p.inversion !== undefined ? p : null;
    const ch = roiByChannel(ds, scope, range).rows.filter((r) => r.inversion !== undefined && r.ventas);
    const soc = socialFor(ds, scope, range);
    const cpc = new Map(soc.platforms.map((pl) => [pl, aggSocial(soc.recs.filter((r) => r.platform === pl)).cpc]));
    const months = roiByMonth(ds, scope, trend).filter((m) => m.ingresos !== undefined);
    const nMonths = roiByMonth(ds, scope, range).filter((m) => m.inversion !== undefined).length || 1;
    return { t, prev, ch, cpc, months, nMonths, estimado: soc.estimado };
  }, [ds, scope, range, cmp, trend]);

  const { t, prev, ch } = d;
  if (t.inversion === undefined || t.ingresos === undefined) return null;

  const rel = (a?: number, b?: number) => (a !== undefined && b ? (a - b) / Math.abs(b) : undefined);

  // KPI distintos a los del Resumen ejecutivo, pensados para entenderse sin fórmulas
  const dias = (r: { from: string; to: string }) => monthsBetween(r).reduce((n, m) => n + new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate(), 0);
  const leadsDia = t.leads !== undefined ? t.leads / dias(range) : undefined;
  const leadsDiaPrev = prev?.leads !== undefined && cmp ? prev.leads / dias(cmp) : undefined;
  const porInscripcion = t.leads !== undefined && t.ventas ? t.leads / t.ventas : undefined;
  const porInscripcionPrev = prev?.leads !== undefined && prev.ventas ? prev.leads / prev.ventas : undefined;
  const porMil = t.ventas !== undefined && t.inversion ? (t.ventas / t.inversion) * 1000 : undefined;
  const porMilPrev = prev?.ventas !== undefined && prev.inversion ? (prev.ventas / prev.inversion) * 1000 : undefined;
  const dec1 = (v?: number) => (v === undefined ? '—' : v.toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  // Mejor y peor red por costo por venta
  const sorted = [...ch].sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // ---------- Decisión con plazo ----------
  const now = new Date();
  const deadline = new Date(now.getFullYear(), now.getMonth() + 2, 0); // último día del próximo mes
  const nextMonth = `${MONTHS_ES[(now.getMonth() + 1) % 12]} ${now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()}`;
  const plazo = deadline.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
  let decision: { title: string; body: string } | null = null;
  if (best && worst && best !== worst && worst.cpa && best.cpa && worst.cpa > best.cpa * 1.5) {
    const mensualWorst = (worst.inversion ?? 0) / d.nMonths;
    const mover = Math.round(mensualWorst / 2 / 500) * 500 || Math.round(mensualWorst / 2);
    const extra = mover / best.cpa - mover / worst.cpa;
    decision = {
      title: `Mover Q ${mover.toLocaleString('es-GT')} al mes de ${worst.canal} a ${best.canal}`,
      body: `Es la mitad de lo que hoy se invierte en ${worst.canal}. Con los costos por venta actuales serían unas ${Math.round(extra)} inscripciones más al mes sin aumentar el presupuesto. Aplicarlo en ${nextMonth} y revisar el resultado en este tablero.`,
    };
  } else if (t.costoConsulta) {
    decision = {
      title: 'Mantener el presupuesto y trabajar el cierre de leads',
      body: `Las redes rinden parecido. Cada punto de cierre adicional sobre los leads actuales vale más que mover dinero entre redes. Fijar una meta de cierre para ${nextMonth} y revisarla en este tablero.`,
    };
  }

  const roasNow = t.ingresos / t.inversion;
  const cpcPairs = ch.map((r) => ({ canal: r.canal, cpc: d.cpc.get(r.canal), cpa: r.cpa }));
  const chartMonths = d.months.map((m) => ({ period: m.period, inversion: m.inversion, venta: m.ingresos, ganancia: m.ingresos! - (m.inversion ?? 0) }));
  const chartCh = sorted.map((r) => ({ canal: r.canal, cpa: r.cpa ?? 0 }));

  return (
    <div className="space-y-6">
      <section aria-labelledby="sec-kpi">
      <SectionTitle id="sec-kpi" n={1} title="KPI clave" note={`Tres números para entender el ritmo del negocio en ${labelRange(range)} (distintos a los del Resumen ejecutivo)${prev ? ` y su cambio frente a ${labelRange(cmp!)}` : ''}.`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Interesados por día"
          value={leadsDia === undefined ? '—' : `${Math.round(leadsDia)} al día`}
          delta={rel(leadsDia, leadsDiaPrev)}
          deltaLabel={prev ? cmpLabel : undefined}
          explain={`En promedio llegan ${Math.round(leadsDia ?? 0)} personas cada día pidiendo información (${fmt(t.leads)} leads en ${dias(range)} días). Es el ritmo que el equipo de ventas debe atender.`}
        />
        <Kpi
          label="Interesados por cada inscripción"
          value={porInscripcion === undefined ? '—' : `1 de cada ${dec1(porInscripcion)}`}
          delta={rel(porInscripcion, porInscripcionPrev)}
          higherIsBetter={false}
          deltaLabel={prev ? cmpLabel : undefined}
          explain={`Hay que atender a unas ${Math.round(porInscripcion ?? 0)} personas interesadas para lograr una inscripción. Mientras menos, mejor: significa que el seguimiento convence más rápido.`}
        />
        <Kpi
          label="Inscripciones por cada Q 1,000 en publicidad"
          value={porMil === undefined ? '—' : `${dec1(porMil)} inscripciones`}
          delta={rel(porMil, porMilPrev)}
          deltaLabel={prev ? cmpLabel : undefined}
          explain={`Cada Q 1,000 invertidos en anuncios trajeron ${dec1(porMil)} clientes nuevos. Sirve para calcular cuántas inscripciones esperar si se sube o baja el presupuesto.`}
        />
      </div>

      </section>

      <section aria-labelledby="sec-comp">
      <SectionTitle id="sec-comp" n={2} title="Comparaciones" note="Lo invertido contra lo vendido, y lo barato de un clic contra lo caro de una venta." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-5">
          <CompareTitle title="Inversión vs. retorno" help="Compara lo que se pagó en publicidad con lo que se vendió en el mismo período." />
          <div className="mt-3 space-y-2.5">
            <Meter label="Inversión" value={t.inversion} max={t.ingresos} color={c.series[2]} />
            <Meter label="Venta (retorno)" value={t.ingresos} max={t.ingresos} color={c.series[0]} />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            <b className="font-semibold text-ink">Por cada Q 1 invertido regresaron Q {roasNow.toFixed(2)} en ventas.</b> La publicidad fue {fmt(t.roi, '%2')} de lo vendido.
          </p>
        </Card>

        <Card className="p-5">
          <CompareTitle
            title="Costo por clic vs. costo por venta"
            help="El clic dice qué tan barato es atraer atención; la venta dice si esa atención se volvió inscripción. Una red puede tener clics baratos y ventas caras."
          />
          <table className="mt-3 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-faint">
                <th className="py-1 font-medium">Red</th>
                <th className="py-1 text-right font-medium">Por clic{d.estimado ? ' (est.)' : ''}</th>
                <th className="py-1 text-right font-medium">Por venta</th>
              </tr>
            </thead>
            <tbody>
              {cpcPairs.map((r) => (
                <tr key={r.canal} className="border-t border-line/60">
                  <td className="py-1.5 font-medium text-ink">{r.canal}</td>
                  <td className="tnum py-1.5 text-right text-ink">{fmt(r.cpc, 'Q2')}</td>
                  <td className={cx('tnum py-1.5 text-right font-semibold', r.canal === best?.canal ? 'text-electric' : 'text-ink')}>{fmt(r.cpa, 'Q2')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {best && worst && best !== worst && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              {(d.cpc.get(worst.canal) ?? Infinity) < (d.cpc.get(best.canal) ?? Infinity) ? (
                <>
                  <b className="font-semibold text-ink">{worst.canal} consigue clics más baratos, pero cada venta cuesta {fmt(worst.cpa, 'Q2')}.</b> Atrae atención que no termina en inscripción.
                </>
              ) : (
                <>
                  <b className="font-semibold text-ink">{best.canal} es más eficiente en clics y en ventas.</b> Cada venta cuesta {fmt(best.cpa, 'Q2')} contra {fmt(worst.cpa, 'Q2')} en {worst.canal}.
                </>
              )}
            </p>
          )}
        </Card>
      </div>

      </section>

      <section aria-labelledby="sec-graf">
      <SectionTitle id="sec-graf" n={3} title="Gráficos" note="La ganancia mes a mes y el costo de cada inscripción por red." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Inversión vs. venta por mes" subtitle="La distancia entre las barras es la ganancia sobre la publicidad." exportName="inversion-vs-venta">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={chartMonths} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={56} tickFormatter={(v) => compact(v, 'Q')} {...axisProps(c)} />
                {highlight && <ReferenceLine x={highlight} stroke={c.electric} strokeOpacity={0.3} strokeWidth={22} />}
                <Legend verticalAlign="top" height={28} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const x = payload[0].payload as (typeof chartMonths)[number];
                    return (
                      <ChartTip
                        title={labelLong(x.period)}
                        rows={[
                          { label: 'Venta', value: x.venta, unit: 'Q', color: c.series[0] },
                          { label: 'Inversión', value: x.inversion, unit: 'Q', color: c.series[2] },
                          { label: 'Ganancia', value: x.ganancia, unit: 'Q', color: c.up },
                        ]}
                      />
                    );
                  }}
                />
                <Bar name="Venta" dataKey="venta" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={26} animationDuration={700} />
                <Bar name="Inversión" dataKey="inversion" fill={c.series[2]} radius={[4, 4, 0, 0]} maxBarSize={26} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Costo por venta por red" subtitle="Cuánto costó cada inscripción en cada red. Más corta es mejor." exportName="costo-por-venta-red">
          <div style={{ height: Math.max(180, chartCh.length * 56) }}>
            <ResponsiveContainer>
              <BarChart data={chartCh} layout="vertical" margin={{ top: 4, right: 90, left: 8, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="canal" width={90} {...axisProps(c)} />
                <Tooltip cursor={{ fill: c.grid }} content={({ active, payload }) => (active && payload?.length ? <ChartTip title={String((payload[0].payload as { canal: string }).canal)} rows={[{ label: 'Costo por venta', value: payload[0].value as number, unit: 'Q2', color: c.series[0] }]} /> : null)} />
                <Bar dataKey="cpa" radius={[0, 4, 4, 0]} maxBarSize={26} animationDuration={700}>
                  {chartCh.map((x, i) => (
                    <Cell key={x.canal} fill={i === 0 ? c.series[1] : i === chartCh.length - 1 ? c.down : c.series[0]} />
                  ))}
                  <LabelList dataKey="cpa" position="right" formatter={(v: number) => fmt(v, 'Q2')} style={{ fill: c.ink, fontSize: 12, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      </section>

      {children && (
        <section aria-labelledby="sec-hall">
          <SectionTitle id="sec-hall" n={4} title="Hallazgos" note="Qué pasó, qué significa y qué hacer, en palabras sencillas." />
          {children}
        </section>
      )}

      {decision && (
        <section aria-labelledby="sec-dec">
          <SectionTitle id="sec-dec" n={children ? 5 : 4} title="Decisión con plazo" note="La acción que más impacto tendría según los datos, y para cuándo." />
          <div className="bg-brand-gradient rounded-card p-5 text-white shadow-card">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Target size={16} className="text-aqua" /> Decisión recomendada
            </div>
            <p className="mt-3 text-[18px] font-semibold leading-snug">{decision.title}</p>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-white/80">{decision.body}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[12.5px]">
              <CalendarClock size={15} className="text-aqua" />
              <span>
                Plazo: <b className="font-semibold">{plazo}</b>
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ id, n, title, note }: { id: string; n: number; title: string; note: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2.5 px-1">
      <span className="grid h-6 w-6 shrink-0 translate-y-0.5 place-items-center rounded-full bg-electric text-[12px] font-semibold text-white">{n}</span>
      <div>
        <h2 id={id} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        <p className="text-[12.5px] text-muted">{note}</p>
      </div>
    </div>
  );
}

function Kpi({ label, value, explain, delta, deltaKind = 'rel', higherIsBetter = true, deltaLabel }: { label: string; value: string; explain: string; delta?: number; deltaKind?: 'rel' | 'pp'; higherIsBetter?: boolean; deltaLabel?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        {delta !== undefined && <Delta value={delta} kind={deltaKind} higherIsBetter={higherIsBetter} />}
      </div>
      <div className="tnum mt-1.5 text-[26px] font-semibold tracking-[-0.02em] text-ink">{value}</div>
      {deltaLabel && delta !== undefined && <div className="text-[11.5px] text-faint">{deltaLabel}</div>}
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{explain}</p>
    </Card>
  );
}

function CompareTitle({ title, help }: { title: string; help: string }): ReactNode {
  return (
    <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
      {title}
      <InfoTip text={help} />
    </div>
  );
}

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        <span className="tnum font-semibold text-ink">{fmt(value, 'Q')}</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}
