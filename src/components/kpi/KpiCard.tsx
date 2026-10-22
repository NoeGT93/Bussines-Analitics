import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { AnimatedNumber, Card, cx, Delta, InfoTip } from '../ui';
import { Sparkline, useSparkIndex } from '../charts/Charts';
import { fmt, pct, pp } from '../../lib/format';
import { labelShort } from '../../lib/periods';
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
  sparkPeriods?: string[];
  color: string;
  icon?: ReactNode;
  secondary?: ReactNode;
  coverage?: { have: number; total: number };
  onOpen?: () => void;
  pending?: string;
  higherIsBetter?: boolean;
}

function LiveReadout({ spark, periods, unit, higherIsBetter = true }: { spark: (number | null)[]; periods: string[]; unit: Unit; higherIsBetter?: boolean }) {
  const si = useSparkIndex(spark, periods);
  if (!si) return null;
  const v = spark[si.dataIndex]!;
  const prev = si.prevIndex !== null ? spark[si.prevIndex] : null;
  const isRate = unit === '%';
  const d = prev !== null && prev !== undefined ? (isRate ? v - prev : prev ? (v - prev) / Math.abs(prev) : undefined) : undefined;
  const up = d !== undefined && d > 0.0005;
  const down = d !== undefined && d < -0.0005;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={si.dataIndex}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -10, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
        className="tnum flex items-center gap-1 whitespace-nowrap text-[11px] sm:gap-1.5 sm:text-[11.5px]"
      >
        <span className="text-faint">{labelShort(periods[si.dataIndex])}</span>
        <span className="font-medium text-muted">{fmt(v, unit)}</span>
        {d !== undefined && (
          <span className={up ? (higherIsBetter ? 'text-up' : 'text-down') : down ? (higherIsBetter ? 'text-down' : 'text-up') : 'text-faint'}>
            {up ? '▲' : down ? '▼' : '■'} {isRate ? pp(Math.abs(d)).replace('+', '') : pct(Math.abs(d)).replace('+', '')}
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

export function KpiCard(p: KpiCardProps) {
  // Indicadores sin datos en este negocio no se muestran (salvo que tengan un texto de pendiente)
  if (p.value === undefined && !p.pending) return null;
  const showLive = !!(p.sparkPeriods && p.spark && p.value !== undefined && p.spark.some((v) => v !== null));
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
        <div className="mt-1.5 h-[18px] overflow-hidden text-[11.5px] text-faint">
          {showLive ? <LiveReadout spark={p.spark!} periods={p.sparkPeriods!} unit={p.unit} higherIsBetter={p.higherIsBetter} /> : <span className="block truncate">{empty ? '\u00a0' : p.secondary ?? (p.delta !== undefined ? p.compareLabel : partial ? `${p.coverage!.have} de ${p.coverage!.total} meses con dato` : 'Sin período anterior comparable')}</span>}
        </div>
      </div>
      <div className="mt-3 h-[30px]">{p.spark && !empty && <Sparkline data={p.spark} periods={p.sparkPeriods} color={p.color} height={30} />}</div>
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
