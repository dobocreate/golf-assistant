import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Gemini APIストリーミングレスポンスを生成する。
 * 呼び出し元で必ず try-catch すること（APIキー無効化やモデル名不正でスローする可能性あり）。
 */
export function createGeminiStream(
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 8192,
): Response {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const googleAI = createGoogleGenerativeAI({ apiKey });
  const result = streamText({
    model: googleAI(process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens,
  });

  return result.toTextStreamResponse();
}
