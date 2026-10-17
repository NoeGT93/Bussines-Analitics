import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/useStore';
import { axisProps, ChartCard, ChartTip, useAnimDuration, useChartColors } from '../components/charts/kit';
import { Heatmap, TrendChart } from '../components/charts/Charts';
import { KpiCard } from '../components/kpi/KpiCard';
import { PageHeader } from '../components/ui';
import { NoData, SourceNote } from '../components/data/Shared';
import { channelsFor, kpi, METRICS, type SeriesMetric } from '../lib/metrics';
import { useScopeRows } from '../lib/hooks';
import { compact, fmt } from '../lib/format';
import { labelLong, labelRange, labelShort, previousRange } from '../lib/periods';

export function Traffic() {
  const { ds, scope, range, openDetail, setRange } = useStore();
  const { rows, prevRows, hasData, scopeLabel } = useScopeRows();
  const c = useChartColors();
  const dur = useAnimDuration(600);
  const channels = useMemo(() => channelsFor(ds, scope, range), [ds, scope, range]);
  const k = useMemo(() => {
    const g = (m: SeriesMetric) => kpi(ds, scope, range, m);
    return { visitas: g('visitas'), clics: g('clics'), consultas: g('consultas'), tasaConsulta: g('tasaConsulta'), conversion: g('conversion') };
  }, [ds, scope, range]);

  if (!hasData) {
    return (
      <>
        <PageHeader title="Tráfico y conversiones" description={`${scopeLabel}, ${labelRange(range)}`} />
        <NoData />
      </>
    );
  }
  const prevLabel = `vs. ${labelRange(previousRange(range))}`;
  const rateData = rows.map((r) => ({ period: r.period, tasaConsulta: r.values.tasaConsulta, cierre: r.values.cierre, conversion: r.values.conversion }));
  const chData = channels.channels.map((x) => ({ canal: x.canal, visitas: x.values.visitas, consultas: x.values.consultas, ventas: x.values.ventas, conversion: x.conversion, cierre: x.cierre }));

  // Contribución: % de cada canal en cada métrica
  const contribMetrics = (['visitas', 'consultas', 'ventas', 'ingresos'] as const).filter((m) => channels.channels.some((x) => x.values[m] !== undefined));
  const contrib = contribMetrics.map((m) => {
    const total = channels.channels.reduce((s, x) => s + (x.values[m] ?? 0), 0);
    const o: Record<string, number | string> = { metric: METRICS[m].label };
    channels.channels.forEach((x) => (o[x.canal] = total ? (x.values[m] ?? 0) / total : 0));
    return o;
  });

  return (
    <>
      <PageHeader title="Tráfico y conversiones" description={`${scopeLabel}, ${labelRange(range)}. Cómo llegan los clientes y cuántos terminan comprando.`} />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <KpiCard label="Visitas web" help={METRICS.visitas.help} unit="n" value={k.visitas.value} delta={k.visitas.delta} compareLabel={prevLabel} coverage={k.visitas.coverage} spark={k.visitas.spark} sparkPeriods={k.visitas.sparkPeriods} color={c.series[0]} />
        <KpiCard label="Clics" help={METRICS.clics.help} unit="n" value={k.clics.value} delta={k.clics.delta} compareLabel={prevLabel} coverage={k.clics.coverage} spark={k.clics.spark} sparkPeriods={k.clics.sparkPeriods} color={c.series[1]} />
        <KpiCard label="Consultas" help={METRICS.consultas.help} unit="n" value={k.consultas.value} delta={k.consultas.delta} compareLabel={prevLabel} coverage={k.consultas.coverage} spark={k.consultas.spark} sparkPeriods={k.consultas.sparkPeriods} color={c.series[1]} />
        <KpiCard label="Visitas que consultan" help={METRICS.tasaConsulta.help} unit="%" value={k.tasaConsulta.value} delta={k.tasaConsulta.delta} deltaKind="pp" compareLabel={prevLabel} coverage={k.tasaConsulta.coverage} spark={k.tasaConsulta.spark} sparkPeriods={k.tasaConsulta.sparkPeriods} color={c.series[2]} />
        <KpiCard label="Conversión" help={METRICS.conversion.help} unit="%" value={k.conversion.value} delta={k.conversion.delta} deltaKind="pp" compareLabel={prevLabel} coverage={k.conversion.coverage} spark={k.conversion.spark} sparkPeriods={k.conversion.sparkPeriods} color={c.series[2]} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-5">
        <ChartCard className="xl:col-span-3" title="Volumen de tráfico" subtitle="Visitas, clics, consultas y ventas por mes" exportName="trafico-mensual">
          <TrendChart
            rows={rows}
            prevRows={prevRows}
            metrics={['visitas', 'clics', 'consultas', 'ventas']}
            initial={['visitas', 'consultas']}
            height={290}
            onPointClick={(p) => openDetail({ period: p })}
            onApplyRange={(from, to) => setRange({ from, to }, 'custom')}
          />
        </ChartCard>
        <ChartCard className="xl:col-span-2" title="Tasas de avance" subtitle="Cada tasa con su denominador" exportName="tasas" help="Visitas que consultan = consultas ÷ visitas. Cierre = ventas ÷ consultas. Conversión = ventas ÷ visitas.">
          <div className="h-[330px]">
            <ResponsiveContainer>
              <LineChart data={rateData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={(s) => s?.activeLabel && openDetail({ period: String(s.activeLabel) })} style={{ cursor: 'pointer' }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis width={44} tickFormatter={(v) => compact(v, '%')} {...axisProps(c)} />
                <Legend verticalAlign="top" height={30} iconType="plainline" wrapperStyle={{ fontSize: 11.5, color: c.muted }} formatter={(v) => <span style={{ color: c.muted }}>{v}</span>} />
                <Tooltip
                  cursor={{ stroke: c.faint, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof rateData)[number];
                    return (
                      <ChartTip
                        title={labelLong(d.period)}
                        rows={[
                          { label: 'Visitas que consultan', value: d.tasaConsulta, unit: '%', color: c.series[1] },
                          { label: 'Cierre de consultas', value: d.cierre, unit: '%', color: c.series[2] },
                          { label: 'Conversión', value: d.conversion, unit: '%', color: c.series[0] },
                        ]}
                      />
                    );
                  }}
                />
                <Line name="Visitas que consultan" type="monotone" dataKey="tasaConsulta" stroke={c.series[1]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, strokeWidth: 1.5 }} activeDot={{ r: 5.5 }} animationDuration={dur} />
                <Line name="Cierre" type="monotone" dataKey="cierre" stroke={c.series[2]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, strokeWidth: 1.5 }} activeDot={{ r: 5.5 }} animationDuration={dur} />
                <Line name="Conversión" type="monotone" dataKey="conversion" stroke={c.series[0]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, strokeWidth: 1.5 }} activeDot={{ r: 5.5 }} animationDuration={dur} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {chData.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <ChartCard title="Adquisición por canal" subtitle={channels.mode === 'acumulado' ? 'Acumulado del archivo de fuentes' : labelRange(range)} exportName="adquisicion-canal">
            <div className="h-[280px]">
              <ResponsiveContainer>
                <BarChart data={chData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="canal" {...axisProps(c)} interval={0} tick={{ fill: c.muted, fontSize: 10.5 }} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)} dy={6} />
                  <YAxis width={44} tickFormatter={(v) => compact(v)} {...axisProps(c)} />
                  <Legend verticalAlign="top" height={30} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                  <Tooltip
                    cursor={{ fill: c.grid }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof chData)[number];
                      return (
                        <ChartTip
                          title={d.canal}
                          rows={[
                            { label: 'Visitas', value: d.visitas, unit: 'n', color: c.series[0] },
                            { label: 'Consultas', value: d.consultas, unit: 'n', color: c.series[1] },
                            { label: 'Ventas', value: d.ventas, unit: 'n', color: c.series[2] },
                          ]}
                          footer={d.conversion !== undefined ? `Conversión ${fmt(d.conversion, '%')}${d.cierre !== undefined ? `, cierre ${fmt(d.cierre, '%')}` : ''}` : undefined}
                        />
                      );
                    }}
                  />
                  <Bar name="Visitas" dataKey="visitas" fill={c.series[0]} radius={[3, 3, 0, 0]} maxBarSize={18} animationDuration={dur} />
                  <Bar name="Consultas" dataKey="consultas" fill={c.series[1]} radius={[3, 3, 0, 0]} maxBarSize={18} animationDuration={dur} />
                  <Bar name="Ventas" dataKey="ventas" fill={c.series[2]} radius={[3, 3, 0, 0]} maxBarSize={18} animationDuration={dur} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {channels.sourceNote && <SourceNote>{channels.sourceNote}</SourceNote>}
          </ChartCard>

          <ChartCard title="Participación de cada canal" subtitle="Porcentaje del total en cada indicador" exportName="participacion-canal" help="Permite ver si un canal aporta más ventas que tráfico, o al revés.">
            <div className="h-[280px]">
              <ResponsiveContainer>
                <BarChart data={contrib} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }} stackOffset="expand">
                  <XAxis type="number" tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axisProps(c)} />
                  <YAxis type="category" dataKey="metric" width={74} {...axisProps(c)} />
                  <Legend verticalAlign="top" height={44} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                  <Tooltip
                    cursor={{ fill: c.grid }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTip title={String(label)} rows={payload.map((p) => ({ label: String(p.name), value: p.value as number, unit: '%' as const, color: String(p.color) }))} />
                      ) : null
                    }
                  />
                  {channels.channels.map((x, i) => (
                    <Bar key={x.canal} dataKey={x.canal} stackId="s" fill={c.series[i % c.series.length]} maxBarSize={26} animationDuration={dur} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      ) : (
        <p className="mt-3 rounded-card border border-dashed border-line px-5 py-8 text-center text-[12.5px] text-muted">{channels.sourceNote ?? 'Sin datos por canal. Importa la hoja de fuentes de tráfico desde Gestión de datos.'}</p>
      )}

      <ChartCard className="mt-3" title="Mapa de variaciones" subtitle="Cambio de cada indicador respecto al mes anterior" exportName="mapa-variaciones" help="Verde: subió. Rojo: bajó. La intensidad es proporcional al tamaño del cambio. Clic en una celda para ver el mes.">
          <div className="px-2">
            <Heatmap rows={rows} metrics={(['visitas', 'clics', 'consultas', 'ventas', 'ingresos', 'conversion', 'cierre'] as SeriesMetric[]).filter((m) => rows.some((r) => r.values[m] !== undefined))} onCell={(p) => openDetail({ period: p })} />
          </div>
      </ChartCard>
    </>
  );
}
