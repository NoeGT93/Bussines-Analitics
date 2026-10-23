import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, GitCompareArrows } from 'lucide-react';
import { availableRange, useStore } from '../../store/useStore';
import { Segmented, Select, cx } from '../ui';
import { compareRangeFor, labelLong, labelRange, monthsBetween, type CompareMode } from '../../lib/periods';
import type { ReactNode } from 'react';

/**
 * Filtros globales:
 *  - Vista "Un mes": navegar mes por mes (◀ ▶ o lista).
 *  - Vista "Varios meses": rango con accesos rápidos.
 *  - Comparar con: período anterior, mismo período del año anterior, otro período o sin comparar.
 */
export function FilterBar({ rangePicker }: { rangePicker: ReactNode }) {
  const { ds, scope, range, setRange, compare, compareCustom, setCompare } = useStore();
  const avail = availableRange(ds, scope);
  const months = useMemo(() => (avail ? monthsBetween(avail) : []), [avail?.from, avail?.to]);
  const single = range.from === range.to;
  const idx = months.indexOf(range.to);

  const goMonth = (p: string) => setRange({ from: p, to: p }, 'month');
  const step = (d: number) => {
    const i = idx < 0 ? months.length - 1 : idx + d;
    if (months[i]) goMonth(months[i]);
  };
  const cmp = compareRangeFor(range, compare, compareCustom);
  const cmpHasData = cmp ? ds.monthly.some((m) => (scope === 'consolidado' || m.companyId === scope) && m.period >= cmp.from && m.period <= cmp.to) : true;

  const setMode = (v: 'mes' | 'rango') => {
    if (v === 'mes') goMonth(months[months.length - 1] ?? range.to);
    else if (avail) setRange(avail, 'all');
  };

  const pickCompare = (v: string) => {
    if (v === 'custom') {
      // Por defecto: el mes (o rango de igual duración) inmediatamente anterior
      const base = compareRangeFor(range, 'prev');
      setCompare('custom', compareCustom ?? base);
    } else setCompare(v as CompareMode);
  };

  return (
    <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-2 px-3 pb-2.5 sm:px-5 lg:px-8">
      <Segmented
        size="sm"
        label="Vista"
        value={single ? 'mes' : 'rango'}
        onChange={setMode}
        options={[
          { value: 'mes', label: 'Un mes' },
          { value: 'rango', label: 'Varios meses' },
        ]}
      />

      {single && months.length ? (
        <div className="flex items-center gap-1" role="group" aria-label="Mes seleccionado">
          <StepButton onClick={() => step(-1)} disabled={idx <= 0} label="Mes anterior">
            <ChevronLeft size={16} />
          </StepButton>
          <Select label="Mes" value={range.to} onChange={goMonth} className="h-9 min-w-[150px] font-medium">
            {months.map((m) => (
              <option key={m} value={m}>
                {labelLong(m)}
              </option>
            ))}
          </Select>
          <StepButton onClick={() => step(1)} disabled={idx < 0 || idx >= months.length - 1} label="Mes siguiente">
            <ChevronRight size={16} />
          </StepButton>
        </div>
      ) : (
        rangePicker
      )}

      <div className="flex flex-wrap items-center gap-1.5 sm:ml-2">
        <GitCompareArrows size={15} className="text-muted" aria-hidden />
        <Select label="Comparar con" value={compare} onChange={pickCompare} className="h-9">
          <option value="prev">{single ? 'Mes anterior' : 'Período anterior'}</option>
          <option value="yoy">{single ? 'Mismo mes del año pasado' : 'Mismo período del año pasado'}</option>
          <option value="custom">{single ? 'Otro mes…' : 'Otro período…'}</option>
          <option value="none">Sin comparar</option>
        </Select>
        {compare === 'custom' && compareCustom && (
          <>
            <Select label="Comparar desde" value={compareCustom.from} onChange={(v) => setCompare('custom', { from: v, to: single ? v : v > compareCustom.to ? v : compareCustom.to })} className="h-9">
              {months.map((m) => (
                <option key={m} value={m}>
                  {labelLong(m)}
                </option>
              ))}
            </Select>
            {!single && (
              <Select label="Comparar hasta" value={compareCustom.to} onChange={(v) => setCompare('custom', { from: compareCustom.from < v ? compareCustom.from : v, to: v })} className="h-9">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {labelLong(m)}
                  </option>
                ))}
              </Select>
            )}
          </>
        )}
        {cmp && (
          <span className={cx('text-[12px]', cmpHasData ? 'text-muted' : 'text-warn')}>
            {cmpHasData ? `${labelRange(range)} vs. ${labelRange(cmp)}` : `Sin datos de ${labelRange(cmp)} para comparar`}
          </span>
        )}
      </div>
    </div>
  );
}

function StepButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
