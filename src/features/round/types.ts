export type RoundStatus = 'in_progress' | 'completed';
export type StartingCourse = 'out' | 'in';
export type Weather = 'sunny' | 'cloudy' | 'light_rain' | 'rain';
export type WindStrength = 'calm' | 'light' | 'moderate' | 'strong';
export type WindDirection = 'head' | 'tail' | 'left' | 'right';

export const WEATHER_VALUES: Weather[] = ['sunny', 'cloudy', 'light_rain', 'rain'];
export const WIND_STRENGTH_VALUES: WindStrength[] = ['calm', 'light', 'moderate', 'strong'];
export const WIND_DIRECTION_VALUES: WindDirection[] = ['head', 'tail', 'left', 'right'];

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: '晴れ',
  cloudy: '曇り',
  light_rain: '小雨',
  rain: '雨',
};

export const WIND_STRENGTH_LABELS: Record<WindStrength, string> = {
  calm: '無風',
  light: '微風',
  moderate: 'やや強い',
  strong: '強い',
};

export const WIND_DIRECTION_LABELS: Record<WindDirection, string> = {
  head: '向かい風',
  tail: '追い風',
  left: '左から',
  right: '右から',
};

export interface Round {
  id: string;
  user_id: string;
  course_id: string;
  played_at: string;
  /** jsonbカラムにフォーマット済みテキスト(string)を保存。AIアドバイス用キャッシュ。 */
  context_snapshot: string | Record<string, unknown> | null;
  total_score: number | null;
  status: RoundStatus;
  created_at: string;
  starting_course: StartingCourse;
  weather: Weather | null;
  wind: WindStrength | null;
  target_score: number | null;
  review_note: string | null;
}

export interface RoundCourse {
  id: string;
  name: string;
  prefecture: string | null;
}

export interface RoundWithCourse extends Round {
  courses: RoundCourse | null;
}
