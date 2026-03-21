export type SlopeFB = 'toe_up' | 'toe_down';
export type SlopeLR = 'left_up' | 'left_down';

export interface Situation {
  holeNumber: number;
  shotType: string;
  remainingDistance: string;
  lie: string;
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
}
