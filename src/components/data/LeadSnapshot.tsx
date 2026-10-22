import { useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Button, Card, CardHeader, cx, Empty, Select, Tag } from '../ui';
import { fmt } from '../../lib/format';
import { rowsFor, totalOf } from '../../lib/metrics';
import type { LeadSnapshot, LeadSnapshotRow } from '../../types';
import { useChartColors } from '../charts/kit';

export function formatDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function totals(rows: LeadSnapshotRow[]) {
  const sum = (k: keyof Omit<LeadSnapshotRow, 'fuente'>) => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) : undefined;
  };
  return { dia: sum('dia'), acumulado: sum('acumulado'), cerrados: sum('cerrados') };
}

/** Tarjeta con el último corte de leads (o el elegido) */
export function LeadSnapshotCard() {
  const { ds, scope, range, setPage } = useStore();
  const c = useChartColors();
  const snaps = useMemo(
    () => ds.leadSnapshots.filter((s) => scope === 'consolidado' || s.companyId === scope).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [ds.leadSnapshots, scope],
  );
  const [sel, setSel] = useState<string | null>(null);
  const snap = snaps.find((s) => s.id === sel) ?? snaps[0];
  const monthlyCierre = useMemo(() => totalOf(rowsFor(ds, scope, range), 'cierre').value, [ds, scope, range]);
  if (!snap) return null;
  const t = totals(snap.rows);
  const cierre = t.cerrados !== undefined && t.acumulado ? t.cerrados / t.acumulado : undefined;
  const maxDia = Math.max(1, ...snap.rows.map((r) => r.dia ?? 0));
  const lowClose = cierre !== undefined && monthlyCierre !== undefined && cierre < monthlyCierre / 2;

  return (
    <Card>
      <CardHeader
        title="Corte de leads"
        subtitle={`${formatDay(snap.fecha)}${snap.desde ? `. Acumulado desde ${formatDay(snap.desde)}` : ''}`}
        help="Reporte diario por fuente: leads que entraron ese día, acumulados a la fecha y cerrados. Se registra en Gestión de datos → Corte de leads."
        actions={
          snaps.length > 1 ? (
            <Select value={snap.id} onChange={setSel} label="Fecha del corte" className="h-8 text-[12px]">
              {snaps.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(`${s.fecha}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })}
                </option>
              ))}
            </Select>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setPage('data')}>
              <Plus size={13} /> Nuevo corte
            </Button>
          )
        }
      />
      <div className="mt-3 grid grid-cols-3 gap-2 px-5">
        {[
          ['En el día', t.dia],
          ['A la fecha', t.acumulado],
          ['Cerrados', t.cerrados],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-sunken px-3 py-2.5">
            <div className="text-[11.5px] text-faint">{l}</div>
            <div className="tnum text-[18px] font-semibold text-ink">{fmt(v as number | undefined)}</div>
          </div>
        ))}
      </div>
      <div className="scroll-thin mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="px-5 py-2 font-medium">Fuente</th>
              <th className="w-[28%] px-3 py-2 font-medium">En el día</th>
              <th className="px-3 py-2 text-right font-medium">A la fecha</th>
              <th className="px-3 py-2 text-right font-medium">Cerrados</th>
              <th className="px-5 py-2 text-right font-medium">% cierre</th>
            </tr>
          </thead>
          <tbody>
            {[...snap.rows]
              .sort((a, b) => (b.dia ?? 0) - (a.dia ?? 0))
              .map((r, i) => (
                <tr key={r.fuente} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2 font-medium text-ink">{r.fuente}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${((r.dia ?? 0) / maxDia) * 100}%`, background: c.series[i % c.series.length] }} />
                      </div>
                      <span className="tnum w-8 text-right text-ink">{fmt(r.dia)}</span>
                    </div>
                  </td>
                  <td className="tnum px-3 py-2 text-right text-ink">{fmt(r.acumulado)}</td>
                  <td className="tnum px-3 py-2 text-right text-ink">{fmt(r.cerrados)}</td>
                  <td className="tnum px-5 py-2 text-right text-ink">{r.cerrados !== undefined && r.acumulado ? fmt(r.cerrados / r.acumulado, '%') : '—'}</td>
                </tr>
              ))}
            <tr className="border-t border-line bg-sunken/50 font-medium">
              <td className="px-5 py-2 text-ink">Total</td>
              <td className="tnum px-3 py-2 text-right text-ink">{fmt(t.dia)}</td>
              <td className="tnum px-3 py-2 text-right text-ink">{fmt(t.acumulado)}</td>
              <td className="tnum px-3 py-2 text-right text-ink">{fmt(t.cerrados)}</td>
              <td className="tnum px-5 py-2 text-right text-ink">{fmt(cierre, '%')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {lowClose && (
        <p className="mx-5 my-3 flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-[12px] leading-snug text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          El cierre de este corte ({fmt(cierre, '%')}) es menos de la mitad del cierre de los reportes mensuales ({fmt(monthlyCierre, '%')}). Puede que los cerrados aún no estén al día o que se cuenten
          de otra forma.
        </p>
      )}
      <p className="px-5 pb-4 pt-1 text-[11.5px] text-faint">Fuente: {snap.source.file ?? 'captura manual'}. Las fuentes del corte (formularios, mensajes directos) son más detalladas que las redes del reporte mensual.</p>
    </Card>
  );
}

/* Editor ------------------------------------------------------------------------- */

function NumInput({ value, onChange, label }: { value?: number; onChange: (v?: number) => void; label: string }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value ?? ''}
      placeholder="—"
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d]/g, '');
        onChange(t === '' ? undefined : Number(t));
      }}
      className="tnum h-8 w-full rounded-md border border-line bg-surface px-2 text-right text-[12.5px] text-ink outline-none focus:border-electric"
    />
  );
}

export function LeadSnapshotEditor() {
  const { ds, scope, saveSnapshot, deleteSnapshot, notify } = useStore();
  const companyId = scope === 'consolidado' ? ds.companies[0].id : scope;
  const list = ds.leadSnapshots.filter((s) => s.companyId === companyId).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const last = list[0];
  const today = new Date().toISOString().slice(0, 10);
  const blank = (): LeadSnapshot => ({
    id: '',
    companyId,
    fecha: today,
    desde: last?.desde,
    rows: (last?.rows ?? [{ fuente: 'Instagram' }, { fuente: 'Facebook' }, { fuente: 'WhatsApp' }, { fuente: 'TikTok' }]).map((r) => ({ fuente: r.fuente })),
    source: { kind: 'manual', at: new Date().toISOString() },
  });
  const [draft, setDraft] = useState<LeadSnapshot>(blank);
  const setRow = (i: number, patch: Partial<LeadSnapshotRow>) => setDraft((d) => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const save = () => {
    const rows = draft.rows.filter((r) => r.fuente.trim() && (r.dia !== undefined || r.acumulado !== undefined || r.cerrados !== undefined));
    if (!rows.length) {
      notify('Escribe al menos un valor.', 'error');
      return;
    }
    const bad = rows.find((r) => r.cerrados !== undefined && r.acumulado !== undefined && r.cerrados > r.acumulado);
    if (bad) {
      notify(`${bad.fuente}: los cerrados no pueden superar a los leads a la fecha.`, 'error');
      return;
    }
    const id = `${companyId}:${draft.fecha}`;
    saveSnapshot({ ...draft, id, rows: rows.map((r) => ({ ...r, fuente: r.fuente.trim() })), source: { kind: 'manual', file: 'Captura manual', at: new Date().toISOString() } });
    notify(list.some((s) => s.id === id) ? 'Corte actualizado.' : 'Corte guardado.');
    setDraft(blank());
  };

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader title="Registrar un corte" subtitle="Copia los números del reporte diario. Si ya existe un corte en esa fecha, se reemplaza." />
        <div className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-2">
          <label className="text-[12px] text-muted">
            Fecha del corte
            <input type="date" value={draft.fecha} onChange={(e) => setDraft((d) => ({ ...d, fecha: e.target.value }))} className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink" />
          </label>
          <label className="text-[12px] text-muted">
            “A la fecha” cuenta desde (opcional)
            <input
              type="date"
              value={draft.desde ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, desde: e.target.value || undefined }))}
              className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink"
            />
          </label>
        </div>
        <div className="scroll-thin mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-2 font-medium">Fuente</th>
                <th className="w-24 px-2 py-2 text-right font-medium">En el día</th>
                <th className="w-24 px-2 py-2 text-right font-medium">A la fecha</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Cerrados</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((r, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="px-5 py-1.5">
                    <input
                      aria-label="Fuente"
                      value={r.fuente}
                      onChange={(e) => setRow(i, { fuente: e.target.value })}
                      className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-electric"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <NumInput label={`${r.fuente} en el día`} value={r.dia} onChange={(v) => setRow(i, { dia: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <NumInput label={`${r.fuente} a la fecha`} value={r.acumulado} onChange={(v) => setRow(i, { acumulado: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <NumInput label={`${r.fuente} cerrados`} value={r.cerrados} onChange={(v) => setRow(i, { cerrados: v })} />
                  </td>
                  <td className="px-2">
                    <Button size="icon" className="h-7 w-7" aria-label={`Quitar ${r.fuente}`} onClick={() => setDraft((d) => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }))}>
                      <Trash2 size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <Button size="sm" variant="outline" onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, { fuente: '' }] }))}>
            <Plus size={13} /> Agregar fuente
          </Button>
          <Button size="sm" variant="primary" className="ml-auto" onClick={save}>
            <Save size={13} /> Guardar corte
          </Button>
        </div>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Cortes guardados" />
        {list.length ? (
          <div className="mt-2 divide-y divide-line">
            {list.map((s) => {
              const t = totals(s.rows);
              return (
                <div key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink first-letter:uppercase">{formatDay(s.fecha)}</div>
                    <div className="tnum text-[11.5px] text-faint">
                      {fmt(t.dia)} en el día, {fmt(t.acumulado)} a la fecha, {fmt(t.cerrados)} cerrados
                    </div>
                  </div>
                  <Tag tone={s.source.kind === 'manual' ? 'neutral' : 'blue'}>{s.source.kind === 'manual' ? 'Manual' : 'Reporte'}</Tag>
                  <Button size="icon" className="h-7 w-7" aria-label="Editar corte" onClick={() => setDraft({ ...s, rows: s.rows.map((r) => ({ ...r })) })}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="icon"
                    className={cx('h-7 w-7')}
                    aria-label="Eliminar corte"
                    onClick={() => confirm('¿Eliminar este corte?') && deleteSnapshot(s.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty compact title="Sin cortes guardados" />
        )}
      </Card>
    </div>
  );
}
