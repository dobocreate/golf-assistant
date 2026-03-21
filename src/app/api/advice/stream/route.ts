import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';
import { buildAdviceContext, formatContextForPrompt, buildScoreContext } from '@/features/advice/lib/context-builder';
import { createSystemPrompt, createUserPrompt } from '@/features/advice/lib/prompt-template';

const VALID_SHOT_TYPES = ['ティーショット', 'セカンド', 'アプローチ', 'パット'];
const VALID_LIES = ['ティーアップ', 'フェアウェイ', 'ラフ', 'バンカー', '林'];
const VALID_SLOPE_FB = ['toe_up', 'toe_down'];
const VALID_SLOPE_LR = ['left_up', 'left_down'];

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  try {
    // 認証チェック
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('ログインが必要です。', 401);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonError('Gemini APIが設定されていません。', 503);

    let body: {
      roundId: string;
      holeNumber: number;
      shotType: string;
      remainingDistance: string;
      lie: string;
      slopeFB?: string | null;
      slopeLR?: string | null;
      notes?: string;
    };

    try {
      body = await request.json();
    } catch {
      return jsonError('リクエストが不正です。', 400);
    }

    if (!body.roundId || !body.holeNumber || !body.shotType || !body.remainingDistance || !body.lie) {
      return jsonError('必須パラメータが不足しています。', 400);
    }

    // バリデーション
    const VALID_DISTANCES = ['〜100y', '100〜150y', '150〜200y', '200y+'];
    if (!Number.isInteger(body.holeNumber) || body.holeNumber < 1 || body.holeNumber > 18) {
      return jsonError('ホール番号が不正です。', 400);
    }
    if (!VALID_SHOT_TYPES.includes(body.shotType)) {
      return jsonError('ショット種別が不正です。', 400);
    }
    if (!VALID_DISTANCES.includes(body.remainingDistance)) {
      return jsonError('残り距離が不正です。', 400);
    }
    if (!VALID_LIES.includes(body.lie)) {
      return jsonError('ライが不正です。', 400);
    }
    if (body.notes && body.notes.length > 200) {
      return jsonError('補足は200文字以内で入力してください。', 400);
    }
    if (body.slopeFB !== null && body.slopeFB !== undefined && !VALID_SLOPE_FB.includes(body.slopeFB)) {
      return jsonError('前後傾斜が不正です。', 400);
    }
    if (body.slopeLR !== null && body.slopeLR !== undefined && !VALID_SLOPE_LR.includes(body.slopeLR)) {
      return jsonError('左右傾斜が不正です。', 400);
    }

    // コンテキスト構築
    const context = await buildAdviceContext(body.roundId);
    if (!context) return jsonError('ラウンド情報の取得に失敗しました。', 404);

    const [contextText, scoreContext] = await Promise.all([
      Promise.resolve(formatContextForPrompt(context)),
      buildScoreContext(body.roundId),
    ]);
    const fullContext = scoreContext
      ? `${contextText}\n\n${scoreContext}`
      : contextText;
    const systemPrompt = createSystemPrompt(fullContext);
    const userPrompt = createUserPrompt({
      holeNumber: body.holeNumber,
      shotType: body.shotType,
      remainingDistance: body.remainingDistance,
      lie: body.lie,
      slopeFB: body.slopeFB,
      slopeLR: body.slopeLR,
      notes: body.notes,
    });

    // Gemini API ストリーミング
    const googleAI = createGoogleGenerativeAI({ apiKey });
    const result = streamText({
      model: googleAI(process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 8192,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Advice API Error:', error);
    return jsonError('サーバー内部でエラーが発生しました。', 500);
  }
}
