'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useAdviceStream } from '@/hooks/use-advice-stream';
import { useSpeechSynthesis } from '@/features/voice/hooks/use-speech-synthesis';
import { useSpeechRecognition } from '@/features/voice/hooks/use-speech-recognition';
import { AdviceDisplay } from '@/features/advice/components/advice-display';
import { updateShotAdvice, getAdviceHistory } from '@/actions/shot';
import {
  LIE_DB_TO_LABEL,
  SHOT_TYPE_DB_TO_LABEL,
  SLOPE_FB_DB_TO_LABEL,
  SLOPE_LR_DB_TO_LABEL,
} from '@/lib/golf-constants';
import type { Shot, ShotLie, ShotSlopeFB, ShotSlopeLR, ShotType, AdviceHistoryItem } from '@/features/score/types';

interface AdvicePanelProps {
  roundId: string;
  holeNumber: number;
  shotNumber: number | null;
  currentShot: Shot | null;
  lie: ShotLie | null;
  slopeFb: ShotSlopeFB | null;
  slopeLr: ShotSlopeLR | null;
  shotType: ShotType | null;
  remainingDistance: number | null;
}

export function AdvicePanel({
  roundId,
  holeNumber,
  shotNumber,
  currentShot,
  lie,
  slopeFb,
  slopeLr,
  shotType,
  remainingDistance,
}: AdvicePanelProps) {
  const { adviceText, isStreaming, error, requestAdvice } = useAdviceStream();
  const { speak, stop, isSpeaking, isSupported: speechSynthSupported, rate, setRate } = useSpeechSynthesis();
  const {
    transcript,
    isListening,
    start: startListening,
    stop: stopListening,
    isSupported: speechRecogSupported,
  } = useSpeechRecognition();

  const [notes, setNotes] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [adviceHistory, setAdviceHistory] = useState<AdviceHistoryItem[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const adviceRef = useRef<HTMLDivElement>(null);

  // Show text input by default if speech recognition is not supported
  useEffect(() => {
    if (!speechRecogSupported) {
      setShowTextInput(true);
    }
  }, [speechRecogSupported]);

  // Sync transcript to notes
  useEffect(() => {
    if (transcript) {
      setNotes(transcript);
    }
  }, [transcript]);

  // Fetch advice history on mount
  useEffect(() => {
    getAdviceHistory(roundId).then(setAdviceHistory).catch(e => console.error('Advice history/save error:', e));
  }, [roundId]);

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
      notes: notes || undefined,
    });
  }, [isStreaming, requestAdvice, roundId, holeNumber, shotType, remainingDistance, lie, slopeFb, slopeLr, notes]);

  // Save advice to shot after streaming completes
  const prevAdviceText = useRef('');
  useEffect(() => {
    if (!isStreaming && adviceText && adviceText !== prevAdviceText.current) {
      prevAdviceText.current = adviceText;

      // Save to DB if shot exists
      if (currentShot && shotNumber) {
        updateShotAdvice({
          roundId,
          holeNumber,
          shotNumber,
          adviceText,
        }).then(() => {
          // Refresh history
          getAdviceHistory(roundId).then(setAdviceHistory).catch(e => console.error('Advice history/save error:', e));
        }).catch(e => console.error('Advice history/save error:', e));
      }
    }
  }, [isStreaming, adviceText, currentShot, roundId, holeNumber, shotNumber]);

  // Build badge items
  const badges: { label: string; value: string }[] = [];
  if (shotType) {
    badges.push({ label: 'ショット', value: SHOT_TYPE_DB_TO_LABEL[shotType] ?? shotType });
  }
  if (remainingDistance != null) {
    badges.push({ label: '距離', value: `${remainingDistance}y` });
  }
  if (lie) {
    badges.push({ label: 'ライ', value: LIE_DB_TO_LABEL[lie] ?? lie });
  }
  if (slopeFb) {
    badges.push({ label: '前後', value: SLOPE_FB_DB_TO_LABEL[slopeFb] ?? slopeFb });
  }
  if (slopeLr) {
    badges.push({ label: '左右', value: SLOPE_LR_DB_TO_LABEL[slopeLr] ?? slopeLr });
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-200">AIアドバイス</label>

      {/* (a) Badge summary */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b.label}
              className="bg-gray-700 text-gray-200 rounded-full px-3 py-1 text-xs font-bold"
            >
              {b.value}
            </span>
          ))}
        </div>
      )}

      {/* (b) Supplementary notes input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {speechRecogSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              className={`min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg transition-colors ${
                isListening
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
              aria-label={isListening ? '音声入力停止' : '音声入力'}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
          {!showTextInput && speechRecogSupported && (
            <button
              onClick={() => setShowTextInput(true)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              テキスト入力
            </button>
          )}
          {isListening && (
            <span className="text-xs text-red-400 animate-pulse">音声認識中...</span>
          )}
        </div>
        {showTextInput && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            placeholder="補足（風向き、ピン位置等）"
            className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 py-2 text-sm border-0 focus:ring-2 focus:ring-blue-600 resize-none"
          />
        )}
      </div>

      {/* (c) Advice button */}
      <button
        onClick={handleRequestAdvice}
        disabled={isStreaming}
        className="bg-blue-600 text-white min-h-[52px] w-full rounded-lg text-lg font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isStreaming ? 'アドバイス取得中...' : 'アドバイスを聞く'}
      </button>

      {/* (d) Advice display */}
      <div ref={adviceRef}>
        <AdviceDisplay
          text={adviceText}
          isStreaming={isStreaming}
          onSpeak={speechSynthSupported ? () => speak(adviceText) : undefined}
          onStopSpeak={stop}
          isSpeaking={isSpeaking}
        />
      </div>

      {/* 未保存ショットのガイダンス */}
      {!currentShot && adviceText && !isStreaming && (
        <p className="text-xs text-gray-400 text-center">
          ショットを記録するとアドバイスが保存されます
        </p>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* (e) Speech rate control */}
      {speechSynthSupported && adviceText && !isStreaming && (
        <div className="flex items-center gap-3 rounded-lg bg-gray-800 border border-gray-700 p-3">
          <label htmlFor="advice-speech-rate" className="text-xs text-gray-200 shrink-0">
            速度
          </label>
          <input
            id="advice-speech-rate"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className="flex-1 h-2 accent-green-500"
          />
          <span className="text-xs text-gray-300 min-w-[32px] text-right">
            {rate.toFixed(1)}x
          </span>
        </div>
      )}

      {/* (f) Advice history */}
      {adviceHistory.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-200">アドバイス履歴</label>
          {adviceHistory.map((h) => {
            const key = `${h.hole_number}-${h.shot_number}`;
            const isExpanded = expandedKey === key;
            const lieLabel = h.lie ? LIE_DB_TO_LABEL[h.lie] ?? h.lie : null;
            const shotTypeLabel = h.shot_type ? SHOT_TYPE_DB_TO_LABEL[h.shot_type] ?? h.shot_type : null;
            const slopeFbLabel = h.slope_fb ? SLOPE_FB_DB_TO_LABEL[h.slope_fb] ?? h.slope_fb : null;
            const slopeLrLabel = h.slope_lr ? SLOPE_LR_DB_TO_LABEL[h.slope_lr] ?? h.slope_lr : null;

            return (
              <details
                key={key}
                open={isExpanded}
                onToggle={(e) => {
                  const target = e.currentTarget as HTMLDetailsElement;
                  setExpandedKey(target.open ? key : null);
                }}
                className="bg-gray-800 border border-gray-700 rounded-lg"
              >
                <summary className="cursor-pointer p-3 text-sm">
                  <span className="font-bold text-gray-200">
                    H{h.hole_number}-{h.shot_number}打
                    {h.club ? ` ${h.club}` : ''}
                    {lieLabel ? ` ${lieLabel}` : ''}
                    {h.remaining_distance != null ? ` ${h.remaining_distance}y` : ''}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {shotTypeLabel && (
                      <span className="bg-gray-700 text-gray-200 rounded-full px-2 py-0.5 text-xs">
                        {shotTypeLabel}
                      </span>
                    )}
                    {slopeFbLabel && (
                      <span className="bg-gray-700 text-gray-200 rounded-full px-2 py-0.5 text-xs">
                        {slopeFbLabel}
                      </span>
                    )}
                    {slopeLrLabel && (
                      <span className="bg-gray-700 text-gray-200 rounded-full px-2 py-0.5 text-xs">
                        {slopeLrLabel}
                      </span>
                    )}
                  </div>
                </summary>
                <div className="px-3 pb-3">
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{h.advice_text}</p>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
