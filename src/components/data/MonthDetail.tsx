import { useMemo } from 'react';
import { FileSpreadsheet, PencilLine } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Drawer, Delta, Tag } from '../ui';
import { METRICS, rowsFor, totalOf, type SeriesMetric } from '../../lib/metrics';
import { fmt } from '../../lib/format';
import { labelLong, shift } from '../../lib/periods';

const ORDER: SeriesMetric[] = ['ingresos', 'ventas', 'ticket', 'visitas', 'clics', 'consultas', 'conversion', 'cierre', 'tasaConsulta', 'clientesNuevos', 'clientesRecurrentes'];

export function MonthDetail() {
  const { detail, openDetail, ds, scope, range, setPage } = useStore();
  const data = useMemo(() => {
    if (!detail) return null;
    const [row] = rowsFor(ds, scope, { from: detail.period, to: detail.period });
    const [prev] = rowsFor(ds, scope, { from: shift(detail.period, -1), to: shift(detail.period, -1) });
    const rangeRows = rowsFor(ds, scope, range);
    const goals = ds.goals.filter((g) => g.period === detail.period && (scope === 'consolidado' || g.companyId === scope));
    const channels = ds.channels.filter((c) => c.period === detail.period && (scope === 'consolidado' || c.companyId === scope));
    return { row, prev, rangeRows, goals, channels };
  }, [detail, ds, scope, range]);

  return (
    <Drawer
      open={!!detail}
      onClose={() => openDetail(null)}
      title={detail ? labelLong(detail.period) : ''}
      subtitle={scope === 'consolidado' ? 'Vista consolidada' : ds.companies.find((c) => c.id === scope)?.name}
    >
      {data && (
        <div className="space-y-6">
          {Object.keys(data.row.values).length === 0 ? (
            <p className="text-[13px] text-muted">No hay registros para este mes.</p>
          ) : (
            <section>
              <div className="divide-y divide-line rounded-xl border border-line">
                {ORDER.filter((m) => data.row.values[m] !== undefined).map((m) => {
                  const def = METRICS[m];
                  const v = data.row.values[m]!;
                  const p = data.prev?.values[m];
                  const isRate = def.unit === '%';
                  const delta = p !== undefined ? (isRate ? v - p : p ? (v - p) / p : undefined) : undefined;
                  const avg = totalOf(data.rangeRows, m);
                  const avgVal = avg.value !== undefined ? (def.ratio ? avg.value : avg.value / Math.max(1, avg.coverage.have)) : undefined;
                  const highlight = detail?.metric === m;
                  return (
                    <div key={m} className={highlight ? 'bg-electric/5 px-3.5 py-2.5' : 'px-3.5 py-2.5'}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12.5px] text-muted">{def.label}</span>
                        <span className="tnum text-[14px] font-semibold text-ink">{fmt(v, def.unit)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px] text-faint">
                        <span>
                          {avgVal !== undefined && `${def.ratio ? 'Acumulado' : 'Promedio'} del rango: ${fmt(avgVal, def.unit)}`}
                        </span>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          vs. mes anterior <Delta value={delta} kind={isRate ? 'pp' : 'rel'} size="xs" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {data.goals.length > 0 && (
            <section>
              <h4 className="mb-2 text-[12.5px] font-semibold text-ink">Metas del mes</h4>
              <div className="space-y-2">
                {data.goals.map((g) => {
                  const v = data.row.values[g.metric];
                  const pctDone = v !== undefined ? v / g.target : undefined;
                  return (
                    <div key={g.id} className="rounded-xl border border-line p-3">
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-muted">{METRICS[g.metric].label}</span>
                        <span className="tnum text-ink">
                          {fmt(v, METRICS[g.metric].unit)} / {fmt(g.target, METRICS[g.metric].unit)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full bg-electric" style={{ width: `${Math.min(100, (pctDone ?? 0) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-right text-[11.5px] text-faint">{fmt(pctDone, '%')} de cumplimiento</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {data.channels.length > 0 && (
            <section>
              <h4 className="mb-2 text-[12.5px] font-semibold text-ink">Canales del mes</h4>
              <div className="divide-y divide-line rounded-xl border border-line text-[12.5px]">
                {data.channels.map((c) => (
                  <div key={c.id} className="flex justify-between px-3.5 py-2">
                    <span className="text-muted">{c.canal}</span>
                    <span className="tnum text-ink">
                      {fmt(c.ventas)} ventas · {fmt(c.ingresos, 'Q')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.row.records.length > 0 && (
            <section>
              <h4 className="mb-2 text-[12.5px] font-semibold text-ink">Origen del dato</h4>
              <div className="space-y-2">
                {data.row.records.map((r) => (
                  <div key={r.id} className="flex items-start gap-2.5 rounded-xl bg-sunken p-3 text-[12px]">
                    {r.source.kind === 'manual' ? <PencilLine size={14} className="mt-0.5 text-muted" /> : <FileSpreadsheet size={14} className="mt-0.5 text-muted" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-ink">
                        {ds.companies.find((c) => c.id === r.companyId)?.name}
                        {r.source.kind === 'demo' && <Tag tone="warn">Demostrativo</Tag>}
                        {r.source.kind === 'manual' && <Tag>Editado a mano</Tag>}
                      </div>
                      <div className="mt-0.5 text-muted">
                        {r.source.file ?? 'Sin archivo'}
                        {r.source.sheet ? `, hoja ${r.source.sheet}` : ''}
                        {r.source.row ? `, fila ${r.source.row}` : ''}
                      </div>
                      <div className="text-faint">{new Date(r.source.at).toLocaleString('es-GT')}</div>
                      {r.conversionArchivo !== undefined && <div className="mt-1 text-faint">Conversión en el archivo: {fmt(r.conversionArchivo, '%')}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => (openDetail(null), setPage('data'))} className="mt-3 text-[12.5px] font-medium text-electric hover:underline">
                Corregir este registro en Gestión de datos
              </button>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
