import { useMemo } from 'react';
import { dataMonths, resolveCursor, useStore } from '../store/useStore';
import type { Period } from '../types';

/** Mes que destacan las tarjetas: el último con datos del rango */
export function useCursor(): { period: Period | null; months: Period[]; index: number } {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  const range = useStore((s) => s.range);
  const cursor = useStore((s) => s.cursor);
  return useMemo(() => {
    const months = dataMonths(ds, scope, range);
    if (!months.length) return { period: null, months, index: -1 };
    const period = resolveCursor(months, cursor);
    return { period, months, index: months.indexOf(period) };
  }, [ds, scope, range, cursor]);
}
