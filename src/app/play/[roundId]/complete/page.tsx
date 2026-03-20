export default async function RoundCompletePage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ラウンド完了</h1>
      <p className="text-gray-500">ラウンドID: {roundId}</p>
      <p className="text-gray-500">Sprint 2 で実装予定</p>
    </div>
  );
}
