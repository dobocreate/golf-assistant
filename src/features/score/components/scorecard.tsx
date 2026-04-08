'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { Score, HoleInfo, Companion, CompanionWithScores } from '@/features/score/types';

interface ScorecardProps {
  roundId: string;
  holes: HoleInfo[];
  scores: Score[];
  courseName: string;
  startingCourse: 'out' | 'in';
  companionData: CompanionWithScores[];
}

function scoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff < 0) return 'text-blue-400';
  if (diff === 0) return 'text-green-400';
  return 'text-red-400';
}

function calcHitRate(targetHoles: number[], scoreMap: Map<number, Score>, stat: 'fairway_hit' | 'green_in_reg'): string {
  const total = targetHoles.filter(h => scoreMap.get(h)?.[stat] != null).length;
  const hits = targetHoles.filter(h => scoreMap.get(h)?.[stat] === true).length;
  return total > 0 ? `${hits}/${total}` : '-';
}

function scoreBg(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return 'bg-yellow-900/30';
  if (diff < 0) return 'bg-blue-900/20';
  if (diff === 0) return '';
  if (diff === 1) return 'bg-red-900/10';
  return 'bg-red-900/20';
}

const OUT_HOLES = Array.from({ length: 9 }, (_, i) => i + 1);
const IN_HOLES = Array.from({ length: 9 }, (_, i) => i + 10);
const ALL_HOLES = [...OUT_HOLES, ...IN_HOLES];

export function Scorecard({ roundId, holes, scores, courseName, startingCourse, companionData }: ScorecardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null);

  const scoreMap = useMemo(() => new Map(scores.map(s => [s.hole_number, s])), [scores]);
  const holeMap = useMemo(() => new Map(holes.map(h => [h.hole_number, h])), [holes]);

  const companionScoreMap = useMemo(() => {
    const map = new Map<string, Map<number, { strokes: number | null; putts: number | null }>>();
    for (const { companion, scores: cs } of companionData) {
      const m = new Map<number, { strokes: number | null; putts: number | null }>();
      for (const s of cs) m.set(s.hole_number, { strokes: s.strokes, putts: s.putts });
      map.set(companion.id, m);
    }
    return map;
  }, [companionData]);

  const sections = startingCourse === 'in'
    ? [{ label: 'IN', holes: IN_HOLES }, { label: 'OUT', holes: OUT_HOLES }]
    : [{ label: 'OUT', holes: OUT_HOLES }, { label: 'IN', holes: IN_HOLES }];

  const companions = companionData.map(c => c.companion);

  const totalStats = useMemo(() => {
    const totalPar = ALL_HOLES.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0);
    const totalStrokes = ALL_HOLES.reduce((sum, h) => sum + (scoreMap.get(h)?.strokes ?? 0), 0);
    const totalPutts = ALL_HOLES.reduce((sum, h) => sum + (scoreMap.get(h)?.putts ?? 0), 0);
    const totalCount = ALL_HOLES.filter(h => scoreMap.has(h)).length;
    return { totalPar, totalStrokes, totalPutts, totalCount };
  }, [holeMap, scoreMap]);

  /** OUT/INのtheadと同一構造のヘッダー行（列幅を揃えるため） */
  function renderTheadRow(label: string) {
    return (
      <tr className="bg-gray-800 text-gray-400 text-xs">
        <th scope="col" className="px-1.5 py-2 text-left font-bold">{label}</th>
        <th scope="col" className="px-1 py-2 text-center font-medium">Par</th>
        <th scope="col" className="px-1 py-2 text-center font-bold">Score</th>
        {showDetail && (
          <>
            <th scope="col" className="px-1 py-2 text-center font-medium">Putt</th>
            <th scope="col" className="px-1 py-2 text-center font-medium">FW</th>
            <th scope="col" className="px-1 py-2 text-center font-medium">GIR</th>
          </>
        )}
        {companions.map(c => (
          <th scope="col" key={c.id} className="text-center font-medium truncate max-w-[48px] p-0">
            <button
              type="button"
              onClick={() => setSelectedCompanion(c)}
              className="w-full px-1 py-2 text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer truncate"
              title={`${c.name}の詳細を表示`}
            >
              {c.name}
            </button>
          </th>
        ))}
      </tr>
    );
  }

  /** セクション小計行を描画 */
  function renderSubtotalRow(label: string, sectionHoles: number[]) {
    const sectionStrokes = sectionHoles.reduce((sum, h) => sum + (scoreMap.get(h)?.strokes ?? 0), 0);
    const sectionPutts = sectionHoles.reduce((sum, h) => sum + (scoreMap.get(h)?.putts ?? 0), 0);
    const sectionPar = sectionHoles.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0);
    const sectionCount = sectionHoles.filter(h => scoreMap.has(h)).length;

    return (
      <tr className="bg-gray-700/80 border-t-2 border-gray-600">
        <td className="px-1.5 py-2.5 font-bold text-white">{label}</td>
        <td className="px-1 py-2.5 text-center font-bold text-gray-300">{sectionPar}</td>
        <td className={`px-1 py-2.5 text-center font-bold text-xl ${sectionCount > 0 ? scoreColor(sectionStrokes, sectionPar) : 'text-white'}`}>{sectionCount > 0 ? sectionStrokes : '-'}</td>
        {showDetail && (
          <>
            <td className="px-1 py-2.5 text-center font-bold text-gray-300">{sectionCount > 0 ? sectionPutts : '-'}</td>
            <td className="px-1 py-2.5 text-center text-xs text-gray-400">{calcHitRate(sectionHoles, scoreMap, 'fairway_hit')}</td>
            <td className="px-1 py-2.5 text-center text-xs text-gray-400">{calcHitRate(sectionHoles, scoreMap, 'green_in_reg')}</td>
          </>
        )}
        {companions.map(c => {
          const csMap = companionScoreMap.get(c.id);
          const ct = sectionHoles.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
          const cc = sectionHoles.filter(h => csMap?.get(h)?.strokes != null).length;
          return <td key={c.id} className="px-1 py-2.5 text-center font-bold text-gray-200">{cc > 0 ? ct : '-'}</td>;
        })}
      </tr>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300 truncate flex-1">{courseName}</p>
        <button
          onClick={() => setShowDetail(prev => !prev)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors px-3 py-2 rounded-lg bg-gray-800 min-h-[48px]"
          aria-expanded={showDetail}
          aria-controls="scorecard-tables"
        >
          {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showDetail ? '簡易表示' : 'パット・FW・GIRを表示'}
        </button>
      </div>

      {/* セクション（OUT/IN） */}
      <div id="scorecard-tables">
      {sections.map(section => (
        <div key={section.label} className="rounded-xl border border-gray-700 overflow-x-auto mb-5">
          <table className="w-full text-sm tabular-nums" aria-label={`${section.label}スコア`}>
            <thead>{renderTheadRow(section.label)}</thead>
            <tbody className="divide-y divide-gray-800">
              {section.holes.map(h => {
                const s = scoreMap.get(h);
                const hole = holeMap.get(h);
                const par = hole?.par ?? 4;

                return (
                  <tr key={h} className={`bg-gray-900 ${s ? scoreBg(s.strokes, par) : ''}`}>
                    <td className="px-1.5 py-2 font-bold text-gray-300">{h}</td>
                    <td className="px-1 py-2 text-center text-gray-400">{par}</td>
                    <td className={`px-1 py-2 text-center font-bold text-xl ${s ? scoreColor(s.strokes, par) : 'text-gray-500'}`}>
                      {s ? s.strokes : '-'}
                    </td>
                    {showDetail && (
                      <>
                        <td className="px-1 py-2 text-center text-gray-300">{s?.putts ?? '-'}</td>
                        <td className={`px-1 py-2 text-center ${s?.fairway_hit === true ? 'text-green-400' : s?.fairway_hit === false ? 'text-red-400' : 'text-gray-500'}`}>
                          {s?.fairway_hit === true ? '○' : s?.fairway_hit === false ? '×' : '-'}
                        </td>
                        <td className={`px-1 py-2 text-center ${s?.green_in_reg === true ? 'text-green-400' : s?.green_in_reg === false ? 'text-red-400' : 'text-gray-500'}`}>
                          {s?.green_in_reg === true ? '○' : s?.green_in_reg === false ? '×' : '-'}
                        </td>
                      </>
                    )}
                    {companions.map(c => {
                      const cs = companionScoreMap.get(c.id)?.get(h);
                      return (
                        <td key={c.id} className={`px-1 py-2 text-center font-bold ${cs?.strokes ? scoreColor(cs.strokes, par) : 'text-gray-500'}`}>
                          {cs?.strokes ?? '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {renderSubtotalRow(section.label, section.holes)}
            </tbody>
          </table>
        </div>
      ))}
      </div>

      {/* 合計（OUT/INと同じthead構造で列幅を揃える） */}
      <div className="rounded-xl border border-gray-600 overflow-x-auto">
        <table className="w-full text-sm tabular-nums" aria-label="合計スコア">
          {/* 非表示のthead: OUT/INと同じ列構造を持たせて列幅を揃える */}
          <thead className="h-0 overflow-hidden" aria-hidden="true">
            {renderTheadRow('合計')}
          </thead>
          <tbody>
            <tr className="bg-gray-800">
              <td className="px-1.5 py-3 font-bold text-white">合計</td>
              <td className="px-1 py-3 text-center font-bold text-gray-300">{totalStats.totalPar}</td>
              <td className={`px-1 py-3 text-center font-bold text-2xl ${totalStats.totalCount > 0 ? scoreColor(totalStats.totalStrokes, totalStats.totalPar) : 'text-white'}`}>
                {totalStats.totalCount > 0 ? totalStats.totalStrokes : '-'}
              </td>
              {showDetail && (
                <>
                  <td className="px-1 py-3 text-center font-bold text-gray-300">{totalStats.totalCount > 0 ? totalStats.totalPutts : '-'}</td>
                  <td className="px-1 py-3 text-center text-xs text-gray-400">{calcHitRate(ALL_HOLES, scoreMap, 'fairway_hit')}</td>
                  <td className="px-1 py-3 text-center text-xs text-gray-400">{calcHitRate(ALL_HOLES, scoreMap, 'green_in_reg')}</td>
                </>
              )}
              {companions.map(c => {
                const csMap = companionScoreMap.get(c.id);
                const ct = ALL_HOLES.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                const cc = ALL_HOLES.filter(h => csMap?.get(h)?.strokes != null).length;
                return <td key={c.id} className="px-1 py-3 text-center font-bold text-gray-200">{cc > 0 ? ct : '-'}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 同伴者詳細モーダル */}
      {selectedCompanion && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="companion-detail-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedCompanion(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setSelectedCompanion(null); }}
        >
          <div className="mx-4 w-full max-w-sm max-h-[80vh] rounded-xl bg-gray-800 border border-gray-600 overflow-hidden flex flex-col">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h2 id="companion-detail-title" className="text-lg font-bold text-white">{selectedCompanion.name}</h2>
              <button
                type="button"
                autoFocus
                onClick={() => setSelectedCompanion(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* スコアテーブル */}
            <div className="overflow-y-auto flex-1 px-4 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" tabIndex={0} role="region" aria-labelledby="companion-detail-title">
              {(() => {
                const csMap = companionScoreMap.get(selectedCompanion.id);
                const totalStrokes = ALL_HOLES.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                const totalPutts = ALL_HOLES.reduce((sum, h) => sum + (csMap?.get(h)?.putts ?? 0), 0);
                const totalCount = ALL_HOLES.filter(h => csMap?.get(h)?.strokes != null).length;

                return (
                  <>
                    {sections.map(section => {
                      const sectionStrokes = section.holes.reduce((sum, h) => sum + (csMap?.get(h)?.strokes ?? 0), 0);
                      const sectionPutts = section.holes.reduce((sum, h) => sum + (csMap?.get(h)?.putts ?? 0), 0);
                      const sectionCount = section.holes.filter(h => csMap?.get(h)?.strokes != null).length;

                      return (
                        <div key={section.label} className="mb-3">
                          <table className="w-full text-sm tabular-nums">
                            <thead>
                              <tr className="text-gray-400 text-xs">
                                <th className="px-1 py-1 text-left font-bold">{section.label}</th>
                                <th className="px-1 py-1 text-center font-medium">Par</th>
                                <th className="px-1 py-1 text-center font-bold">Score</th>
                                <th className="px-1 py-1 text-center font-medium">Putt</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                              {section.holes.map(h => {
                                const cs = csMap?.get(h);
                                const par = holeMap.get(h)?.par ?? 4;
                                return (
                                  <tr key={h} className={cs?.strokes ? scoreBg(cs.strokes, par) : ''}>
                                    <td className="px-1 py-1.5 font-bold text-gray-300">{h}</td>
                                    <td className="px-1 py-1.5 text-center text-gray-400">{par}</td>
                                    <td className={`px-1 py-1.5 text-center font-bold ${cs?.strokes ? scoreColor(cs.strokes, par) : 'text-gray-500'}`}>
                                      {cs?.strokes ?? '-'}
                                    </td>
                                    <td className="px-1 py-1.5 text-center text-gray-300">
                                      {cs?.putts ?? '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-gray-700/50 border-t border-gray-600">
                                <td className="px-1 py-1.5 font-bold text-white">{section.label}</td>
                                <td className="px-1 py-1.5 text-center text-gray-300">
                                  {section.holes.reduce((sum, h) => sum + (holeMap.get(h)?.par ?? 0), 0)}
                                </td>
                                <td className="px-1 py-1.5 text-center font-bold text-white">{sectionCount > 0 ? sectionStrokes : '-'}</td>
                                <td className="px-1 py-1.5 text-center text-gray-300">{sectionCount > 0 ? sectionPutts : '-'}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}

                    <div className="rounded-lg bg-gray-700/50 px-3 py-2 flex justify-between items-center">
                      <span className="font-bold text-white">合計</span>
                      <div className="flex gap-4">
                        <span className="text-white font-bold text-lg">{totalCount > 0 ? totalStrokes : '-'}<span className="text-xs text-gray-400 ml-0.5">打</span></span>
                        <span className="text-gray-300">{totalCount > 0 ? totalPutts : '-'}<span className="text-xs text-gray-400 ml-0.5">パット</span></span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {/* BottomNav高さ(~80px) + safe area分のスペーサー */}
      <div className="h-28" />
    </div>
  );
}
