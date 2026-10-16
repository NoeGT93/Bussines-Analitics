import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Info, Minus, X } from 'lucide-react';
import { fmt, pct, pp, type Unit } from '../../lib/format';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

/* Tarjeta ------------------------------------------------------------ */
export function Card({ children, className, as = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  const C = as;
  return <C className={cx('rounded-card border border-line bg-surface shadow-card', className)}>{children}</C>;
}

export function CardHeader({ title, subtitle, actions, help }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; help?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          {title}
          {help && <InfoTip text={help} />}
        </h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/* Tooltip informativo ------------------------------------------------ */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cx('relative inline-flex', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={id}
        aria-label="Más información"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-faint transition-colors hover:text-muted"
      >
        <Info size={13} strokeWidth={2} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-normal leading-snug text-muted shadow-pop"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* Número animado ----------------------------------------------------- */
export function AnimatedNumber({ value, unit = 'n', className }: { value?: number; unit?: Unit; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | undefined>(undefined);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === undefined) {
      el.textContent = '—';
      prev.current = undefined;
      return;
    }
    const from = prev.current ?? value * 0.92;
    prev.current = value;
    if (reduce) {
      el.textContent = fmt(value, unit);
      return;
    }
    const c = animate(from, value, {
      duration: 0.5,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v, unit);
      },
    });
    return () => c.stop();
  }, [value, unit, reduce]);
  return <span ref={ref} className={cx('tnum', className)}>{fmt(value, unit)}</span>;
}

/* Variación ---------------------------------------------------------- */
export function Delta({ value, kind = 'rel', size = 'sm', higherIsBetter = true }: { value?: number; kind?: 'rel' | 'pp'; size?: 'sm' | 'xs'; higherIsBetter?: boolean }) {
  if (value === undefined || !Number.isFinite(value)) {
    return <span className={cx('tnum text-faint', size === 'xs' ? 'text-[11px]' : 'text-[12px]')}>—</span>;
  }
  const flat = Math.abs(value) < 0.0005;
  const good = flat ? null : (value > 0) === higherIsBetter;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cx(
        'tnum inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium',
        size === 'xs' ? 'text-[11px]' : 'text-[12px]',
        good === null ? 'bg-sunken text-muted' : good ? 'bg-up/10 text-up' : 'bg-down/10 text-down',
      )}
    >
      <Icon size={size === 'xs' ? 11 : 13} strokeWidth={2.4} />
      {kind === 'pp' ? pp(value) : pct(value)}
    </span>
  );
}

/* Botones ------------------------------------------------------------ */
export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  className,
  disabled,
  type = 'button',
  title,
  ...rest
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
  'aria-pressed'?: boolean;
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      {...rest}
      className={cx(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-7 px-2.5 text-[12px]',
        size === 'md' && 'h-9 px-3 text-[13px]',
        size === 'icon' && 'h-9 w-9',
        variant === 'primary' && 'bg-electric text-white hover:bg-electric/90',
        variant === 'ghost' && 'text-muted hover:bg-sunken hover:text-ink',
        variant === 'outline' && 'border border-line bg-surface text-ink hover:bg-sunken',
        variant === 'danger' && 'border border-down/30 text-down hover:bg-down/10',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* Control segmentado -------------------------------------------------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex rounded-lg bg-sunken p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-10 whitespace-nowrap rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-md bg-surface shadow-card ring-1 ring-line"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Select nativo con estilo ------------------------------------------- */
export function Select({
  value,
  onChange,
  children,
  className,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-9 rounded-lg border border-line bg-surface pl-3 pr-8 text-[13px] text-ink outline-none transition-colors hover:bg-sunken focus:border-electric',
        className,
      )}
    >
      {children}
    </select>
  );
}

/* Estado vacío -------------------------------------------------------- */
export function Empty({ icon, title, body, action, compact }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      {icon && <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-sunken text-muted">{icon}</div>}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {body && <div className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Etiqueta ------------------------------------------------------------ */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'warn' | 'up' | 'down' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-sunken text-muted',
        tone === 'blue' && 'bg-electric/10 text-electric',
        tone === 'warn' && 'bg-warn/12 text-warn',
        tone === 'up' && 'bg-up/10 text-up',
        tone === 'down' && 'bg-down/10 text-down',
      )}
    >
      {children}
    </span>
  );
}

/* Panel lateral ------------------------------------------------------- */
export function Drawer({ open, onClose, title, subtitle, children, width = 420 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/10 backdrop-blur-[1px] dark:bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-pop"
            style={{ maxWidth: width, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
              </div>
              <Button size="icon" onClick={onClose} aria-label="Cerrar panel">
                <X size={16} />
              </Button>
            </header>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* Popover simple ------------------------------------------------------ */
export function Popover({ trigger, children, align = 'right', width = 260 }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    window.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', k);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            style={{ width, maxWidth: 'calc(100vw - 24px)' }}
            className={cx('absolute top-full z-50 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({ icon, children, onClick, hint }: { icon?: ReactNode; children: ReactNode; onClick: () => void; hint?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-sunken">
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </button>
  );
}

/* Estado de carga ----------------------------------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-sunken', className)} />;
}

/* Sección de página --------------------------------------------------- */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
