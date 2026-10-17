import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  Database,
  FileDown,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Lightbulb,
  Menu,
  Moon,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Share2,
  Sun,
  TableProperties,
  X,
  LayoutDashboard,
  Activity,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { MarketTicker } from './Ticker';
import { availableRange, hasDemo, useStore, type PageId } from '../../store/useStore';
import { Button, cx, MenuItem, Popover, Tag } from '../ui';
import { labelLong, labelRange, monthsBetween, shift } from '../../lib/periods';
import { exportCsv, exportPdf, exportXlsx } from '../../lib/exporter';

export const NAV: { id: PageId; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Resumen ejecutivo', icon: <LayoutDashboard size={17} /> },
  { id: 'social', label: 'Redes sociales', icon: <Share2 size={17} /> },
  { id: 'sales', label: 'Ventas', icon: <BarChart3 size={17} /> },
  { id: 'traffic', label: 'Tráfico y conversiones', icon: <MousePointerClick size={17} /> },
  { id: 'compare', label: 'Comparativas', icon: <GitCompareArrows size={17} /> },
  { id: 'insights', label: 'Hallazgos', icon: <Lightbulb size={17} /> },
  { id: 'data', label: 'Gestión de datos', icon: <Database size={17} /> },
];

/* Marca ----------------------------------------------------------------- */
function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex h-14 items-center gap-2.5 px-4">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-electric text-white">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 16.5l4.5-5.5 3.5 2.8L19.5 6" />
          <circle cx="19.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13.5px] font-semibold text-ink">Business Analytics</div>
          <div className="truncate text-[11px] text-faint">OVNI · Construex</div>
        </div>
      )}
    </div>
  );
}

/* Barra lateral ---------------------------------------------------------- */
export function Sidebar() {
  const { page, setPage, sidebarCollapsed, toggleSidebar, mobileNav, setMobileNav } = useStore();
  const nav = (collapsed: boolean, onPick?: () => void) => (
    <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-2" aria-label="Secciones">
      {NAV.map((n) => {
        const active = page === n.id;
        return (
          <button
            key={n.id}
            type="button"
            title={collapsed ? n.label : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              setPage(n.id);
              onPick?.();
            }}
            className={cx(
              'relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
              active ? 'text-ink' : 'text-muted hover:bg-sunken hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
          >
            {active && <motion.span layoutId={`nav-active-${collapsed ? 'c' : 'e'}`} className="absolute inset-0 rounded-lg bg-sunken" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            {active && <span className="absolute left-0 top-2 h-5 w-[3px] rounded-r bg-electric" />}
            <span className={cx('relative', active && 'text-electric')}>{n.icon}</span>
            {!collapsed && <span className="relative truncate">{n.label}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        className={cx(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-300 lg:flex',
          sidebarCollapsed ? 'w-[64px]' : 'w-[232px]',
        )}
      >
        <Brand collapsed={sidebarCollapsed} />
        {nav(sidebarCollapsed)}
        <div className="border-t border-line p-2.5">
          <button
            type="button"
            onClick={toggleSidebar}
            className={cx('flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-sunken hover:text-ink', sidebarCollapsed && 'justify-center px-0')}
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!sidebarCollapsed && 'Contraer menú'}
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {mobileNav && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/20 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNav(false)} />
            <motion.aside
              className="fixed bottom-0 left-0 top-0 z-50 flex w-[272px] flex-col border-r border-line bg-surface lg:hidden"
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="flex items-center justify-between pr-2">
                <Brand />
                <Button size="icon" onClick={() => setMobileNav(false)} aria-label="Cerrar menú">
                  <X size={17} />
                </Button>
              </div>
              {nav(false, () => setMobileNav(false))}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* Selector de empresa ------------------------------------------------------ */
function CompanyPicker() {
  const { ds, scope, setScope } = useStore();
  const current = scope === 'consolidado' ? null : ds.companies.find((c) => c.id === scope);
  return (
    <Popover
      align="left"
      width={280}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface pl-2.5 pr-2 text-[13px] font-medium text-ink hover:bg-sunken"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: current?.color ?? 'conic-gradient(#2F5BFF 0 50%, #0E9F8E 0)' }} />
          <span className="max-w-[150px] truncate sm:max-w-[200px]">{current?.name ?? 'Vista consolidada'}</span>
          <ChevronDown size={14} className="text-faint" />
        </button>
      )}
    >
      {(close) => (
        <div role="listbox" aria-label="Empresa">
          {ds.companies.map((c) => {
            const n = ds.monthly.filter((m) => m.companyId === c.id).length;
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={scope === c.id}
                type="button"
                onClick={() => {
                  setScope(c.id);
                  close();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sunken"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{c.name}</span>
                  <span className="block text-[11.5px] text-faint">{n ? `${n} meses con datos` : 'Sin datos todavía'}</span>
                </span>
                {scope === c.id && <Check size={15} className="text-electric" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-line" />
          <button
            role="option"
            aria-selected={scope === 'consolidado'}
            type="button"
            onClick={() => {
              setScope('consolidado');
              close();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sunken"
          >
            <Building2 size={15} className="text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink">Vista consolidada</span>
              <span className="block text-[11.5px] text-faint">Solo suma indicadores que ambas empresas tienen</span>
            </span>
            {scope === 'consolidado' && <Check size={15} className="text-electric" />}
          </button>
        </div>
      )}
    </Popover>
  );
}

/* Selector de período ------------------------------------------------------ */
function RangePicker() {
  const { ds, scope, range, rangePreset, setRange } = useStore();
  const avail = availableRange(ds, scope);
  const anchor = avail?.to ?? range.to;
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => {
    setFrom(range.from);
    setTo(range.to);
  }, [range]);

  const options = useMemo(() => {
    const start = avail ? shift(avail.from, -12) : shift(anchor, -24);
    return monthsBetween({ from: start, to: shift(anchor, 3) });
  }, [avail, anchor]);
  const years = [...new Set(options.map((p) => p.slice(0, 4)))].filter((y) => avail && y >= avail.from.slice(0, 4) && y <= avail.to.slice(0, 4));

  const presets = [
    { id: 'm1', label: 'Último mes', r: { from: anchor, to: anchor } },
    { id: 'm3', label: 'Últimos 3 meses', r: { from: shift(anchor, -2), to: anchor } },
    { id: 'm6', label: 'Últimos 6 meses', r: { from: shift(anchor, -5), to: anchor } },
    ...(avail ? [{ id: 'all', label: 'Todo el período con datos', r: avail }] : []),
    ...years.map((y) => ({ id: `y${y}`, label: `Año ${y}`, r: { from: `${y}-01`, to: `${y}-12` < anchor ? `${y}-12` : anchor } })),
  ];

  return (
    <Popover
      width={300}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-sunken"
        >
          <CalendarRange size={15} className="text-muted" />
          <span className="tnum whitespace-nowrap">{labelRange(range)}</span>
          <ChevronDown size={14} className="text-faint" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-faint">Accesos rápidos</div>
          {presets.map((p) => (
            <MenuItem
              key={p.id}
              onClick={() => {
                setRange(p.r, p.id);
                close();
              }}
              icon={rangePreset === p.id ? <Check size={14} className="text-electric" /> : <span className="inline-block w-[14px]" />}
              hint={labelRange(p.r)}
            >
              {p.label}
            </MenuItem>
          ))}
          <div className="my-1.5 h-px bg-line" />
          <div className="px-2.5 pb-2 pt-1">
            <div className="mb-2 text-[11.5px] font-medium text-faint">Período personalizado</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11.5px] text-muted">
                Desde
                <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink">
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {labelLong(o)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11.5px] text-muted">
                Hasta
                <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink">
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {labelLong(o)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {from > to && <p className="mt-1.5 text-[11.5px] text-down">El mes inicial debe ser anterior al final.</p>}
            <Button
              variant="primary"
              size="sm"
              className="mt-2.5 w-full"
              disabled={from > to}
              onClick={() => {
                setRange({ from, to }, 'custom');
                close();
              }}
            >
              Aplicar período
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/* Exportación ------------------------------------------------------------- */
function ExportMenu() {
  const { ds, scope, range, notify } = useStore();
  const pdf = async () => {
    notify('Preparando reporte PDF…', 'info');
    let img: string | undefined;
    const node = document.querySelector<HTMLElement>('[data-report-chart]');
    if (node) {
      try {
        img = await toPng(node, { skipFonts: true, pixelRatio: 2, backgroundColor: '#ffffff', filter: (n) => !(n as HTMLElement).dataset?.noexport });
      } catch {
        img = undefined;
      }
    }
    exportPdf(ds, scope, range, img);
    notify('Reporte PDF descargado.');
  };
  return (
    <Popover
      width={250}
      trigger={({ open, toggle }) => (
        <Button variant="outline" onClick={toggle} aria-expanded={open} className="px-2.5 sm:px-3">
          <FileDown size={15} />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<FileText size={15} />} hint="PDF" onClick={() => (close(), pdf())}>
            Reporte ejecutivo
          </MenuItem>
          <MenuItem icon={<FileSpreadsheet size={15} />} hint="XLSX" onClick={() => (close(), exportXlsx(ds, scope, range), notify('Excel descargado.'))}>
            Datos filtrados
          </MenuItem>
          <MenuItem icon={<TableProperties size={15} />} hint="CSV" onClick={() => (close(), exportCsv(ds, scope, range), notify('CSV descargado.'))}>
            Datos filtrados
          </MenuItem>
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-faint">Incluye la empresa y el período seleccionados. Cada gráfico se puede descargar como imagen desde su tarjeta.</p>
        </>
      )}
    </Popover>
  );
}

/* Configuración ------------------------------------------------------------ */
function SettingsMenu() {
  const { theme, toggleTheme, setPage, liveMotion, toggleLive } = useStore();
  return (
    <Popover
      width={230}
      trigger={({ open, toggle }) => (
        <Button size="icon" onClick={toggle} aria-expanded={open} aria-label="Configuración">
          <Settings size={17} />
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} onClick={() => (toggleTheme(), close())}>
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </MenuItem>
          <MenuItem icon={<Activity size={15} />} hint={liveMotion ? 'Activada' : 'Pausada'} onClick={() => toggleLive()}>
            Animación continua
          </MenuItem>
          <MenuItem icon={<Database size={15} />} onClick={() => (setPage('data'), close())}>
            Datos, empresas y metas
          </MenuItem>
        </>
      )}
    </Popover>
  );
}

/* Encabezado ----------------------------------------------------------------- */
export function Header() {
  const { setMobileNav, ds, theme, toggleTheme, page } = useStore();
  const demo = hasDemo(ds);
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-2 px-3 sm:px-5 lg:px-8">
        <Button size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Abrir menú">
          <Menu size={18} />
        </Button>
        <CompanyPicker />
        <div className="hidden md:block">
          <RangePicker />
        </div>
        {demo && page !== 'data' && (
          <span className="hidden xl:inline-flex">
            <Tag tone="warn">Cifras demostrativas del archivo, no verificadas</Tag>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <ExportMenu />
          <Button size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} className="hidden sm:inline-flex">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <SettingsMenu />
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2.5 md:hidden">
        <RangePicker />
        {demo && <Tag tone="warn">Cifras demostrativas</Tag>}
      </div>
      <MarketTicker />
    </header>
  );
}

/* Toast ------------------------------------------------------------------------ */
export function Toaster() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-live="polite">
      <AnimatePresence>
        {visible && toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22 }}
            className={cx(
              'pointer-events-auto flex items-center gap-2 rounded-xl border bg-surface px-4 py-2.5 text-[13px] shadow-pop',
              toast.tone === 'error' ? 'border-down/30 text-down' : 'border-line text-ink',
            )}
          >
            {toast.tone === 'ok' && <Check size={15} className="text-up" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
