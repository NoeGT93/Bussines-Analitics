import { Fragment, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink, FileSpreadsheet, Info, PlugZap, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { axisProps, ChartCard, ChartTip, useAnimDuration, useChartColors } from '../components/charts/kit';
import { Donut } from '../components/charts/Charts';
import { Button, Card, CardHeader, cx, Delta, InfoTip, PageHeader, Select, Tag } from '../components/ui';
import { useCompareRange, useTrendRange } from '../lib/hooks';
import { aggSocial, SOCIAL_DEFS, socialFor, type SocialAgg } from '../lib/metrics';
import { compact, fmt } from '../lib/format';
import { labelLong, labelRange, labelShort, monthsBetween } from '../lib/periods';
import { downloadTemplate } from '../lib/importer';

type SKey = (typeof SOCIAL_DEFS)[number]['key'];

/** Orden de la comparativa: primero lo que dice si la pauta deja ventas, luego su eficiencia y al final el alcance */
const TABLE_GROUPS: { title: string; note: string; keys: string[]; main?: boolean }[] = [
  { title: 'Resultados del negocio', note: 'lo que más importa: cuánto se invirtió y cuánto se vendió', keys: ['inversion', 'leads', 'conversiones', 'cpr', 'roas'], main: true },
  { title: 'Eficiencia de la pauta', note: 'qué tan barato y atractivo es el anuncio', keys: ['cpc', 'ctr', 'cpm', 'clicsEnlace'] },
  { title: 'Alcance e interacción', note: 'cuánta gente lo vio y cómo reaccionó', keys: ['alcance', 'impresiones', 'engagement', 'interacciones', 'reproducciones', 'nuevosSeguidores'] },
];

/** Qué valor es mejor en cada indicador, para marcar la mejor red */
const BETTER: Record<string, 'high' | 'low' | undefined> = {
  leads: 'high', conversiones: 'high', cpr: 'low', roas: 'high', cpc: 'low', ctr: 'high', cpm: 'low', clicsEnlace: 'high',
  alcance: 'high', impresiones: 'high', engagement: 'high', interacciones: 'high', reproducciones: 'high', nuevosSeguidores: 'high',
};

/** Indicadores que vienen tal cual del Excel (los demás son estimados) */
const REAL_KEYS = new Set(['inversion', 'leads', 'conversiones', 'cpr']);

export function Social() {
  const { ds, scope, range, setPage } = useStore();
  const c = useChartColors();
  const dur = useAnimDuration(600);
  const { recs, platforms, hasSplit, estimado } = useMemo(() => socialFor(ds, scope, range), [ds, scope, range]);
  const { cmp, label: cmpLabel } = useCompareRange();
  const { trend, highlight } = useTrendRange();
  const trendRecs = useMemo(() => socialFor(ds, scope, trend).recs, [ds, scope, trend]);
  const prevTotal = useMemo(() => (cmp ? aggSocial(socialFor(ds, scope, cmp).recs) : {}), [ds, scope, cmp]);
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
      monthsBetween(trend).map((p) => {
        const o: Record<string, number | string | undefined> = { period: p };
        for (const pl of platforms) {
          const a = aggSocial(trendRecs.filter((r) => r.platform === pl && r.period === p));
          o[pl] = activeMetric ? a[activeMetric.key as keyof SocialAgg] : undefined;
        }
        return o;
      }),
    [trend, platforms, trendRecs, activeMetric],
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
        title="Alcance y clics"
        description={`${scopeLabel}, ${labelRange(range)}. Alcance, clics y costos de la pauta en Instagram, Facebook, WhatsApp y TikTok. Toca un indicador para graficarlo.`}
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

      {estimado && (
        <div className="mb-3 flex items-start gap-2.5 rounded-card border border-electric/25 bg-electric/5 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          <Info size={16} className="mt-0.5 shrink-0 text-electric" />
          <span>
            <b className="font-semibold text-ink">Inversión, leads y ventas cerradas son datos reales del Excel.</b> Alcance, impresiones, clics, interacciones, reproducciones y seguidores son{' '}
            <b className="font-semibold text-ink">estimados</b>: se calculan con la inversión de cada red (costo por mil impresiones de referencia) y sus leads (tasa de lead por clic). Al importar el reporte del
            administrador de anuncios, se reemplazan por las cifras reales.
          </span>
        </div>
      )}

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
                  <>
                    <div className="tnum mt-2 truncate text-[20px] font-semibold tracking-[-0.02em] text-ink">{d.key === 'roas' ? `${v.toFixed(2)}×` : fmt(v, d.unit)}</div>
                    {cmp && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                        <Delta value={socialDelta(v, prevTotal[d.key as keyof SocialAgg], d.unit === '%')} kind={d.unit === '%' ? 'pp' : 'rel'} size="xs" higherIsBetter={!['cpr', 'cpc', 'cpm', 'inversion'].includes(d.key)} />
                        <span className="truncate">{cmpLabel}</span>
                      </div>
                    )}
                  </>
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
                    {highlight && <ReferenceLine x={highlight} stroke={c.electric} strokeWidth={2} strokeOpacity={0.35} />}
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
            <CardHeader
              title="Comparativa por plataforma"
              subtitle={`Totales de ${labelRange(range)}, ordenados de lo más importante a lo de apoyo. Toca la (i) para saber qué significa cada término; ● marca la mejor red en cada fila.`}
            />
            <div className="scroll-thin mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-faint">
                    <th className="px-5 py-2 font-medium">Indicador</th>
                    {platforms.map((p) => (
                      <th key={p} className="px-3 py-2 text-right font-medium text-ink">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLE_GROUPS.map((g) => {
                    const defs = g.keys.map((k) => available.find((d) => d.key === k)).filter((d): d is (typeof available)[number] => !!d);
                    if (!defs.length) return null;
                    return (
                      <Fragment key={g.title}>
                        <tr className="bg-sunken/60">
                          <td colSpan={platforms.length + 1} className="px-5 py-2">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-electric">{g.title}</span>
                            <span className="ml-2 text-[11.5px] text-faint">{g.note}</span>
                          </td>
                        </tr>
                        {defs.map((d) => {
                          const dir = BETTER[d.key];
                          const vals = byPlatform.map((b) => b.agg[d.key as keyof SocialAgg]).filter((v): v is number => v !== undefined);
                          const best = dir && vals.length > 1 ? (dir === 'high' ? Math.max(...vals) : Math.min(...vals)) : undefined;
                          const isEst = estimado && !REAL_KEYS.has(d.key);
                          return (
                            <tr key={d.key} className="border-b border-line/60 last:border-0">
                              <td className={cx('px-5 py-2.5', g.main ? 'font-medium text-ink' : 'text-muted')}>
                                <span className="inline-flex items-center gap-1.5">
                                  {d.label}
                                  <InfoTip text={`${d.help}${isEst ? ' Estimado a partir de la inversión y los leads del Excel.' : REAL_KEYS.has(d.key) && estimado ? ' Dato real del Excel.' : ''}`} />
                                </span>
                              </td>
                              {byPlatform.map((b) => {
                                const v = b.agg[d.key as keyof SocialAgg];
                                const top = v !== undefined && best !== undefined && v === best;
                                return (
                                  <td key={b.platform} className={cx('tnum px-3 py-2.5 text-right', top ? 'font-semibold text-electric' : 'text-ink', g.main && 'text-[13px]')}>
                                    {v === undefined ? (
                                      <span className="text-faint">—</span>
                                    ) : (
                                      <>
                                        {top && <span className="mr-1.5 text-[9px] align-middle text-aqua">●</span>}
                                        {d.key === 'roas' ? `${v.toFixed(2)}×` : fmt(v, d.unit)}
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {posts.length > 0 && (
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
        ) : null}
      </Card>
      )}
    </>
  );
}

function socialDelta(a?: number, b?: number, rate?: boolean) {
  if (a === undefined || b === undefined) return undefined;
  if (rate) return a - b;
  return b !== 0 ? (a - b) / Math.abs(b) : undefined;
}
