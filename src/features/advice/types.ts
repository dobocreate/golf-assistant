import type { ShotLie, ShotSlopeFB, ShotSlopeLR } from '@/features/score/types';

export type SlopeFB = ShotSlopeFB;
export type SlopeLR = ShotSlopeLR;

export interface Situation {
  holeNumber: number;
  shotType: string;
  remainingDistance: string;
  lie: ShotLie;
  slopeFB: SlopeFB | null;
  slopeLR: SlopeLR | null;
  notes?: string;
}

export interface AdviceContext {
  profile: Record<string, unknown>;
  clubs: Record<string, unknown>[];
  course: Record<string, unknown>;
  holes: Record<string, unknown>[];
  hole_notes: Record<string, unknown>[];
  recent_rounds: Record<string, unknown>[];
  knowledge: Record<string, unknown>[];
}
