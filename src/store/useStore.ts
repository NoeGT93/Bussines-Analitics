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
  LeadSnapshot,
} from '../types';
import { activeRepository } from '../lib/repository';
import { emptyDataset } from '../lib/defaults';
import { seedSpartan, SEED_VERSION } from '../lib/demo';
import { shift } from '../lib/periods';
import { rowsFor } from '../lib/metrics';

export type PageId = 'overview' | 'traffic' | 'roi' | 'data';
const PAGE_IDS: PageId[] = ['overview', 'traffic', 'roi', 'data'];

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
  /** Mes que muestran las tarjetas (null = último mes con datos) */
  cursor: Period | null;
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
  setCursor(p: Period | null): void;
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
  saveSnapshot(snap: LeadSnapshot): void;
  deleteSnapshot(id: string): void;
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

/** Primera visita: Spartan Gym arranca con los datos de REPORTE_DASHABOARD.xlsx y el corte de leads */
function seededDataset(): Dataset {
  const ds = emptyDataset();
  const seed = seedSpartan(ds.companies[0].id);
  return { ...ds, monthly: seed.monthly, channels: seed.channels, costs: seed.costs, leadSnapshots: seed.snapshots, seedVersion: SEED_VERSION };
}

/** Datos guardados con una semilla anterior: se vuelve a sembrar */
function upgradeSeed(ds: Dataset): Dataset {
  if ((ds.seedVersion ?? 1) >= SEED_VERSION) return ds;
  return seededDataset();
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
    page: prefs.page && PAGE_IDS.includes(prefs.page) ? prefs.page : 'overview',
    scope: initialScope,
    range: availableRange(initialDs, initialScope) ?? fallbackRange(),
    rangePreset: 'all',
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    sidebarCollapsed: !!prefs.sidebarCollapsed,
    cursor: null,
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
    setCursor: (cursor) => set({ cursor }),
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
    saveSnapshot: (snap) => mutate((ds) => ({ ...ds, leadSnapshots: [...ds.leadSnapshots.filter((x) => x.id !== snap.id), snap] })),
    deleteSnapshot: (id) => mutate((ds) => ({ ...ds, leadSnapshots: ds.leadSnapshots.filter((x) => x.id !== id) })),
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
        leadSnapshots: ds.leadSnapshots.filter((r) => r.companyId !== companyId),
      })),
    loadDemo: () => {
      const id = get().ds.companies[0].id;
      const seed = seedSpartan(id);
      // No sobrescribe lo que ya existe: solo agrega lo que falte del reporte inicial
      mutate((ds) => {
        const has = (list: { id: string }[]) => new Set(list.map((x) => x.id));
        const m = has(ds.monthly);
        const c = has(ds.channels);
        const k = has(ds.costs);
        const l = has(ds.leadSnapshots);
        return {
          ...ds,
          monthly: [...ds.monthly, ...seed.monthly.filter((x) => !m.has(x.id))],
          channels: [...ds.channels, ...seed.channels.filter((x) => !c.has(x.id))],
          costs: [...ds.costs, ...seed.costs.filter((x) => !k.has(x.id))],
          leadSnapshots: [...ds.leadSnapshots, ...seed.snapshots.filter((x) => !l.has(x.id))],
        };
      });
      set({ scope: id, range: availableRange(get().ds, id) ?? fallbackRange(), rangePreset: 'all', cursor: null });
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
  if (s.page !== prev.page || s.scope !== prev.scope || s.sidebarCollapsed !== prev.sidebarCollapsed) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ page: s.page, scope: s.scope, sidebarCollapsed: s.sidebarCollapsed }));
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
