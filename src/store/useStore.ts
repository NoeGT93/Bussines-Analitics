import { create } from 'zustand';
import type {
  ChannelRecord,
  Company,
  CompanyScope,
  Dataset,
  DateRange,
  Goal,
  ImportKind,
  ImportLogEntry,
  MonthlyRecord,
  Period,
  SocialPost,
  SocialRecord,
  CostRecord,
} from '../types';
import { activeRepository } from '../lib/repository';
import { emptyDataset } from '../lib/defaults';
import { demoCopicentro, SEED_VERSION } from '../lib/demo';
import { shift } from '../lib/periods';
import { rowsFor } from '../lib/metrics';

export type PageId = 'overview' | 'social' | 'sales' | 'traffic' | 'roi' | 'compare' | 'insights' | 'data';

export interface DetailTarget {
  period: Period;
  metric?: string;
}

interface UiState {
  page: PageId;
  scope: CompanyScope;
  range: DateRange;
  rangePreset: string;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  liveMotion: boolean;
  /** Mes seleccionado para el recorrido (null = último mes con datos) */
  cursor: Period | null;
  playing: boolean;
  mobileNav: boolean;
  detail: DetailTarget | null;
  toast: { id: number; text: string; tone: 'ok' | 'error' | 'info' } | null;
}

type Upsert<T> = { inserted: number; updated: number; skipped: number; items: T[] };

interface Actions {
  setPage(p: PageId): void;
  setScope(s: CompanyScope): void;
  setRange(r: DateRange, preset?: string): void;
  toggleTheme(): void;
  toggleSidebar(): void;
  toggleLive(): void;
  setCursor(p: Period | null): void;
  stepCursor(delta: number): void;
  togglePlay(): void;
  setMobileNav(v: boolean): void;
  openDetail(d: DetailTarget | null): void;
  notify(text: string, tone?: 'ok' | 'error' | 'info'): void;

  upsertMonthly(recs: MonthlyRecord[], file: string, companyId: string): Upsert<MonthlyRecord>;
  upsertChannels(recs: ChannelRecord[], file: string, companyId: string): Upsert<ChannelRecord>;
  upsertSocial(recs: SocialRecord[], file: string, companyId: string): Upsert<SocialRecord>;
  upsertPosts(recs: SocialPost[], file: string, companyId: string): Upsert<SocialPost>;
  upsertCosts(recs: CostRecord[], file: string, companyId: string): Upsert<CostRecord>;
  setCost(rec: { companyId: string; period: Period | null; canal: string | null; inversion?: number; concepto?: string }): void;
  setMargin(companyId: string, margen: number | undefined): void;
  updateMonthly(id: string, patch: Partial<MonthlyRecord>): void;
  deleteMonthly(id: string): void;
  deleteChannel(id: string): void;
  setGoal(goal: Goal | { id: string; remove: true }): void;
  addCompany(c: Company): void;
  updateCompany(id: string, patch: Partial<Company>): void;
  clearCompany(companyId: string): void;
  loadDemo(): void;
  clearDemo(): void;
  replaceDataset(ds: Dataset): void;
  resetAll(): void;
}

export type Store = UiState & { ds: Dataset } & Actions;

const PREFS_KEY = 'ba-prefs-v1';

function loadPrefs(): Partial<UiState> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Rango por defecto: los meses con datos de la empresa, o enero → mes actual */
export function availableRange(ds: Dataset, scope: CompanyScope): DateRange | null {
  const ids = scope === 'consolidado' ? ds.companies.map((c) => c.id) : [scope];
  const ps = ds.monthly.filter((r) => ids.includes(r.companyId)).map((r) => r.period).sort();
  if (!ps.length) return null;
  return { from: ps[0], to: ps[ps.length - 1] };
}

function fallbackRange(): DateRange {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { from: `${now.getFullYear()}-01`, to };
}

/** Primera visita: Copicentro OVNI arranca con los datos de Dashboard_Copicentro.xlsx */
function seededDataset(): Dataset {
  const ds = emptyDataset();
  const seed = demoCopicentro(ds.companies[0].id);
  return { ...ds, monthly: seed.monthly, channels: seed.channels, seedVersion: SEED_VERSION };
}

/** Si el navegador guardó datos base de una versión anterior del Excel, se reemplazan por los nuevos (los importados no se tocan) */
function upgradeSeed(ds: Dataset): Dataset {
  if ((ds.seedVersion ?? 1) >= SEED_VERSION) return ds;
  const id = ds.companies[0]?.id;
  if (!id) return ds;
  const seed = demoCopicentro(id);
  const realMonths = new Set(ds.monthly.filter((m) => m.source.kind !== 'demo').map((m) => m.id));
  const realCh = new Set(ds.channels.filter((m) => m.source.kind !== 'demo').map((m) => m.id));
  return {
    ...ds,
    monthly: [...ds.monthly.filter((m) => m.source.kind !== 'demo'), ...seed.monthly.filter((m) => !realMonths.has(m.id))],
    channels: [...ds.channels.filter((m) => m.source.kind !== 'demo'), ...seed.channels.filter((m) => !realCh.has(m.id))],
    seedVersion: SEED_VERSION,
  };
}

const stored = activeRepository.load();
const initialDs = stored ? upgradeSeed(stored) : seededDataset();
const prefs = loadPrefs();
const initialScope = prefs.scope && (prefs.scope === 'consolidado' || initialDs.companies.some((c) => c.id === prefs.scope)) ? prefs.scope : initialDs.companies[0].id;

function upsert<T extends { id: string }>(list: T[], incoming: T[]): { next: T[]; inserted: number; updated: number; skipped: number } {
  const map = new Map(list.map((x) => [x.id, x]));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const item of incoming) {
    if (seen.has(item.id)) {
      skipped++; // duplicado dentro del mismo archivo
      continue;
    }
    seen.add(item.id);
    if (map.has(item.id)) updated++;
    else inserted++;
    map.set(item.id, item);
  }
  return { next: [...map.values()], inserted, updated, skipped };
}

let toastId = 0;

export const useStore = create<Store>((set, get) => {
  const log = (companyId: string, file: string, kind: ImportKind, r: { inserted: number; updated: number; skipped: number }): ImportLogEntry => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    companyId,
    file,
    kind,
    ...r,
  });

  const mutate = (fn: (ds: Dataset) => Dataset) => set((s) => ({ ds: fn(s.ds) }));

  return {
    ds: initialDs,
    page: (prefs.page as PageId) ?? 'overview',
    scope: initialScope,
    range: availableRange(initialDs, initialScope) ?? fallbackRange(),
    rangePreset: 'all',
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    sidebarCollapsed: !!prefs.sidebarCollapsed,
    liveMotion: prefs.liveMotion ?? true,
    cursor: null,
    playing: false,
    mobileNav: false,
    detail: null,
    toast: null,

    setPage: (page) => set({ page, mobileNav: false, detail: null }),
    setScope: (scope) => {
      const r = availableRange(get().ds, scope);
      set({ scope, ...(r ? { range: r, rangePreset: 'all' } : {}), detail: null, cursor: null });
    },
    setRange: (range, preset = 'custom') => set({ range, rangePreset: preset, cursor: null }),
    toggleTheme: () => {
      const theme = get().theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem('ba-theme', theme);
      } catch {
        /* noop */
      }
      set({ theme });
    },
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    toggleLive: () => set((s) => ({ liveMotion: !s.liveMotion })),
    setCursor: (cursor) => set({ cursor }),
    stepCursor: (delta) => {
      const { ds, scope, range, cursor } = get();
      const months = dataMonths(ds, scope, range);
      if (!months.length) return;
      const cur = resolveCursor(months, cursor);
      const i = months.indexOf(cur);
      set({ cursor: months[(i + delta + months.length * 10) % months.length] });
    },
    togglePlay: () => set((s) => ({ playing: !s.playing })),
    setMobileNav: (mobileNav) => set({ mobileNav }),
    openDetail: (detail) => set({ detail }),
    notify: (text, tone = 'ok') => set({ toast: { id: ++toastId, text, tone } }),

    upsertMonthly: (recs, file, companyId) => {
      const r = upsert(get().ds.monthly, recs);
      mutate((ds) => ({ ...ds, monthly: r.next, log: [log(companyId, file, 'monthly', r), ...ds.log].slice(0, 200) }));
      const range = availableRange(get().ds, get().scope);
      if (range && get().rangePreset === 'all') set({ range });
      return { ...r, items: recs };
    },
    upsertChannels: (recs, file, companyId) => {
      const r = upsert(get().ds.channels, recs);
      mutate((ds) => ({ ...ds, channels: r.next, log: [log(companyId, file, 'channels', r), ...ds.log].slice(0, 200) }));
      return { ...r, items: recs };
    },
    upsertSocial: (recs, file, companyId) => {
      const r = upsert(get().ds.social, recs);
      mutate((ds) => ({ ...ds, social: r.next, log: [log(companyId, file, 'social', r), ...ds.log].slice(0, 200) }));
      return { ...r, items: recs };
    },
    upsertPosts: (recs, file, companyId) => {
      const r = upsert(get().ds.posts, recs);
      mutate((ds) => ({ ...ds, posts: r.next, log: [log(companyId, file, 'posts', r), ...ds.log].slice(0, 200) }));
      return { ...r, items: recs };
    },
    upsertCosts: (recs, file, companyId) => {
      const r = upsert(get().ds.costs, recs);
      mutate((ds) => ({ ...ds, costs: r.next, log: [log(companyId, file, 'costs', r), ...ds.log].slice(0, 200) }));
      return { ...r, items: recs };
    },
    setCost: ({ companyId, period, canal, inversion, concepto }) =>
      mutate((ds) => {
        const id = `${companyId}:${period ?? 'total'}:${canal ?? 'total'}`;
        const rest = ds.costs.filter((c) => c.id !== id);
        if (inversion === undefined) return { ...ds, costs: rest };
        return { ...ds, costs: [...rest, { id, companyId, period, canal, inversion, concepto, source: { kind: 'manual', at: new Date().toISOString() } }] };
      }),
    setMargin: (companyId, margen) =>
      mutate((ds) => ({ ...ds, settings: { ...ds.settings, [companyId]: { ...(ds.settings[companyId] ?? {}), margen } } })),
    updateMonthly: (id, patch) =>
      mutate((ds) => ({
        ...ds,
        monthly: ds.monthly.map((m) => (m.id === id ? { ...m, ...patch, source: { kind: 'manual', at: new Date().toISOString(), file: m.source.file } } : m)),
      })),
    deleteMonthly: (id) => mutate((ds) => ({ ...ds, monthly: ds.monthly.filter((m) => m.id !== id) })),
    deleteChannel: (id) => mutate((ds) => ({ ...ds, channels: ds.channels.filter((m) => m.id !== id) })),
    setGoal: (goal) =>
      mutate((ds) => {
        const rest = ds.goals.filter((g) => g.id !== goal.id);
        return { ...ds, goals: 'remove' in goal ? rest : [...rest, goal] };
      }),
    addCompany: (c) => mutate((ds) => ({ ...ds, companies: [...ds.companies, c] })),
    updateCompany: (id, patch) => mutate((ds) => ({ ...ds, companies: ds.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
    clearCompany: (companyId) =>
      mutate((ds) => ({
        ...ds,
        monthly: ds.monthly.filter((r) => r.companyId !== companyId),
        channels: ds.channels.filter((r) => r.companyId !== companyId),
        social: ds.social.filter((r) => r.companyId !== companyId),
        posts: ds.posts.filter((r) => r.companyId !== companyId),
        goals: ds.goals.filter((r) => r.companyId !== companyId),
        costs: ds.costs.filter((r) => r.companyId !== companyId),
      })),
    loadDemo: () => {
      const id = get().ds.companies[0].id;
      const demo = demoCopicentro(id);
      // No sobrescribe datos reales: solo agrega meses/canales que no existan
      const existing = new Set(get().ds.monthly.map((m) => m.id));
      const existingCh = new Set(get().ds.channels.map((m) => m.id));
      mutate((ds) => ({
        ...ds,
        monthly: [...ds.monthly, ...demo.monthly.filter((m) => !existing.has(m.id))],
        channels: [...ds.channels, ...demo.channels.filter((m) => !existingCh.has(m.id))],
      }));
      set({ scope: id, range: availableRange(get().ds, id) ?? fallbackRange(), rangePreset: 'all' });
    },
    clearDemo: () =>
      mutate((ds) => ({
        ...ds,
        monthly: ds.monthly.filter((r) => r.source.kind !== 'demo'),
        channels: ds.channels.filter((r) => r.source.kind !== 'demo'),
        social: ds.social.filter((r) => r.source.kind !== 'demo'),
        posts: ds.posts.filter((r) => r.source.kind !== 'demo'),
      })),
    replaceDataset: (ds) => {
      set({ ds });
      const r = availableRange(ds, get().scope);
      if (r) set({ range: r, rangePreset: 'all' });
    },
    resetAll: () => {
      activeRepository.clear();
      set({ ds: emptyDataset(), range: fallbackRange(), rangePreset: 'all' });
    },
  };
});

/* Persistencia: guardamos el dataset al cambiar (con pequeño retardo) y las preferencias de UI */
let saveTimer: number | undefined;
useStore.subscribe((s, prev) => {
  if (s.ds !== prev.ds) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => activeRepository.save(s.ds), 150);
  }
  if (s.page !== prev.page || s.scope !== prev.scope || s.sidebarCollapsed !== prev.sidebarCollapsed || s.liveMotion !== prev.liveMotion) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ page: s.page, scope: s.scope, sidebarCollapsed: s.sidebarCollapsed, liveMotion: s.liveMotion }));
    } catch {
      /* noop */
    }
  }
});

/** Meses del rango con algún dato, para el recorrido */
export function dataMonths(ds: Dataset, scope: CompanyScope, range: DateRange): Period[] {
  return rowsFor(ds, scope, range)
    .filter((r) => Object.keys(r.values).length > 0)
    .map((r) => r.period);
}

export function resolveCursor(months: Period[], cursor: Period | null): Period {
  if (cursor && months.includes(cursor)) return cursor;
  return months[months.length - 1];
}

export const hasDemo = (ds: Dataset) => ds.monthly.some((r) => r.source.kind === 'demo') || ds.channels.some((r) => r.source.kind === 'demo');

export { shift };
