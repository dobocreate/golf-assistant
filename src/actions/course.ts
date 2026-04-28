'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { Course } from '@/features/course/types';
import { isValidUUID } from '@/lib/utils';

function parseOptionalInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = parseInt(raw, 10);
  return isNaN(v) ? null : v;
}

function validateOptionalInt(value: number | null, min: number, max: number, label: string): string | null {
  if (value !== null && (isNaN(value) || value < min || value > max)) {
    return `${label}は${min}〜${max}の範囲で入力してください。`;
  }
  return null;
}

function validateOptionalEnum(value: string | null, allowed: string[], label: string): string | null {
  if (value !== null && !allowed.includes(value)) {
    return `${label}の値が不正です。`;
  }
  return null;
}

export async function getSavedCourses(): Promise<Course[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('courses')
    .select('id, gora_id, name, prefecture, address, layout_url')
    .order('name');

  return data ?? [];
}

interface SaveCourseData {
  goraId: string;
  name: string;
  prefecture: string;
  address: string;
  imageUrl?: string;
}

export async function saveCourse(data: SaveCourseData): Promise<{ error?: string; courseId?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!data.goraId || !data.name) return { error: 'コース情報が不足しています。' };

  const supabase = await createClient();

  // 既に保存済みかチェック
  const { data: existing } = await supabase
    .from('courses')
    .select('id')
    .eq('gora_id', data.goraId)
    .single();

  if (existing) {
    return { courseId: existing.id };
  }

  // DBに保存（検索結果のデータをそのまま使用）
  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      gora_id: data.goraId,
      name: data.name,
      prefecture: data.prefecture,
      address: data.address,
      layout_url: data.imageUrl || null,
    })
    .select('id')
    .single();

  if (error) return { error: 'コースの保存に失敗しました。' };

  revalidatePath('/courses');
  return { courseId: course.id };
}


export async function getCourseWithHoles(courseId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { course: null, holes: [], holeNotes: [] };
  if (!isValidUUID(courseId)) return { course: null, holes: [], holeNotes: [] };

  const supabase = await createClient();

  const [courseResult, holesResult, notesResult] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('holes').select('*').eq('course_id', courseId).order('hole_number'),
    supabase
      .from('hole_notes')
      .select('id, user_id, hole_id, note, strategy, holes!inner(course_id)')
      .eq('user_id', user.id)
      .eq('holes.course_id', courseId),
  ]);

  return {
    course: courseResult.data as Course | null,
    holes: holesResult.data ?? [],
    holeNotes: notesResult.data ?? [],
  };
}

export async function upsertHole(formData: FormData): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const courseId = formData.get('course_id') as string;
  const holeNumberRaw = formData.get('hole_number') as string;
  const parRaw = formData.get('par') as string;
  const distanceRaw = formData.get('distance') as string;

  if (!courseId || !isValidUUID(courseId)) return { error: 'コースIDが不正です。' };

  const holeNumber = parseInt(holeNumberRaw, 10);
  if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return { error: 'ホール番号は1〜18で入力してください。' };
  }

  const par = parseInt(parRaw, 10);
  if (isNaN(par) || par < 3 || par > 5) {
    return { error: 'Parは3〜5で入力してください。' };
  }

  const distance = distanceRaw ? parseInt(distanceRaw, 10) : null;
  if (distance !== null && (isNaN(distance) || distance < 0 || distance > 700)) {
    return { error: '距離は0〜700の範囲で入力してください。' };
  }

  // 新フィールドの読み取り
  const hdcp = parseOptionalInt(formData.get('hdcp') as string);
  const distanceBack = parseOptionalInt(formData.get('distance_back') as string);
  const distanceFront = parseOptionalInt(formData.get('distance_front') as string);
  const distanceLadies = parseOptionalInt(formData.get('distance_ladies') as string);
  const dogleg = (formData.get('dogleg') as string) || null;
  const elevation = (formData.get('elevation') as string) || null;

  const fieldError =
    validateOptionalInt(hdcp, 1, 18, 'HDCP') ??
    validateOptionalEnum(dogleg, ['straight', 'left', 'right'], 'ドッグレッグ') ??
    validateOptionalEnum(elevation, ['flat', 'uphill', 'downhill'], '高低差') ??
    validateOptionalInt(distanceBack, 0, 700, 'バックティー距離') ??
    validateOptionalInt(distanceFront, 0, 700, 'フロントティー距離') ??
    validateOptionalInt(distanceLadies, 0, 700, 'レディースティー距離');
  if (fieldError) return { error: fieldError };

  const supabase = await createClient();
  const { error } = await supabase
    .from('holes')
    .upsert(
      {
        course_id: courseId,
        hole_number: holeNumber,
        par,
        distance,
        hdcp,
        dogleg,
        elevation,
        distance_back: distanceBack,
        distance_front: distanceFront,
        distance_ladies: distanceLadies,
        hazard: (formData.get('hazard') as string) || null,
        ob: (formData.get('ob') as string) || null,
        description: (formData.get('description') as string) || null,
      },
      { onConflict: 'course_id,hole_number' }
    );

  if (error) return { error: 'ホール情報の保存に失敗しました。' };

  revalidatePath(`/courses/${courseId}`);
  return {};
}

export async function upsertHoleNote(formData: FormData): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  const holeId = formData.get('hole_id') as string;
  if (!holeId) return { error: 'ホールIDが必要です。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('hole_notes')
    .upsert(
      {
        user_id: user.id,
        hole_id: holeId,
        note: (formData.get('note') as string) || null,
        strategy: (formData.get('strategy') as string) || null,
      },
      { onConflict: 'user_id,hole_id' }
    );

  if (error) return { error: 'メモの保存に失敗しました。' };

  // holeIdからcourse_idを取得してコース詳細ページも再検証
  const { data: hole } = await supabase.from('holes').select('course_id').eq('id', holeId).single();
  if (hole?.course_id) {
    revalidatePath(`/courses/${hole.course_id}`);
  }
  revalidatePath('/courses');
  return {};
}

interface HoleImportData {
  holeNumber: number;
  par: number;
  distance: number | null;
  hdcp: number | null;
  dogleg: string | null;
  elevation: string | null;
  distanceBack: number | null;
  distanceFront: number | null;
  distanceLadies: number | null;
  hazard: string | null;
  ob: string | null;
  description: string | null;
}

export async function importHoles(
  courseId: string,
  holes: HoleImportData[]
): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };

  if (!isValidUUID(courseId)) return { error: 'コースIDが不正です。' };

  if (!Array.isArray(holes) || holes.length === 0) {
    return { error: 'ホールデータが必要です。' };
  }

  // バリデーション
  const seenHoles = new Set<number>();
  for (const h of holes) {
    if (!Number.isInteger(h.holeNumber) || h.holeNumber < 1 || h.holeNumber > 18) {
      return { error: `ホール番号が不正です: ${h.holeNumber}` };
    }
    if (seenHoles.has(h.holeNumber)) {
      return { error: `ホール${h.holeNumber}が重複しています。` };
    }
    seenHoles.add(h.holeNumber);

    const prefix = `ホール${h.holeNumber}: `;
    const holeError =
      validateOptionalInt(h.par, 3, 5, 'Par') ??
      validateOptionalInt(h.distance, 0, 700, '距離') ??
      validateOptionalInt(h.hdcp, 1, 18, 'HDCP') ??
      validateOptionalEnum(h.dogleg, ['straight', 'left', 'right'], 'ドッグレッグ') ??
      validateOptionalEnum(h.elevation, ['flat', 'uphill', 'downhill'], '高低差') ??
      validateOptionalInt(h.distanceBack, 0, 700, 'バックティー距離') ??
      validateOptionalInt(h.distanceFront, 0, 700, 'フロントティー距離') ??
      validateOptionalInt(h.distanceLadies, 0, 700, 'レディースティー距離');
    if (holeError) return { error: prefix + holeError };
  }

  const supabase = await createClient();

  // コースの存在確認
  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .single();
  if (!course) return { error: 'コースが見つかりません。' };

  // 全ホールをupsert
  const { error } = await supabase
    .from('holes')
    .upsert(
      holes.map(h => ({
        course_id: courseId,
        hole_number: h.holeNumber,
        par: h.par,
        distance: h.distance,
        hdcp: h.hdcp,
        dogleg: h.dogleg,
        elevation: h.elevation,
        distance_back: h.distanceBack,
        distance_front: h.distanceFront,
        distance_ladies: h.distanceLadies,
        hazard: h.hazard,
        ob: h.ob,
        description: h.description,
      })),
      { onConflict: 'course_id,hole_number' }
    );

  if (error) return { error: 'ホール情報のインポートに失敗しました。' };

  revalidatePath(`/courses/${courseId}`);
  return {};
}

function validateLatLng(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '座標値が不正です。';
  if (lat < -90 || lat > 90) return '緯度が不正です（-90〜90）。';
  if (lng < -180 || lng > 180) return '経度が不正です（-180〜180）。';
  return null;
}

export async function updateHoleCoordinates(
  holeId: string,
  tee: { lat: number; lng: number } | null,
  green: { lat: number; lng: number } | null,
): Promise<{ error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { error: 'ログインが必要です。' };
  if (!isValidUUID(holeId)) return { error: 'ホールIDが不正です。' };

  if (tee) {
    const err = validateLatLng(tee.lat, tee.lng);
    if (err) return { error: err };
  }
  if (green) {
    const err = validateLatLng(green.lat, green.lng);
    if (err) return { error: err };
  }

  const supabase = await createClient();

  const { data: hole, error: holeError } = await supabase
    .from('holes')
    .select('course_id')
    .eq('id', holeId)
    .single();

  if (holeError || !hole) return { error: 'ホールが見つかりません。' };

  const { data: updated, error } = await supabase
    .from('holes')
    .update({
      tee_lat: tee?.lat ?? null,
      tee_lng: tee?.lng ?? null,
      green_lat: green?.lat ?? null,
      green_lng: green?.lng ?? null,
    })
    .eq('id', holeId)
    .select('id');

  if (error || !updated?.length) return { error: '座標の保存に失敗しました。' };

  revalidatePath(`/courses/${hole.course_id}`);

  return {};
}
