import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useCompareRange } from '../../lib/hooks';
import { adMetrics, metaBranches, roiByChannel, roiTotal } from '../../lib/roi';
import { META_LABEL } from '../../lib/metrics';
import { BranchLeaf, BranchName } from './Branch';
import { Fragment } from 'react';
import { rowsFor, totalOf } from '../../lib/metrics';
import { companyIdsFor } from '../../lib/metrics';
import { fmt, type Unit } from '../../lib/format';
import { labelRange, monthsBetween } from '../../lib/periods';
import type { CompanyScope, Dataset, DateRange } from '../../types';
import { Card, CardHeader, Delta, InfoTip, Segmented, Tag, cx } from '../ui';
import { glossText } from '../../lib/glossary';

interface Line {
  key: string;
  label: string;
  unit: Unit;
  a?: number;
  b?: number;
  /** Tasas: diferencia en puntos; montos: variación relativa */
  rate?: boolean;
  higherIsBetter?: boolean;
  estimado?: boolean;
}

/** Suma de métricas de redes (estimadas o importadas) del período */
function socialSum(ds: Dataset, scope: CompanyScope, range: DateRange, k: 'alcance' | 'impresiones' | 'interacciones') {
  const ids = new Set(companyIdsFor(ds, scope));
  const months = new Set(monthsBetween(range));
  const v = ds.social.filter((r) => ids.has(r.companyId) && months.has(r.period)).map((r) => r[k]).filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((s, x) => s + x, 0) : undefined;
}

function summary(ds: Dataset, scope: CompanyScope, range: DateRange) {
  const rows = rowsFor(ds, scope, range);
  const t = roiTotal(ds, scope, range);
  const ads = adMetrics(ds, scope, range);
  return {
    hasData: rows.some((r) => Object.keys(r.values).length > 0),
    ingresos: t.ingresos,
    inversion: t.inversion,
    beneficio: t.beneficio,
    leads: totalOf(rows, 'consultas').value,
    ventas: totalOf(rows, 'ventas').value,
    cierre: totalOf(rows, 'cierre').value,
    ticket: totalOf(rows, 'ticket').value,
    roi: t.roi,
    cpl: t.costoConsulta,
    cpa: t.cpa,
    impresiones: ads.impresiones,
    alcance: socialSum(ds, scope, range, 'alcance'),
    clics: ads.clics,
    ctr: ads.ctr,
    cpc: ads.cpc,
  };
}

export function CompareCard() {
  const { ds, scope, range } = useStore();
  const { cmp } = useCompareRange();
  const [view, setView] = useState<'indicadores' | 'redes'>('indicadores');
  const [metaOpen, setMetaOpen] = useState(false);

  const data = useMemo(() => {
    if (!cmp) return null;
    const A = summary(ds, scope, range);
    const B = summary(ds, scope, cmp);
    const all: Line[] = [
      { key: 'ingresos', label: 'Venta', unit: 'Q', a: A.ingresos, b: B.ingresos },
      { key: 'inversion', label: 'Inversión en publicidad', unit: 'Q', a: A.inversion, b: B.inversion, higherIsBetter: false },
      { key: 'beneficio', label: 'Venta menos inversión', unit: 'Q', a: A.beneficio, b: B.beneficio },
      { key: 'leads', label: 'Leads recibidos', unit: 'n', a: A.leads, b: B.leads },
      { key: 'ventas', label: 'Ventas cerradas', unit: 'n', a: A.ventas, b: B.ventas },
      { key: 'cierre', label: 'Tasa de cierre', unit: '%', a: A.cierre, b: B.cierre, rate: true },
      { key: 'ticket', label: 'Ticket promedio', unit: 'Q2', a: A.ticket, b: B.ticket },
      { key: 'roi', label: 'ROI (inversión ÷ venta)', unit: '%2', a: A.roi, b: B.roi, rate: true, higherIsBetter: false },
      { key: 'cpl', label: 'Costo por lead (CPL)', unit: 'Q2', a: A.cpl, b: B.cpl, higherIsBetter: false },
      { key: 'cpa', label: 'Costo por venta (CPA)', unit: 'Q2', a: A.cpa, b: B.cpa, higherIsBetter: false },
      { key: 'alcance', label: 'Alcance', unit: 'n', a: A.alcance, b: B.alcance, estimado: true },
      { key: 'impresiones', label: 'Impresiones', unit: 'n', a: A.impresiones, b: B.impresiones, estimado: true },
      { key: 'clics', label: 'Clics', unit: 'n', a: A.clics, b: B.clics, estimado: true },
      { key: 'ctr', label: 'CTR (clics ÷ impresiones)', unit: '%', a: A.ctr, b: B.ctr, rate: true, estimado: true },
      { key: 'cpc', label: 'Costo por clic (CPC)', unit: 'Q2', a: A.cpc, b: B.cpc, higherIsBetter: false, estimado: true },
    ];
    const lines = all.filter((l) => l.a !== undefined || l.b !== undefined);

    const chA = roiByChannel(ds, scope, range).rows;
    const chB = new Map(roiByChannel(ds, scope, cmp).rows.map((r) => [r.canal, r]));
    const redes = chA.map((r) => ({ canal: r.canal, a: r, b: chB.get(r.canal) }));
    const brB = new Map(metaBranches(ds, scope, cmp).map((r) => [r.canal, r]));
    const ramal = metaBranches(ds, scope, range).map((r) => ({ canal: r.canal, a: r, b: brB.get(r.canal) }));
    return { lines, redes, ramal, hasB: B.hasData };
  }, [ds, scope, range, cmp]);

  if (!cmp || !data) return null;

  const aLabel = labelRange(range);
  const bLabel = labelRange(cmp);

  return (
    <Card className="mb-3">
      <CardHeader
        title="Comparativa"
        subtitle={`${aLabel} frente a ${bLabel}. Cambia el mes o con qué comparar en la barra de filtros.`}
        actions={
          <Segmented
            size="sm"
            label="Ver"
            value={view}
            onChange={setView}
            options={[
              { value: 'indicadores', label: 'Indicadores' },
              { value: 'redes', label: 'Por red' },
            ]}
          />
        }
      />
      {!data.hasB ? (
        <p className="px-5 py-6 text-[12.5px] text-muted">No hay datos de {bLabel}. Elige otro mes en "Comparar con".</p>
      ) : view === 'indicadores' ? (
        <div className="scroll-thin mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-2 font-medium">Indicador</th>
                <th className="px-3 py-2 text-right font-medium text-ink">{aLabel}</th>
                <th className="px-3 py-2 text-right font-medium">{bLabel}</th>
                <th className="px-5 py-2 text-right font-medium">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.key} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2 text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {l.label}
                      {glossText(l.key) && <InfoTip text={glossText(l.key)} />}
                    </span>
                    {l.estimado && <span className="ml-1 text-[11px] text-faint">estimado</span>}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-ink">{fmt(l.a, l.unit)}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">{fmt(l.b, l.unit)}</td>
                  <td className="px-5 py-2 text-right">
                    <Delta value={change(l)} kind={l.rate ? 'pp' : 'rel'} higherIsBetter={l.higherIsBetter ?? true} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scroll-thin mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-2 font-medium">Red</th>
                <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Leads<InfoTip text={glossText('consultas')} /></span></th>
                <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Cerrados<InfoTip text={glossText('ventas')} /></span></th>
                <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Cierre<InfoTip text={glossText('cierre')} /></span></th>
                <th className="px-3 py-2 text-right font-medium">Inversión</th>
                <th className="px-5 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Costo por venta<InfoTip text={glossText('cpa')} /></span></th>
              </tr>
            </thead>
            <tbody>
              {data.redes.map(({ canal, a, b }) => {
                const isMeta = canal === META_LABEL && data.ramal.length > 1;
                return (
                  <Fragment key={canal}>
                    <tr className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2.5">
                        <BranchName name={canal} open={metaOpen} onToggle={isMeta ? () => setMetaOpen((v) => !v) : undefined} count={isMeta ? data.ramal.length : undefined} />
                      </td>
                      <Pair a={a.consultas} b={b?.consultas} unit="n" />
                      <Pair a={a.ventas} b={b?.ventas} unit="n" />
                      <Pair a={a.cierre} b={b?.cierre} unit="%" rate />
                      <Pair a={a.inversion} b={b?.inversion} unit="Q" higherIsBetter={false} />
                      <Pair a={a.cpa} b={b?.cpa} unit="Q2" higherIsBetter={false} last />
                    </tr>
                    {isMeta &&
                      metaOpen &&
                      data.ramal.map((x, i) => (
                        <tr key={x.canal} className="border-b border-line/40 bg-sunken/50 text-[12px]">
                          <td className="px-5 py-0">
                            <BranchLeaf name={x.canal} last={i === data.ramal.length - 1} />
                          </td>
                          <Pair a={x.a.consultas} b={x.b?.consultas} unit="n" />
                          <Pair a={x.a.ventas} b={x.b?.ventas} unit="n" />
                          <Pair a={x.a.cierre} b={x.b?.cierre} unit="%" rate />
                          <Pair a={x.a.inversion} b={x.b?.inversion} unit="Q" higherIsBetter={false} />
                          <Pair a={x.a.cpa} b={x.b?.cpa} unit="Q2" higherIsBetter={false} last />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="px-5 py-3 text-[11.5px] text-faint">Arriba el valor de {aLabel}; abajo, en gris, el de {bLabel} y el cambio.</p>
        </div>
      )}
      {view === 'indicadores' && data.hasB && data.lines.some((l) => l.estimado) && (
        <div className="px-5 pb-4 pt-2">
          <Tag tone="blue">Alcance, impresiones, clics, CTR y CPC son estimados a partir de la inversión y los leads del Excel</Tag>
        </div>
      )}
    </Card>
  );
}

function change(l: { a?: number; b?: number; rate?: boolean }) {
  if (l.a === undefined || l.b === undefined) return undefined;
  if (l.rate) return l.a - l.b;
  return l.b !== 0 ? (l.a - l.b) / Math.abs(l.b) : undefined;
}

function Pair({ a, b, unit, rate, higherIsBetter = true, last }: { a?: number; b?: number; unit: Unit; rate?: boolean; higherIsBetter?: boolean; last?: boolean }) {
  return (
    <td className={cx('tnum py-2 text-right align-top', last ? 'px-5' : 'px-3')}>
      <div className="font-semibold text-ink">{fmt(a, unit)}</div>
      <div className="mt-0.5 flex items-center justify-end gap-1.5 whitespace-nowrap text-[11.5px] text-faint">
        {fmt(b, unit)}
        <Delta value={change({ a, b, rate })} kind={rate ? 'pp' : 'rel'} size="xs" higherIsBetter={higherIsBetter} />
      </div>
    </td>
  );
}
