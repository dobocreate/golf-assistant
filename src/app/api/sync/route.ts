import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/utils';

interface SyncRequestBody {
  roundId: string;
  holeNumber: number;
  score?: {
    strokes: number;
    putts: number | null;
    fairwayHit: boolean | null;
    greenInReg: boolean | null;
    teeShotLr: string | null;
    teeShotFb: string | null;
    obCount: number;
    bunkerCount: number;
    penaltyCount: number;
    firstPuttDistance: string | null;
    firstPuttDistanceM?: number | null;
    windDirection: string | null;
    windStrength: string | null;
  };
  shots?: Array<{
    id?: string;
    clientId: string;
    shotNumber: number;
    club: string | null;
    result: string | null;
    missType: string | null;
    directionLr: string | null;
    directionFb: string | null;
    lie: string | null;
    slopeFb: string | null;
    slopeLr: string | null;
    landing: string | null;
    shotType: string | null;
    remainingDistance: number | null;
    note: string | null;
    adviceText: string | null;
    windDirection: string | null;
    windStrength: string | null;
    elevation: string | null;
  }>;
  companions?: Array<{
    companionId: string;
    strokes: number | null;
    putts: number | null;
  }>;
}

interface SyncResult {
  score?: { success: boolean; error?: string };
  shots?: { success: boolean; error?: string };
  companions?: { success: boolean; error?: string };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
    }

    let body: SyncRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const { roundId, holeNumber, score, shots, companions } = body;

    if (!isValidUUID(roundId)) {
      return NextResponse.json({ error: 'ラウンドIDが不正です。' }, { status: 400 });
    }
    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      return NextResponse.json({ error: 'ホール番号が不正です。' }, { status: 400 });
    }
    if (!score && !shots && !companions) {
      return NextResponse.json({ error: '保存データがありません。' }, { status: 400 });
    }

    // Verify round ownership
    const { data: round } = await supabase
      .from('rounds')
      .select('id')
      .eq('id', roundId)
      .eq('user_id', user.id)
      .in('status', ['in_progress', 'completed'])
      .single();

    if (!round) {
      return NextResponse.json({ error: 'ラウンドが見つかりません。' }, { status: 404 });
    }

    const result: SyncResult = {};

    // Save score
    if (score) {
      try {
        const { error } = await supabase
          .from('scores')
          .upsert(
            {
              round_id: roundId,
              hole_number: holeNumber,
              strokes: score.strokes,
              putts: score.putts,
              fairway_hit: score.fairwayHit,
              green_in_reg: score.greenInReg,
              tee_shot_lr: score.teeShotLr,
              tee_shot_fb: score.teeShotFb,
              ob_count: score.obCount,
              bunker_count: score.bunkerCount,
              penalty_count: score.penaltyCount,
              first_putt_distance: score.firstPuttDistance,
              first_putt_distance_m: score.firstPuttDistanceM ?? null,
              wind_direction: score.windDirection,
              wind_strength: score.windStrength,
            },
            { onConflict: 'round_id,hole_number' }
          );

        if (error) {
          result.score = { success: false, error: 'スコアの保存に失敗しました。' };
        } else {
          // Recalculate total_score
          const { data: allScores } = await supabase
            .from('scores')
            .select('strokes')
            .eq('round_id', roundId);
          if (allScores) {
            const total = allScores.reduce((sum: number, s: { strokes: number }) => sum + s.strokes, 0);
            await supabase
              .from('rounds')
              .update({ total_score: total })
              .eq('id', roundId);
          }
          result.score = { success: true };
        }
      } catch {
        result.score = { success: false, error: 'スコアの保存に失敗しました。' };
      }
    }

    // Save shots via RPC (atomic delete+insert in transaction)
    if (shots) {
      try {
        const { error: rpcError } = await supabase.rpc('replace_shots_for_hole', {
          p_round_id: roundId,
          p_hole_number: holeNumber,
          p_shots: shots.map((s) => ({
            shot_number: s.shotNumber,
            club: s.club,
            result: s.result,
            miss_type: s.missType,
            direction_lr: s.directionLr,
            direction_fb: s.directionFb,
            lie: s.lie,
            slope_fb: s.slopeFb,
            slope_lr: s.slopeLr,
            landing: s.landing,
            shot_type: s.shotType,
            remaining_distance: s.remainingDistance,
            note: s.note,
            advice_text: s.adviceText,
            wind_direction: s.windDirection,
            wind_strength: s.windStrength,
            elevation: s.elevation,
          })),
        });

        result.shots = rpcError
          ? { success: false, error: 'ショットの保存に失敗しました。' }
          : { success: true };
      } catch {
        result.shots = { success: false, error: 'ショットの保存に失敗しました。' };
      }
    }

    // Save companion scores via RPC (atomic delete+insert in transaction)
    if (companions) {
      try {
        const { error: rpcError } = await supabase.rpc('replace_companion_scores_for_hole', {
          p_round_id: roundId,
          p_hole_number: holeNumber,
          p_scores: companions.map((s) => ({
            companion_id: s.companionId,
            strokes: s.strokes,
            putts: s.putts,
          })),
        });

        result.companions = rpcError
          ? { success: false, error: '同伴者スコアの保存に失敗しました。' }
          : { success: true };
      } catch {
        result.companions = { success: false, error: '同伴者スコアの保存に失敗しました。' };
      }
    }

    // Check if any operation failed
    const anyFailed = Object.values(result).some((r) => !r.success);

    return NextResponse.json(
      { result },
      { status: anyFailed ? 207 : 200 }
    );
  } catch {
    return NextResponse.json(
      { error: '予期しないエラーが発生しました。' },
      { status: 500 }
    );
  }
}
