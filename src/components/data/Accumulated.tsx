import { useMemo, useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { roiByMonth } from '../../lib/roi';
import { fmt } from '../../lib/format';
import { labelLong } from '../../lib/periods';
import { Card, cx } from '../ui';

/**
 * Total invertido y total vendido acumulados del período seleccionado,
 * con el detalle mes a mes para ver de dónde sale cada total.
 */
export function AccumulatedCard() {
  const { ds, scope, range } = useStore();
  const [open, setOpen] = useState(false);

  const data = useMemo(() => {
    const months = roiByMonth(ds, scope, range).filter((m) => m.inversion !== undefined || m.ingresos !== undefined);
    let accInv = 0;
    let accVenta = 0;
    const rows = months.map((m) => {
      accInv += m.inversion ?? 0;
      accVenta += m.ingresos ?? 0;
      return { period: m.period, inversion: m.inversion, venta: m.ingresos, accInv, accVenta };
    });
    const conInversion = months.filter((m) => m.inversion !== undefined).length;
    const conVenta = months.filter((m) => m.ingresos !== undefined).length;
    return { rows, inversion: accInv, venta: accVenta, conInversion, conVenta };
  }, [ds, scope, range]);

  if (!data.rows.length) return null;

  const first = data.rows[0].period;
  const last = data.rows[data.rows.length - 1].period;
  const periodo = first === last ? labelLong(first) : `${labelLong(first)} a ${labelLong(last)}`;
  const resultado = data.venta - data.inversion;
  const porQuetzal = data.inversion > 0 ? data.venta / data.inversion : undefined;
  const faltaInversion = data.conInversion < data.rows.length;

  return (
    <Card className="mb-3 overflow-hidden">
      <div className="px-5 pt-4">
        <div className="text-[13.5px] font-semibold text-ink">Acumulado del período</div>
        <div className="mt-0.5 text-[12.5px] text-muted">
          {periodo} · {data.rows.length} {data.rows.length === 1 ? 'mes' : 'meses'}. Suma de todos los meses del período seleccionado arriba.
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-3">
        <Figure
          label="Total invertido en publicidad"
          value={fmt(data.inversion, 'Q')}
          note={faltaInversion ? `Registrada en ${data.conInversion} de ${data.rows.length} meses` : `Suma de la inversión de ${data.conInversion} meses`}
          warn={faltaInversion}
        />
        <Figure label="Total vendido" value={fmt(data.venta, 'Q')} note={`Suma de las ventas de ${data.conVenta} meses`} />
        <Figure
          label="Venta menos inversión"
          value={fmt(resultado, 'Q')}
          tone={resultado >= 0 ? 'up' : 'down'}
          note={porQuetzal !== undefined ? `Por cada Q 1 invertido se vendieron Q ${porQuetzal.toFixed(2)}` : 'Sin inversión registrada'}
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-[12.5px] font-medium text-electric hover:bg-sunken"
      >
        {open ? 'Ocultar detalle mes a mes' : 'Ver de dónde sale cada total (mes a mes)'}
        <ChevronDown size={15} className={cx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="scroll-thin overflow-x-auto border-t border-line">
          <table className="w-full min-w-[620px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-2 font-medium">Mes</th>
                <th className="px-3 py-2 text-right font-medium">Inversión del mes</th>
                <th className="px-3 py-2 text-right font-medium">Venta del mes</th>
                <th className="px-3 py-2 text-right font-medium">Inversión acumulada</th>
                <th className="px-5 py-2 text-right font-medium">Venta acumulada</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.period} className="border-b border-line/60">
                  <td className="px-5 py-2 text-ink">{labelLong(r.period)}</td>
                  <td className="tnum px-3 py-2 text-right text-ink">{fmt(r.inversion, 'Q')}</td>
                  <td className="tnum px-3 py-2 text-right text-ink">{fmt(r.venta, 'Q')}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">{fmt(r.accInv, 'Q')}</td>
                  <td className="tnum px-5 py-2 text-right text-muted">{fmt(r.accVenta, 'Q')}</td>
                </tr>
              ))}
              <tr className="bg-sunken font-semibold">
                <td className="px-5 py-2.5 text-ink">Total</td>
                <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(data.inversion, 'Q')}</td>
                <td className="tnum px-3 py-2.5 text-right text-ink">{fmt(data.venta, 'Q')}</td>
                <td className="px-3 py-2.5" />
                <td className="px-5 py-2.5" />
              </tr>
            </tbody>
          </table>
          <p className="flex items-start gap-1.5 px-5 py-3 text-[11.5px] leading-snug text-faint">
            <Info size={13} className="mt-px shrink-0" />
            La inversión es lo registrado en el reporte mensual (o escrito en ROI y costos). La venta menos inversión no descuenta renta, planilla ni otros gastos del gimnasio.
          </p>
        </div>
      )}
    </Card>
  );
}

function Figure({ label, value, note, tone, warn }: { label: string; value: string; note: string; tone?: 'up' | 'down'; warn?: boolean }) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={cx('tnum mt-1.5 whitespace-nowrap text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink')}>{value}</div>
      <div className={cx('mt-1 text-[12px]', warn ? 'text-warn' : 'text-faint')}>{note}</div>
    </div>
  );
}
