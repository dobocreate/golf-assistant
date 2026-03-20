'use client';

// TODO: Sprint 2 で実装
// Web Speech Recognition API ラッパー
export function useSpeechRecognition() {
  return {
    isListening: false,
    transcript: '',
    start: () => { throw new Error('Not implemented: Sprint 2 で実装予定'); },
    stop: () => { throw new Error('Not implemented: Sprint 2 で実装予定'); },
    error: null as string | null,
  };
}
