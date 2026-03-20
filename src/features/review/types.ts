export interface RoundReview {
  round_id: string;
  total_score: number;
  scores: ScoreSummary[];
  memos: MemoSummary[];
}

export interface ScoreSummary {
  hole_number: number;
  par: number;
  strokes: number;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_reg: boolean | null;
}

export interface MemoSummary {
  hole_number: number;
  content: string;
  source: 'voice' | 'text';
}
