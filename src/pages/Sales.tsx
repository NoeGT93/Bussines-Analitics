import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Target, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { axisProps, ChartCard, ChartTip, useAnimDuration, useChartColors } from '../components/charts/kit';
import { Funnel } from '../components/charts/Charts';
import { KpiCard } from '../components/kpi/KpiCard';
import { Button, Card, CardHeader, Delta, PageHeader, Segmented, Tag } from '../components/ui';
import { NoData, SourceNote } from '../components/data/Shared';
import { channelsFor, kpi, METRICS, totalOf, type SeriesMetric } from '../lib/metrics';
import { useScopeRows } from '../lib/hooks';
import { compact, fmt } from '../lib/format';
import { labelLong, labelRange, labelShort, previousRange } from '../lib/periods';
import type { Goal } from '../types';

export function Sales() {
  const { ds, scope, range, openDetail } = useStore();
  const { rows, prevRows, hasData, scopeLabel } = useScopeRows();
  const c = useChartColors();
  const dur = useAnimDuration(600);
  const channels = useMemo(() => channelsFor(ds, scope, range), [ds, scope, range]);
  const [chSort, setChSort] = useState<'ingresos' | 'ventas' | 'conversion'>('ingresos');

  const k = useMemo(() => {
    const g = (m: SeriesMetric) => kpi(ds, scope, range, m);
    return { ingresos: g('ingresos'), ventas: g('ventas'), ticket: g('ticket'), clientesNuevos: g('clientesNuevos') };
  }, [ds, scope, range]);

  const goals = useMemo(() => ds.goals.filter((g) => scope !== 'consolidado' && g.companyId === scope), [ds.goals, scope]);

  const data = rows.map((r, i) => ({
    period: r.period,
    ingresos: r.values.ingresos,
    prevIngresos: prevRows[i]?.values.ingresos,
    prevPeriod: prevRows[i]?.period,
    ventas: r.values.ventas,
    ticket: r.values.ticket,
    conversion: r.values.conversion,
    cierre: r.values.cierre,
    clientesNuevos: r.values.clientesNuevos,
    clientesRecurrentes: r.values.clientesRecurrentes,
    meta: goals.find((g) => g.period === r.period && g.metric === 'ingresos')?.target,
  }));

  if (!hasData) {
    return (
      <>
        <PageHeader title="Ventas" description={`${scopeLabel}, ${labelRange(range)}`} />
        <NoData />
      </>
    );
  }

  const ticketAvg = totalOf(rows, 'ticket').value;
  const hasPrev = data.some((d) => d.prevIngresos !== undefined);
  const hasRecurrent = data.some((d) => d.clientesRecurrentes !== undefined);
  const click = (s: { activeLabel?: string | number } | null) => s?.activeLabel && openDetail({ period: String(s.activeLabel) });
  const prevLabel = `vs. ${labelRange(previousRange(range))}`;

  const sorted = [...channels.channels].sort((a, b) =>
    chSort === 'conversion' ? (b.conversion ?? -1) - (a.conversion ?? -1) : (b.values[chSort] ?? -1) - (a.values[chSort] ?? -1),
  );
  const maxCh = Math.max(1, ...sorted.map((x) => (chSort === 'conversion' ? x.conversion ?? 0 : x.values[chSort] ?? 0)));

  return (
    <>
      <PageHeader title="Ventas" description={`${scopeLabel}, ${labelRange(range)}. Montos en quetzales.`} />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <KpiCard label="Ingresos" help={METRICS.ingresos.help} unit="Q" value={k.ingresos.value} delta={k.ingresos.delta} compareLabel={prevLabel} coverage={k.ingresos.coverage} spark={k.ingresos.spark} color={c.series[0]} />
        <KpiCard label="Ventas" help={METRICS.ventas.help} unit="n" value={k.ventas.value} delta={k.ventas.delta} compareLabel={prevLabel} coverage={k.ventas.coverage} spark={k.ventas.spark} color={c.series[0]} />
        <KpiCard label="Ticket promedio" help={METRICS.ticket.help} unit="Q2" value={k.ticket.value} delta={k.ticket.delta} compareLabel={prevLabel} coverage={k.ticket.coverage} spark={k.ticket.spark} color={c.series[2]} />
        <KpiCard label="Clientes nuevos" help={METRICS.clientesNuevos.help} unit="n" value={k.clientesNuevos.value} delta={k.clientesNuevos.delta} compareLabel={prevLabel} coverage={k.clientesNuevos.coverage} spark={k.clientesNuevos.spark} color={c.series[3]} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Evolución de ingresos"
          subtitle={hasPrev ? `Barras claras: ${labelRange(previousRange(range))}` : 'Sin datos del período anterior para comparar'}
          exportName="ingresos-mensuales"
          help="Clic en una barra para ver el detalle del mes. Si defines metas, aparecen como línea punteada."
        >
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }} barGap={3}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={56} tickFormatter={(v) => compact(v, 'Q')} {...axisProps(c)} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <ChartTip
                        title={labelLong(d.period)}
                        rows={[
                          { label: 'Ingresos', value: d.ingresos, unit: 'Q', color: c.series[0] },
                          ...(d.prevIngresos !== undefined ? [{ label: d.prevPeriod ? labelLong(d.prevPeriod) : 'Anterior', value: d.prevIngresos, unit: 'Q' as const, color: c.faint }] : []),
                          ...(d.meta !== undefined ? [{ label: 'Meta', value: d.meta, unit: 'Q' as const, color: c.warn, dashed: true }] : []),
                        ]}
                        footer={d.meta && d.ingresos !== undefined ? `Cumplimiento: ${fmt(d.ingresos / d.meta, '%')}` : 'Clic para ver el detalle.'}
                      />
                    );
                  }}
                />
                {hasPrev && <Bar dataKey="prevIngresos" fill={c.line} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={dur} />}
                <Bar dataKey="ingresos" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={dur} />
                {goals.length > 0 && <Line dataKey="meta" stroke={c.warn} strokeDasharray="5 4" strokeWidth={1.6} dot={false} type="stepAfter" connectNulls={false} animationDuration={dur} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Número de ventas" subtitle="Ventas o tickets por mes" exportName="ventas-mensuales">
          <div className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={40} {...axisProps(c)} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTip title={labelLong((payload[0].payload as { period: string }).period)} rows={[{ label: 'Ventas', value: payload[0].value as number, unit: 'n', color: c.series[1] }]} />
                    ) : null
                  }
                />
                <Bar dataKey="ventas" fill={c.series[1]} radius={[4, 4, 0, 0]} maxBarSize={26} animationDuration={dur} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Ticket promedio" subtitle={ticketAvg ? `Línea de referencia: ${fmt(ticketAvg, 'Q2')} acumulado del rango` : undefined} help={METRICS.ticket.help} exportName="ticket-promedio">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={56} domain={['auto', 'auto']} tickFormatter={(v) => compact(v, 'Q')} {...axisProps(c)} />
                {ticketAvg && <ReferenceLine y={ticketAvg} stroke={c.faint} strokeDasharray="3 4" />}
                <Tooltip
                  cursor={{ stroke: c.faint, strokeDasharray: '3 3' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTip
                        title={labelLong((payload[0].payload as { period: string }).period)}
                        rows={[{ label: 'Ticket', value: payload[0].value as number, unit: 'Q2', color: c.series[2] }]}
                        footer={ticketAvg ? `${fmt((payload[0].value as number) / ticketAvg - 1, '%')} respecto al acumulado del rango` : undefined}
                      />
                    ) : null
                  }
                />
                <Line type="monotone" dataKey="ticket" stroke={c.series[2]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, stroke: c.series[2], strokeWidth: 1.5 }} activeDot={{ r: 5.5, fill: c.series[2], stroke: c.surface, strokeWidth: 2 }} animationDuration={dur} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Conversión" subtitle="Ventas ÷ visitas y ventas ÷ consultas" help="Cada tasa usa su propio denominador, indicado en la leyenda. Se calculan con los datos base de cada mes." exportName="conversion">
          <div className="mb-1 flex gap-4 px-2 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-3 rounded-full" style={{ background: c.series[0] }} /> Conversión (÷ visitas)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-3 rounded-full" style={{ background: c.series[2] }} /> Cierre (÷ consultas)
            </span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={44} tickFormatter={(v) => compact(v, '%')} {...axisProps(c)} />
                <Tooltip
                  cursor={{ stroke: c.faint, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <ChartTip
                        title={labelLong(d.period)}
                        rows={[
                          { label: 'Conversión', value: d.conversion, unit: '%', color: c.series[0] },
                          { label: 'Cierre', value: d.cierre, unit: '%', color: c.series[2] },
                        ]}
                      />
                    );
                  }}
                />
                <Line type="monotone" dataKey="conversion" stroke={c.series[0]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, stroke: c.series[0], strokeWidth: 1.5 }} activeDot={{ r: 5.5 }} animationDuration={dur} />
                <Line type="monotone" dataKey="cierre" stroke={c.series[2]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, stroke: c.series[2], strokeWidth: 1.5 }} activeDot={{ r: 5.5 }} animationDuration={dur} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Adquisición de clientes" subtitle={hasRecurrent ? 'Nuevos y recurrentes por mes' : 'Clientes nuevos por mes. Recurrentes: sin datos en el archivo.'} exportName="clientes">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={36} {...axisProps(c)} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <ChartTip
                        title={labelLong(d.period)}
                        rows={[
                          { label: 'Nuevos', value: d.clientesNuevos, unit: 'n', color: c.series[3] },
                          ...(hasRecurrent ? [{ label: 'Recurrentes', value: d.clientesRecurrentes, unit: 'n' as const, color: c.series[1] }] : []),
                        ]}
                        footer={d.clientesNuevos !== undefined && d.ventas ? `${fmt(d.clientesNuevos / d.ventas, '%')} de las ventas fueron de clientes nuevos` : undefined}
                      />
                    );
                  }}
                />
                <Bar dataKey="clientesNuevos" stackId="c" fill={c.series[3]} radius={hasRecurrent ? [0, 0, 0, 0] : [4, 4, 0, 0]} maxBarSize={26} animationDuration={dur} />
                {hasRecurrent && <Bar dataKey="clientesRecurrentes" stackId="c" fill={c.series[1]} radius={[4, 4, 0, 0]} maxBarSize={26} animationDuration={dur} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Embudo comercial" subtitle={labelRange(range)} exportName="embudo-ventas">
          <div className="px-2 pt-1">
            <Funnel
              stages={[
                { label: 'Visitas web', value: totalOf(rows, 'visitas').value },
                totalOf(rows, 'consultas').value !== undefined ? { label: 'Consultas', value: totalOf(rows, 'consultas').value } : { label: 'Clics / consultas', value: totalOf(rows, 'clics').value },
                { label: 'Oportunidades', value: undefined, note: 'Sin registro de oportunidades' },
                { label: 'Ventas', value: totalOf(rows, 'ventas').value },
              ]}
            />
          </div>
        </ChartCard>
      </div>

      <Card className="mt-3">
        <CardHeader
          title="Rendimiento por canal"
          subtitle={channels.mode === 'acumulado' ? 'Acumulado del archivo de fuentes, no filtrado por fecha' : channels.mode === 'mensual' ? labelRange(range) : undefined}
          actions={
            sorted.length > 0 && (
              <Segmented
                size="sm"
                label="Ordenar por"
                value={chSort}
                onChange={setChSort}
                options={[
                  { value: 'ingresos', label: 'Ingresos' },
                  { value: 'ventas', label: 'Ventas' },
                  { value: 'conversion', label: 'Conversión' },
                ]}
              />
            )
          }
        />
        {sorted.length ? (
          <div className="scroll-thin mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="px-5 py-2 font-medium">Canal</th>
                  <th className="w-[30%] px-3 py-2 font-medium" />
                  <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                  <th className="px-3 py-2 text-right font-medium">Ventas</th>
                  <th className="px-3 py-2 text-right font-medium">Conversión</th>
                  <th className="px-5 py-2 text-right font-medium">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((ch, i) => {
                  const v = chSort === 'conversion' ? ch.conversion ?? 0 : ch.values[chSort] ?? 0;
                  return (
                    <tr key={ch.canal} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2.5 font-medium text-ink">{ch.canal}</td>
                      <td className="px-3 py-2.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(v / maxCh) * 100}%`, background: c.series[i % c.series.length] }} />
                        </div>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(ch.values.ingresos, 'Q')}</td>
                      <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(ch.values.ventas)}</td>
                      <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(ch.conversion, '%')}</td>
                      <td className="tnum px-5 py-2.5 text-right text-ink">{fmt(ch.ticket, 'Q2')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="py-3">
              <SourceNote>Conversión por canal = ventas del canal ÷ visitas del canal. {channels.sourceNote}</SourceNote>
            </div>
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">{channels.sourceNote ?? 'Sin datos por canal para este alcance.'}</p>
        )}
      </Card>

      {scope !== 'consolidado' && <GoalsCard rows={rows} goals={goals} />}
    </>
  );
}

/* Metas ---------------------------------------------------------------------------- */
function GoalsCard({ rows, goals }: { rows: ReturnType<typeof useScopeRows>['rows']; goals: Goal[] }) {
  const { scope, setGoal, notify } = useStore();
  const [metric, setMetric] = useState<Goal['metric']>('ingresos');
  const [amount, setAmount] = useState('');
  const list = rows.map((r) => {
    const g = goals.find((x) => x.period === r.period && x.metric === metric);
    const v = r.values[metric];
    return { period: r.period, goal: g, v, pct: g && v !== undefined ? v / g.target : undefined };
  });
  const withGoal = list.filter((x) => x.goal);
  const totalTarget = withGoal.reduce((s, x) => s + x.goal!.target, 0);
  const totalActual = withGoal.reduce((s, x) => s + (x.v ?? 0), 0);
  const unit = METRICS[metric].unit;

  const applyAll = () => {
    const n = Number(amount.replace(/[^\d.]/g, ''));
    if (!n || n <= 0) {
      notify('Escribe una meta mensual mayor que cero.', 'error');
      return;
    }
    rows.forEach((r) => setGoal({ id: `${scope}:${r.period}:${metric}`, companyId: scope, period: r.period, metric, target: n }));
    setAmount('');
    notify(`Meta aplicada a ${rows.length} meses.`);
  };

  return (
    <Card className="mt-3">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Target size={15} className="text-muted" /> Metas y cumplimiento
          </span>
        }
        subtitle="Define una meta mensual para el período seleccionado. Se guarda por empresa y mes."
        actions={
          <Segmented
            size="sm"
            label="Métrica de la meta"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'ingresos', label: 'Ingresos' },
              { value: 'ventas', label: 'Ventas' },
              { value: 'clientesNuevos', label: 'Clientes' },
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-end gap-2 px-5 pt-4">
        <label className="text-[12px] text-muted">
          Meta mensual de {METRICS[metric].label.toLowerCase()}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyAll()}
            placeholder={unit === 'Q' ? 'Q 20,000' : '150'}
            className="tnum mt-1 block h-9 w-44 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-electric"
          />
        </label>
        <Button variant="primary" onClick={applyAll}>
          Aplicar a {labelRange({ from: rows[0].period, to: rows[rows.length - 1].period })}
        </Button>
        {withGoal.length > 0 && (
          <div className="ml-auto text-right">
            <div className="text-[11.5px] text-faint">Cumplimiento acumulado</div>
            <div className="tnum text-[18px] font-semibold text-ink">{fmt(totalActual / totalTarget, '%')}</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-5 pb-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((x) => (
          <div key={x.period} className="rounded-xl border border-line px-3.5 py-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted">{labelLong(x.period)}</span>
              {x.goal ? (
                <span className="flex items-center gap-1.5">
                  {x.pct !== undefined && <Delta value={x.pct - 1} size="xs" />}
                  <button
                    type="button"
                    aria-label={`Quitar meta de ${labelLong(x.period)}`}
                    className="text-faint hover:text-down"
                    onClick={() => setGoal({ id: x.goal!.id, remove: true })}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ) : (
                <Tag>Sin meta</Tag>
              )}
            </div>
            <div className="tnum mt-1 text-[13px] text-ink">
              {fmt(x.v, unit)}
              {x.goal && <span className="text-faint"> de {fmt(x.goal.target, unit)}</span>}
            </div>
            {x.goal && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className={`h-full rounded-full ${x.pct !== undefined && x.pct >= 1 ? 'bg-up' : 'bg-electric'}`} style={{ width: `${Math.min(100, (x.pct ?? 0) * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
