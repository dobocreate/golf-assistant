export interface Course {
  id: string;
  gora_id: string | null;
  name: string;
  prefecture: string | null;
  address: string | null;
  layout_url: string | null;
}

export interface Hole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  distance: number | null;
  description: string | null;
}

export interface HoleNote {
  id: string;
  user_id: string;
  hole_id: string;
  note: string | null;
  strategy: string | null;
}
