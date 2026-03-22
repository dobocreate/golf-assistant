'use client';

import { useState, useCallback, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { SHOT_TYPES, DISTANCES, LIE_OPTIONS, VALID_LIES } from '@/lib/golf-constants';
import type { ShotLie } from '@/features/score/types';
import type { Situation, SlopeFB, SlopeLR } from '../types';

interface SituationInputProps {
  holeNumber: number;
  onSubmit: (situation: Situation) => void;
  isLoading: boolean;
  initialLie?: ShotLie | string;
  initialSlopeFB?: string;
  initialSlopeLR?: string;
}

function parseLie(value: string | undefined): ShotLie | null {
  if (!value) return null;
  return (VALID_LIES as readonly string[]).includes(value) ? (value as ShotLie) : null;
}

export function SituationInput({ holeNumber, onSubmit, isLoading, initialLie, initialSlopeFB, initialSlopeLR }: SituationInputProps) {
  const [shotType, setShotType] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [lie, setLie] = useState<ShotLie | null>(() => parseLie(initialLie));
  const [slopeFB, setSlopeFB] = useState<SlopeFB | null>(() => {
    return (initialSlopeFB === 'toe_up' || initialSlopeFB === 'toe_down') ? initialSlopeFB : null;
  });
  const [slopeLR, setSlopeLR] = useState<SlopeLR | null>(() => {
    return (initialSlopeLR === 'left_up' || initialSlopeLR === 'left_down') ? initialSlopeLR : null;
  });

  // props の初期値が変化した場合に state を同期（ページ遷移でコンポーネントが再利用されるケース）
  useEffect(() => {
    setLie(parseLie(initialLie));
  }, [initialLie]);

  useEffect(() => {
    if (initialSlopeFB === 'toe_up' || initialSlopeFB === 'toe_down') setSlopeFB(initialSlopeFB);
    else setSlopeFB(null);
  }, [initialSlopeFB]);

  useEffect(() => {
    if (initialSlopeLR === 'left_up' || initialSlopeLR === 'left_down') setSlopeLR(initialSlopeLR);
    else setSlopeLR(null);
  }, [initialSlopeLR]);

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
          {LIE_OPTIONS.map(l => (
            <button
              key={l.value}
              onClick={() => setLie(l.value)}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                lie === l.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {l.label}
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
