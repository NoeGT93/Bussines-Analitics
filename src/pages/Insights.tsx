import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Card, PageHeader, Segmented } from '../components/ui';
import { InsightItem, NoData } from '../components/data/Shared';
import { generateInsights, providers, type InsightCategory } from '../lib/insights';
import { labelRange } from '../lib/periods';
import { useScopeRows } from '../lib/hooks';

export function Insights() {
  const { ds, scope, range } = useStore();
  const { hasData, scopeLabel } = useScopeRows();
  const all = useMemo(() => generateInsights({ ds, scope, range }), [ds, scope, range]);
  const cats = ['Todos', ...new Set(all.map((i) => i.category))] as ('Todos' | InsightCategory)[];
  const [cat, setCat] = useState<'Todos' | InsightCategory>('Todos');
  const list = cat === 'Todos' ? all : all.filter((i) => i.category === cat);

  return (
    <>
      <PageHeader
        title="Hallazgos"
        description={`${scopeLabel}, ${labelRange(range)}. Cada hallazgo indica cómo se calculó. Señalan variaciones y coincidencias, no causas.`}
      />
      {!hasData ? (
        <NoData />
      ) : (
        <>
          {cats.length > 2 && (
            <div className="scroll-thin mb-3 overflow-x-auto pb-1">
              <Segmented value={cat} onChange={setCat} label="Categoría" options={cats.map((c) => ({ value: c, label: c }))} />
            </div>
          )}
          {list.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {list.map((i) => (
                <Card key={i.id} as="article" className="p-5">
                  <div className="mb-2 text-[11.5px] font-medium text-faint">{i.category}</div>
                  <InsightItem ins={i} showBasis />
                </Card>
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-line px-5 py-10 text-center text-[13px] text-muted">
              No hay hallazgos con los datos del período. Amplía el rango para tener al menos dos meses.
            </p>
          )}
          <p className="mt-5 text-[11.5px] text-faint">
            Motor activo: {providers.map((p) => p.label).join(', ')}. La arquitectura admite agregar un proveedor de análisis con IA; sus resultados se mostrarían etiquetados por separado.
          </p>
        </>
      )}
    </>
  );
}
