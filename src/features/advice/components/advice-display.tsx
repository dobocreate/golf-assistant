'use client';

import { Volume2, VolumeOff } from 'lucide-react';

interface AdviceDisplayProps {
  text: string;
  isStreaming: boolean;
  onSpeak?: () => void;
  onStopSpeak?: () => void;
  isSpeaking?: boolean;
}

export function AdviceDisplay({ text, isStreaming, onSpeak, onStopSpeak, isSpeaking }: AdviceDisplayProps) {
  if (!text && !isStreaming) return null;

  return (
    <div className="space-y-3 rounded-lg bg-gray-800 border border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-400">AIアドバイス</h3>
        {text && !isStreaming && onSpeak && (
          <button
            onClick={isSpeaking ? onStopSpeak : onSpeak}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            aria-label={isSpeaking ? '読み上げ停止' : '読み上げ'}
          >
            {isSpeaking ? <VolumeOff className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}
      </div>
      <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
        {text}
        {isStreaming && <span className="animate-pulse">▌</span>}
      </div>
    </div>
  );
}
