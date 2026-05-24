import type { ShotLie, ShotSlopeFB, ShotSlopeLR } from '@/features/score/types';
import type { StartingCourse } from '@/features/round/types';
import type { HoleArea, HoleMapPoint } from '@/lib/geo';
import type { ShotPatternStat } from './lib/shot-stats';

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

export interface KnowledgeContext {
  title: string;
  content: string;
  category: string | null;
  tags: string[];
}

export interface AdviceContext {
  profile: Record<string, unknown>;
  clubs: Record<string, unknown>[];
  course: Record<string, unknown>;
  holes: Record<string, unknown>[];
  hole_notes: Record<string, unknown>[];
  recent_rounds: Record<string, unknown>[];
  knowledge: KnowledgeContext[];
  starting_course: StartingCourse | null;
  /** ホールエリア情報（hole_areas テーブル、未登録の場合は空配列） */
  hole_areas: HoleArea[];
  /** ホールマップポイント（ティー基準点の特定に使用） */
  map_points: HoleMapPoint[];
  /** 使用グリーン（ツーグリーン制コースのみ） */
  active_green: 'A' | 'B' | null;
  /** 過去ショット傾向（lie × 距離 × クラブ別、サンプル3件以上、Top10）。AI が個別実績に基づくアドバイスを生成するため */
  shot_stats: ShotPatternStat[];
}
