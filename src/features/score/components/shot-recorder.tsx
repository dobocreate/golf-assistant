'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { recordShot, getShots, deleteShot } from '@/actions/shot';
import type { Shot, ShotResult } from '@/features/score/types';

interface ClubOption {
  name: string;
}

interface ShotRecorderProps {
  roundId: string;
  holeNumber: number;
  clubs: ClubOption[];
}

const RESULT_OPTIONS: { value: ShotResult; label: string; color: string; activeColor: string }[] = [
  { value: 'excellent', label: '\u25CE', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-yellow-600 text-white' },
  { value: 'good', label: '\u25CB', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-green-600 text-white' },
  { value: 'fair', label: '\u25B3', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-orange-600 text-white' },
  { value: 'poor', label: '\u2715', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-red-600 text-white' },
];

const MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];

export function ShotRecorder({ roundId, holeNumber, clubs }: ShotRecorderProps) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<ShotResult | null>(null);
  const [selectedMissType, setSelectedMissType] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);

  // ホール切り替え時にショットを取得
  useEffect(() => {
    let cancelled = false;
    getShots(roundId, holeNumber).then(data => {
      if (!cancelled) {
        setShots(data);
        setSelectedClub(null);
        setSelectedResult(null);
        setSelectedMissType(null);
      }
    });
    return () => { cancelled = true; };
  }, [roundId, holeNumber]);

  const nextShotNumber = shots.length > 0
    ? Math.max(...shots.map(s => s.shot_number)) + 1
    : 1;

  const showMissType = selectedResult === 'fair' || selectedResult === 'poor';

  const handleRecordShot = useCallback(() => {
    if (selectedResult === null) return;

    startTransition(async () => {
      const result = await recordShot({
        roundId,
        holeNumber,
        shotNumber: nextShotNumber,
        club: selectedClub,
        result: selectedResult,
        missType: showMissType ? selectedMissType : null,
      });
      if (!result.error && result.shot) {
        setShots(prev => [...prev, result.shot!]);
        setSelectedClub(null);
        setSelectedResult(null);
        setSelectedMissType(null);
      }
    });
  }, [roundId, holeNumber, nextShotNumber, selectedClub, selectedResult, selectedMissType, showMissType]);

  const handleDelete = useCallback((shotId: string) => {
    startTransition(async () => {
      const result = await deleteShot(shotId, roundId);
      if (!result.error) {
        setShots(prev => prev.filter(s => s.id !== shotId));
      }
    });
  }, [roundId]);

  const getResultLabel = (result: ShotResult | null) => {
    const opt = RESULT_OPTIONS.find(r => r.value === result);
    return opt?.label ?? '';
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-sm font-bold text-gray-300"
      >
        <span>ショット記録 {shots.length > 0 && `(${shots.length}打)`}</span>
        <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="space-y-3">
          {/* 記録済みショット */}
          {shots.length > 0 && (
            <div className="space-y-1">
              {shots.map(s => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono w-6">{s.shot_number}.</span>
                    {s.club && <span className="text-gray-200">{s.club}</span>}
                    <span className="font-bold">{getResultLabel(s.result)}</span>
                    {s.miss_type && (
                      <span className="text-orange-400 text-xs">({s.miss_type})</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={isPending}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                    aria-label={`ショット${s.shot_number}を削除`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 新規ショット入力 */}
          <div className="bg-gray-900 rounded-lg p-3 space-y-3">
            <p className="text-sm text-gray-400">
              第{nextShotNumber}打
            </p>

            {/* クラブ選択 */}
            {clubs.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs text-gray-500">クラブ</label>
                <select
                  value={selectedClub ?? ''}
                  onChange={e => setSelectedClub(e.target.value || null)}
                  className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 py-2 text-sm border-0 focus:ring-2 focus:ring-green-600"
                >
                  <option value="">選択なし</option>
                  {clubs.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 結果ボタン */}
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">結果</label>
              <div className="grid grid-cols-4 gap-2">
                {RESULT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSelectedResult(opt.value);
                      if (opt.value !== 'fair' && opt.value !== 'poor') {
                        setSelectedMissType(null);
                      }
                    }}
                    className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                      selectedResult === opt.value ? opt.activeColor : opt.color
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ミスタイプ（fair/poor 時のみ） */}
            {showMissType && (
              <div className="space-y-1">
                <label className="block text-xs text-gray-500">ミスタイプ</label>
                <div className="grid grid-cols-3 gap-2">
                  {MISS_TYPES.map(mt => (
                    <button
                      key={mt}
                      onClick={() => setSelectedMissType(selectedMissType === mt ? null : mt)}
                      className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                        selectedMissType === mt
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      {mt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 記録ボタン */}
            <button
              onClick={handleRecordShot}
              disabled={selectedResult === null || isPending}
              className="w-full min-h-[48px] flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? '記録中...' : `第${nextShotNumber}打を記録`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
