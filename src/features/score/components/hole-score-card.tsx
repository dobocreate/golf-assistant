'use client';

import type { Score, HoleInfo } from '@/features/score/types';

interface HoleScoreCardProps {
  holes: HoleInfo[];
  scores: Score[];
}

export function HoleScoreCard({ holes, scores }: HoleScoreCardProps) {
  const scoreMap = new Map(scores.map(s => [s.hole_number, s]));

  const outHoles = holes.filter(h => h.hole_number <= 9);
  const inHoles = holes.filter(h => h.hole_number > 9);

  const outPar = outHoles.reduce((sum, h) => sum + h.par, 0);
  const inPar = inHoles.reduce((sum, h) => sum + h.par, 0);

  const outScore = outHoles.reduce((sum, h) => sum + (scoreMap.get(h.hole_number)?.strokes ?? 0), 0);
  const inScore = inHoles.reduce((sum, h) => sum + (scoreMap.get(h.hole_number)?.strokes ?? 0), 0);

  return (
    <div className="space-y-3">
      <ScoreRow label="OUT" holes={outHoles} scoreMap={scoreMap} totalPar={outPar} totalScore={outScore} />
      <ScoreRow label="IN" holes={inHoles} scoreMap={scoreMap} totalPar={inPar} totalScore={inScore} />
      <div className="flex justify-end gap-4 text-sm font-bold text-gray-300">
        <span>TOTAL Par {outPar + inPar}</span>
        <span className="text-white">{outScore + inScore > 0 ? outScore + inScore : '-'}</span>
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  holes,
  scoreMap,
  totalPar,
  totalScore,
}: {
  label: string;
  holes: HoleInfo[];
  scoreMap: Map<number, Score>;
  totalPar: number;
  totalScore: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400">
            <th className="px-1 py-1 text-left">{label}</th>
            {holes.map(h => (
              <th key={h.hole_number} className="px-1 py-1 text-center min-w-[28px]">
                {h.hole_number}
              </th>
            ))}
            <th className="px-1 py-1 text-center">計</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-gray-500">
            <td className="px-1 py-1">Par</td>
            {holes.map(h => (
              <td key={h.hole_number} className="px-1 py-1 text-center">{h.par}</td>
            ))}
            <td className="px-1 py-1 text-center">{totalPar}</td>
          </tr>
          <tr className="text-white font-bold">
            <td className="px-1 py-1">Score</td>
            {holes.map(h => {
              const s = scoreMap.get(h.hole_number);
              const diff = s ? s.strokes - h.par : 0;
              const color = !s ? 'text-gray-600' : diff < 0 ? 'text-blue-400' : diff === 0 ? 'text-green-400' : 'text-red-400';
              return (
                <td key={h.hole_number} className={`px-1 py-1 text-center ${color}`}>
                  {s ? s.strokes : '-'}
                </td>
              );
            })}
            <td className="px-1 py-1 text-center">{totalScore > 0 ? totalScore : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
