'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { Save } from 'lucide-react';
import { SpeedDial } from '@/components/ui/speed-dial';
import { HoleNavigation } from '@/components/ui/hole-navigation';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';
import { upsertCompanionScoresBatch } from '@/actions/companion';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import type { CompanionWithScores } from '@/features/score/types';

interface CompanionScoreEditorProps {
  companionData: CompanionWithScores[];
  roundId: string;
  startingCourse?: 'out' | 'in';
  onSaved?: (holeNumber: number, scores: Array<{ companionId: string; strokes: number | null; putts: number | null }>) => void;
}

type HoleInputs = Map<string, { strokes: string; putts: string }>;

function getHoleOrder(startingCourse: 'out' | 'in'): number[] {
  if (startingCourse === 'in') {
    return [...Array.from({ length: 9 }, (_, i) => i + 10), ...Array.from({ length: 9 }, (_, i) => i + 1)];
  }
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

function buildAllInputs(companionData: CompanionWithScores[]): Map<number, HoleInputs> {
  const map = new Map<number, HoleInputs>();
  for (let h = 1; h <= 18; h++) {
    const holeMap = new Map<string, { strokes: string; putts: string }>();
    for (const { companion, scores } of companionData) {
      const s = scores.find(sc => sc.hole_number === h);
      holeMap.set(companion.id, {
        strokes: s?.strokes?.toString() ?? '',
        putts: s?.putts?.toString() ?? '',
      });
    }
    map.set(h, holeMap);
  }
  return map;
}

function parseScore(value: string): number | null {
  if (value === '') return null;
  const n = parseInt(value, 10);
  return !isNaN(n) ? n : null;
}

export function CompanionScoreEditor({ companionData, roundId, startingCourse = 'out', onSaved }: CompanionScoreEditorProps) {
  const playRound = usePlayRoundOptional();
  const holeOrder = getHoleOrder(startingCourse);
  const [editingHole, setEditingHole] = useState(playRound?.currentHole ?? holeOrder[0]);
  const [isPending, startTransition] = useTransition();
  const [saveResult, setSaveResult] = useState<'idle' | 'saved' | 'error'>('idle');

  // --- メモリ管理 ---
  const [allInputs, setAllInputs] = useState(() => buildAllInputs(companionData));
  const savedBaselineRef = useRef(buildAllInputs(companionData));
  const dirtyHolesRef = useRef(new Set<number>());
  const savingHolesRef = useRef(new Set<number>());

  // --- Ref群（stale closure回避） ---
  const allInputsRef = useRef(allInputs);
  useEffect(() => { allInputsRef.current = allInputs; }, [allInputs]);

  const editingHoleRef = useRef(editingHole);
  useEffect(() => { editingHoleRef.current = editingHole; }, [editingHole]);

  const roundIdRef = useRef(roundId);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);

  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- companionData更新時のマージ（dirtyでないホールのみ同期） ---
  useEffect(() => {
    const newBaseline = buildAllInputs(companionData);
    // dirtyでないホールのみbaselineを更新（クライアント保存済みの値を保護）
    for (const [hole, inputs] of newBaseline) {
      if (!dirtyHolesRef.current.has(hole)) {
        savedBaselineRef.current.set(hole, inputs);
      }
    }
    setAllInputs(prev => {
      const next = new Map(prev);
      for (const [hole, inputs] of newBaseline) {
        if (!dirtyHolesRef.current.has(hole)) {
          next.set(hole, inputs);
        }
      }
      return next;
    });
  }, [companionData]);

  // --- 現在ホールのinputs（描画用） ---
  const inputs = allInputs.get(editingHole) ?? new Map<string, { strokes: string; putts: string }>();

  const currentIndex = holeOrder.indexOf(editingHole);
  const prevHole = currentIndex > 0 ? holeOrder[currentIndex - 1] : null;
  const nextHole = currentIndex < holeOrder.length - 1 ? holeOrder[currentIndex + 1] : null;

  // --- 変更検知（savedBaselineと双方向比較） ---
  const hasChanges = useCallback((holeNumber: number): boolean => {
    const holeInputs = allInputsRef.current.get(holeNumber);
    const baseline = savedBaselineRef.current.get(holeNumber);
    if (!holeInputs || !baseline) return false;
    // サイズが異なれば変更あり（同伴者追加/削除）
    if (holeInputs.size !== baseline.size) return true;
    for (const [companionId, input] of holeInputs) {
      const saved = baseline.get(companionId);
      if (!saved) return true;
      if (input.strokes !== saved.strokes || input.putts !== saved.putts) return true;
    }
    return false;
  }, []);

  // --- ホール単位のDB保存（競合防止付き） ---
  const saveHole = useCallback((holeNumber: number) => {
    if (savingHolesRef.current.has(holeNumber)) return;
    if (!hasChanges(holeNumber)) return;

    const holeInputs = allInputsRef.current.get(holeNumber);
    if (!holeInputs) return;

    const scoreData = [...holeInputs].map(([companionId, input]) => ({
      companionId,
      strokes: parseScore(input.strokes),
      putts: parseScore(input.putts),
    }));

    savingHolesRef.current.add(holeNumber);

    startTransition(async () => {
      const result = await upsertCompanionScoresBatch({
        roundId: roundIdRef.current,
        holeNumber,
        scores: scoreData,
      });
      savingHolesRef.current.delete(holeNumber);
      if (result.error) {
        setSaveResult('error');
      } else {
        const currentInputs = allInputsRef.current.get(holeNumber);
        if (currentInputs) {
          savedBaselineRef.current.set(holeNumber, new Map(currentInputs));
        }
        dirtyHolesRef.current.delete(holeNumber);
        onSaved?.(holeNumber, scoreData);
        setSaveResult('saved');
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = setTimeout(() => setSaveResult('idle'), 3000);
      }
    });
  }, [hasChanges, onSaved]);

  // --- ホール切替（保存→切替） ---
  const switchHole = useCallback((newHole: number) => {
    const currentHole = editingHoleRef.current;
    if (currentHole !== newHole) {
      saveHole(currentHole);
    }
    setEditingHole(newHole);
    setSaveResult('idle');
  }, [saveHole]);

  // --- Context連動（スコア画面のホール変更に追従、初回/同値ガード付き） ---
  const prevContextHoleRef = useRef(playRound?.currentHole);
  useEffect(() => {
    const incoming = playRound?.currentHole;
    if (incoming && incoming !== prevContextHoleRef.current) {
      prevContextHoleRef.current = incoming;
      if (incoming !== editingHoleRef.current) {
        saveHole(editingHoleRef.current);
        setEditingHole(incoming);
        setSaveResult('idle');
      }
    }
  }, [playRound?.currentHole, saveHole]);

  // --- アンマウント時: 全dirtyホールをfire-and-forget保存 ---
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      // 現在ホールのdirty判定
      const current = editingHoleRef.current;
      const currentInputs = allInputsRef.current.get(current);
      const currentBaseline = savedBaselineRef.current.get(current);
      if (currentInputs && currentBaseline) {
        for (const [cid, input] of currentInputs) {
          const saved = currentBaseline.get(cid);
          if (!saved || input.strokes !== saved.strokes || input.putts !== saved.putts) {
            dirtyHolesRef.current.add(current);
            break;
          }
        }
      }
      // 全dirtyホールを保存
      for (const hole of dirtyHolesRef.current) {
        const holeInputs = allInputsRef.current.get(hole);
        if (!holeInputs) continue;
        const scoreData = [...holeInputs].map(([companionId, input]) => ({
          companionId,
          strokes: parseScore(input.strokes),
          putts: parseScore(input.putts),
        }));
        upsertCompanionScoresBatch({
          roundId: roundIdRef.current,
          holeNumber: hole,
          scores: scoreData,
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (companionData.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <HoleNavigation
        prevHole={prevHole}
        nextHole={nextHole}
        onNavigate={switchHole}
        className="bg-gray-800 px-2 py-2"
      >
        <div className="flex items-center gap-2 justify-center">
          <span className="text-sm font-bold text-gray-200">
            Hole {editingHole} 同伴者スコア
          </span>
          <SaveStatusIndicator status={saveResult} compact showLabel={false} />
        </div>
      </HoleNavigation>

      <div className="p-3 space-y-3 bg-gray-900">
        {companionData.map(({ companion }) => {
          const input = inputs.get(companion.id) ?? { strokes: '', putts: '' };
          return (
            <div key={companion.id} className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-300 w-16 truncate">{companion.name}</span>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-400">打数</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={input.strokes}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const value = e.target.value;
                    setAllInputs(prev => {
                      const next = new Map(prev);
                      const holeMap = new Map(next.get(editingHole) ?? new Map<string, { strokes: string; putts: string }>());
                      holeMap.set(companion.id, { ...input, strokes: value });
                      next.set(editingHole, holeMap);
                      return next;
                    });
                    dirtyHolesRef.current.add(editingHole);
                    setSaveResult('idle');
                  }}
                  className="w-14 min-h-[48px] rounded-lg bg-gray-800 text-gray-200 text-center text-base font-bold border-0 focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-400">パット</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={input.putts}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const value = e.target.value;
                    setAllInputs(prev => {
                      const next = new Map(prev);
                      const holeMap = new Map(next.get(editingHole) ?? new Map<string, { strokes: string; putts: string }>());
                      holeMap.set(companion.id, { ...input, putts: value });
                      next.set(editingHole, holeMap);
                      return next;
                    });
                    dirtyHolesRef.current.add(editingHole);
                    setSaveResult('idle');
                  }}
                  className="w-14 min-h-[48px] rounded-lg bg-gray-800 text-gray-200 text-center text-base font-bold border-0 focus:ring-2 focus:ring-green-600"
                />
              </div>
            </div>
          );
        })}

      </div>

      {/* フローティング保存ボタン */}
      <SpeedDial
        aboveNav
        actions={[
          {
            key: 'save',
            icon: <Save className="h-4 w-4" />,
            label: isPending ? '保存中...' : '保存',
            onClick: () => saveHole(editingHole),
            disabled: isPending,
            variant: 'primary',
          },
        ]}
      />
    </div>
  );
}
