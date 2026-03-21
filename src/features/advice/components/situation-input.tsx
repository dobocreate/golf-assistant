'use client';

import { useState, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import type { Situation, SlopeFB, SlopeLR } from '../types';

const SHOT_TYPES = ['ティーショット', 'セカンド', 'アプローチ', 'パット'];
const DISTANCES = ['〜100y', '100〜150y', '150〜200y', '200y+'];
const LIES = ['ティーアップ', 'フェアウェイ', 'ラフ', 'バンカー', '林'];

interface SituationInputProps {
  holeNumber: number;
  onSubmit: (situation: Situation) => void;
  isLoading: boolean;
}

export function SituationInput({ holeNumber, onSubmit, isLoading }: SituationInputProps) {
  const [shotType, setShotType] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [lie, setLie] = useState<string | null>(null);
  const [slopeFB, setSlopeFB] = useState<SlopeFB | null>(null);
  const [slopeLR, setSlopeLR] = useState<SlopeLR | null>(null);

  const handleSubmit = useCallback(() => {
    if (!shotType || !distance || !lie) return;
    onSubmit({
      holeNumber,
      shotType,
      remainingDistance: distance,
      lie,
      slopeFB,
      slopeLR,
    });
  }, [holeNumber, shotType, distance, lie, slopeFB, slopeLR, onSubmit]);

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

      {/* 傾斜（任意） */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">傾斜（任意）</label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 min-w-[32px]">前後</span>
            <div className="grid grid-cols-2 gap-2 flex-1">
              <button
                onClick={() => setSlopeFB(prev => prev === 'toe_up' ? null : 'toe_up')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeFB === 'toe_up'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                つま先上がり
              </button>
              <button
                onClick={() => setSlopeFB(prev => prev === 'toe_down' ? null : 'toe_down')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeFB === 'toe_down'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                つま先下がり
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 min-w-[32px]">左右</span>
            <div className="grid grid-cols-2 gap-2 flex-1">
              <button
                onClick={() => setSlopeLR(prev => prev === 'left_up' ? null : 'left_up')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeLR === 'left_up'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                左足上がり
              </button>
              <button
                onClick={() => setSlopeLR(prev => prev === 'left_down' ? null : 'left_down')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeLR === 'left_down'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                左足下がり
              </button>
            </div>
          </div>
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
