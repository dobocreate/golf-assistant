import { requireUser, db } from '@/lib/db/neon';
import { buildPracticeContext } from '@/features/advice/lib/practice-context-builder';
import { createPracticeSystemPrompt, createPracticeUserPrompt } from '@/features/advice/lib/practice-prompt-template';
import { jsonError, createGeminiStream } from '@/lib/llm';
import { isValidUUID } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) return jsonError('Gemini APIが設定されていません。', 503);

    let body: { roundId: string };
    try {
      body = await request.json();
    } catch {
      return jsonError('リクエストが不正です。', 400);
    }

    if (!body.roundId || !isValidUUID(body.roundId)) return jsonError('ラウンドIDが不正です。', 400);

    const built = await requireUser(async () => {
      const round = await db.userRead(async (client) => {
        const r = await client.query<{ status: string; review_note: string | null }>(
          `SELECT status, review_note FROM rounds
            WHERE id = $1 AND user_id = current_user_id()::uuid`,
          [body.roundId],
        );
        return r.rows[0] ?? null;
      });
      if (!round) return { error: 'round_not_found' as const };
      if (round.status !== 'completed') return { error: 'not_completed' as const };

      const context = await buildPracticeContext(body.roundId);
      if (!context) return { error: 'no_data' as const };

      return { ok: true as const, context, reviewNote: round.review_note };
    }).catch((err) => {
      if (err instanceof Error && err.message.startsWith('unauthorized')) {
        return { error: 'unauthorized' as const };
      }
      throw err;
    });

    if (built.error === 'unauthorized') return jsonError('ログインが必要です。', 401);
    if (built.error === 'round_not_found') return jsonError('ラウンドが見つかりません。', 404);
    if (built.error === 'not_completed') return jsonError('完了済みのラウンドのみ練習提案を受けられます。', 400);
    if (built.error === 'no_data') return jsonError('ラウンドデータの取得に失敗しました。', 404);

    const systemPrompt = createPracticeSystemPrompt(built.context);
    const userPrompt = createPracticeUserPrompt(built.reviewNote);

    return createGeminiStream(systemPrompt, userPrompt, 4096);
  } catch (error) {
    console.error('Practice Suggestion API Error:', error);
    return jsonError('サーバー内部でエラーが発生しました。', 500);
  }
}
