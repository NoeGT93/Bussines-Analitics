import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FlaskConical,
  HardDrive,
  Info,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { hasDemo, useStore } from '../store/useStore';
import { Button, Card, CardHeader, cx, Empty, PageHeader, Segmented, Select, Tag } from '../components/ui';
import {
  findTables,
  buildRecords,
  crossCheck,
  downloadTemplate,
  FIELD_SPECS,
  KIND_LABEL,
  readFile,
  remap,
  type BuildResult,
  type Issue,
  type SheetAnalysis,
} from '../lib/importer';
import { activeRepository, LocalStorageRepository } from '../lib/repository';
import { LeadSnapshotEditor } from '../components/data/LeadSnapshot';
import { exportBackup } from '../lib/exporter';
import { fmt } from '../lib/format';
import { labelLong, shift } from '../lib/periods';
import type { ChannelRecord, Company, CostRecord, Dataset, ImportKind, MonthlyRecord, SocialPost, SocialRecord } from '../types';

type Tab = 'import' | 'snapshots' | 'records' | 'companies' | 'storage' | 'log';

export function DataAdmin() {
  const [tab, setTab] = useState<Tab>('import');
  return (
    <>
      <PageHeader title="Gestión de datos" description="Importa, revisa y corrige la información de cada empresa. Los cambios se reflejan al instante en todos los paneles." />
      <div className="scroll-thin mb-4 overflow-x-auto pb-1">
        <Segmented
          value={tab}
          onChange={setTab}
          label="Sección"
          options={[
            { value: 'import', label: 'Importar' },
            { value: 'snapshots', label: 'Corte de leads' },
            { value: 'records', label: 'Registros' },
            { value: 'companies', label: 'Empresas' },
            { value: 'storage', label: 'Almacenamiento' },
            { value: 'log', label: 'Historial' },
          ]}
        />
      </div>
      {tab === 'import' && <ImportPanel />}
      {tab === 'snapshots' && <LeadSnapshotEditor />}
      {tab === 'records' && <RecordsPanel />}
      {tab === 'companies' && <CompaniesPanel />}
      {tab === 'storage' && <StoragePanel />}
      {tab === 'log' && <LogPanel />}
    </>
  );
}

/* ================================================================== */
/* Importación                                                        */
/* ================================================================== */

interface SheetState {
  a: SheetAnalysis;
  include: boolean;
  open: boolean;
}

function ImportPanel() {
  const { ds, scope, upsertMonthly, upsertChannels, upsertSocial, upsertPosts, upsertCosts, setCost, notify, setPage, setScope } = useStore();
  const [companyId, setCompanyId] = useState(scope === 'consolidado' ? ds.companies[0].id : scope);
  const [year, setYear] = useState(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (f: File) => {
    setError(null);
    if (!/\.(xlsx|xlsm|xls|csv|tsv|txt)$/i.test(f.name)) {
      setError('Formato no compatible. Usa un archivo .xlsx, .xls o .csv.');
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError('El archivo supera 15 MB. Divide la información en archivos más pequeños.');
      return;
    }
    setLoading(true);
    try {
      const raw = await readFile(f);
      const analyzed = raw.flatMap((s) => findTables(s)).map((a) => ({ a, include: !!a.kind, open: false }));
      const firstIncluded = analyzed.findIndex((s) => s.include);
      if (firstIncluded >= 0) analyzed[firstIncluded].open = true;
      setSheets(analyzed);
      setFile(f);
      if (!analyzed.some((s) => s.include)) setError('No se reconoció ninguna hoja con datos importables. Revisa los encabezados o asigna el tipo manualmente.');
    } catch (e) {
      console.error(e);
      setError('No se pudo leer el archivo. Verifica que no esté dañado ni protegido con contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const builds = useMemo(
    () =>
      sheets.map((s) => (s.include && s.a.kind ? buildRecords(s.a, { companyId, year, file: file?.name ?? 'archivo' }) : null)),
    [sheets, companyId, year, file],
  );

  const cross: Issue[] = useMemo(() => {
    const monthly = builds.filter((b) => b?.kind === 'monthly').flatMap((b) => b!.records) as MonthlyRecord[];
    const ch = builds.filter((b) => b?.kind === 'channels').flatMap((b) => b!.records) as ChannelRecord[];
    return crossCheck(monthly, ch);
  }, [builds]);

  const existing = useMemo(() => new Set([...ds.monthly, ...ds.channels, ...ds.social, ...ds.posts, ...ds.costs].map((r) => r.id)), [ds]);
  const summary = builds.reduce(
    (acc, b) => {
      if (!b) return acc;
      for (const r of b.records) existing.has(r.id) ? acc.update++ : acc.insert++;
      acc.errors += b.issues.filter((i) => i.level === 'error').length;
      return acc;
    },
    { insert: 0, update: 0, errors: 0 },
  );
  const ready = builds.some((b) => b && b.records.length) && summary.errors === 0;
  const targetHasData = ds.monthly.some((m) => m.companyId === companyId && m.source.kind === 'demo');

  const doImport = () => {
    const name = file?.name ?? 'archivo';
    let total = 0;
    builds.forEach((b) => {
      if (!b || !b.records.length) return;
      total += b.records.length;
      if (b.kind === 'monthly') upsertMonthly(b.records as MonthlyRecord[], name, companyId);
      if (b.kind === 'channels') upsertChannels(b.records as ChannelRecord[], name, companyId);
      if (b.kind === 'social') upsertSocial(b.records as SocialRecord[], name, companyId);
      if (b.kind === 'posts') upsertPosts(b.records as SocialPost[], name, companyId);
      if (b.kind === 'costs') upsertCosts(b.records as CostRecord[], name, companyId);
      if (b.kind === 'report') {
        const recs = b.records as unknown as Record<string, unknown>[];
        const social = recs.filter((r) => 'platform' in r) as unknown as SocialRecord[];
        const costs = recs.filter((r) => 'inversion' in r && !('platform' in r)) as unknown as CostRecord[];
        upsertMonthly(recs.filter((r) => !('canal' in r) && !('inversion' in r) && !('platform' in r)) as unknown as MonthlyRecord[], name, companyId);
        upsertChannels(recs.filter((r) => 'canal' in r && !('inversion' in r)) as unknown as ChannelRecord[], name, companyId);
        // Si el reporte trae inversión por red, se quita la inversión total del mes para no contarla dos veces
        for (const c of costs) if (c.canal && c.period) setCost({ companyId, period: c.period, canal: null, inversion: undefined });
        upsertCosts(costs, name, companyId);
        if (social.length) upsertSocial(social, name, companyId);
      }
    });
    notify(`${total} registros importados en ${ds.companies.find((c) => c.id === companyId)?.name}.`);
    setSheets([]);
    setFile(null);
    setScope(companyId);
    setPage('overview');
  };

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <div className="space-y-3 xl:col-span-2">
        <Card>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <label className="text-[12px] text-muted">
              Empresa de destino
              <Select value={companyId} onChange={setCompanyId} className="mt-1 w-full" label="Empresa de destino">
                {ds.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[12px] text-muted">
              Año para meses sin año (“Enero”, “Feb”)
              <input
                type="number"
                value={year}
                min={2000}
                max={2100}
                onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
                className="tnum mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-electric"
              />
            </label>
          </div>

          <div className="px-5 pb-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handle(f);
              }}
              className={cx(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors',
                drag ? 'border-electric bg-electric/5' : 'border-line',
              )}
            >
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-sunken text-muted">{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-faint border-t-electric" /> : <Upload size={18} />}</div>
              <p className="text-[13.5px] font-medium text-ink">{file ? file.name : 'Arrastra un archivo Excel o CSV'}</p>
              <p className="mt-1 text-[12px] text-muted">Reconoce el reporte mensual por bloques (inversión, venta y leads por red) y tablas con encabezados. Nada se guarda hasta que confirmes.</p>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => input.current?.click()}>
                  <FileSpreadsheet size={15} /> {file ? 'Elegir otro archivo' : 'Elegir archivo'}
                </Button>
                {file && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setFile(null);
                      setSheets([]);
                      setError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
              <input
                ref={input}
                type="file"
                accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handle(f);
                  e.target.value = '';
                }}
              />
            </div>
            {error && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-down/10 px-3 py-2 text-[12.5px] text-down">
                <XCircle size={15} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}
            {targetHasData && file && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Esta empresa ya tiene los datos del archivo base. Los meses y canales que importes los reemplazarán.
              </p>
            )}
          </div>
        </Card>

        {sheets.map((s, i) => (
          <SheetCard
            key={`${s.a.sheet.name}:${s.a.headerRow}`}
            s={s}
            build={builds[i]}
            onChange={(next) => setSheets((list) => list.map((x, j) => (j === i ? next : x)))}
          />
        ))}
      </div>

      <div className="space-y-3">
        <Card className="xl:sticky xl:top-20">
          <CardHeader title="Resumen de la importación" />
          <div className="space-y-3 px-5 py-4">
            {!file ? (
              <p className="text-[12.5px] text-muted">Elige un archivo para ver la vista previa y las validaciones.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-sunken px-3 py-2.5">
                    <div className="text-[11.5px] text-faint">Registros nuevos</div>
                    <div className="tnum text-[18px] font-semibold text-ink">{summary.insert}</div>
                  </div>
                  <div className="rounded-xl bg-sunken px-3 py-2.5">
                    <div className="text-[11.5px] text-faint">Se actualizarán</div>
                    <div className="tnum text-[18px] font-semibold text-ink">{summary.update}</div>
                  </div>
                </div>
                {summary.update > 0 && <p className="text-[12px] text-muted">Los registros que ya existen para el mismo mes y empresa se reemplazan; no se duplican.</p>}
                {cross.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-medium text-ink">Coherencia entre hojas</div>
                    {cross.map((x, j) => (
                      <IssueLine key={j} issue={x} />
                    ))}
                  </div>
                )}
                <Button variant="primary" className="w-full" disabled={!ready} onClick={doImport}>
                  Importar {summary.insert + summary.update} registros
                </Button>
                {summary.errors > 0 && <p className="text-[12px] text-down">Corrige los errores marcados antes de importar.</p>}
              </>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Plantillas" subtitle="Estructura recomendada para cada tipo de dato." />
          <div className="px-3 py-3">
            {(Object.keys(KIND_LABEL) as ImportKind[]).map((k) => (
              <button key={k} type="button" onClick={() => downloadTemplate(k)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-sunken">
                <Download size={14} className="text-muted" />
                <span className="flex-1">{KIND_LABEL[k]}</span>
                <span className="text-[11px] text-faint">XLSX</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function IssueLine({ issue }: { issue: Issue }) {
  const Icon = issue.level === 'error' ? XCircle : issue.level === 'warn' ? AlertTriangle : Info;
  return (
    <p className={cx('flex items-start gap-2 text-[12px] leading-snug', issue.level === 'error' ? 'text-down' : issue.level === 'warn' ? 'text-warn' : 'text-muted')}>
      <Icon size={13} className="mt-[2px] shrink-0" />
      <span>
        {issue.row ? <span className="text-faint">Fila {issue.row}: </span> : null}
        {issue.msg}
      </span>
    </p>
  );
}

function SheetCard({ s, build, onChange }: { s: SheetState; build: BuildResult | null; onChange: (s: SheetState) => void }) {
  const { a } = s;
  const specs = a.kind ? FIELD_SPECS[a.kind] : [];
  const issues = build?.issues ?? [];
  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const [showAll, setShowAll] = useState(false);

  const previewRecords = a.kind === 'report' ? [] : ((build?.records ?? []).slice(0, 8) as unknown as Record<string, unknown>[]);
  const mappedSpecs = specs.filter((sp) => (a.mapping[sp.key] ?? -1) >= 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <button type="button" onClick={() => onChange({ ...s, open: !s.open })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={s.open}>
          <ChevronDown size={16} className={cx('shrink-0 text-faint transition-transform', !s.open && '-rotate-90')} />
          <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">
            {a.sheet.name}
            {a.title && <span className="font-normal text-muted"> · {a.title.charAt(0) + a.title.slice(1).toLowerCase()}</span>}
          </span>
          {s.include && a.kind ? (
            errors ? <Tag tone="down">{errors} error{errors > 1 ? 'es' : ''}</Tag> : <Tag tone="up">{build?.records.length ?? 0} registros</Tag>
          ) : (
            <Tag>No se importa</Tag>
          )}
          {s.include && warns > 0 && <Tag tone="warn">{warns} aviso{warns > 1 ? 's' : ''}</Tag>}
        </button>
        <Select
          value={s.include && a.kind ? a.kind : 'skip'}
          onChange={(v) => (v === 'skip' ? onChange({ ...s, include: false }) : onChange({ ...s, include: true, open: true, a: remap(a, v as ImportKind) }))}
          label={`Tipo de datos de la hoja ${a.sheet.name}`}
          className="h-8 text-[12px]"
        >
          <option value="skip">No importar</option>
          {(Object.keys(KIND_LABEL) as ImportKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
      {!s.include && a.reason && <p className="-mt-1 px-5 pb-3.5 pl-[46px] text-[12px] text-faint">{a.reason}</p>}
      <AnimatePresence initial={false}>
        {s.open && s.include && a.kind && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="border-t border-line px-5 py-4">
              {a.kind !== 'report' && <div className="mb-2 text-[12px] font-medium text-ink">Columnas</div>}
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {specs.map((sp) => (
                  <label key={sp.key} className="text-[11.5px] text-muted">
                    {sp.label}
                    {sp.required && <span className="text-down"> *</span>}
                    <select
                      value={a.mapping[sp.key] ?? -1}
                      onChange={(e) => onChange({ ...s, a: { ...a, mapping: { ...a.mapping, [sp.key]: Number(e.target.value) } } })}
                      className={cx(
                        'mt-1 h-8 w-full rounded-md border bg-surface px-2 text-[12.5px] text-ink',
                        sp.required && (a.mapping[sp.key] ?? -1) < 0 ? 'border-down/50' : 'border-line',
                      )}
                    >
                      <option value={-1}>Sin asignar</option>
                      {a.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Columna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {a.kind !== 'report' && <p className="mt-2 text-[11.5px] text-faint">Encabezados detectados en la fila {a.headerRow + 1}.</p>}

              {a.kind === 'report' && build && (
                <>
                  <div className="mb-2 mt-1 text-[12px] font-medium text-ink">Meses detectados</div>
                  <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
                    <table className="w-full min-w-[560px] text-[12px]">
                      <thead className="bg-sunken text-left text-faint">
                        <tr>
                          {['Mes', 'Inversión', 'Venta', 'Leads', 'Cerrados', 'Cierre', 'Redes'].map((h) => (
                            <th key={h} className="px-3 py-1.5 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(build.records as unknown as Record<string, unknown>[])
                          .filter((r) => !('canal' in r) && !('inversion' in r))
                          .sort((x, y) => String(x.period).localeCompare(String(y.period)))
                          .map((r) => {
                            const period = String(r.period);
                            const inv = (build.records as unknown as Record<string, unknown>[]).find((x) => 'inversion' in x && x.period === period)?.inversion as number | undefined;
                            const nets = (build.records as unknown as Record<string, unknown>[]).filter((x) => 'canal' in x && !('inversion' in x) && x.period === period).length;
                            const leads = r.consultas as number | undefined;
                            const cer = r.ventas as number | undefined;
                            return (
                              <tr key={period} className="border-t border-line/60">
                                <td className="px-3 py-1.5 text-ink">{labelLong(period)}</td>
                                <td className="tnum px-3 py-1.5 text-ink">{fmt(inv, 'Q')}</td>
                                <td className="tnum px-3 py-1.5 text-ink">{fmt(r.ingresos as number | undefined, 'Q')}</td>
                                <td className="tnum px-3 py-1.5 text-ink">{fmt(leads)}</td>
                                <td className="tnum px-3 py-1.5 text-ink">{fmt(cer)}</td>
                                <td className="tnum px-3 py-1.5 text-ink">{leads && cer !== undefined ? fmt(cer / leads, '%') : '—'}</td>
                                <td className="tnum px-3 py-1.5 text-muted">{nets}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {previewRecords.length > 0 && (
                <>
                  <div className="mb-2 mt-5 text-[12px] font-medium text-ink">Vista previa</div>
                  <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
                    <table className="w-full min-w-[560px] text-[12px]">
                      <thead className="bg-sunken text-left text-faint">
                        <tr>
                          <th className="px-3 py-1.5 font-medium">Fila</th>
                          {mappedSpecs.map((sp) => (
                            <th key={sp.key} className="px-3 py-1.5 font-medium">
                              {sp.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRecords.map((r) => (
                          <tr key={String(r.id)} className="border-t border-line/60">
                            <td className="tnum px-3 py-1.5 text-faint">{(r.source as { row?: number }).row}</td>
                            {mappedSpecs.map((sp) => {
                              const key = sp.key === 'period' ? 'period' : sp.key;
                              const v = r[key];
                              return (
                                <td key={sp.key} className="tnum px-3 py-1.5 text-ink">
                                  {v === undefined || v === null
                                    ? <span className="text-faint">—</span>
                                    : typeof v === 'number'
                                      ? sp.kind === 'percent'
                                        ? fmt(v, '%')
                                        : sp.kind === 'money'
                                          ? fmt(v, 'Q2')
                                          : fmt(v)
                                      : key === 'period'
                                        ? labelLong(String(v))
                                        : String(v)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {build && build.records.length > 8 && <p className="mt-1.5 text-[11.5px] text-faint">Y {build.records.length - 8} más.</p>}
                </>
              )}

              {issues.length > 0 && (
                <div className="mt-5 space-y-1.5">
                  <div className="text-[12px] font-medium text-ink">Validación</div>
                  {(showAll ? issues : issues.slice(0, 6)).map((x, j) => (
                    <IssueLine key={j} issue={x} />
                  ))}
                  {issues.length > 6 && (
                    <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[12px] font-medium text-electric hover:underline">
                      {showAll ? 'Ver menos' : `Ver ${issues.length - 6} más`}
                    </button>
                  )}
                </div>
              )}
              {issues.length === 0 && build && (
                <p className="mt-4 flex items-center gap-2 text-[12px] text-up">
                  <CheckCircle2 size={14} /> Sin problemas detectados.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ================================================================== */
/* Registros: edición                                                 */
/* ================================================================== */

const EDIT_FIELDS: { key: keyof MonthlyRecord; label: string; money?: boolean }[] = [
  { key: 'visitas', label: 'Visitas' },
  { key: 'clics', label: 'Clics' },
  { key: 'consultas', label: 'Consultas' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'ingresos', label: 'Ingresos (Q)', money: true },
  { key: 'clientesNuevos', label: 'Clientes nuevos' },
  { key: 'clientesRecurrentes', label: 'Recurrentes' },
];

function NumCell({ value, onCommit, label }: { value?: number; onCommit: (v: number | undefined) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));
  const invalid = draft !== null && draft.trim() !== '' && !Number.isFinite(Number(draft.replace(/,/g, '')));
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={shown}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        if (invalid) return;
        const t = draft.trim();
        const n = t === '' ? undefined : Number(t.replace(/,/g, ''));
        if (n !== value) onCommit(n);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className={cx(
        'tnum h-8 w-full min-w-[84px] rounded-md border bg-transparent px-2 text-right text-[12.5px] text-ink outline-none transition-colors hover:border-line focus:border-electric focus:bg-surface',
        invalid ? 'border-down' : 'border-transparent',
      )}
    />
  );
}

function RecordsPanel() {
  const { ds, scope, updateMonthly, deleteMonthly, deleteChannel, upsertMonthly, notify } = useStore();
  const [companyId, setCompanyId] = useState(scope === 'consolidado' ? ds.companies[0].id : scope);
  const monthly = ds.monthly.filter((m) => m.companyId === companyId).sort((a, b) => a.period.localeCompare(b.period));
  const channels = ds.channels.filter((m) => m.companyId === companyId);
  const lastPeriod = monthly[monthly.length - 1]?.period;
  const [newPeriod, setNewPeriod] = useState(lastPeriod ? shift(lastPeriod, 1) : `${new Date().getFullYear()}-01`);

  const addMonth = () => {
    if (!/^\d{4}-\d{2}$/.test(newPeriod)) {
      notify('Usa el formato AAAA-MM, por ejemplo 2026-10.', 'error');
      return;
    }
    if (monthly.some((m) => m.period === newPeriod)) {
      notify(`${labelLong(newPeriod)} ya existe para esta empresa.`, 'error');
      return;
    }
    upsertMonthly([{ id: `${companyId}:${newPeriod}`, companyId, period: newPeriod, source: { kind: 'manual', at: new Date().toISOString() } }], 'Captura manual', companyId);
    setNewPeriod(shift(newPeriod, 1));
    notify(`${labelLong(newPeriod)} agregado. Completa sus valores en la tabla.`);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Datos mensuales"
          subtitle="Edita cualquier celda; el cambio se guarda al salir de ella y queda marcado como edición manual."
          actions={
            <Select value={companyId} onChange={setCompanyId} label="Empresa" className="h-8 text-[12.5px]">
              {ds.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          }
        />
        {monthly.length ? (
          <div className="scroll-thin mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="px-5 py-2 font-medium">Mes</th>
                  {EDIT_FIELDS.map((f) => (
                    <th key={f.key} className="px-2 py-2 text-right font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">Origen</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 last:border-0 hover:bg-sunken/50">
                    <td className="whitespace-nowrap px-5 py-1 text-ink">{labelLong(m.period)}</td>
                    {EDIT_FIELDS.map((f) => (
                      <td key={f.key} className="px-1 py-1">
                        <NumCell
                          label={`${f.label} de ${labelLong(m.period)}`}
                          value={m[f.key] as number | undefined}
                          onCommit={(v) => {
                            if (v !== undefined && v < 0) {
                              notify('Los valores no pueden ser negativos.', 'error');
                              return;
                            }
                            updateMonthly(m.id, { [f.key]: v } as Partial<MonthlyRecord>);
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      {m.source.kind === 'demo' ? <Tag tone="warn">Base</Tag> : m.source.kind === 'manual' ? <Tag>Manual</Tag> : <Tag tone="blue">Importado</Tag>}
                    </td>
                    <td className="px-2 py-1">
                      <Button
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Eliminar ${labelLong(m.period)}`}
                        onClick={() => {
                          if (confirm(`¿Eliminar ${labelLong(m.period)}? Esta acción no se puede deshacer.`)) deleteMonthly(m.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty compact title="Sin meses registrados" body="Importa un archivo o agrega un mes manualmente." />
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <input
            type="month"
            value={newPeriod}
            onChange={(e) => setNewPeriod(e.target.value)}
            aria-label="Mes a agregar"
            className="tnum h-8 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink"
          />
          <Button size="sm" variant="outline" onClick={addMonth}>
            <Plus size={13} /> Agregar mes
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fuentes de tráfico" subtitle="Registros por canal. Para corregirlos, vuelve a importar la hoja; los repetidos se reemplazan." />
        {channels.length ? (
          <div className="scroll-thin mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="px-5 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 font-medium">Período</th>
                  <th className="px-3 py-2 text-right font-medium">Visitas</th>
                  <th className="px-3 py-2 text-right font-medium">Consultas</th>
                  <th className="px-3 py-2 text-right font-medium">Ventas</th>
                  <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2 text-ink">{c.canal}</td>
                    <td className="px-3 py-2 text-muted">{c.period ? labelLong(c.period) : 'Acumulado'}</td>
                    <td className="tnum px-3 py-2 text-right">{fmt(c.visitas)}</td>
                    <td className="tnum px-3 py-2 text-right">{fmt(c.consultas)}</td>
                    <td className="tnum px-3 py-2 text-right">{fmt(c.ventas)}</td>
                    <td className="tnum px-3 py-2 text-right">{fmt(c.ingresos, 'Q')}</td>
                    <td className="px-2">
                      <Button size="icon" className="h-7 w-7" aria-label={`Eliminar ${c.canal}`} onClick={() => deleteChannel(c.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty compact title="Sin datos por canal" />
        )}
      </Card>
    </div>
  );
}

/* ================================================================== */
/* Empresas                                                           */
/* ================================================================== */

function CompaniesPanel() {
  const { ds, addCompany, updateCompany, notify } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7A5AF8');

  const add = () => {
    const n = name.trim();
    if (n.length < 2) {
      notify('Escribe el nombre de la empresa.', 'error');
      return;
    }
    const id = n
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    if (ds.companies.some((c) => c.id === id)) {
      notify('Ya existe una empresa con ese nombre.', 'error');
      return;
    }
    const c: Company = { id, name: n, shortName: n.split(' ')[0], color };
    addCompany(c);
    setName('');
    notify(`${n} agregada.`);
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {ds.companies.map((c) => {
        const months = ds.monthly.filter((m) => m.companyId === c.id);
        const ch = ds.channels.filter((m) => m.companyId === c.id).length;
        const so = ds.social.filter((m) => m.companyId === c.id).length;
        const periods = months.map((m) => m.period).sort();
        return (
          <Card key={c.id} className="p-5">
            <div className="flex items-start gap-3">
              <input
                type="color"
                value={c.color}
                onChange={(e) => updateCompany(c.id, { color: e.target.value })}
                aria-label={`Color de ${c.name}`}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1"
              />
              <div className="min-w-0 flex-1">
                <input
                  defaultValue={c.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && updateCompany(c.id, { name: e.target.value.trim() })}
                  aria-label="Nombre de la empresa"
                  className="w-full rounded-md bg-transparent text-[15px] font-semibold text-ink outline-none focus:bg-sunken"
                />
                {c.note && <p className="mt-0.5 text-[12px] text-muted">{c.note}</p>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ['Meses', months.length],
                ['Canales', ch],
                ['Redes', so],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-sunken py-2">
                  <div className="tnum text-[16px] font-semibold text-ink">{v}</div>
                  <div className="text-[11px] text-faint">{l}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-muted">{periods.length ? `Datos de ${labelLong(periods[0])} a ${labelLong(periods[periods.length - 1])}.` : 'Sin datos todavía. Lista para importar.'}</p>
            {c.links && (
              <div className="mt-2 flex flex-wrap gap-3">
                {c.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-electric hover:underline">
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <Card className="border-dashed p-5">
        <div className="text-[13.5px] font-medium text-ink">Agregar empresa</div>
        <p className="mt-0.5 text-[12px] text-muted">Tendrá su propia estructura de datos, independiente de las demás.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-transparent p-1" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Nombre de la empresa"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-electric"
          />
          <Button variant="primary" onClick={add}>
            <Plus size={15} /> Agregar
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* Almacenamiento                                                     */
/* ================================================================== */

function StoragePanel() {
  const { ds, loadDemo, clearDemo, resetAll, replaceDataset, notify } = useStore();
  const demo = hasDemo(ds);
  const input = useRef<HTMLInputElement>(null);
  const bytes = activeRepository instanceof LocalStorageRepository ? activeRepository.bytesUsed() : 0;

  const restore = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text()) as Dataset;
      if (!parsed || !Array.isArray(parsed.monthly) || !Array.isArray(parsed.companies)) throw new Error('formato');
      if (!confirm('Se reemplazarán todos los datos actuales por los del respaldo. ¿Continuar?')) return;
      replaceDataset({ ...parsed, channels: parsed.channels ?? [], social: parsed.social ?? [], posts: parsed.posts ?? [], goals: parsed.goals ?? [], costs: parsed.costs ?? [], settings: parsed.settings ?? {}, log: parsed.log ?? [] });
      notify('Respaldo restaurado.');
    } catch {
      notify('El archivo no es un respaldo válido de esta plataforma.', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <HardDrive size={17} className="text-muted" />
          <div className="text-[13.5px] font-medium text-ink">{activeRepository.label}</div>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{activeRepository.scopeNote}</p>
        <div className="mt-3 text-[12px] text-faint">Espacio usado: {(bytes / 1024).toFixed(1)} KB de aproximadamente 5 MB.</div>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Para compartir datos entre varias personas, la capa de persistencia está aislada en <code className="rounded bg-sunken px-1">src/lib/repository.ts</code> y puede cambiarse por una base de
          datos sin tocar el resto de la aplicación.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportBackup(ds)}>
            <Download size={15} /> Descargar respaldo
          </Button>
          <Button variant="outline" onClick={() => input.current?.click()}>
            <RotateCcw size={15} /> Restaurar respaldo
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              e.target.value = '';
            }}
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <FlaskConical size={17} className="text-muted" />
          <div className="text-[13.5px] font-medium text-ink">Reporte inicial de Spartan Gym</div>
          {demo && <Tag tone="warn">Activos</Tag>}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Ventas, inversión por red y leads de enero a septiembre de 2026 (Excel_actualizado.xlsx) y el corte de leads del 20 de octubre. Restaurarlo solo agrega lo que falte; nunca reemplaza datos que hayas importado o editado.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {demo ? (
            <Button variant="outline" onClick={() => (clearDemo(), notify('Datos base eliminados.'))}>
              <Trash2 size={15} /> Quitar datos base
            </Button>
          ) : (
            <Button variant="outline" onClick={() => (loadDemo(), notify('Reporte inicial restaurado.'))}>
              <FlaskConical size={15} /> Restaurar reporte inicial
            </Button>
          )}
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <div className="text-[13px] font-medium text-ink">Borrar todo</div>
          <p className="mt-1 text-[12px] text-muted">Elimina empresas agregadas, registros, metas e historial de este navegador.</p>
          <Button
            variant="danger"
            className="mt-3"
            onClick={() => {
              if (confirm('Se borrarán todos los datos guardados en este navegador. Descarga un respaldo antes si lo necesitas. ¿Continuar?')) {
                resetAll();
                notify('Datos borrados.');
              }
            }}
          >
            <Trash2 size={15} /> Borrar todos los datos
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* Historial                                                          */
/* ================================================================== */

function LogPanel() {
  const ds = useStore((s) => s.ds);
  if (!ds.log.length) return <Card><Empty compact title="Sin importaciones registradas" body="Cada importación quedará registrada aquí con su archivo, empresa y resultado." /></Card>;
  return (
    <Card>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="px-5 py-2.5 font-medium">Fecha</th>
              <th className="px-3 py-2.5 font-medium">Archivo</th>
              <th className="px-3 py-2.5 font-medium">Empresa</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-5 py-2.5 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {ds.log.map((l) => (
              <tr key={l.id} className="border-b border-line/60 last:border-0">
                <td className="whitespace-nowrap px-5 py-2.5 text-muted">{new Date(l.at).toLocaleString('es-GT')}</td>
                <td className="px-3 py-2.5 text-ink">{l.file}</td>
                <td className="px-3 py-2.5 text-muted">{ds.companies.find((c) => c.id === l.companyId)?.name ?? l.companyId}</td>
                <td className="px-3 py-2.5 text-muted">{KIND_LABEL[l.kind]}</td>
                <td className="tnum px-5 py-2.5 text-right text-ink">
                  {l.inserted} nuevos, {l.updated} actualizados{l.skipped ? `, ${l.skipped} omitidos` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
