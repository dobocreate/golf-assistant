'use client';

import { useState, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import type { Situation } from '../types';

const SHOT_TYPES = ['ティーショット', 'セカンド', 'アプローチ', 'パット'];
const DISTANCES = ['〜100y', '100〜150y', '150〜200y', '200y+'];
const LIES = ['フェアウェイ', 'ラフ', 'バンカー', '林', '打ち下ろし', '打ち上げ'];

interface SituationInputProps {
  holeNumber: number;
  onSubmit: (situation: Situation) => void;
  isLoading: boolean;
}

export function SituationInput({ holeNumber, onSubmit, isLoading }: SituationInputProps) {
  const [shotType, setShotType] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [lie, setLie] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!shotType || !distance || !lie) return;
    onSubmit({
      holeNumber,
      shotType,
      remainingDistance: distance,
      lie,
    });
  }, [holeNumber, shotType, distance, lie, onSubmit]);

  const canSubmit = shotType && distance && lie && !isLoading;

  return (
    <div className="space-y-4">
      {/* ショット種別 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">ショット</label>
        <div className="grid grid-cols-2 gap-2">
          {SHOT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setShotType(t)}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                shotType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 残り距離 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">残り距離</label>
        <div className="grid grid-cols-2 gap-2">
          {DISTANCES.map(d => (
            <button
              key={d}
              onClick={() => setDistance(d)}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                distance === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ライ・状況 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">ライ・状況</label>
        <div className="grid grid-cols-3 gap-2">
          {LIES.map(l => (
            <button
              key={l}
              onClick={() => setLie(l)}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                lie === l
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* アドバイスボタン */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-xl font-bold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <MessageSquare className="h-5 w-5" />
        {isLoading ? 'アドバイス取得中...' : 'アドバイス'}
      </button>
    </div>
  );
}
