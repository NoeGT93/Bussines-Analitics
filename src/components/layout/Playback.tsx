import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useCursor } from '../../lib/live';
import { labelShort, labelLong } from '../../lib/periods';
import { cx } from '../ui';

/** Controles del recorrido: mes anterior, reproducir/pausar y mes siguiente */
export function PlaybackControls({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { playing, togglePlay, stepCursor } = useStore();
  const { period, months, index } = useCursor();
  if (!period) return null;
  const btn = 'grid h-7 w-7 shrink-0 sm:h-6 sm:w-6 place-items-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-40';
  return (
    <div className={cx('flex shrink-0 items-center gap-0.5', className)} role="group" aria-label="Recorrido mes a mes">
      <button type="button" className={btn} onClick={() => stepCursor(-1)} aria-label="Mes anterior" title="Mes anterior (←)" disabled={months.length < 2}>
        <ChevronLeft size={15} />
      </button>
      <button
        type="button"
        className={cx(btn, playing && 'bg-electric/10 text-electric hover:bg-electric/15 hover:text-electric')}
        onClick={togglePlay}
        aria-label={playing ? 'Pausar recorrido' : 'Reproducir recorrido'}
        aria-pressed={playing}
        title={playing ? 'Pausar' : 'Reproducir mes a mes'}
        disabled={months.length < 2}
      >
        {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
      </button>
      <button type="button" className={btn} onClick={() => stepCursor(1)} aria-label="Mes siguiente" title="Mes siguiente (→)" disabled={months.length < 2}>
        <ChevronRight size={15} />
      </button>
      <span className="tnum ml-1 whitespace-nowrap text-[12px] font-medium text-ink" aria-live="polite" title={labelLong(period)}>
        {labelShort(period, true)}
        {!compact && (
          <span className="ml-1 font-normal text-faint">
            {index + 1}/{months.length}
          </span>
        )}
      </span>
    </div>
  );
}
