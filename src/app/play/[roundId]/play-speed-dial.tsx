'use client';

import { Pencil, CheckCircle } from 'lucide-react';
import { SpeedDial } from '@/components/ui/speed-dial';

export function PlaySpeedDial({ roundId }: { roundId: string }) {
  return (
    <SpeedDial
      aboveNav
      actions={[
        {
          key: 'score',
          icon: <Pencil className="h-4 w-4" />,
          label: 'スコア入力',
          href: `/play/${roundId}/score`,
          variant: 'primary',
        },
        {
          key: 'complete',
          icon: <CheckCircle className="h-4 w-4" />,
          label: 'ラウンド完了',
          href: `/play/${roundId}/complete`,
          variant: 'secondary',
        },
      ]}
    />
  );
}
