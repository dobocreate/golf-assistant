import { requireUser } from '@/lib/db/neon';
import { getOrBuildContextSnapshot, buildScoreContext } from '@/features/advice/lib/context-builder';
import { buildCurrentPositionContext } from '@/features/advice/lib/current-position-context-builder';
import { createChatSystemPrompt, createChatUserPrompt, MAX_CHAT_TOKENS } from '@/features/advice/lib/prompt-template';
import { jsonError, createGeminiStream } from '@/lib/llm';

export async function POST(request: Request) {
  try {
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

    const built = await requireUser(async () => {
      const snapshotResult = await getOrBuildContextSnapshot(body.roundId);
      if (!snapshotResult) return null;

      // 静的 snapshot + 動的 scoreContext + 動的 currentPositionContext を並列取得
      const [scoreContext, currentPositionContext] = await Promise.all([
        buildScoreContext(body.roundId, snapshotResult.startingCourse, snapshotResult.courseId),
        buildCurrentPositionContext(body.roundId, body.holeNumber),
      ]);

      return {
        snapshotContext: snapshotResult.contextText,
        scoreContext,
        currentPositionContext,
      };
    }).catch((err) => {
      if (err instanceof Error && err.message.startsWith('unauthorized')) {
        return { unauthorized: true as const };
      }
      throw err;
    });

    if (built && 'unauthorized' in built) return jsonError('ログインが必要です。', 401);
    if (!built) return jsonError('ラウンド情報の取得に失敗しました。', 404);

    const fullContext = [built.snapshotContext, built.scoreContext, built.currentPositionContext]
      .filter((s): s is string => Boolean(s))
      .join('\n\n');

    const systemPrompt = createChatSystemPrompt(fullContext);
    const userPrompt = createChatUserPrompt(body.holeNumber, body.question);

    return createGeminiStream(systemPrompt, userPrompt, MAX_CHAT_TOKENS);
  } catch (error) {
    console.error('Chat API Error:', error);
    return jsonError('サーバー内部でエラーが発生しました。', 500);
  }
}
