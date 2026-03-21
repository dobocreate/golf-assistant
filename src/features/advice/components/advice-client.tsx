'use client';

import { useState, useCallback, useRef } from 'react';
import { SituationInput } from './situation-input';
import { AdviceDisplay } from './advice-display';
import type { Situation } from '../types';

interface AdviceClientProps {
  roundId: string;
}

export function AdviceClient({ roundId }: AdviceClientProps) {
  const [currentHole, setCurrentHole] = useState(1);
  const [adviceText, setAdviceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async (situation: Situation) => {
    // 前回のリクエストをキャンセル
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAdviceText('');
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/advice/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
          holeNumber: situation.holeNumber,
          shotType: situation.shotType,
          remainingDistance: situation.remainingDistance,
          lie: situation.lie,
          notes: situation.notes,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'アドバイスの取得に失敗しました。');
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('ストリーミングに対応していません。');
        setIsLoading(false);
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

      setIsLoading(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('アドバイスの取得に失敗しました。');
      setIsLoading(false);
    }
  }, [roundId]);

  return (
    <div className="space-y-4">
      {/* ホール選択 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">ホール</label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentHole(h => Math.max(1, h - 1))}
            disabled={currentHole <= 1}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white text-xl font-bold disabled:opacity-30"
          >
            −
          </button>
          <span className="text-2xl font-bold min-w-[80px] text-center">
            Hole {currentHole}
          </span>
          <button
            onClick={() => setCurrentHole(h => Math.min(18, h + 1))}
            disabled={currentHole >= 18}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white text-xl font-bold disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      {/* 状況入力 */}
      <SituationInput
        holeNumber={currentHole}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />

      {/* エラー表示 */}
      {error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* アドバイス表示 */}
      <AdviceDisplay
        text={adviceText}
        isStreaming={isLoading}
      />
    </div>
  );
}
