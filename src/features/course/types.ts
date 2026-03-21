export interface Course {
  id: string;
  gora_id: string | null;
  name: string;
  prefecture: string | null;
  address: string | null;
  layout_url: string | null;
}

export type Dogleg = 'straight' | 'left' | 'right';
export type Elevation = 'flat' | 'uphill' | 'downhill';

export interface Hole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  distance: number | null;
  hdcp: number | null;
  dogleg: Dogleg | null;
  elevation: Elevation | null;
  distance_back: number | null;
  distance_front: number | null;
  distance_ladies: number | null;
  hazard: string | null;
  ob: string | null;
  description: string | null;
}

export interface HoleNote {
  id: string;
  user_id: string;
  hole_id: string;
  note: string | null;
  strategy: string | null;
}
