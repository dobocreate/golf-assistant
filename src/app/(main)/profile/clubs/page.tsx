import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'クラブ設定 | Golf Assistant',
};

export default function ClubsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">クラブ設定</h1>
      <p className="text-gray-500">Sprint 1 で実装予定</p>
    </div>
  );
}
