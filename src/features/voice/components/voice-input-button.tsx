'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { Mic, MicOff, Save, X } from 'lucide-react';
import { useSpeechRecognition } from '@/features/voice/hooks/use-speech-recognition';
import { saveMemo } from '@/actions/memo';

interface VoiceInputButtonProps {
  roundId: string;
  holeNumber: number;
  onSaved?: () => void;
}

export function VoiceInputButton({ roundId, holeNumber, onSaved }: VoiceInputButtonProps) {
  const { transcript, isListening, start, stop, error: speechError, isSupported } = useSpeechRecognition();
  const [editedText, setEditedText] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);

  const handleToggleRecording = useCallback(() => {
    if (isListening) {
      stop();
      setShowResult(true);
    } else {
      setSaveStatus('idle');
      setSaveError(null);
      setEditedText('');
      start();
      setShowResult(true);
    }
  }, [isListening, start, stop]);

  const handleSave = useCallback((content: string, source: 'voice' | 'text') => {
    if (!content.trim()) return;

    setSaveStatus('idle');
    setSaveError(null);

    startTransition(async () => {
      const result = await saveMemo({
        roundId,
        holeNumber,
        content: content.trim(),
        source,
      });

      if (result.error) {
        setSaveStatus('error');
        setSaveError(result.error);
      } else {
        setSaveStatus('saved');
        setShowResult(false);
        setEditedText('');
        setTextInput('');
        setShowTextInput(false);
        onSaved?.();
      }
    });
  }, [roundId, holeNumber, onSaved]);

  const handleSaveVoice = useCallback(() => {
    const content = editedText || transcript;
    handleSave(content, 'voice');
  }, [editedText, transcript, handleSave]);

  const handleSaveText = useCallback(() => {
    handleSave(textInput, 'text');
  }, [textInput, handleSave]);

  const handleCancel = useCallback(() => {
    if (isListening) stop();
    setShowResult(false);
    setEditedText('');
    setSaveStatus('idle');
    setSaveError(null);
  }, [isListening, stop]);

  const handleCancelText = useCallback(() => {
    setShowTextInput(false);
    setTextInput('');
  }, []);

  // 保存メッセージの自動非表示
  useEffect(() => {
    if (saveStatus === 'saved') {
      const timer = setTimeout(() => setSaveStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const displayText = editedText || transcript;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* マイクボタン（音声認識対応時のみ） */}
        {isSupported && (
          <button
            onClick={handleToggleRecording}
            disabled={isPending}
            className={`min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full transition-all ${
              isListening
                ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-600/50'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            } disabled:opacity-50`}
            aria-label={isListening ? '音声認識を停止' : '音声メモを開始'}
          >
            {isListening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        )}

        <div className="flex-1">
          {isListening && (
            <p className="text-sm text-red-400 animate-pulse">録音中...</p>
          )}
          {!isListening && !showResult && !showTextInput && (
            <div className="flex items-center gap-2">
              {isSupported && (
                <p className="text-sm text-gray-500">タップして音声メモ</p>
              )}
              <button
                onClick={() => setShowTextInput(true)}
                className="text-sm text-gray-400 underline hover:text-gray-300"
              >
                テキスト入力
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 音声認識エラー */}
      {speechError && (
        <p className="text-sm text-red-400">{speechError}</p>
      )}

      {/* 音声認識結果の表示・編集 */}
      {showResult && !isListening && displayText && (
        <div className="space-y-2 rounded-lg bg-gray-800 p-3">
          <label className="block text-xs font-bold text-gray-400">認識結果（編集可能）</label>
          <textarea
            value={editedText || transcript}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600"
            rows={3}
            placeholder="認識結果がここに表示されます"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveVoice}
              disabled={isPending || !displayText.trim()}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1 rounded-lg bg-green-600 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {isPending ? '保存中...' : 'メモを保存'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
              aria-label="キャンセル"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 音声認識中の途中結果 */}
      {showResult && isListening && transcript && (
        <div className="rounded-lg bg-gray-800 p-3">
          <p className="text-sm text-gray-300">{transcript}</p>
        </div>
      )}

      {/* テキスト入力フォールバック */}
      {showTextInput && (
        <div className="space-y-2 rounded-lg bg-gray-800 p-3">
          <label className="block text-xs font-bold text-gray-400">テキストメモ</label>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600"
            rows={3}
            placeholder="メモを入力..."
            maxLength={1000}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveText}
              disabled={isPending || !textInput.trim()}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1 rounded-lg bg-green-600 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {isPending ? '保存中...' : 'メモを保存'}
            </button>
            <button
              onClick={handleCancelText}
              disabled={isPending}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
              aria-label="キャンセル"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 保存結果 */}
      {saveStatus === 'saved' && (
        <p className="text-sm text-green-400">メモを保存しました</p>
      )}
      {saveStatus === 'error' && saveError && (
        <p className="text-sm text-red-400">{saveError}</p>
      )}
    </div>
  );
}
