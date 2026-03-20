export default async function RoundReviewPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ラウンド振り返り</h1>
      <p className="text-gray-500">ラウンドID: {roundId}</p>
      <p className="text-gray-500">Sprint 4 で実装予定</p>
    </div>
  );
}
