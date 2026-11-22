export type PigBreed = 'Landrace' | 'Yorkshire' | 'Duroc' | 'Persilangan F1';

export type PigPhase =
  | 'Anak Babi'
  | 'Sapihan'
  | 'Pembesaran'
  | 'Penggemukan'
  | 'Indukan'
  | 'Pejantan';

export type HealthStatus = 'Sehat' | 'Pantauan' | 'Karantina' | 'Siap Panen';

export interface PigBatch {
  id: string;
  penName: string;
  breed: PigBreed;
  phase: PigPhase;
  count: number;
  avgWeightKg: number;
  healthStatus: HealthStatus;
  notes: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PopulationEvent {
  id: string;
  type: 'create' | 'update' | 'delete';
  penName: string;
  breed: string;
  phase: string;
  previousCount: number | null;
  newCount: number;
  delta: number;
  actor: string;
  timestamp: string;
}

export interface CreateBatchInput {
  penName: string;
  breed: PigBreed;
  phase: PigPhase;
  count: number;
  avgWeightKg: number;
  healthStatus: HealthStatus;
  notes: string;
  actor: string;
}

export interface UpdateBatchInput {
  penName?: string;
  breed?: PigBreed;
  phase?: PigPhase;
  count?: number;
  avgWeightKg?: number;
  healthStatus?: HealthStatus;
  notes?: string;
  actor: string;
}

export const PIG_BREEDS: PigBreed[] = [
  'Landrace',
  'Yorkshire',
  'Duroc',
  'Persilangan F1',
];

export const PIG_PHASES: PigPhase[] = [
  'Anak Babi',
  'Sapihan',
  'Pembesaran',
  'Penggemukan',
  'Indukan',
  'Pejantan',
];

export const HEALTH_STATUSES: HealthStatus[] = [
  'Sehat',
  'Pantauan',
  'Karantina',
  'Siap Panen',
];
