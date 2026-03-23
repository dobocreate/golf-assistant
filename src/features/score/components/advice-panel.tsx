'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useAdviceStream } from '@/hooks/use-advice-stream';
import { useSpeechRecognition } from '@/features/voice/hooks/use-speech-recognition';
import { AdviceDisplay } from '@/features/advice/components/advice-display';
import { updateShotAdvice } from '@/actions/shot';
import type { Shot, ShotLie, ShotSlopeFB, ShotSlopeLR, ShotType } from '@/features/score/types';

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
  const {
    transcript,
    isListening,
    start: startListening,
    stop: stopListening,
    isSupported: speechRecogSupported,
  } = useSpeechRecognition();

  const [notes, setNotes] = useState('');
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
        }).catch(e => console.error('Advice save error:', e));
      }
    }
  }, [isStreaming, adviceText, currentShot, roundId, holeNumber, shotNumber]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-200">AIアドバイス</label>

      {/* Supplementary notes input: textarea + mic side by side */}
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

      {/* Advice button */}
      <button
        onClick={handleRequestAdvice}
        disabled={isStreaming}
        className="bg-blue-600 text-white min-h-[52px] w-full rounded-lg text-lg font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isStreaming ? 'アドバイス取得中...' : 'アドバイスを聞く'}
      </button>

      {/* Advice display */}
      <div ref={adviceRef}>
        <AdviceDisplay
          text={adviceText}
          isStreaming={isStreaming}
        />
      </div>

      {/* Unsaved shot guidance */}
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
    </div>
  );
}
