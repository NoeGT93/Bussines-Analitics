import { useEffect, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { dataMonths, resolveCursor, useStore } from '../store/useStore';
import type { Period } from '../types';

/**
 * Recorrido mes a mes, controlado por la persona.
 * Un solo cursor (el mes seleccionado) sincroniza la cinta, las tarjetas y el gráfico principal.
 * Avanza solo únicamente si se pulsa reproducir; si no, se mueve con los botones o con las flechas del teclado.
 * Los destellos decorativos dependen de la preferencia "Animación continua" y del sistema (reducir movimiento).
 */
export const PLAY_STEP_MS = 1800;

export function useLiveEnabled() {
  const pref = useStore((s) => s.liveMotion);
  const reduce = useReducedMotion();
  return pref && !reduce;
}

/** Mes activo del recorrido, resuelto contra los meses con datos */
export function useCursor(): { period: Period | null; months: Period[]; index: number } {
  const ds = useStore((s) => s.ds);
  const scope = useStore((s) => s.scope);
  const range = useStore((s) => s.range);
  const cursor = useStore((s) => s.cursor);
  return useMemo(() => {
    const months = dataMonths(ds, scope, range);
    if (!months.length) return { period: null, months, index: -1 };
    const period = resolveCursor(months, cursor);
    return { period, months, index: months.indexOf(period) };
  }, [ds, scope, range, cursor]);
}

/** Se monta una vez: reproduce cuando corresponde y atiende las flechas del teclado */
export function PlaybackClock() {
  const playing = useStore((s) => s.playing);
  const stepCursor = useStore((s) => s.stepCursor);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      if (!document.hidden) stepCursor(1);
    }, PLAY_STEP_MS);
    return () => window.clearInterval(t);
  }, [playing, stepCursor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') stepCursor(1);
      if (e.key === 'ArrowLeft') stepCursor(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepCursor]);
  return null;
}
