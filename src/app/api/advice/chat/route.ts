import { createClient } from '@/lib/supabase/server';
import { getOrBuildContextSnapshot, buildScoreContext } from '@/features/advice/lib/context-builder';
import { createChatSystemPrompt, createChatUserPrompt, MAX_CHAT_TOKENS } from '@/features/advice/lib/prompt-template';
import { jsonError, createGeminiStream } from '@/lib/llm';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('ログインが必要です。', 401);

    if (!process.env.GEMINI_API_KEY) return jsonError('Gemini APIが設定されていません。', 503);

    let body: {
      roundId: string;
      holeNumber: number;
      question: string;
    };

    try {
      body = await request.json();
    } catch {
      return jsonError('リクエストが不正です。', 400);
    }

    if (!body.roundId || !body.holeNumber || !body.question) {
      return jsonError('必須パラメータが不足しています。', 400);
    }

    if (!Number.isInteger(body.holeNumber) || body.holeNumber < 1 || body.holeNumber > 18) {
      return jsonError('ホール番号が不正です。', 400);
    }

    if (body.question.length > 500) {
      return jsonError('質問は500文字以内で入力してください。', 400);
    }

    const snapshotResult = await getOrBuildContextSnapshot(body.roundId, user.id);
    if (!snapshotResult) return jsonError('ラウンド情報の取得に失敗しました。', 404);

    const scoreContext = await buildScoreContext(body.roundId, user.id, snapshotResult.startingCourse, snapshotResult.courseId);

    const fullContext = scoreContext
      ? `${snapshotResult.contextText}\n\n${scoreContext}`
      : snapshotResult.contextText;

    const systemPrompt = createChatSystemPrompt(fullContext);
    const userPrompt = createChatUserPrompt(body.holeNumber, body.question);

    return createGeminiStream(systemPrompt, userPrompt, MAX_CHAT_TOKENS);
  } catch (error) {
    console.error('Chat API Error:', error);
    return jsonError('サーバー内部でエラーが発生しました。', 500);
  }
}
