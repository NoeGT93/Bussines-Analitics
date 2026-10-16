import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { rowsFor, type Row } from './metrics';
import { previousRange } from './periods';

/** Datos derivados del alcance y período seleccionados, memorizados */
export function useScopeRows(): { rows: Row[]; prevRows: Row[]; hasData: boolean; scopeLabel: string } {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  const range = useStore((s) => s.range);
  return useMemo(() => {
    const rows = rowsFor(ds, scope, range);
    const prevRows = rowsFor(ds, scope, previousRange(range));
    const hasData = rows.some((r) => Object.keys(r.values).length > 0);
    const scopeLabel = scope === 'consolidado' ? 'Vista consolidada' : ds.companies.find((c) => c.id === scope)?.name ?? '';
    return { rows, prevRows, hasData, scopeLabel };
  }, [ds, scope, range]);
}

export function useCompanyHasAnyData() {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  return useMemo(() => {
    const ids = scope === 'consolidado' ? ds.companies.map((c) => c.id) : [scope];
    return ds.monthly.some((m) => ids.includes(m.companyId));
  }, [ds, scope]);
}
