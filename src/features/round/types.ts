export type RoundStatus = 'in_progress' | 'completed';
export type StartingCourse = 'out' | 'in';

export interface Round {
  id: string;
  user_id: string;
  course_id: string;
  played_at: string;
  context_snapshot: Record<string, unknown> | null;
  total_score: number | null;
  status: RoundStatus;
  starting_course: StartingCourse;
}

export interface RoundCourse {
  id: string;
  name: string;
  prefecture: string | null;
}

export interface RoundWithCourse extends Round {
  courses: RoundCourse | null;
}
