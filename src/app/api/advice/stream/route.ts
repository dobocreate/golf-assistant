import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';
import { buildAdviceContext, formatContextForPrompt } from '@/features/advice/lib/context-builder';
import { createSystemPrompt, createUserPrompt } from '@/features/advice/lib/prompt-template';

export async function POST(request: Request) {
  // 認証チェック
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'ログインが必要です。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Gemini APIが設定されていません。' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    return new Response(JSON.stringify({ error: 'リクエストが不正です。' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.roundId || !body.holeNumber || !body.shotType || !body.remainingDistance || !body.lie) {
    return new Response(JSON.stringify({ error: '必須パラメータが不足しています。' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // コンテキスト構築
  const context = await buildAdviceContext(body.roundId);
  if (!context) {
    return new Response(JSON.stringify({ error: 'ラウンド情報の取得に失敗しました。' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    model: googleAI('gemini-2.0-flash-lite'),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 500,
  });

  return result.toTextStreamResponse();
}
