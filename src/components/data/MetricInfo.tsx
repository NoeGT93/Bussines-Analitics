import { GLOSSARY, SOCIAL_TO_GLOSS } from '../../lib/glossary';
import { cx } from '../ui';

/**
 * Contenido de la tarjeta flotante de un indicador: nombre, sigla, qué es, cómo se calcula
 * (con la cuenta del período si se pasa `calc`) y de dónde sale el dato.
 */
export function MetricInfo({
  k,
  label,
  calc,
  fuente,
  real,
  que,
  formula,
  tag,
}: {
  k: string;
  label?: string;
  calc?: string;
  fuente?: string;
  real?: boolean;
  que?: string;
  formula?: string;
  /** Texto de la etiqueta de origen; si se omite se usa Dato real / Calculado */
  tag?: string;
}) {
  const g = GLOSSARY[SOCIAL_TO_GLOSS[k] ?? k];
  const isReal = real ?? g?.real ?? false;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{label ?? g?.label ?? k}</span>
        <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium', isReal ? 'bg-up/10 text-up' : 'bg-electric/10 text-electric')}>{tag ?? (isReal ? 'Dato real' : 'Calculado')}</span>
      </div>
      {g?.sigla && (
        <div className="rounded-lg border border-electric/20 bg-electric/5 px-2.5 py-1.5 text-[11.5px] text-ink">
          <b className="font-semibold">{g.sigla.abbr}</b>
          {g.sigla.abbr !== g.sigla.en ? (
            <>
              {' '}= <i>{g.sigla.en}</i>: {g.sigla.es}
            </>
          ) : (
            <>: palabra en inglés que significa {g.sigla.es}</>
          )}
        </div>
      )}
      <p className="text-ink">{que ?? g?.que}</p>
      <div className="rounded-lg bg-sunken px-2.5 py-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Cómo se calcula</div>
        <div className="mt-0.5 text-ink">{formula ?? g?.formula}</div>
        {calc && <div className="tnum mt-1 font-mono text-[11.5px] text-electric">{calc}</div>}
      </div>
      {fuente && <p className="text-[11.5px] text-faint">{fuente}</p>}
    </div>
  );
}
