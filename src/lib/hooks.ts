import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { rowsFor, type Row } from './metrics';
import { compareRangeFor, labelRange } from './periods';
import type { DateRange } from '../types';

/** Período de comparación elegido en los filtros y su etiqueta ("vs. Agosto 2026") */
export function useCompareRange(): { cmp: DateRange | null; label: string } {
  const range = useStore((s) => s.range);
  const compare = useStore((s) => s.compare);
  const custom = useStore((s) => s.compareCustom);
  return useMemo(() => {
    const cmp = compareRangeFor(range, compare, custom);
    return { cmp, label: cmp ? `vs. ${labelRange(cmp)}` : 'Sin comparación' };
  }, [range, compare, custom]);
}

/** Datos derivados del alcance y período seleccionados, memorizados */
export function useScopeRows(): { rows: Row[]; prevRows: Row[]; hasData: boolean; scopeLabel: string } {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  const range = useStore((s) => s.range);
  const { cmp } = useCompareRange();
  return useMemo(() => {
    const rows = rowsFor(ds, scope, range);
    const prevRows = cmp ? rowsFor(ds, scope, cmp) : [];
    const hasData = rows.some((r) => Object.keys(r.values).length > 0);
    const scopeLabel = scope === 'consolidado' ? 'Vista consolidada' : ds.companies.find((c) => c.id === scope)?.name ?? '';
    return { rows, prevRows, hasData, scopeLabel };
  }, [ds, scope, range, cmp]);
}

export function useCompanyHasAnyData() {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  return useMemo(() => {
    const ids = scope === 'consolidado' ? ds.companies.map((c) => c.id) : [scope];
    return ds.monthly.some((m) => ids.includes(m.companyId));
  }, [ds, scope]);
}

/**
 * Meses que muestran los gráficos de evolución. Con un solo mes seleccionado se muestran
 * todos los meses con datos y se resalta el elegido, para que la tendencia tenga contexto.
 */
export function useTrendRange(): { trend: DateRange; highlight: string | null; single: boolean } {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  const range = useStore((s) => s.range);
  return useMemo(() => {
    const single = range.from === range.to;
    if (!single) return { trend: range, highlight: null, single };
    const ids = scope === 'consolidado' ? ds.companies.map((c) => c.id) : [scope];
    const ps = ds.monthly.filter((m) => ids.includes(m.companyId)).map((m) => m.period).sort();
    const trend = ps.length ? { from: ps[0] < range.from ? ps[0] : range.from, to: ps[ps.length - 1] > range.to ? ps[ps.length - 1] : range.to } : range;
    return { trend, highlight: range.from, single };
  }, [ds, scope, range]);
}
