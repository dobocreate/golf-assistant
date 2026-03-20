export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">コース詳細</h1>
      <p className="text-gray-500">コースID: {courseId}</p>
      <p className="text-gray-500">Sprint 1 で実装予定</p>
    </div>
  );
}
