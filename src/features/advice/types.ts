export interface Situation {
  hole_number: number;
  remaining_distance: number;
  lie: string;
  wind: string | null;
  notes: string | null;
}

export interface Advice {
  recommended_club: string;
  strategy: string;
  notes: string | null;
}

export interface AdviceContext {
  profile: Record<string, unknown>;
  clubs: Record<string, unknown>[];
  course: Record<string, unknown>;
  hole_notes: Record<string, unknown>[];
  recent_rounds: Record<string, unknown>[];
}
