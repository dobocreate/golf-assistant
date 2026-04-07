'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
// DB値のまま API に送信。日本語変換は prompt-template.ts が担当

export interface AdviceRequestParams {
  roundId: string;
  holeNumber: number;
  shotType: string | null;
  remainingDistance: number | null;
  lie: string | null;
  slopeFB: string | null;
  slopeLR: string | null;
  notes?: string;
  windDirection?: string;
  windStrength?: string;
  weather?: string;
  elevation?: string;
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
      // DB値のまま送信。日本語変換は prompt-template.ts が担当
      // パット時はメートル単位、それ以外はヤード単位
      const isPutt = params.shotType === 'putt';
      let distanceStr: string;
      if (params.remainingDistance != null) {
        distanceStr = `${params.remainingDistance}${isPutt ? 'm' : 'y'}`;
      } else {
        distanceStr = isPutt ? '5m' : '150y';
      }

      const res = await fetch('/api/advice/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: params.roundId,
          holeNumber: params.holeNumber,
          shotType: params.shotType ?? 'second',
          remainingDistance: distanceStr,
          lie: params.lie ?? 'fairway',
          slopeFB: params.slopeFB,
          slopeLR: params.slopeLR,
          notes: params.notes,
          windDirection: params.windDirection,
          windStrength: params.windStrength,
          weather: params.weather,
          elevation: params.elevation,
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
