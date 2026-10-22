import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BookOpen, Calculator, FileSpreadsheet, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { axisProps, ChartCard, ChartTip, useAnimDuration, useChartColors } from '../components/charts/kit';
import { Button, Card, CardHeader, cx, InfoTip, PageHeader, Tag } from '../components/ui';
import { adMetrics, roiByChannel, roiByMonth, roiTotal, ROI_GLOSSARY } from '../lib/roi';
import { compact, fmt } from '../lib/format';
import { labelLong, labelRange, labelShort } from '../lib/periods';
import { downloadTemplate } from '../lib/importer';

/* Campo numérico que guarda al salir ----------------------------------- */
function MoneyInput({ value, onCommit, label, suffix = 'Q', placeholder = 'Q 0' }: { value?: number; onCommit: (v: number | undefined) => void; label: string; suffix?: 'Q' | '%'; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : suffix === '%' ? String(Math.round(value * 1000) / 10) : String(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft.replace(/[Qq%\s,]/g, '');
    if (t === '') onCommit(undefined);
    else {
      const n = Number(t);
      if (Number.isFinite(n) && n >= 0) onCommit(suffix === '%' ? Math.min(n, 100) / 100 : n);
    }
    setDraft(null);
  };
  return (
    <div className="relative">
      {suffix === 'Q' && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-faint">Q</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        value={shown}
        placeholder={suffix === 'Q' ? '0' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={cx(
          'tnum h-8 w-full min-w-[96px] rounded-md border border-line bg-surface text-right text-[12.5px] text-ink outline-none focus:border-electric',
          suffix === 'Q' ? 'pl-6 pr-2' : 'pl-2 pr-6',
        )}
      />
      {suffix === '%' && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-faint">%</span>}
    </div>
  );
}

function RoiValue({ v }: { v?: number }) {
  if (v === undefined) return <span className="text-faint">—</span>;
  return <span className={cx('font-semibold', v >= 0 ? 'text-up' : 'text-down')}>{fmt(v, '%')}</span>;
}

function Stat({ label, value, help, tone }: { label: string; value: string; help: string; tone?: 'up' | 'down' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {label} <InfoTip text={help} />
      </div>
      <div className={cx('tnum mt-2 whitespace-nowrap text-[19px] font-semibold tracking-[-0.02em] sm:text-[21px]', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink')}>{value}</div>
    </Card>
  );
}

export function Roi() {
  const { ds, scope, range, setCost, setMargin, setPage } = useStore();
  const c = useChartColors();
  const dur = useAnimDuration(550);
  const [showGlossary, setShowGlossary] = useState(true);
  const editable = scope !== 'consolidado';
  const companyName = scope === 'consolidado' ? 'Vista consolidada' : ds.companies.find((x) => x.id === scope)?.name;

  const ch = useMemo(() => roiByChannel(ds, scope, range), [ds, scope, range]);
  const months = useMemo(() => roiByMonth(ds, scope, range), [ds, scope, range]);
  const total = useMemo(() => roiTotal(ds, scope, range), [ds, scope, range]);
  const ads = useMemo(() => adMetrics(ds, scope, range), [ds, scope, range]);
  const chCost = (canal: string) => ds.costs.find((x) => x.companyId === scope && x.period === null && x.canal === canal)?.inversion;
  const monthCost = (p: string) => ds.costs.find((x) => x.companyId === scope && x.period === p && x.canal === null)?.inversion;
  const hasChannelCosts = ch.rows.some((r) => r.inversion !== undefined);
  const hasMonthCosts = months.some((m) => m.inversion !== undefined);
  const margen = ch.margen;
  const hasChIngresos = ch.rows.some((r) => r.ingresos !== undefined);

  const chartCh = ch.rows.filter((r) => r.roi !== undefined).map((r) => ({ canal: r.canal, roi: r.roi!, ingresos: r.ingresos, inversion: r.inversion }));
  const chartMonths = months.map((m) => ({ period: m.period, ingresos: m.ingresos, inversion: m.inversion, roi: m.roi, cpl: m.costoConsulta, cpa: m.cpa }));

  return (
    <>
      <PageHeader
        title="ROI y costos de retorno"
        description={`${companyName}, ${labelRange(range)}. Si la inversión en publicidad fue rentable, cuánto cuesta cada lead y cuánto cuesta cada venta cerrada.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowGlossary((v) => !v)}>
              <BookOpen size={15} /> {showGlossary ? 'Ocultar definiciones' : 'Ver definiciones'}
            </Button>
            <Button variant="outline" onClick={() => downloadTemplate('costs')}>
              <FileSpreadsheet size={15} /> Plantilla de costos
            </Button>
          </>
        }
      />

      {!total.hasCosts && (
        <Card className="mb-3 border-warn/40">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn/10 text-warn">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-medium text-ink">El archivo no trae inversión ni costos, así que todavía no hay ROI</p>
              <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
                El Excel registra ingresos, ventas y visitas, pero no cuánto se pagó en publicidad, pauta o comisiones. El ROI compara lo que regresa contra lo que se invirtió: sin la inversión,
                cualquier porcentaje sería inventado. Escribe la inversión por canal o por mes en las tablas de abajo, o importa la plantilla de costos, y los cálculos aparecen al instante.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('costs')}>
                  <FileSpreadsheet size={13} /> Descargar plantilla
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage('data')}>
                  <Upload size={13} /> Importar costos
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {showGlossary && (
        <Card className="mb-3">
          <CardHeader title="La chuleta para no confundirse" subtitle="Qué significa cada métrica y cómo se calcula aquí. Todas en quetzales y sobre el período seleccionado." />
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-card bg-line sm:grid-cols-2 xl:grid-cols-3 mt-4 border-t border-line">
            {ROI_GLOSSARY.map((g) => (
              <div key={g.term} className="bg-surface px-5 py-3.5">
                <div className="text-[13px] font-semibold text-ink">{g.term}</div>
                <div className="tnum mt-1 inline-block rounded-md bg-sunken px-2 py-0.5 font-mono text-[11.5px] text-ink">{g.formula}</div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{g.reading}</p>
                {g.needs && (
                  <div className="mt-1.5">
                    <Tag tone={ads.impresiones ? 'up' : 'warn'}>{ads.impresiones ? 'Con datos de anuncios' : `Pendiente: ${g.needs.toLowerCase()}`}</Tag>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <Stat label="Inversión" value={fmt(total.inversion, 'Q')} help="Suma de la inversión registrada para el período." />
        <Stat label="Ventas" value={fmt(total.ingresos, 'Q')} help="Ventas en quetzales del período." />
        <Stat
          label="Beneficio neto"
          value={fmt(total.beneficio, 'Q')}
          tone={total.beneficio === undefined ? undefined : total.beneficio >= 0 ? 'up' : 'down'}
          help={margen !== undefined ? `Ventas × ${fmt(margen, '%')} de margen − inversión.` : 'Ventas − inversión, como en el reporte. No descuenta renta, planilla ni otros gastos del gimnasio.'}
        />
        <Stat label="ROI" value={total.roi === undefined ? '—' : fmt(total.roi, '%')} tone={total.roi === undefined ? undefined : total.roi >= 0 ? 'up' : 'down'} help="Beneficio neto ÷ inversión × 100." />
        <Stat label="ROAS" value={total.roas === undefined ? '—' : `${total.roas.toFixed(2)}×`} help="Ventas ÷ inversión." />
        <Stat label="CPL" value={fmt(total.costoConsulta, 'Q2')} help="Costo por lead: inversión ÷ leads recibidos." />
        <Stat label="CPA" value={fmt(total.cpa, 'Q2')} help="Costo por venta cerrada: inversión ÷ ventas cerradas." />
        <Stat
          label="CTR"
          value={ads.ctr === undefined ? 'Pendiente' : fmt(ads.ctr, '%')}
          help="Clics ÷ impresiones. Requiere los datos del administrador de anuncios (Meta Ads, TikTok Ads), que se importan en Redes sociales."
        />
      </div>

      {total.hasCosts && (() => {
        const chWith = ch.rows.filter((r) => r.inversion !== undefined).length;
        const mWith = months.filter((m) => m.inversion !== undefined).length;
        const incomplete = (chWith > 0 && chWith < ch.rows.filter((r) => !/recurrente|referido/i.test(r.canal)).length) || (mWith > 0 && mWith < months.length);
        return (
          <p className={cx('mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-snug', incomplete ? 'bg-warn/10 text-warn' : 'bg-sunken text-muted')}>
            {incomplete && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
            <span>
              Inversión registrada en {chWith} de {ch.rows.length} canales y en {mWith} de {months.length} meses.
              {incomplete
                ? ' El total compara la inversión registrada con todos los ingresos del período, así que mientras falte inversión el ROI total aparece más alto de lo real.'
                : ' El total compara toda la inversión registrada con todos los ingresos del período.'}
            </span>
          </p>
        );
      })()}

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Costo por red"
            subtitle={
              ch.mode === 'acumulado'
                ? 'Los datos por canal son acumulados del archivo; escribe la inversión total de cada canal en ese mismo período.'
                : `${labelRange(range)}. El reporte no reparte la inversión por red: escribe cuánto va a cada una para ver su CPL y CPA.`
            }
            help="Si el archivo atribuye ventas en quetzales a cada red, también se calcula su ROI. Es una atribución declarada, no una medición causal."
          />
          {ch.rows.length ? (
            <div className="scroll-thin mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-faint">
                    <th className="px-5 py-2 font-medium">Red</th>
                    <th className="w-32 px-2 py-2 text-right font-medium">Inversión</th>
                    <th className="px-3 py-2 text-right font-medium">Leads</th>
                    <th className="px-3 py-2 text-right font-medium">Cerradas</th>
                    <th className="px-3 py-2 text-right font-medium">Cierre</th>
                    <th className="px-3 py-2 text-right font-medium">CPL</th>
                    <th className="px-3 py-2 text-right font-medium">CPA</th>
                    {hasChIngresos && <th className="px-5 py-2 text-right font-medium">ROI</th>}
                  </tr>
                </thead>
                <tbody>
                  {ch.rows.map((r) => {
                    const organic = /recurrente|referido/i.test(r.canal);
                    return (
                      <tr key={r.canal} className="border-b border-line/60 last:border-0">
                        <td className="px-5 py-2">
                          <div className="font-medium text-ink">{r.canal}</div>
                          {organic && r.inversion === undefined && <div className="text-[11px] text-faint">Suele no tener inversión directa</div>}
                        </td>
                        <td className="px-2 py-1.5">
                          {editable ? (
                            <MoneyInput label={`Inversión en ${r.canal}`} value={chCost(r.canal)} onCommit={(v) => setCost({ companyId: scope, period: null, canal: r.canal, inversion: v })} />
                          ) : (
                            <div className="tnum text-right text-ink">{fmt(r.inversion, 'Q')}</div>
                          )}
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(r.consultas)}</td>
                        <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(r.ventas)}</td>
                        <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(r.cierre, '%')}</td>
                        <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(r.costoConsulta, 'Q2')}</td>
                        <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(r.cpa, 'Q2')}</td>
                        {hasChIngresos && (
                          <td className="tnum whitespace-nowrap px-5 py-2 text-right">
                            <RoiValue v={r.roi} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {ch.orphan.length > 0 && (
                <p className="px-5 pt-2 text-[11.5px] text-warn">Hay costos registrados para canales que no aparecen en los datos: {ch.orphan.join(', ')}. Cuentan en el total, no en esta tabla.</p>
              )}
              <p className="px-5 py-3 text-[11.5px] leading-snug text-faint">
                {editable ? 'Escribe la inversión y presiona Enter; se guarda en este navegador. ' : 'En la vista consolidada los costos se suman; edítalos desde cada empresa. '}
                Las redes sin inversión registrada no tienen CPL ni CPA (no se puede dividir entre cero).
              </p>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-[12.5px] text-muted">Sin datos por canal para este alcance.</p>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Calculator size={15} className="text-muted" /> Margen bruto
              </span>
            }
            subtitle="Opcional, pero recomendable"
          />
          <div className="flex-1 px-5 py-4">
            <p className="text-[12.5px] leading-relaxed text-muted">
              El reporte calcula el beneficio neto como ventas menos inversión en publicidad, pero una membresía también paga renta, entrenadores, equipo y servicios. Con el margen, el ROI refleja
              lo que realmente queda: con 40 % de margen, una inscripción de Q 1,500 deja Q 600 para pagar la publicidad.
            </p>
            {editable ? (
              <div className="mt-4 max-w-[160px]">
                <label className="text-[12px] text-muted">
                  Margen de {companyName}
                  <div className="mt-1">
                    <MoneyInput label="Margen bruto" suffix="%" placeholder="40" value={margen} onCommit={(v) => setMargin(scope, v)} />
                  </div>
                </label>
              </div>
            ) : (
              <p className="mt-4 text-[12.5px] text-ink">{margen !== undefined ? `Margen común: ${fmt(margen, '%')}` : 'Las empresas tienen márgenes distintos o sin definir.'}</p>
            )}
            <div className="mt-4">
              {margen !== undefined ? <Tag tone="up">ROI con margen</Tag> : <Tag tone="warn">ROI como en el reporte: ventas − inversión</Tag>}
            </div>
            {total.ventasEquilibrio !== undefined && (
              <div className="mt-5 rounded-xl bg-sunken p-3.5">
                <div className="text-[11.5px] text-faint">Ventas para recuperar la inversión del período</div>
                <div className="tnum mt-1 text-[18px] font-semibold text-ink">{fmt(Math.ceil(total.ventasEquilibrio))}</div>
                <div className="tnum mt-0.5 text-[11.5px] text-muted">
                  de {fmt(total.ventas)} ventas realizadas ({fmt(total.ventas ? total.ventasEquilibrio / total.ventas : undefined, '%')})
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {hasChannelCosts && chartCh.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ChartCard title="ROI por canal" subtitle={margen !== undefined ? 'Sobre utilidad bruta' : 'Sobre ingresos'} exportName="roi-por-canal">
            <div style={{ height: Math.max(200, chartCh.length * 50) }}>
              <ResponsiveContainer>
                <BarChart data={chartCh} layout="vertical" margin={{ top: 4, right: 80, left: 8, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="canal" width={140} {...axisProps(c)} />
                  <ReferenceLine x={0} stroke={c.line} />
                  <Tooltip
                    cursor={{ fill: c.grid }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof chartCh)[number];
                      return (
                        <ChartTip
                          title={d.canal}
                          rows={[
                            { label: 'ROI', value: d.roi, unit: '%', color: d.roi >= 0 ? c.up : c.down },
                            { label: 'Inversión', value: d.inversion, unit: 'Q', color: c.faint },
                            { label: 'Ingresos', value: d.ingresos, unit: 'Q', color: c.series[0] },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="roi" radius={[0, 4, 4, 0]} maxBarSize={24} animationDuration={dur} label={{ position: 'right', fill: c.muted, fontSize: 11.5, formatter: (v: number) => fmt(v, '%') }}>
                    {chartCh.map((d) => (
                      <Cell key={d.canal} fill={d.roi >= 0 ? c.up : c.down} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard title="Inversión frente a ingresos" subtitle="Por canal" exportName="inversion-ingresos-canal">
            <div className="h-[260px]">
              <ResponsiveContainer>
                <BarChart data={chartCh} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="canal" {...axisProps(c)} interval={0} tick={{ fill: c.muted, fontSize: 10.5 }} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)} dy={6} />
                  <YAxis width={56} tickFormatter={(v) => compact(v, 'Q')} {...axisProps(c)} />
                  <Legend verticalAlign="top" height={30} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                  <Tooltip
                    cursor={{ fill: c.grid }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTip title={String(label)} rows={payload.map((p) => ({ label: String(p.name), value: p.value as number, unit: 'Q' as const, color: String(p.color) }))} />
                      ) : null
                    }
                  />
                  <Bar name="Inversión" dataKey="inversion" fill={c.warn} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={dur} />
                  <Bar name="Ingresos" dataKey="ingresos" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={dur} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      <Card className="mt-3">
        <CardHeader
          title="Retorno mes a mes"
          subtitle="Inversión total de cada mes (todas las redes). Puedes corregirla aquí; el ROI, el CPL y el CPA se recalculan al instante."
        />
        <div className="scroll-thin mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-2 font-medium">Mes</th>
                <th className="w-32 px-2 py-2 text-right font-medium">Inversión</th>
                <th className="px-3 py-2 text-right font-medium">Ventas</th>
                <th className="px-3 py-2 text-right font-medium">Beneficio neto</th>
                <th className="px-3 py-2 text-right font-medium">ROI</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
                <th className="px-3 py-2 text-right font-medium">CPL</th>
                <th className="px-5 py-2 text-right font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.period} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2 text-ink">{labelLong(m.period)}</td>
                  <td className="px-2 py-1.5">
                    {editable ? (
                      <MoneyInput label={`Inversión de ${labelLong(m.period)}`} value={monthCost(m.period)} onCommit={(v) => setCost({ companyId: scope, period: m.period, canal: null, inversion: v })} />
                    ) : (
                      <div className="tnum text-right text-ink">{fmt(m.inversion, 'Q')}</div>
                    )}
                  </td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(m.ingresos, 'Q')}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(m.beneficio, 'Q')}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right">
                    <RoiValue v={m.roi} />
                  </td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{m.roas === undefined ? '—' : `${m.roas.toFixed(2)}×`}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(m.costoConsulta, 'Q2')}</td>
                  <td className="tnum whitespace-nowrap px-5 py-2 text-right text-ink">{fmt(m.cpa, 'Q2')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11.5px] leading-snug text-faint">
          La inversión mensual se suma a la de los canales solo en el total del período. Si registras los mismos costos en ambas tablas, se contarán dos veces.
        </p>
      </Card>

      {hasMonthCosts && (
        <ChartCard className="mt-3" title="Inversión, ventas y ROI por mes" subtitle={margen !== undefined ? 'ROI con margen bruto' : 'ROI como en el reporte: (ventas − inversión) ÷ inversión'} exportName="roi-mensual">
          <div className="h-[300px]">
            <ResponsiveContainer>
              <ComposedChart data={chartMonths} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="period" tickFormatter={(p) => labelShort(p)} {...axisProps(c)} dy={6} />
                <YAxis yAxisId="q" width={56} tickFormatter={(v) => compact(v, 'Q')} {...axisProps(c)} />
                <YAxis yAxisId="r" orientation="right" width={48} tickFormatter={(v) => compact(v, '%')} {...axisProps(c)} />
                <Legend verticalAlign="top" height={30} iconType="circle" iconSize={7} formatter={(v) => <span style={{ color: c.muted, fontSize: 11.5 }}>{v}</span>} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof chartMonths)[number];
                    return (
                      <ChartTip
                        title={labelLong(d.period)}
                        rows={[
                          { label: 'Inversión', value: d.inversion, unit: 'Q', color: c.warn },
                          { label: 'Ventas', value: d.ingresos, unit: 'Q', color: c.series[0] },
                          { label: 'ROI', value: d.roi, unit: '%', color: c.up },
                          { label: 'CPL', value: d.cpl, unit: 'Q2', color: c.faint },
                          { label: 'CPA', value: d.cpa, unit: 'Q2', color: c.faint },
                        ]}
                      />
                    );
                  }}
                />
                <Bar yAxisId="q" name="Inversión" dataKey="inversion" fill={c.warn} radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={dur} />
                <Bar yAxisId="q" name="Ventas" dataKey="ingresos" fill={c.series[0]} radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={dur} />
                <Line yAxisId="r" name="ROI" dataKey="roi" type="monotone" stroke={c.up} strokeWidth={2} dot={{ r: 3, fill: c.surface, strokeWidth: 1.5 }} connectNulls={false} animationDuration={dur} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </>
  );
}

