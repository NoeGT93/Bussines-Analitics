import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink, FileSpreadsheet, PlugZap, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { axisProps, ChartCard, ChartTip, useAnimDuration, useChartColors } from '../components/charts/kit';
import { Donut } from '../components/charts/Charts';
import { Button, Card, CardHeader, InfoTip, PageHeader, Select, Tag } from '../components/ui';
import { aggSocial, SOCIAL_DEFS, socialFor, type SocialAgg } from '../lib/metrics';
import { compact, fmt } from '../lib/format';
import { labelLong, labelRange, labelShort, monthsBetween } from '../lib/periods';
import { downloadTemplate } from '../lib/importer';

type SKey = (typeof SOCIAL_DEFS)[number]['key'];

export function Social() {
  const { ds, scope, range, setPage } = useStore();
  const c = useChartColors();
  const dur = useAnimDuration(600);
  const { recs, platforms, hasSplit } = useMemo(() => socialFor(ds, scope, range), [ds, scope, range]);
  const posts = useMemo(
    () =>
      ds.posts
        .filter((p) => (scope === 'consolidado' || p.companyId === scope) && p.fecha.slice(0, 7) >= range.from && p.fecha.slice(0, 7) <= range.to)
        .sort((a, b) => (b.interacciones ?? 0) - (a.interacciones ?? 0)),
    [ds.posts, scope, range],
  );
  const total = useMemo(() => aggSocial(recs), [recs]);
  const byPlatform = useMemo(() => platforms.map((p) => ({ platform: p, agg: aggSocial(recs.filter((r) => r.platform === p)) })), [platforms, recs]);
  const [metric, setMetric] = useState<SKey>('alcance');
  const scopeLabel = scope === 'consolidado' ? 'Vista consolidada' : ds.companies.find((x) => x.id === scope)?.name;
  const hasData = recs.length > 0;

  const available = SOCIAL_DEFS.filter((d) => total[d.key as keyof SocialAgg] !== undefined);
  const activeMetric = available.find((d) => d.key === metric) ?? available[0];

  const series = useMemo(
    () =>
      monthsBetween(range).map((p) => {
        const o: Record<string, number | string | undefined> = { period: p };
        for (const pl of platforms) {
          const a = aggSocial(recs.filter((r) => r.platform === pl && r.period === p));
          o[pl] = activeMetric ? a[activeMetric.key as keyof SocialAgg] : undefined;
        }
        return o;
      }),
    [range, platforms, recs, activeMetric],
  );

  const splitData = useMemo(
    () =>
      platforms.map((pl) => {
        const org = aggSocial(recs.filter((r) => r.platform === pl && r.tipo === 'organico'));
        const pag = aggSocial(recs.filter((r) => r.platform === pl && r.tipo === 'pagado'));
        const k = (activeMetric?.key ?? 'alcance') as keyof SocialAgg;
        return { platform: pl, organico: org[k], pagado: pag[k] };
      }),
    [platforms, recs, activeMetric],
  );

  return (
    <>
      <PageHeader
        title="Redes sociales"
        description={`${scopeLabel}, ${labelRange(range)}. Facebook, Instagram y cualquier otra plataforma que se incorpore.`}
        actions={
          <>
            <Button variant="outline" onClick={() => downloadTemplate('social')}>
              <FileSpreadsheet size={15} /> Plantilla
            </Button>
            <Button variant="primary" onClick={() => setPage('data')}>
              <Upload size={15} /> Importar métricas
            </Button>
          </>
        }
      />

      {!hasData && (
        <Card className="mb-3 border-dashed">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-electric/10 text-electric">
              <PlugZap size={18} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-medium text-ink">Métricas de redes pendientes de conexión</p>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                El archivo actual no incluye alcance, impresiones, seguidores ni inversión, así que aquí no se muestran cifras. Exporta las estadísticas desde Meta Business Suite
                o completa la plantilla y súbela en Gestión de datos. La estructura ya admite separar orgánico y pagado.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {SOCIAL_DEFS.map((d) => {
          const v = total[d.key as keyof SocialAgg];
          const selectable = v !== undefined;
          return (
            <Card key={d.key} as="article" className={selectable && activeMetric?.key === d.key ? 'ring-1 ring-electric/40' : undefined}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => setMetric(d.key)}
                className="w-full rounded-card p-4 text-left disabled:cursor-default"
                aria-pressed={selectable && activeMetric?.key === d.key}
              >
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
                  <span className="truncate">{d.label}</span>
                  <InfoTip text={d.help} />
                </div>
                {v === undefined ? (
                  <div className="mt-2.5">
                    <Tag>{hasData ? 'Sin datos' : 'Pendiente'}</Tag>
                  </div>
                ) : (
                  <div className="tnum mt-2 truncate text-[20px] font-semibold tracking-[-0.02em] text-ink">{d.key === 'roas' ? `${v.toFixed(2)}×` : fmt(v, d.unit)}</div>
                )}
              </button>
            </Card>
          );
        })}
      </div>

      {hasData && activeMetric && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <ChartCard
              className="xl:col-span-2"
              title={`${activeMetric.label} por plataforma`}
              subtitle="Evolución mensual"
              exportName={`social-${activeMetric.key}`}
              actions={
                <Select value={activeMetric.key} onChange={(v) => setMetric(v as SKey)} label="Indicador" className="h-8 text-[12px]">
                  {available.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              }
            >
              <div className="h-[290px]">
                <ResponsiveContainer>
                  <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                    <YAxis width={52} tickFormatter={(v) => compact(v, activeMetric.unit === 'Q2' ? 'Q' : activeMetric.unit)} {...axisProps(c)} />
                    <Legend verticalAlign="top" height={30} iconType="plainline" formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                    <Tooltip
                      cursor={{ stroke: c.faint, strokeDasharray: '3 3' }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <ChartTip title={labelLong(String(label))} rows={payload.map((p) => ({ label: String(p.name), value: p.value as number, unit: activeMetric.unit, color: String(p.color) }))} />
                        ) : null
                      }
                    />
                    {platforms.map((p, i) => (
                      <Line key={p} type="monotone" dataKey={p} stroke={c.series[i % c.series.length]} strokeWidth={2} dot={{ r: 2.5, fill: c.surface, strokeWidth: 1.5 }} activeDot={{ r: 5.5 }} connectNulls={false} animationDuration={dur} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard title="Distribución" subtitle={`${activeMetric.label} del período por plataforma`} exportName="social-distribucion">
              {(() => {
                const d = byPlatform.map((b) => ({ name: b.platform, value: (b.agg[activeMetric.key as keyof SocialAgg] as number) ?? 0 })).filter((x) => x.value > 0);
                return d.length && activeMetric.unit !== '%' && activeMetric.key !== 'roas' ? (
                  <div className="px-2 pt-2">
                    <Donut data={d} unit={activeMetric.unit === 'Q2' ? 'Q' : activeMetric.unit} centerLabel={activeMetric.label.toLowerCase()} height={180} stack />
                  </div>
                ) : (
                  <p className="px-2 py-10 text-center text-[12.5px] text-muted">Las tasas no se reparten entre plataformas. Elige un indicador de volumen.</p>
                );
              })()}
            </ChartCard>
          </div>

          {hasSplit && (
            <ChartCard className="mt-3" title="Orgánico frente a pagado" subtitle={`${activeMetric.label}, ${labelRange(range)}`} exportName="organico-pagado">
              <div className="h-[240px]">
                <ResponsiveContainer>
                  <BarChart data={splitData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="platform" {...axisProps(c)} dy={6} />
                    <YAxis width={52} tickFormatter={(v) => compact(v)} {...axisProps(c)} />
                    <Legend verticalAlign="top" height={30} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                    <Tooltip
                      cursor={{ fill: c.grid }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <ChartTip title={String(label)} rows={payload.map((p) => ({ label: String(p.name), value: p.value as number, unit: activeMetric.unit, color: String(p.color) }))} />
                        ) : null
                      }
                    />
                    <Bar name="Orgánico" dataKey="organico" fill={c.series[1]} radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={dur} />
                    <Bar name="Pagado" dataKey="pagado" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={dur} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          <Card className="mt-3">
            <CardHeader title="Comparativa por plataforma" subtitle="Totales del período" />
            <div className="scroll-thin mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-faint">
                    <th className="px-5 py-2 font-medium">Indicador</th>
                    {platforms.map((p) => (
                      <th key={p} className="px-3 py-2 text-right font-medium">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {available.map((d) => (
                    <tr key={d.key} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2.5 text-muted">{d.label}</td>
                      {byPlatform.map((b) => {
                        const v = b.agg[d.key as keyof SocialAgg];
                        return (
                          <td key={b.platform} className="tnum px-3 py-2.5 text-right text-ink">
                            {v === undefined ? <span className="text-faint">—</span> : d.key === 'roas' ? `${v.toFixed(2)}×` : fmt(v, d.unit)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-3">
        <CardHeader title="Publicaciones destacadas" subtitle="Ordenadas por interacciones" />
        {posts.length ? (
          <div className="scroll-thin mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="px-5 py-2 font-medium">Publicación</th>
                  <th className="px-3 py-2 font-medium">Plataforma</th>
                  <th className="px-3 py-2 text-right font-medium">Alcance</th>
                  <th className="px-3 py-2 text-right font-medium">Interacciones</th>
                  <th className="px-3 py-2 text-right font-medium">Engagement</th>
                  <th className="px-5 py-2 text-right font-medium">Clics</th>
                </tr>
              </thead>
              <tbody>
                {posts.slice(0, 12).map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="max-w-[340px] px-5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-ink">{p.titulo}</span>
                        {p.url && /^https?:\/\//.test(p.url) && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="text-faint hover:text-electric" aria-label="Abrir publicación">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="text-[11.5px] text-faint">
                        {new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {p.tipo && ` · ${p.tipo === 'pagado' ? 'Pagado' : 'Orgánico'}`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{p.platform}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(p.alcance)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(p.interacciones)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{p.interacciones !== undefined && p.alcance ? fmt(p.interacciones / p.alcance, '%') : '—'}</td>
                    <td className="tnum px-5 py-2.5 text-right text-ink">{fmt(p.clics)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6">
            <p className="text-[12.5px] text-muted">Sin publicaciones registradas en este período.</p>
            <Button variant="outline" size="sm" onClick={() => downloadTemplate('posts')}>
              <FileSpreadsheet size={13} /> Plantilla de publicaciones
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
