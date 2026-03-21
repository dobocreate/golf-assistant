'use client';

import { useState, useCallback, useRef } from 'react';
import { SituationInput } from './situation-input';
import { AdviceDisplay } from './advice-display';
import { useSpeechSynthesis } from '@/features/voice/hooks/use-speech-synthesis';
import type { Situation } from '../types';

interface AdviceClientProps {
  roundId: string;
  scoredHoles: number[];
}

export function AdviceClient({ roundId, scoredHoles }: AdviceClientProps) {
  const nextHole = Array.from({ length: 18 }, (_, i) => i + 1).find(h => !new Set(scoredHoles).has(h)) ?? 18;
  const [currentHole, setCurrentHole] = useState(nextHole);
  const [adviceText, setAdviceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { speak, stop, isSpeaking, isSupported, rate, setRate } = useSpeechSynthesis();

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
          slopeFB: situation.slopeFB,
          slopeLR: situation.slopeLR,
          notes: situation.notes,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage = 'アドバイスの取得に失敗しました。';
        try {
          const data = await res.json();
          errorMessage = data.error ?? errorMessage;
        } catch (jsonError) {
          console.error('Failed to parse error response:', jsonError);
        }
        setError(errorMessage);
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
      console.error('Failed to fetch advice:', err);
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
        onSpeak={isSupported ? () => speak(adviceText) : undefined}
        onStopSpeak={stop}
        isSpeaking={isSpeaking}
      />

      {/* 読み上げ速度調整 */}
      {isSupported && adviceText && !isLoading && (
        <div className="flex items-center gap-3 rounded-lg bg-gray-800 border border-gray-700 p-3">
          <label htmlFor="speech-rate" className="text-xs text-gray-400 shrink-0">
            速度
          </label>
          <input
            id="speech-rate"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className="flex-1 h-2 accent-green-500"
          />
          <span className="text-xs text-gray-400 min-w-[32px] text-right">
            {rate.toFixed(1)}x
          </span>
        </div>
      )}
    </div>
  );
}
