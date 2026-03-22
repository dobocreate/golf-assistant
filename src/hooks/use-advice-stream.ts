'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SHOT_TYPE_DB_TO_LABEL, LIE_DB_TO_LABEL } from '@/lib/golf-constants';

export interface AdviceRequestParams {
  roundId: string;
  holeNumber: number;
  shotType: string | null;
  remainingDistance: number | null;
  lie: string | null;
  slopeFB: string | null;
  slopeLR: string | null;
  notes?: string;
}

export interface UseAdviceStreamReturn {
  adviceText: string;
  isStreaming: boolean;
  error: string | null;
  requestAdvice: (params: AdviceRequestParams) => Promise<void>;
  cancelAdvice: () => void;
}

/**
 * AIアドバイスのストリーミング取得フック
 * ストリーム制御のみ担当。保存・履歴取得は呼び出し側の責務。
 */
export function useAdviceStream(): UseAdviceStreamReturn {
  const [adviceText, setAdviceText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelAdvice = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const requestAdvice = useCallback(async (params: AdviceRequestParams) => {
    // 前回のリクエストをキャンセル
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAdviceText('');
    setError(null);
    setIsStreaming(true);

    try {
      // shotType と lie を日本語ラベルに変換（API は日本語を期待）
      const shotTypeLabel = params.shotType ? (SHOT_TYPE_DB_TO_LABEL[params.shotType] ?? params.shotType) : 'セカンド';
      const lieLabel = params.lie ? (LIE_DB_TO_LABEL[params.lie] ?? params.lie) : 'フェアウェイ';
      const distanceStr = params.remainingDistance != null ? `${params.remainingDistance}y` : '150y';

      const res = await fetch('/api/advice/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: params.roundId,
          holeNumber: params.holeNumber,
          shotType: shotTypeLabel,
          remainingDistance: distanceStr,
          lie: lieLabel,
          slopeFB: params.slopeFB,
          slopeLR: params.slopeLR,
          notes: params.notes,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage = 'アドバイスの取得に失敗しました。';
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
        setAdviceText(text);
      }

      setIsStreaming(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsStreaming(false);
        return;
      }
      console.error('Failed to fetch advice:', err);
      setError('アドバイスの取得に失敗しました。');
      setIsStreaming(false);
    }
  }, []);

  // unmount 時に進行中のストリーミングを中断
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { adviceText, isStreaming, error, requestAdvice, cancelAdvice };
}
