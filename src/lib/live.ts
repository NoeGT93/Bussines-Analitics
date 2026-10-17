import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useStore } from '../store/useStore';

/**
 * Reloj compartido para las animaciones continuas: todas las tarjetas y gráficos
 * avanzan al mismo ritmo, como un tablero de bolsa. Se detiene si la pestaña no está
 * visible, si la persona desactiva la animación o si el sistema pide reducir movimiento.
 * No genera datos: solo recorre los puntos que ya existen.
 */
export const LIVE_STEP_MS = 1800;

const listeners = new Set<(n: number) => void>();
let tick = 0;
let timer: number | undefined;

function start() {
  if (timer !== undefined) return;
  timer = window.setInterval(() => {
    if (document.hidden) return;
    tick++;
    listeners.forEach((l) => l(tick));
  }, LIVE_STEP_MS);
}

function stop() {
  if (listeners.size || timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
}

export function useLiveEnabled() {
  const pref = useStore((s) => s.liveMotion);
  const reduce = useReducedMotion();
  return pref && !reduce;
}

/** Devuelve el pulso actual, o null si la animación continua está apagada */
export function useLiveTick(): number | null {
  const live = useLiveEnabled();
  const [t, setT] = useState(tick);
  useEffect(() => {
    if (!live) return;
    listeners.add(setT);
    start();
    return () => {
      listeners.delete(setT);
      stop();
    };
  }, [live]);
  return live ? t : null;
}
