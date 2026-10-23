import { useMemo, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, Lightbulb, Target } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useCompareRange, useTrendRange } from '../../lib/hooks';
import { roiByChannel, roiByMonth, roiTotal } from '../../lib/roi';
import { aggSocial, socialFor } from '../../lib/metrics';
import { compact, fmt, pct } from '../../lib/format';
import { labelLong, labelRange, labelShort, MONTHS_ES } from '../../lib/periods';
import { axisProps, ChartCard, ChartTip, useChartColors } from '../charts/kit';
import { Card, cx, Delta, InfoTip } from '../ui';

/**
 * Hallazgos principales: 3 KPI, 2 comparaciones, 2 gráficos, 3 hallazgos y una decisión con plazo.
 * Todo se calcula con el período y la comparación elegidos en los filtros.
 */
export function ExecutiveBrief() {
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

  const ganancia = t.ingresos - t.inversion;
  const ganPrev = prev ? prev.ingresos! - prev.inversion! : undefined;
  const rel = (a?: number, b?: number) => (a !== undefined && b ? (a - b) / Math.abs(b) : undefined);

  // Mejor y peor red por costo por venta
  const sorted = [...ch].sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const invTotal = ch.reduce((s, r) => s + (r.inversion ?? 0), 0);
  const venTotal = ch.reduce((s, r) => s + (r.ventas ?? 0), 0);

  // ---------- 3 hallazgos ----------
  const findings: { title: string; body: string; tone: 'good' | 'bad' | 'info' }[] = [];
  if (best && worst && best !== worst && worst.cpa && best.cpa) {
    findings.push({
      tone: 'bad',
      title: `${worst.canal} cuesta ${Math.round(worst.cpa / best.cpa)} veces más por venta que ${best.canal}`,
      body: `${worst.canal} recibe ${pct((worst.inversion ?? 0) / invTotal, 0).replace('+', '')} de la inversión pero aporta solo ${pct((worst.ventas ?? 0) / venTotal, 0).replace('+', '')} de las ventas (${fmt(worst.cpa, 'Q2')} por venta contra ${fmt(best.cpa, 'Q2')}).`,
    });
  }
  if (prev && prev.ingresos) {
    const dv = rel(t.ingresos, prev.ingresos)!;
    findings.push({
      tone: dv >= 0 ? 'good' : 'bad',
      title: `La venta ${dv >= 0 ? 'subió' : 'bajó'} ${pct(Math.abs(dv), 0).replace('+', '')} frente a ${labelRange(cmp!)}`,
      body: `Con ${t.inversion === prev.inversion ? 'la misma inversión' : `una inversión de ${fmt(t.inversion, 'Q')}`}, el ROI pasó de ${fmt(prev.roi, '%2')} a ${fmt(t.roi, '%2')}: ${t.roi! < prev.roi! ? 'la publicidad rindió más' : 'la publicidad rindió menos'}.`,
    });
  } else if (d.months.length >= 2) {
    const bestM = d.months.reduce((a, b) => ((b.roi ?? Infinity) < (a.roi ?? Infinity) ? b : a));
    const worstM = d.months.reduce((a, b) => ((b.roi ?? -Infinity) > (a.roi ?? -Infinity) ? b : a));
    findings.push({
      tone: 'info',
      title: `${labelLong(bestM.period)} fue el mejor mes y ${labelLong(worstM.period)} el peor`,
      body: `Con inversión similar, el ROI fue ${fmt(bestM.roi, '%2')} contra ${fmt(worstM.roi, '%2')}. La diferencia la hizo la venta, no el gasto.`,
    });
  }
  if (d.months.length >= 2) {
    const f = d.months[0];
    const l = d.months[d.months.length - 1];
    if (f.costoConsulta && l.costoConsulta) {
      const dl = l.costoConsulta / f.costoConsulta - 1;
      findings.push({
        tone: dl > 0.1 ? 'bad' : dl < -0.1 ? 'good' : 'info',
        title: `Cada lead cuesta ${dl > 0 ? 'más' : 'menos'} que al inicio: ${fmt(f.costoConsulta, 'Q2')} → ${fmt(l.costoConsulta, 'Q2')}`,
        body: `De ${labelLong(f.period)} a ${labelLong(l.period)} el costo por lead ${dl > 0 ? 'subió' : 'bajó'} ${pct(Math.abs(dl), 0).replace('+', '')} porque ${dl > 0 ? 'llegan menos interesados' : 'llegan más interesados'} con la misma inversión.`,
      });
    }
  }

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
    <section className="mb-3" aria-labelledby="hallazgos-titulo">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 id="hallazgos-titulo" className="text-[15px] font-semibold text-ink">
            Hallazgos principales
          </h2>
          <p className="text-[12.5px] text-muted">
            {labelRange(range)}
            {prev ? `, comparado con ${labelRange(cmp!)}` : ''}. Los 3 números clave, 2 comparaciones, 2 gráficos y qué hacer.
          </p>
        </div>
      </div>

      {/* 3 KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Ganancia sobre la publicidad"
          value={fmt(ganancia, 'Q')}
          delta={rel(ganancia, ganPrev)}
          deltaLabel={prev ? cmpLabel : undefined}
          explain={`Lo que queda de la venta después de pagar la publicidad: ${fmt(t.ingresos, 'Q')} vendidos − ${fmt(t.inversion, 'Q')} invertidos. No descuenta renta ni planilla.`}
        />
        <Kpi
          label="ROI"
          value={fmt(t.roi, '%2')}
          delta={prev && t.roi !== undefined && prev.roi !== undefined ? t.roi - prev.roi : undefined}
          deltaKind="pp"
          higherIsBetter={false}
          deltaLabel={prev ? cmpLabel : undefined}
          explain={`Inversión ÷ venta, como en el Excel. De cada Q 100 vendidos, Q ${((t.roi ?? 0) * 100).toFixed(2)} se fueron en publicidad. Más bajo es mejor.`}
        />
        <Kpi
          label="Costo por venta"
          value={fmt(t.cpa, 'Q2')}
          delta={rel(t.cpa, prev?.cpa)}
          higherIsBetter={false}
          deltaLabel={prev ? cmpLabel : undefined}
          explain={`Lo que costó en publicidad conseguir cada inscripción: ${fmt(t.inversion, 'Q')} ÷ ${fmt(t.ventas)} ventas cerradas.`}
        />
      </div>

      {/* 2 comparaciones */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
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

      {/* 2 gráficos */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
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

      {/* 3 hallazgos + decisión con plazo */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
            <Lightbulb size={16} className="text-electric" /> 3 hallazgos
          </div>
          <ol className="mt-3 space-y-3.5">
            {findings.slice(0, 3).map((f, i) => (
              <li key={i} className="flex gap-3">
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white', f.tone === 'good' ? 'bg-up' : f.tone === 'bad' ? 'bg-down' : 'bg-electric')}>{i + 1}</span>
                <div>
                  <p className="text-[13px] font-medium leading-snug text-ink">{f.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {decision && (
          <div className="bg-brand-gradient rounded-card p-5 text-white shadow-card lg:col-span-2">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Target size={16} className="text-aqua" /> Decisión recomendada
            </div>
            <p className="mt-3 text-[16px] font-semibold leading-snug">{decision.title}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/80">{decision.body}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[12.5px]">
              <CalendarClock size={15} className="text-aqua" />
              <span>
                Plazo: <b className="font-semibold">{plazo}</b>
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
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
