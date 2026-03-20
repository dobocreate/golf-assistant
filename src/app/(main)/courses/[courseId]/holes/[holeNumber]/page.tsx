export default async function HoleDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; holeNumber: string }>;
}) {
  const { courseId, holeNumber } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ホール {holeNumber}</h1>
      <p className="text-gray-500">コースID: {courseId}</p>
      <p className="text-gray-500">Sprint 1 で実装予定</p>
    </div>
  );
}
