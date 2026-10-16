import type { Company, Dataset } from '../types';

export const DATASET_VERSION = 1;

export const DEFAULT_COMPANIES: Company[] = [
  {
    id: 'copicentro-ovni',
    name: 'Copicentro OVNI',
    shortName: 'OVNI',
    color: '#2F5BFF',
    links: [
      { label: 'Sitio web', url: 'https://copicentrovni.wixsite.com/copicentro-ovni' },
      { label: 'Perfil en Construex', url: 'https://www.construex.gt/exhibidores/copicentros_ovni' },
    ],
    note: 'Datos base: archivo Dashboard_Copicentro.xlsx (cifras demostrativas, no verificadas).',
  },
  {
    id: 'construex-gt',
    name: 'Construex Guatemala',
    shortName: 'Construex',
    color: '#0E9F8E',
    links: [{ label: 'Sitio web', url: 'https://www.construex.gt' }],
    note: 'Estructura lista para incorporar datos reales. Aún sin registros.',
  },
];

export function emptyDataset(): Dataset {
  return {
    version: DATASET_VERSION,
    companies: DEFAULT_COMPANIES,
    monthly: [],
    channels: [],
    social: [],
    posts: [],
    goals: [],
    log: [],
  };
}
