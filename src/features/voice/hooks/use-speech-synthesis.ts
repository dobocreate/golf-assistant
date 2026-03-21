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
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ブラウザサポート判定
  useEffect(() => {
    setIsSupported(
      typeof window !== 'undefined' && 'speechSynthesis' in window
    );
  }, []);

  /**
   * 日本語音声を選択する
   * voiceschanged イベントを待つ必要がある場合があるため、
   * 利用可能な音声から ja で始まるものを優先選択する
   */
  const getJapaneseVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const voices = window.speechSynthesis.getVoices();
    // ja-JP を優先、次に ja で始まるもの
    const jaJP = voices.find((v) => v.lang === 'ja-JP');
    if (jaJP) return jaJP;

    const ja = voices.find((v) => v.lang.startsWith('ja'));
    if (ja) return ja;

    return null;
  }, []);

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

  // クリーンアップ: アンマウント時に読み上げを停止
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, stop, isSpeaking, isSupported, rate, setRate };
}
