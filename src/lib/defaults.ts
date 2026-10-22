import type { Company, Dataset } from '../types';

export const DATASET_VERSION = 2;

export const DEFAULT_COMPANIES: Company[] = [
  {
    id: 'spartan-gym',
    name: 'Spartan Gym',
    shortName: 'Spartan',
    city: 'Quetzaltenango',
    color: '#2F5BFF',
    note: 'Quetzaltenango. Datos base: REPORTE_DASHABOARD.xlsx (enero a septiembre de 2026) y corte de leads del 20 de octubre.',
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
    costs: [],
    leadSnapshots: [],
    settings: {},
    log: [],
  };
}
