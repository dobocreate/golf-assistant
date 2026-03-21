import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';
import { buildAdviceContext, formatContextForPrompt } from '@/features/advice/lib/context-builder';
import { createSystemPrompt, createUserPrompt } from '@/features/advice/lib/prompt-template';

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

    // コンテキスト構築
    const context = await buildAdviceContext(body.roundId);
    if (!context) return jsonError('ラウンド情報の取得に失敗しました。', 404);

    const contextText = formatContextForPrompt(context);
    const systemPrompt = createSystemPrompt(contextText);
    const userPrompt = createUserPrompt({
      holeNumber: body.holeNumber,
      shotType: body.shotType,
      remainingDistance: body.remainingDistance,
      lie: body.lie,
      notes: body.notes,
    });

    // Gemini API ストリーミング
    const googleAI = createGoogleGenerativeAI({ apiKey });
    const result = streamText({
      model: googleAI(process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite'),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 500,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Advice API Error:', error);
    return jsonError('サーバー内部でエラーが発生しました。', 500);
  }
}
