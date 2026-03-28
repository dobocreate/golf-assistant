'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Eye } from 'lucide-react';
import { useAdviceStream } from '@/hooks/use-advice-stream';
import { useSpeechRecognition } from '@/features/voice/hooks/use-speech-recognition';
import { AdviceDisplay } from '@/features/advice/components/advice-display';
import { Modal } from '@/components/ui/modal';
import type { ShotLie, ShotSlopeFB, ShotSlopeLR, ShotType } from '@/features/score/types';

interface AdvicePanelProps {
  roundId: string;
  holeNumber: number;
  shotNumber: number | null;
  lie: ShotLie | null;
  slopeFb: ShotSlopeFB | null;
  slopeLr: ShotSlopeLR | null;
  shotType: ShotType | null;
  remainingDistance: number | null;
  windDirection?: string | null;
  windStrength?: string | null;
  weather?: string | null;
  savedAdviceText?: string | null;
  onAdviceReceived?: (text: string) => void;
  gamePlanContext?: string | null;
}

export function AdvicePanel({
  roundId,
  holeNumber,
  shotNumber,
  lie,
  slopeFb,
  slopeLr,
  shotType,
  remainingDistance,
  windDirection,
  windStrength,
  weather,
  savedAdviceText,
  onAdviceReceived,
  gamePlanContext,
}: AdvicePanelProps) {
  const { adviceText, isStreaming, error, requestAdvice } = useAdviceStream();
  const {
    transcript,
    isListening,
    start: startListening,
    stop: stopListening,
    isSupported: speechRecogSupported,
  } = useSpeechRecognition();

  const [notes, setNotes] = useState('');
  const [showSavedAdvice, setShowSavedAdvice] = useState(false);
  const adviceRef = useRef<HTMLDivElement>(null);

  // Sync transcript to notes
  useEffect(() => {
    if (transcript) {
      setNotes(transcript);
    }
  }, [transcript]);

  // Auto-scroll when streaming starts
  const prevIsStreaming = useRef(false);
  useEffect(() => {
    if (isStreaming && !prevIsStreaming.current) {
      adviceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming]);

  const handleRequestAdvice = useCallback(async () => {
    if (isStreaming) return;

    await requestAdvice({
      roundId,
      holeNumber,
      shotType: shotType,
      remainingDistance,
      lie,
      slopeFB: slopeFb,
      slopeLR: slopeLr,
      notes: [gamePlanContext, notes].filter(Boolean).join('\n') || undefined,
      windDirection: windDirection ?? undefined,
      windStrength: windStrength ?? undefined,
      weather: weather ?? undefined,
    });
  }, [isStreaming, requestAdvice, roundId, holeNumber, shotType, remainingDistance, lie, slopeFb, slopeLr, notes, gamePlanContext, windDirection, windStrength, weather]);

  // アドバイス取得完了時にコールバックで親に通知（DB保存は親が管理）
  const prevAdviceText = useRef('');
  useEffect(() => {
    if (!isStreaming && adviceText && adviceText !== prevAdviceText.current) {
      prevAdviceText.current = adviceText;
      onAdviceReceived?.(adviceText);
    }
  }, [isStreaming, adviceText, onAdviceReceived]);

  // 表示するアドバイス: 新規取得中/取得済みならそれを表示、なければ保存済みは確認ボタンで
  const hasSavedAdvice = !!(savedAdviceText && !adviceText);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-200">AIアドバイス</label>

      {/* 補足入力: textarea + マイク */}
      <div className="flex items-start gap-2">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="補足（風向き等）"
          maxLength={500}
          rows={3}
          className="flex-1 min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 py-2 text-base border-0 focus:ring-2 focus:ring-blue-600 resize-none"
        />
        {speechRecogSupported && (
          <button
            onClick={isListening ? stopListening : startListening}
            className={`min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg transition-colors ${
              isListening
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
            }`}
            aria-label={isListening ? '音声入力停止' : '音声入力'}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
      </div>

      {isListening && (
        <span className="text-xs text-red-400 animate-pulse">音声認識中...</span>
      )}

      {/* アドバイスボタン + 確認ボタン */}
      <div className="flex gap-2">
        <button
          onClick={handleRequestAdvice}
          disabled={isStreaming}
          className="flex-1 bg-blue-600 text-white min-h-[52px] rounded-lg text-lg font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isStreaming ? 'アドバイス取得中...' : 'アドバイスを聞く'}
        </button>
        {hasSavedAdvice && (
          <button
            onClick={() => setShowSavedAdvice(true)}
            className="min-h-[52px] min-w-[52px] flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            aria-label="保存済みアドバイスを確認"
          >
            <Eye className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 新規アドバイスのストリーミング表示 */}
      <div ref={adviceRef}>
        <AdviceDisplay
          text={adviceText}
          isStreaming={isStreaming}
        />
      </div>

      {/* エラー */}
      {error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* 保存済みアドバイスモーダル */}
      <Modal
        isOpen={showSavedAdvice}
        onClose={() => setShowSavedAdvice(false)}
        title="AIアドバイス"
      >
        <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
          {savedAdviceText}
        </div>
        <button
          onClick={() => setShowSavedAdvice(false)}
          className="mt-4 w-full min-h-[48px] rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold hover:opacity-90 transition-colors"
        >
          閉じる
        </button>
      </Modal>
    </div>
  );
}
