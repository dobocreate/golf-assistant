'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseStreamFetchReturn {
  text: string;
  isStreaming: boolean;
  error: string | null;
  request: (url: string, body: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
}

/**
 * 汎用ストリーミングフェッチフック
 * AbortController管理、ReadableStream読み取り、状態管理を提供
 */
export function useStreamFetch(options?: {
  onComplete?: (text: string) => void;
}): UseStreamFetchReturn {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const request = useCallback(async (url: string, body: Record<string, unknown>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText('');
    setError(null);
    setIsStreaming(true);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage = 'リクエストに失敗しました。';
        try {
          const data = await res.json();
          errorMessage = data.error ?? errorMessage;
        } catch {
          // ignore
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
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setText(accumulated);
      }

      setIsStreaming(false);
      optionsRef.current?.onComplete?.(accumulated);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsStreaming(false);
        return;
      }
      console.error('Stream fetch error:', err);
      setError('リクエストに失敗しました。');
      setIsStreaming(false);
    }
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { text, isStreaming, error, request, cancel };
}
