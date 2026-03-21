'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Web Speech Synthesis API ラッパーフック
 * 日本語音声を自動選択し、読み上げ速度の調整が可能
 */
export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [rate, setRate] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ブラウザサポート判定 + 音声リスト取得
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    const updateVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    updateVoices();

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const getJapaneseVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!voices.length) return null;
    // ja-JP を優先、次に ja で始まるもの
    const jaJP = voices.find((v) => v.lang === 'ja-JP');
    if (jaJP) return jaJP;

    const ja = voices.find((v) => v.lang.startsWith('ja'));
    if (ja) return ja;

    return null;
  }, [voices]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      // 既存の読み上げを停止
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = rate;

      const voice = getJapaneseVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        // cancel() による中断は無視
        if (event.error === 'canceled' || event.error === 'interrupted') return;
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [rate, getJapaneseVoice]
  );

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, isSupported, rate, setRate };
}
