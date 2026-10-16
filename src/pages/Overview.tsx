import { useMemo, useState } from 'react';
import { BadgePercent, Banknote, Eye, MessageSquare, Receipt, ShoppingBag, TrendingUp, UserPlus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { KpiCard } from '../components/kpi/KpiCard';
import { ChartCard, useChartColors } from '../components/charts/kit';
import { Donut, Funnel, TrendChart } from '../components/charts/Charts';
import { Card, CardHeader, PageHeader, Segmented } from '../components/ui';
import { InsightItem, MonthTable, NoData, SourceNote } from '../components/data/Shared';
import { channelsFor, kpi, METRICS, totalOf, type SeriesMetric } from '../lib/metrics';
import { generateInsights } from '../lib/insights';
import { useScopeRows } from '../lib/hooks';
import { labelRange, previousRange } from '../lib/periods';
import { fmt } from '../lib/format';

export function Overview() {
  const { ds, scope, range, setPage, openDetail, setRange } = useStore();
  const { rows, prevRows, hasData, scopeLabel } = useScopeRows();
  const c = useChartColors();
  const [chMetric, setChMetric] = useState<'ingresos' | 'ventas'>('ingresos');

  const k = useMemo(() => {
    const get = (m: SeriesMetric) => kpi(ds, scope, range, m);
    return {
      ingresos: get('ingresos'),
      ventas: get('ventas'),
      visitas: get('visitas'),
      clics: get('clics'),
      consultas: get('consultas'),
      conversion: get('conversion'),
      ticket: get('ticket'),
      clientesNuevos: get('clientesNuevos'),
    };
  }, [ds, scope, range]);

  const insights = useMemo(() => generateInsights({ ds, scope, range }).slice(0, 4), [ds, scope, range]);
  const channels = useMemo(() => channelsFor(ds, scope, range), [ds, scope, range]);
  const prevLabel = `vs. ${labelRange(previousRange(range))}`;

  if (!hasData) {
    return (
      <>
        <PageHeader title="Resumen ejecutivo" description={`${scopeLabel}, ${labelRange(range)}`} />
        <NoData />
      </>
    );
  }

  const tot = (m: SeriesMetric) => totalOf(rows, m).value;
  const donutData = channels.channels.filter((x) => (x.values[chMetric] ?? 0) > 0).map((x) => ({ name: x.canal, value: x.values[chMetric]! }));

  return (
    <>
      <PageHeader title="Resumen ejecutivo" description={`${scopeLabel}, ${labelRange(range)}. Toca un indicador para ver su análisis.`} />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <KpiCard
          label="Ingresos"
          icon={<Banknote size={14} />}
          help={METRICS.ingresos.help}
          unit="Q"
          value={k.ingresos.value}
          delta={k.ingresos.delta}
          compareLabel={prevLabel}
          coverage={k.ingresos.coverage}
          spark={k.ingresos.spark}
          color={c.series[0]}
          onOpen={() => setPage('sales')}
        />
        <KpiCard
          label="Ventas"
          icon={<ShoppingBag size={14} />}
          help={METRICS.ventas.help}
          unit="n"
          value={k.ventas.value}
          delta={k.ventas.delta}
          compareLabel={prevLabel}
          coverage={k.ventas.coverage}
          spark={k.ventas.spark}
          color={c.series[0]}
          onOpen={() => setPage('sales')}
        />
        <KpiCard
          label="Visitas web"
          icon={<Eye size={14} />}
          help={METRICS.visitas.help}
          unit="n"
          value={k.visitas.value}
          delta={k.visitas.delta}
          compareLabel={prevLabel}
          coverage={k.visitas.coverage}
          spark={k.visitas.spark}
          color={c.series[1]}
          onOpen={() => setPage('traffic')}
        />
        {k.consultas.value === undefined && k.clics.value !== undefined ? (
          <KpiCard
            label="Clics / consultas"
            icon={<MessageSquare size={14} />}
            help="El archivo registra clics y consultas en una sola columna, así que se muestran juntos."
            unit="n"
            value={k.clics.value}
            delta={k.clics.delta}
            compareLabel={prevLabel}
            coverage={k.clics.coverage}
            spark={k.clics.spark}
            color={c.series[1]}
            onOpen={() => setPage('traffic')}
          />
        ) : (
          <KpiCard
            label="Consultas"
            icon={<MessageSquare size={14} />}
            help={`${METRICS.consultas.help} Debajo se muestran los clics del mismo período.`}
            unit="n"
            value={k.consultas.value}
            delta={k.consultas.delta}
            secondary={k.clics.value !== undefined ? `${fmt(k.clics.value)} clics en el período` : undefined}
            compareLabel={prevLabel}
            coverage={k.consultas.coverage}
            spark={k.consultas.spark}
            color={c.series[1]}
            onOpen={() => setPage('traffic')}
          />
        )}
        <KpiCard
          label="Conversión"
          icon={<BadgePercent size={14} />}
          help={METRICS.conversion.help}
          unit="%"
          value={k.conversion.value}
          delta={k.conversion.delta}
          deltaKind="pp"
          compareLabel={prevLabel}
          coverage={k.conversion.coverage}
          spark={k.conversion.spark}
          color={c.series[2]}
          onOpen={() => setPage('traffic')}
        />
        <KpiCard
          label="Ticket promedio"
          icon={<Receipt size={14} />}
          help={METRICS.ticket.help}
          unit="Q2"
          value={k.ticket.value}
          delta={k.ticket.delta}
          compareLabel={prevLabel}
          coverage={k.ticket.coverage}
          spark={k.ticket.spark}
          color={c.series[2]}
          onOpen={() => setPage('sales')}
        />
        <KpiCard
          label="Clientes nuevos"
          icon={<UserPlus size={14} />}
          help={METRICS.clientesNuevos.help}
          unit="n"
          value={k.clientesNuevos.value}
          delta={k.clientesNuevos.delta}
          compareLabel={prevLabel}
          coverage={k.clientesNuevos.coverage}
          spark={k.clientesNuevos.spark}
          color={c.series[3]}
          onOpen={() => setPage('sales')}
        />
        <KpiCard
          label="Crecimiento"
          icon={<TrendingUp size={14} />}
          help="Variación de ingresos frente al período anterior de igual duración. Solo se calcula si ambos períodos tienen todos sus meses con dato."
          unit="%"
          value={k.ingresos.delta}
          delta={undefined}
          secondary={k.ingresos.prev !== undefined ? `Antes: ${fmt(k.ingresos.prev, 'Q')} (${labelRange(previousRange(range))})` : undefined}
          pending="Sin período anterior completo"
          spark={rows.map((r, i) => (i && r.values.ingresos !== undefined && rows[i - 1].values.ingresos ? r.values.ingresos / rows[i - 1].values.ingresos! - 1 : null))}
          color={c.series[0]}
          onOpen={() => setPage('compare')}
        />
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
          <div className="border-t border-line px-5 py-3">
            <button type="button" onClick={() => setPage('insights')} className="text-[12.5px] font-medium text-electric hover:underline">
              Ver todos los hallazgos
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="Contribución por canal"
          subtitle={channels.mode === 'mensual' ? labelRange(range) : channels.mode === 'acumulado' ? 'Acumulado del archivo de fuentes' : undefined}
          exportName="contribucion-canal"
          actions={
            donutData.length > 0 && (
              <Segmented
                size="sm"
                label="Métrica"
                value={chMetric}
                onChange={setChMetric}
                options={[
                  { value: 'ingresos', label: 'Ingresos' },
                  { value: 'ventas', label: 'Ventas' },
                ]}
              />
            )
          }
        >
          {donutData.length ? (
            <div className="px-2">
              <Donut data={donutData} unit={chMetric === 'ingresos' ? 'Q' : 'n'} centerLabel={chMetric === 'ingresos' ? 'ingresos por canal' : 'ventas por canal'} />
            </div>
          ) : (
            <p className="px-2 py-8 text-center text-[12.5px] text-muted">
              {channels.missing.length && scope === 'consolidado' ? 'Falta información por canal de alguna empresa; no se consolida.' : channels.sourceNote ?? 'Sin datos por canal. Impórtalos desde Gestión de datos.'}
            </p>
          )}
          {channels.mode === 'acumulado' && donutData.length > 0 && <SourceNote>{channels.sourceNote} Sus totales pueden no coincidir con los datos mensuales.</SourceNote>}
        </ChartCard>

        <ChartCard title="Embudo comercial" subtitle={`${labelRange(range)}. Cada etapa usa el mismo período.`} help="Solo se muestran etapas con datos compatibles. Oportunidades no se registra todavía en el archivo." exportName="embudo">
          <div className="px-2 pt-1">
            <Funnel
              stages={[
                { label: 'Visitas web', value: tot('visitas') },
                tot('consultas') !== undefined ? { label: 'Consultas', value: tot('consultas') } : { label: 'Clics / consultas', value: tot('clics') },
                { label: 'Oportunidades', value: undefined, note: 'Sin registro de oportunidades' },
                { label: 'Ventas', value: tot('ventas') },
              ]}
            />
          </div>
        </ChartCard>
      </div>

      <Card className="mt-3">
        <CardHeader title="Detalle mensual" subtitle="Haz clic en un mes para abrir su detalle." />
        <div className="mt-2">
          <MonthTable rows={rows} metrics={['ingresos', 'ventas', 'ticket', 'visitas', 'consultas', 'conversion', 'clientesNuevos']} />
        </div>
      </Card>
    </>
  );
}
