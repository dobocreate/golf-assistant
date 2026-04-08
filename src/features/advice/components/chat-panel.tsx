'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Send } from 'lucide-react';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useSpeechRecognition } from '@/features/voice/hooks/use-speech-recognition';
import { AdviceDisplay } from '@/features/advice/components/advice-display';

interface ChatPanelProps {
  roundId: string;
  holeNumber: number;
}

export function ChatPanel({ roundId, holeNumber }: ChatPanelProps) {
  const { answerText, isStreaming, error, sendQuestion } = useChatStream();
  const {
    transcript,
    isListening,
    start: startListening,
    stop: stopListening,
    isSupported: speechRecogSupported,
  } = useSpeechRecognition();

  const [question, setQuestion] = useState('');
  const answerRef = useRef<HTMLDivElement>(null);

  // 音声入力の結果を質問欄に反映
  useEffect(() => {
    if (transcript) {
      setQuestion(transcript);
    }
  }, [transcript]);

  // ストリーミング開始時に自動スクロール
  const prevIsStreaming = useRef(false);
  useEffect(() => {
    if (isStreaming && !prevIsStreaming.current) {
      answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming]);

  const handleSend = useCallback(async () => {
    if (isStreaming || !question.trim()) return;

    await sendQuestion({
      roundId,
      holeNumber,
      question: question.trim(),
    });
  }, [isStreaming, question, sendQuestion, roundId, holeNumber]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-gray-200">AIキャディーに質問</h2>

      {/* 質問入力 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="バンカーの打ち方、クラブ選択、コース攻略など..."
            rows={2}
            maxLength={500}
            disabled={isStreaming}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none disabled:opacity-50"
          />
          {speechRecogSupported && (
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={isStreaming}
              className="absolute right-2 top-2 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              aria-label={isListening ? '音声入力を停止' : '音声入力を開始'}
            >
              {isListening ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* 送信ボタン */}
      <button
        onClick={handleSend}
        disabled={isStreaming || !question.trim()}
        className="w-full min-h-[52px] rounded-xl bg-green-600 text-white font-bold text-base hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <Send className="h-4 w-4" />
        {isStreaming ? '回答取得中...' : 'AIに質問する'}
      </button>

      {/* 回答表示 */}
      <div ref={answerRef}>
        <AdviceDisplay
          text={answerText}
          isStreaming={isStreaming}
          error={error}
        />
      </div>
    </div>
  );
}
