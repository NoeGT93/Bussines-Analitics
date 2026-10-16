import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { AnimatedNumber, Card, cx, Delta, InfoTip } from '../ui';
import { Sparkline } from '../charts/Charts';
import type { Unit } from '../../lib/format';

export interface KpiCardProps {
  label: string;
  help: string;
  value?: number;
  unit: Unit;
  delta?: number;
  deltaKind?: 'rel' | 'pp';
  compareLabel?: string;
  spark?: (number | null)[];
  color: string;
  icon?: ReactNode;
  secondary?: ReactNode;
  coverage?: { have: number; total: number };
  onOpen?: () => void;
  pending?: string;
  higherIsBetter?: boolean;
}

export function KpiCard(p: KpiCardProps) {
  const partial = p.coverage && p.coverage.have > 0 && p.coverage.have < p.coverage.total;
  const empty = p.value === undefined;
  const Inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-muted">
          {p.icon && <span className="text-faint">{p.icon}</span>}
          <span className="truncate">{p.label}</span>
          <InfoTip text={p.help} />
        </span>
        {!empty && <Delta value={p.delta} kind={p.deltaKind} higherIsBetter={p.higherIsBetter} />}
      </div>
      <div className="mt-2.5 min-w-0">
        {empty ? (
          <div className="flex h-[26px] items-center text-[13px] text-faint">{p.pending ?? 'Sin datos'}</div>
        ) : (
          <AnimatedNumber value={p.value} unit={p.unit} className="block whitespace-nowrap text-[19px] font-semibold leading-[26px] sm:text-[24px] tracking-[-0.02em] text-ink" />
        )}
        <div className="mt-1.5 truncate text-[11.5px] text-faint">
          {empty ? '\u00a0' : p.secondary ?? (p.delta !== undefined ? p.compareLabel : partial ? `${p.coverage!.have} de ${p.coverage!.total} meses con dato` : 'Sin período anterior comparable')}
        </div>
      </div>
      <div className="mt-3 h-[30px]">{p.spark && !empty && <Sparkline data={p.spark} color={p.color} height={30} />}</div>
    </>
  );
  return (
    <Card as="article" className={cx('group relative min-w-0 transition-shadow', p.onOpen && 'hover:shadow-pop')}>
      {p.onOpen ? (
        <div
          role="button"
          tabIndex={0}
          onClick={p.onOpen}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), p.onOpen!())}
          className="block w-full cursor-pointer rounded-card p-4 text-left"
          aria-label={`${p.label}: ver análisis detallado`}
        >
          {Inner}
          <ChevronRight size={14} className="absolute bottom-3 right-3 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      ) : (
        <div className="p-3.5 sm:p-4">{Inner}</div>
      )}
    </Card>
  );
}
