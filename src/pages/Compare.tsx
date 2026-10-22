import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store/useStore';
import { axisProps, ChartCard, ChartTip, useAnimDuration, useChartColors } from '../components/charts/kit';
import { Card, CardHeader, Delta, PageHeader, Segmented, Select, Tag } from '../components/ui';
import { channelsFor, METRICS, rowsFor, totalOf, type SeriesMetric } from '../lib/metrics';
import { compact, fmt } from '../lib/format';
import { labelLong, labelRange, labelShort, monthsBetween, previousRange, shift } from '../lib/periods';
import type { DateRange } from '../types';

const CMP_METRICS: SeriesMetric[] = ['ingresos', 'ventas', 'ticket', 'visitas', 'clics', 'consultas', 'conversion', 'cierre', 'clientesNuevos'];

export function Compare() {
  const [mode, setMode] = useState<'periodos' | 'empresas' | 'canales'>('periodos');
  const companies = useStore((st) => st.ds.companies.length);
  return (
    <>
      <PageHeader
        title="Comparativas"
        description="Compara períodos, redes o empresas. Solo se comparan indicadores con datos en ambos lados."
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            label="Tipo de comparación"
            options={[
              { value: 'periodos', label: 'Períodos' },
              ...(companies > 1 ? [{ value: 'empresas' as const, label: 'Empresas' }] : []),
              { value: 'canales', label: 'Redes' },
            ]}
          />
        }
      />
      {mode === 'periodos' && <PeriodCompare />}
      {mode === 'empresas' && <CompanyCompare />}
      {mode === 'canales' && <ChannelCompare />}
    </>
  );
}

function PeriodCompare() {
  const { ds, scope, range } = useStore();
  const c = useChartColors();
  const dur = useAnimDuration(550);
  const [ref, setRef] = useState<'prev' | 'yoy' | 'custom'>('prev');
  const n = monthsBetween(range).length;
  const [customFrom, setCustomFrom] = useState(shift(range.from, -n));
  const [metric, setMetric] = useState<SeriesMetric>('ingresos');
  const B: DateRange =
    ref === 'prev' ? previousRange(range) : ref === 'yoy' ? { from: shift(range.from, -12), to: shift(range.to, -12) } : { from: customFrom, to: shift(customFrom, n - 1) };
  const rowsA = useMemo(() => rowsFor(ds, scope, range), [ds, scope, range]);
  const rowsB = useMemo(() => rowsFor(ds, scope, B), [ds, scope, B.from, B.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = monthsBetween({ from: shift(range.from, -36), to: shift(range.to, -1) });

  const data = rowsA.map((r, i) => ({ idx: i, a: r.values[metric], b: rowsB[i]?.values[metric], pa: r.period, pb: rowsB[i]?.period }));
  const anyB = rowsB.some((r) => Object.keys(r.values).length);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-4 p-5">
          <div>
            <div className="text-[11.5px] text-faint">Período A (filtro actual)</div>
            <div className="mt-1 flex items-center gap-2 text-[14px] font-medium text-ink">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.series[0] }} />
              {labelRange(range)}
            </div>
          </div>
          <div className="text-faint">frente a</div>
          <div>
            <div className="text-[11.5px] text-faint">Período B</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.line }} />
              <Select value={ref} onChange={(v) => setRef(v as typeof ref)} label="Período de referencia">
                <option value="prev">Período anterior ({labelRange(previousRange(range))})</option>
                <option value="yoy">Mismo período, año anterior</option>
                <option value="custom">Personalizado</option>
              </Select>
              {ref === 'custom' && (
                <Select value={customFrom} onChange={setCustomFrom} label="Inicio del período B">
                  {options.map((o) => (
                    <option key={o} value={o}>
                      Desde {labelLong(o)} ({n} {n === 1 ? 'mes' : 'meses'})
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
        </div>
      </Card>

      {!anyB ? (
        <p className="mt-3 rounded-card border border-dashed border-line px-5 py-10 text-center text-[13px] text-muted">
          No hay datos para {labelRange(B)}. Elige otro período de referencia o importa esos meses.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-5">
          <Card className="xl:col-span-2">
            <CardHeader title="Resumen" subtitle={`${labelRange(range)} frente a ${labelRange(B)}`} />
            <div className="mt-2 divide-y divide-line">
              {CMP_METRICS.map((m) => {
                const a = totalOf(rowsA, m);
                const b = totalOf(rowsB, m);
                if (a.value === undefined && b.value === undefined) return null;
                const isRate = METRICS[m].unit === '%';
                const full = a.coverage.have === a.coverage.total && b.coverage.have === b.coverage.total;
                const d = a.value !== undefined && b.value !== undefined ? (isRate ? a.value - b.value : b.value ? (a.value - b.value) / b.value : undefined) : undefined;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    className={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-sunken ${metric === m ? 'bg-sunken' : ''}`}
                  >
                    <span className="flex-1 text-[12.5px] text-muted">{METRICS[m].label}</span>
                    <span className="tnum w-24 text-right text-[12.5px] text-ink">{fmt(a.value, METRICS[m].unit)}</span>
                    <span className="tnum hidden w-24 text-right text-[12.5px] text-faint sm:inline">{fmt(b.value, METRICS[m].unit)}</span>
                    <span className="w-20 text-right">{full ? <Delta value={d} kind={isRate ? 'pp' : 'rel'} size="xs" /> : <Tag>Incompleto</Tag>}</span>
                  </button>
                );
              })}
            </div>
          </Card>
          <ChartCard className="xl:col-span-3" title={`${METRICS[metric].label}: mes a mes`} subtitle="Cada barra B corresponde al mes equivalente del período de referencia" exportName={`comparativa-${metric}`}>
            <div className="h-[320px]">
              <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="idx" tickFormatter={(i) => `${labelShort(data[i].pa)}${data[i].pb ? ` / ${labelShort(data[i].pb!)}` : ''}`} {...axisProps(c)} dy={6} tick={{ fill: c.muted, fontSize: 10.5 }} />
                  <YAxis width={56} tickFormatter={(v) => compact(v, METRICS[metric].unit === 'Q2' ? 'Q' : METRICS[metric].unit)} {...axisProps(c)} />
                  <Tooltip
                    cursor={{ fill: c.grid }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof data)[number];
                      return (
                        <ChartTip
                          title={METRICS[metric].label}
                          rows={[
                            { label: labelLong(d.pa), value: d.a, unit: METRICS[metric].unit, color: c.series[0] },
                            { label: d.pb ? labelLong(d.pb) : 'B', value: d.b, unit: METRICS[metric].unit, color: c.faint },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="b" fill={c.line} radius={[4, 4, 0, 0]} maxBarSize={24} animationDuration={dur} />
                  <Bar dataKey="a" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={24} animationDuration={dur} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}
    </>
  );
}

function CompanyCompare() {
  const { ds, range } = useStore();
  const c = useChartColors();
  const dur = useAnimDuration(550);
  const [metric, setMetric] = useState<SeriesMetric>('ingresos');
  const per = ds.companies.map((co) => ({ co, rows: rowsFor(ds, co.id, range) }));
  const data = monthsBetween(range).map((p, i) => {
    const o: Record<string, number | string | undefined> = { period: p };
    per.forEach(({ co, rows }) => (o[co.id] = rows[i].values[metric]));
    return o;
  });
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardHeader title="Indicadores por empresa" subtitle={labelRange(range)} />
        <div className="scroll-thin mt-2 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-2 font-medium">Indicador</th>
                {ds.companies.map((co) => (
                  <th key={co.id} className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: co.color }} />
                      {co.shortName}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CMP_METRICS.map((m) => (
                <tr key={m} onClick={() => setMetric(m)} className={`cursor-pointer border-b border-line/60 last:border-0 hover:bg-sunken ${metric === m ? 'bg-sunken' : ''}`}>
                  <td className="px-5 py-2.5 text-muted">{METRICS[m].label}</td>
                  {per.map(({ co, rows }) => {
                    const t = totalOf(rows, m);
                    return (
                      <td key={co.id} className="tnum px-3 py-2.5 text-right text-ink">
                        {t.value === undefined ? <span className="text-faint">Sin datos</span> : fmt(t.value, METRICS[m].unit)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11.5px] leading-snug text-faint">Las empresas operan en rubros distintos; compara tendencias y tasas más que montos absolutos.</p>
      </Card>
      <ChartCard className="xl:col-span-3" title={`${METRICS[metric].label} por empresa`} subtitle="Mes a mes" exportName={`empresas-${metric}`}>
        <div className="h-[340px]">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
              <CartesianGrid vertical={false} stroke={c.grid} />
              <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
              <YAxis width={56} tickFormatter={(v) => compact(v, METRICS[metric].unit === 'Q2' ? 'Q' : METRICS[metric].unit)} {...axisProps(c)} />
              <Legend verticalAlign="top" height={30} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{ds.companies.find((x) => x.id === v)?.name ?? v}</span>} />
              <Tooltip
                cursor={{ fill: c.grid }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTip
                      title={labelLong(String(label))}
                      rows={ds.companies.map((co) => ({ label: co.name, value: (payload[0].payload as Record<string, number>)[co.id], unit: METRICS[metric].unit, color: co.color }))}
                    />
                  ) : null
                }
              />
              {ds.companies.map((co) => (
                <Bar key={co.id} dataKey={co.id} fill={co.color} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={dur} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

function ChannelCompare() {
  const { ds, scope, range } = useStore();
  const c = useChartColors();
  const dur = useAnimDuration(550);
  const ch = useMemo(() => channelsFor(ds, scope, range), [ds, scope, range]);
  const [metric, setMetric] = useState<'ingresos' | 'ventas' | 'visitas' | 'consultas' | 'conversion' | 'ticket'>('ingresos');
  const unit = metric === 'ingresos' ? 'Q' : metric === 'ticket' ? 'Q2' : metric === 'conversion' ? '%' : 'n';
  const data = ch.channels
    .map((x) => ({ canal: x.canal, v: metric === 'conversion' ? x.conversion : metric === 'ticket' ? x.ticket : x.values[metric] }))
    .filter((x) => x.v !== undefined)
    .sort((a, b) => b.v! - a.v!);
  if (!ch.channels.length) {
    return <p className="rounded-card border border-dashed border-line px-5 py-10 text-center text-[13px] text-muted">{ch.sourceNote ?? 'Sin datos por canal para este alcance.'}</p>;
  }
  return (
    <ChartCard
      title="Canales"
      subtitle={ch.mode === 'acumulado' ? 'Acumulado del archivo de fuentes, no filtrado por fecha' : labelRange(range)}
      exportName={`canales-${metric}`}
      actions={
        <Select value={metric} onChange={(v) => setMetric(v as typeof metric)} label="Indicador" className="h-8 text-[12px]">
          <option value="ingresos">Ingresos</option>
          <option value="ventas">Ventas</option>
          <option value="visitas">Visitas</option>
          <option value="consultas">Consultas</option>
          <option value="conversion">Conversión</option>
          <option value="ticket">Ticket promedio</option>
        </Select>
      }
    >
      <div style={{ height: Math.max(220, data.length * 52) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="canal" width={140} {...axisProps(c)} />
            <Tooltip cursor={{ fill: c.grid }} content={({ active, payload }) => (active && payload?.length ? <ChartTip title={String((payload[0].payload as { canal: string }).canal)} rows={[{ label: 'Valor', value: payload[0].value as number, unit, color: c.series[0] }]} /> : null)} />
            <Bar
              dataKey="v"
              fill={c.series[0]}
              radius={[0, 4, 4, 0]}
              maxBarSize={26}
              animationDuration={dur}
              label={{ position: 'right', fill: c.muted, fontSize: 11.5, formatter: (v: number) => fmt(v, unit) }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
