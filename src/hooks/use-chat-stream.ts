'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChatRequestParams {
  roundId: string;
  holeNumber: number;
  question: string;
}

export interface UseChatStreamReturn {
  answerText: string;
  isStreaming: boolean;
  error: string | null;
  sendQuestion: (params: ChatRequestParams) => Promise<void>;
  cancelStream: () => void;
}

export function useChatStream(): UseChatStreamReturn {
  const [answerText, setAnswerText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendQuestion = useCallback(async (params: ChatRequestParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnswerText('');
    setError(null);
    setIsStreaming(true);

    try {
      const res = await fetch('/api/advice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: params.roundId,
          holeNumber: params.holeNumber,
          question: params.question,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage = '回答の取得に失敗しました。';
        try {
          const data = await res.json();
          errorMessage = data.error ?? errorMessage;
        } catch {
          // JSON parse失敗は無視
        }
        setError(errorMessage);
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('ストリーミングに対応していません。');
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setAnswerText(text);
      }

      setIsStreaming(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsStreaming(false);
        return;
      }
      console.error('Failed to fetch chat answer:', err);
      setError('回答の取得に失敗しました。しばらくしてから再度お試しください。');
      setIsStreaming(false);
    }
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { answerText, isStreaming, error, sendQuestion, cancelStream };
}
