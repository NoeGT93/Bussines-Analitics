import { ChevronRight } from 'lucide-react';
import { cx } from '../ui';
import { META_HELP } from '../../lib/metrics';

/** Nombre de la red con botón para desplegar su ramal (solo Meta tiene ramal) */
export function BranchName({ name, open, onToggle, count }: { name: string; open?: boolean; onToggle?: () => void; count?: number }) {
  if (!onToggle) return <span className="font-medium text-ink">{name}</span>;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} title={META_HELP} className="group -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium text-ink hover:bg-sunken">
      <ChevronRight size={14} className={cx('text-muted transition-transform duration-200', open && 'rotate-90')} />
      {name}
      {count !== undefined && <span className="ml-1 rounded bg-sunken px-1.5 text-[11px] font-normal text-muted group-hover:bg-surface">{count} redes</span>}
    </button>
  );
}

/** Celda de una red hija: conector de árbol (├─ └─) y nombre */
export function BranchLeaf({ name, last }: { name: string; last: boolean }) {
  return (
    <span className="flex items-center text-muted">
      <span aria-hidden className="relative mr-2 inline-block h-8 w-5 shrink-0">
        <span className={cx('absolute left-2 top-0 border-l border-line', last ? 'h-1/2' : 'h-full')} />
        <span className="absolute left-2 top-1/2 w-3 border-t border-line" />
      </span>
      {name}
    </span>
  );
}
