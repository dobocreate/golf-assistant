import { createClient } from '@/lib/supabase/server';
import { buildPracticeContext } from '@/features/advice/lib/practice-context-builder';
import { createPracticeSystemPrompt, createPracticeUserPrompt } from '@/features/advice/lib/practice-prompt-template';
import { jsonError, createGeminiStream } from '@/lib/llm';
import { isValidUUID } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('ログインが必要です。', 401);

    if (!process.env.GEMINI_API_KEY) return jsonError('Gemini APIが設定されていません。', 503);

    let body: { roundId: string };
    try {
      body = await request.json();
    } catch {
      return jsonError('リクエストが不正です。', 400);
    }

    if (!body.roundId || !isValidUUID(body.roundId)) return jsonError('ラウンドIDが不正です。', 400);

    // ラウンドのステータス確認（completedのみ）
    const { data: round } = await supabase
      .from('rounds')
      .select('status, review_note')
      .eq('id', body.roundId)
      .eq('user_id', user.id)
      .single();

    if (!round) return jsonError('ラウンドが見つかりません。', 404);
    if (round.status !== 'completed') return jsonError('完了済みのラウンドのみ練習提案を受けられます。', 400);

    // コンテキスト構築
    const context = await buildPracticeContext(body.roundId, user.id);
    if (!context) return jsonError('ラウンドデータの取得に失敗しました。', 404);

    const systemPrompt = createPracticeSystemPrompt(context);
    const userPrompt = createPracticeUserPrompt(round.review_note);

    return createGeminiStream(systemPrompt, userPrompt, 4096);
  } catch (error) {
    console.error('Practice Suggestion API Error:', error);
    return jsonError('サーバー内部でエラーが発生しました。', 500);
  }
}
