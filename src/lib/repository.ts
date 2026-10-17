import type { Dataset } from '../types';

/**
 * Capa de persistencia.
 * Hoy los datos viven en el navegador (localStorage): son privados de este equipo y este navegador,
 * no se comparten entre usuarios y se pierden si se borran los datos del sitio.
 * Para migrar a una base de datos, implementa esta misma interfaz (p. ej. SupabaseRepository o una API REST)
 * y cámbiala en `activeRepository`. El resto de la aplicación no necesita cambios.
 */
export interface DataRepository {
  readonly label: string;
  readonly scopeNote: string;
  load(): Dataset | null;
  save(ds: Dataset): void;
  clear(): void;
}

const KEY = 'ba-dataset-v1';

export class LocalStorageRepository implements DataRepository {
  readonly label = 'Almacenamiento local del navegador';
  readonly scopeNote =
    'Los datos se guardan solo en este navegador y este equipo. Otras personas no los ven y se pierden si se borran los datos del sitio. Exporta un respaldo en Excel con regularidad.';

  load(): Dataset | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Dataset;
      if (!parsed || !Array.isArray(parsed.monthly)) return null;
      // Compatibilidad con datos guardados por versiones anteriores
      return {
        ...parsed,
        channels: parsed.channels ?? [],
        social: parsed.social ?? [],
        posts: parsed.posts ?? [],
        goals: parsed.goals ?? [],
        costs: parsed.costs ?? [],
        settings: parsed.settings ?? {},
        log: parsed.log ?? [],
      };
    } catch {
      return null;
    }
  }

  save(ds: Dataset) {
    try {
      localStorage.setItem(KEY, JSON.stringify(ds));
    } catch (e) {
      console.error('No se pudo guardar el dataset', e);
    }
  }

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  }

  bytesUsed(): number {
    try {
      return (localStorage.getItem(KEY) ?? '').length * 2;
    } catch {
      return 0;
    }
  }
}

export const activeRepository = new LocalStorageRepository();
