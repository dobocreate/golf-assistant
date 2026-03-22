'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SituationInput } from './situation-input';
import { AdviceDisplay } from './advice-display';
import { useSpeechSynthesis } from '@/features/voice/hooks/use-speech-synthesis';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import { updateShotAdvice, getAdviceHistory } from '@/actions/shot';
import type { Situation } from '../types';

interface AdviceInitialValues {
  hole?: number;
  lie?: string;
  slopeFB?: string;
  slopeLR?: string;
  shotNumber?: number;
}

interface AdviceClientProps {
  roundId: string;
  scoredHoles: number[];
  initialValues?: AdviceInitialValues;
}

export function AdviceClient({ roundId, scoredHoles, initialValues }: AdviceClientProps) {
  const playRound = usePlayRoundOptional();
  const playRoundRef = useRef(playRound);
  useEffect(() => { playRoundRef.current = playRound; }, [playRound]);

  const initialHole = (() => {
    if (initialValues?.hole && initialValues.hole >= 1 && initialValues.hole <= 18) return initialValues.hole;
    if (playRound?.currentHole) return playRound.currentHole;
    const scored = new Set(scoredHoles);
    return Array.from({ length: 18 }, (_, i) => i + 1).find(h => !scored.has(h)) ?? 18;
  })();
  const [currentHole, setCurrentHoleLocal] = useState(initialHole);
  const [adviceText, setAdviceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { speak, stop, isSpeaking, isSupported, rate, setRate } = useSpeechSynthesis();
  const [adviceHistory, setAdviceHistory] = useState<{ hole_number: number; shot_number: number; advice_text: string; club: string | null }[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  // mount時に Context を初期化 & 履歴を取得
  useEffect(() => {
    playRound?.setCurrentHole(initialHole);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getAdviceHistory(roundId).then(setAdviceHistory).catch(console.error);
  }, [roundId]);

  const changeHole = useCallback((hole: number) => {
    setCurrentHoleLocal(hole);
    playRoundRef.current?.setCurrentHole(hole);
  }, []);

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

      // アドバイスをショットに保存
      if (initialValues?.shotNumber && text) {
        updateShotAdvice({
          roundId,
          holeNumber: situation.holeNumber,
          shotNumber: initialValues.shotNumber,
          adviceText: text,
        })
          .then(() => getAdviceHistory(roundId).then(setAdviceHistory).catch(console.error))
          .catch(console.error);
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
            onClick={() => changeHole(Math.max(1, currentHole - 1))}
            disabled={currentHole <= 1}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white text-xl font-bold disabled:opacity-30"
          >
            −
          </button>
          <span className="text-2xl font-bold min-w-[80px] text-center">
            Hole {currentHole}
          </span>
          <button
            onClick={() => changeHole(Math.min(18, currentHole + 1))}
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
        initialLie={initialValues?.lie}
        initialSlopeFB={initialValues?.slopeFB}
        initialSlopeLR={initialValues?.slopeLR}
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

      {/* アドバイス履歴 */}
      {adviceHistory.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-300">アドバイス履歴</label>
          {adviceHistory.map((h, i) => (
            <button
              key={i}
              onClick={() => setExpandedHistory(expandedHistory === i ? null : i)}
              className="w-full text-left rounded-lg bg-gray-800 border border-gray-700 p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">Hole {h.hole_number} - 第{h.shot_number}打</span>
                {h.club && <span className="text-xs text-gray-400">{h.club}</span>}
              </div>
              {expandedHistory === i ? (
                <p className="mt-2 text-gray-300 whitespace-pre-wrap">{h.advice_text}</p>
              ) : (
                <p className="mt-1 text-gray-500 truncate">{h.advice_text}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
