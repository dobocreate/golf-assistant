/**
 * ゴルフ関連の共通定数
 * lie / slope / shot-type / distance の定義を一元管理
 * DB値・日本語ラベル・バリデーション値をすべてここで定義
 */

import type { ShotLie, ShotSlopeFB, ShotSlopeLR, ShotType } from '@/features/score/types';

// --- ライ ---

export const LIE_OPTIONS: readonly { value: ShotLie; label: string; shortLabel: string }[] = [
  { value: 'tee', label: 'ティーアップ', shortLabel: 'ティー' },
  { value: 'fairway', label: 'フェアウェイ', shortLabel: 'FW' },
  { value: 'rough', label: 'ラフ', shortLabel: 'ラフ' },
  { value: 'bunker', label: 'バンカー', shortLabel: 'バンカー' },
  { value: 'woods', label: '林', shortLabel: '林' },
];

export const VALID_LIES: ShotLie[] = LIE_OPTIONS.map(l => l.value);

export const LIE_DB_TO_LABEL: Record<string, string> = Object.fromEntries(
  LIE_OPTIONS.map(l => [l.value, l.label])
);

// --- 傾斜（前後） ---

export const SLOPE_FB_OPTIONS: readonly { value: ShotSlopeFB; label: string; shortLabel: string }[] = [
  { value: 'toe_up', label: 'つま先上がり', shortLabel: 'つま先↑' },
  { value: 'toe_down', label: 'つま先下がり', shortLabel: 'つま先↓' },
];

export const VALID_SLOPE_FB: ShotSlopeFB[] = SLOPE_FB_OPTIONS.map(s => s.value);

export const SLOPE_FB_DB_TO_LABEL: Record<string, string> = Object.fromEntries(
  SLOPE_FB_OPTIONS.map(s => [s.value, s.label])
);

// --- 傾斜（左右） ---

export const SLOPE_LR_OPTIONS: readonly { value: ShotSlopeLR; label: string; shortLabel: string }[] = [
  { value: 'left_up', label: '左足上がり', shortLabel: '左足↑' },
  { value: 'left_down', label: '左足下がり', shortLabel: '左足↓' },
];

export const VALID_SLOPE_LR: ShotSlopeLR[] = SLOPE_LR_OPTIONS.map(s => s.value);

export const SLOPE_LR_DB_TO_LABEL: Record<string, string> = Object.fromEntries(
  SLOPE_LR_OPTIONS.map(s => [s.value, s.label])
);

// --- ショット種別（アドバイス用） ---

export const SHOT_TYPE_OPTIONS: readonly { value: ShotType; label: string }[] = [
  { value: 'tee_shot', label: 'ティーショット' },
  { value: 'second', label: 'セカンド' },
  { value: 'approach', label: 'アプローチ' },
  { value: 'putt', label: 'パット' },
];

export const VALID_SHOT_TYPES: ShotType[] = SHOT_TYPE_OPTIONS.map(s => s.value);

export const SHOT_TYPE_DB_TO_LABEL: Record<string, string> = Object.fromEntries(
  SHOT_TYPE_OPTIONS.map(s => [s.value, s.label])
);

// アドバイス画面用（日本語ラベル配列）— 後方互換
export const SHOT_TYPES = SHOT_TYPE_OPTIONS.map(s => s.label);

// --- 残り距離（アドバイス用） ---

export const DISTANCES = ['〜100y', '100〜150y', '150〜200y', '200y+'] as const;
