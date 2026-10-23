import { useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useCompareRange, useScopeRows, useTrendRange } from '../lib/hooks';
import { buildFindings, type Finding } from '../lib/findings';
import { labelRange } from '../lib/periods';
import { Card, cx, PageHeader, Segmented } from '../components/ui';
import { NoData } from '../components/data/Shared';

const TONE: Record<Finding['tone'], { icon: JSX.Element; ring: string; chip: string; label: string }> = {
  good: { icon: <CircleCheck size={18} />, ring: 'text-up', chip: 'bg-up/10 text-up', label: 'Va bien' },
  bad: { icon: <CircleAlert size={18} />, ring: 'text-down', chip: 'bg-down/10 text-down', label: 'Atención' },
  info: { icon: <Info size={18} />, ring: 'text-electric', chip: 'bg-electric/10 text-electric', label: 'Para saber' },
};

export function Findings() {
  const { ds, scope, range } = useStore();
  const { hasData, scopeLabel } = useScopeRows();
  const { cmp } = useCompareRange();
  const { trend } = useTrendRange();
  const all = useMemo(() => buildFindings(ds, scope, range, cmp, trend), [ds, scope, range, cmp, trend]);
  const [filtro, setFiltro] = useState<'todos' | Finding['tone']>('todos');
  const list = filtro === 'todos' ? all : all.filter((f) => f.tone === filtro);
  const count = (t: Finding['tone']) => all.filter((f) => f.tone === t).length;

  return (
    <>
      <PageHeader
        title="Hallazgos"
        description={`${scopeLabel}, ${labelRange(range)}${cmp ? `, comparado con ${labelRange(cmp)}` : ''}. Lo más importante que dicen los datos, en palabras sencillas: qué pasó, qué significa y qué hacer.`}
      />
      {!hasData ? (
        <NoData />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented
              label="Filtrar hallazgos"
              value={filtro}
              onChange={setFiltro}
              options={[
                { value: 'todos', label: `Todos (${all.length})` },
                { value: 'bad', label: `Atención (${count('bad')})` },
                { value: 'good', label: `Va bien (${count('good')})` },
                { value: 'info', label: `Para saber (${count('info')})` },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((f, i) => {
              const tone = TONE[f.tone];
              return (
                <Card key={f.id} as="article" className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className={cx('mt-0.5 shrink-0', tone.ring)}>{tone.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                        <span className="font-semibold text-faint">#{all.indexOf(f) + 1 || i + 1}</span>
                        <span className={cx('rounded-full px-2 py-0.5 font-medium', tone.chip)}>{tone.label}</span>
                        <span className="text-faint">{f.tema}</span>
                      </div>
                      <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{f.title}</h3>
                    </div>
                    <span className="tnum shrink-0 rounded-lg bg-sunken px-2.5 py-1 text-[13px] font-semibold text-ink">{f.figure}</span>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-muted">
                    <b className="font-semibold text-ink">Qué significa: </b>
                    {f.meaning}
                  </p>
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-electric/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
                    <ArrowRight size={15} className="mt-0.5 shrink-0 text-electric" />
                    <span>
                      <b className="font-semibold">Qué hacer: </b>
                      {f.action}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
          {all.length < 5 && (
            <p className="mt-4 text-[12.5px] text-muted">
              Con este período hay pocos datos para comparar. Elige "Varios meses" o "Comparar con" un mes con datos para ver más hallazgos.
            </p>
          )}
        </>
      )}
    </>
  );
}
