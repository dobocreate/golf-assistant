export interface CourseSearchResult {
  id: string;
  name: string;
  prefecture: string;
  address: string;
  image_url?: string;
}

export interface CourseDetail {
  id: string;
  name: string;
  prefecture: string;
  address: string;
  layout_url?: string;
  holes: CourseHole[];
  raw_data?: Record<string, unknown>;
}

export interface CourseHole {
  hole_number: number;
  par: number;
  distance: number;
  description?: string;
}

export interface CourseSource {
  search(query: string, prefecture?: string): Promise<CourseSearchResult[]>;
  getDetail(courseId: string): Promise<CourseDetail | null>;
}
