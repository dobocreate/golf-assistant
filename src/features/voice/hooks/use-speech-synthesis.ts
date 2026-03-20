'use client';

// TODO: Sprint 3 で実装
// Web Speech Synthesis API ラッパー
export function useSpeechSynthesis() {
  return {
    isSpeaking: false,
    speak: (_text: string) => { throw new Error('Not implemented: Sprint 3 で実装予定'); },
    stop: () => { throw new Error('Not implemented: Sprint 3 で実装予定'); },
  };
}
