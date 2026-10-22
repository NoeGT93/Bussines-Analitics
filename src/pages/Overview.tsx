import { useMemo, useState } from 'react';
import { BadgePercent, Banknote, Coins, Eye, MessageSquare, MousePointerClick, Receipt, ShoppingBag, TrendingUp, UserPlus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { KpiCard, type KpiCardProps } from '../components/kpi/KpiCard';
import { LeadSnapshotCard } from '../components/data/LeadSnapshot';
import { AccumulatedCard } from '../components/data/Accumulated';
import { roiByMonth, roiTotal } from '../lib/roi';
import type { Unit } from '../lib/format';
import type { PageId } from '../store/useStore';
import { ChartCard, useChartColors } from '../components/charts/kit';
import { Donut, Funnel, TrendChart } from '../components/charts/Charts';
import { Card, CardHeader, PageHeader, Segmented } from '../components/ui';
import { InsightItem, MonthTable, NoData, SourceNote } from '../components/data/Shared';
import { channelsFor, kpi, METRICS, totalOf, type SeriesMetric } from '../lib/metrics';
import { generateInsights } from '../lib/insights';
import { useScopeRows } from '../lib/hooks';
import { labelRange, previousRange } from '../lib/periods';

export function Overview() {
  const { ds, scope, range, setPage, openDetail, setRange } = useStore();
  const { rows, prevRows, hasData, scopeLabel } = useScopeRows();
  const c = useChartColors();
  const [chPick, setChMetric] = useState<'ingresos' | 'ventas' | 'consultas' | null>(null);


  const roi = useMemo(() => {
    const total = roiTotal(ds, scope, range);
    const prev = roiTotal(ds, scope, previousRange(range));
    const months = roiByMonth(ds, scope, range);
    const prevFull = prev.hasCosts && prevRows.every((r) => Object.keys(r.values).length > 0);
    return { total, prev: prevFull ? prev : null, months };
  }, [ds, scope, range, prevRows]);

  const cards = useMemo(() => {
    const prevLabel = `vs. ${labelRange(previousRange(range))}`;
    type Base = { key: SeriesMetric; label: string; icon: JSX.Element; unit: Unit; color: string; page: PageId; pp?: boolean };
    const base: Base[] = [
      { key: 'ingresos', label: 'Ingresos', icon: <Banknote size={14} />, unit: 'Q', color: c.series[0], page: 'roi' },
      { key: 'ventas', label: 'Ventas cerradas', icon: <ShoppingBag size={14} />, unit: 'n', color: c.series[0], page: 'traffic' },
      { key: 'consultas', label: 'Leads', icon: <MessageSquare size={14} />, unit: 'n', color: c.series[1], page: 'traffic' },
      { key: 'cierre', label: 'Tasa de cierre', icon: <BadgePercent size={14} />, unit: '%', color: c.series[2], page: 'traffic', pp: true },
      { key: 'ticket', label: 'Ticket promedio', icon: <Receipt size={14} />, unit: 'Q2', color: c.series[2], page: 'roi' },
      { key: 'visitas', label: 'Visitas web', icon: <Eye size={14} />, unit: 'n', color: c.series[1], page: 'traffic' },
      { key: 'clics', label: 'Clics', icon: <MousePointerClick size={14} />, unit: 'n', color: c.series[1], page: 'traffic' },
      { key: 'conversion', label: 'Conversión web', icon: <BadgePercent size={14} />, unit: '%', color: c.series[2], page: 'traffic', pp: true },
      { key: 'clientesNuevos', label: 'Clientes nuevos', icon: <UserPlus size={14} />, unit: 'n', color: c.series[3], page: 'roi' },
    ];
    const out: (KpiCardProps & { key: string })[] = [];
    for (const b of base) {
      const r = kpi(ds, scope, range, b.key);
      if (r.value === undefined) continue;
      out.push({
        key: b.key,
        label: b.label,
        icon: b.icon,
        help: METRICS[b.key].help,
        unit: b.unit,
        value: r.value,
        delta: r.delta,
        deltaKind: b.pp ? 'pp' : 'rel',
        compareLabel: prevLabel,
        coverage: r.coverage,
        spark: r.spark,
        sparkPeriods: r.sparkPeriods,
        color: b.color,
        onOpen: () => setPage(b.page),
      } as KpiCardProps & { key: string });
    }
    const t = roi.total;
    const p = roi.prev;
    const rel = (a?: number, b?: number) => (a !== undefined && b ? (a - b) / Math.abs(b) : undefined);
    const roiCards: (KpiCardProps & { key: string })[] = [];
    if (t.roi !== undefined) {
      roiCards.push({
        key: 'roi', label: 'ROI', icon: <TrendingUp size={14} />, unit: '%', value: t.roi,
        help: 'Beneficio neto ÷ inversión × 100. Beneficio neto = ventas − inversión (o ventas × margen − inversión si se define el margen en ROI y costos).',
        delta: p?.roi !== undefined ? t.roi - p.roi : undefined, deltaKind: 'pp', compareLabel: prevLabel,
        spark: roi.months.map((m) => m.roi ?? null), sparkPeriods: roi.months.map((m) => m.period), color: c.up, onOpen: () => setPage('roi'),
      } as KpiCardProps & { key: string });
    }
    if (t.costoConsulta !== undefined) {
      roiCards.push({
        key: 'cpl', label: 'CPL', icon: <Coins size={14} />, unit: 'Q2', value: t.costoConsulta, higherIsBetter: false,
        help: 'Costo por lead: inversión ÷ leads recibidos.', delta: rel(t.costoConsulta, p?.costoConsulta), compareLabel: prevLabel,
        spark: roi.months.map((m) => m.costoConsulta ?? null), sparkPeriods: roi.months.map((m) => m.period), color: c.warn, onOpen: () => setPage('roi'),
      } as KpiCardProps & { key: string });
    }
    if (t.cpa !== undefined) {
      roiCards.push({
        key: 'cpa', label: 'CPA', icon: <Coins size={14} />, unit: 'Q2', value: t.cpa, higherIsBetter: false,
        help: 'Costo por venta cerrada: inversión ÷ ventas cerradas.', delta: rel(t.cpa, p?.cpa), compareLabel: prevLabel,
        spark: roi.months.map((m) => m.cpa ?? null), sparkPeriods: roi.months.map((m) => m.period), color: c.warn, onOpen: () => setPage('roi'),
      } as KpiCardProps & { key: string });
    }
    const room = Math.max(4, 8 - roiCards.length);
    const list = [...out.slice(0, room), ...roiCards];
    if (list.length < 8 && !roiCards.length) {
      const g = kpi(ds, scope, range, 'ingresos');
      list.push({
        key: 'crec', label: 'Crecimiento', icon: <TrendingUp size={14} />, unit: '%', value: g.delta,
        help: 'Variación de ingresos frente al período anterior de igual duración.', pending: 'Sin período anterior completo', color: c.series[0],
      } as KpiCardProps & { key: string });
    }
    return list;
  }, [ds, scope, range, roi, c, setPage]);

  const insights = useMemo(() => generateInsights({ ds, scope, range }).slice(0, 4), [ds, scope, range]);
  const channels = useMemo(() => channelsFor(ds, scope, range), [ds, scope, range]);

  if (!hasData) {
    return (
      <>
        <PageHeader title="Resumen ejecutivo" description={`${scopeLabel}, ${labelRange(range)}`} />
        <NoData />
      </>
    );
  }

  const tot = (m: SeriesMetric) => totalOf(rows, m).value;
  const chOptions = (['ingresos', 'ventas', 'consultas'] as const).filter((m) => channels.channels.some((x) => (x.values[m] ?? 0) > 0));
  const chMetric = chPick && chOptions.includes(chPick) ? chPick : chOptions[0] ?? 'ingresos';
  const chLabel = { ingresos: 'Ingresos', ventas: 'Cerradas', consultas: 'Leads' } as const;
  const donutData = channels.channels.filter((x) => (x.values[chMetric] ?? 0) > 0).map((x) => ({ name: x.canal, value: x.values[chMetric]! }));

  return (
    <>
      <PageHeader title="Resumen ejecutivo" description={`${scopeLabel}, ${labelRange(range)}. Toca un indicador para ver su análisis.`} />

      <AccumulatedCard />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {cards.map(({ key, ...cd }) => (
          <KpiCard key={key} {...cd} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2" data-report-chart>
          <ChartCard
            title="Evolución mensual"
            subtitle="Activa series, compara con el período anterior o arrastra el selector inferior para acotar meses."
            exportName="evolucion-mensual"
            className="h-full"
          >
            <TrendChart rows={rows} prevRows={prevRows} onPointClick={(p) => openDetail({ period: p })} onApplyRange={(from, to) => setRange({ from, to }, 'custom')} />
          </ChartCard>
        </div>
        <Card className="flex flex-col">
          <CardHeader title="Hallazgos principales" subtitle="Calculados con reglas a partir de los datos cargados." />
          <div className="flex-1 space-y-4 px-5 py-4">
            {insights.length ? insights.map((i) => <InsightItem key={i.id} ins={i} />) : <p className="text-[12.5px] text-muted">Se necesitan al menos dos meses con datos.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="Contribución por red"
          subtitle={channels.mode === 'mensual' ? labelRange(range) : channels.mode === 'acumulado' ? 'Acumulado del archivo de fuentes' : undefined}
          exportName="contribucion-canal"
          actions={
            chOptions.length > 1 && (
              <Segmented size="sm" label="Métrica" value={chMetric} onChange={setChMetric} options={chOptions.map((m) => ({ value: m, label: chLabel[m] }))} />
            )
          }
        >
          {donutData.length ? (
            <div className="px-2">
              <Donut data={donutData} unit={chMetric === 'ingresos' ? 'Q' : 'n'} centerLabel={chMetric === 'ingresos' ? 'ingresos por red' : chMetric === 'ventas' ? 'cerradas por red' : 'leads por red'} />
            </div>
          ) : (
            <p className="px-2 py-8 text-center text-[12.5px] text-muted">
              {channels.missing.length && scope === 'consolidado' ? 'Falta información por canal de alguna empresa; no se consolida.' : channels.sourceNote ?? 'Sin datos por canal. Impórtalos desde Gestión de datos.'}
            </p>
          )}
          {channels.mode === 'acumulado' && donutData.length > 0 && <SourceNote>{channels.sourceNote} Sus totales pueden no coincidir con los datos mensuales.</SourceNote>}
        </ChartCard>

        <ChartCard title="Embudo comercial" subtitle={`${labelRange(range)}. Cada etapa usa el mismo período.`} help="Solo se muestran las etapas que tienen datos en el período. Las etapas sin registro (visitas web, oportunidades) se omiten." exportName="embudo">
          <div className="px-2 pt-1">
            <Funnel
              stages={[
                { label: 'Visitas web', value: tot('visitas') },
                tot('consultas') !== undefined ? { label: 'Leads', value: tot('consultas') } : { label: 'Clics / consultas', value: tot('clics') },
                { label: 'Ventas cerradas', value: tot('ventas') },
              ].filter((st) => st.value !== undefined)}
            />
          </div>
        </ChartCard>
      </div>

      <div className="mt-3">
        <LeadSnapshotCard />
      </div>

      <Card className="mt-3">
        <CardHeader title="Detalle mensual" subtitle="Haz clic en un mes para abrir su detalle." />
        <div className="mt-2">
          <MonthTable rows={rows} metrics={['ingresos', 'ventas', 'ticket', 'consultas', 'cierre', 'visitas', 'conversion', 'clientesNuevos']} />
        </div>
      </Card>
    </>
  );
}
