export interface Profile {
  id: string;
  user_id: string;
  handicap: number | null;
  play_style: string | null;
  miss_tendency: string | null;
  fatigue_note: string | null;
  favorite_shot: string | null;
  favorite_distance: string | null;
  situation_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Club {
  id: string;
  profile_id: string;
  name: string;
  distance: number | null;
  is_weak: boolean;
  confidence: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const CLUB_PRESETS = [
  '1W', '3W', '5W',
  '3I', '4I', '5I', '6I', '7I', '8I', '9I',
  'PW', 'AW', 'SW',
  'PT',
] as const;

export const PLAY_STYLES = [
  { value: 'aggressive', label: '攻撃的' },
  { value: 'balanced', label: 'バランス型' },
  { value: 'conservative', label: '安定型' },
] as const;
