import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, MapPin } from 'lucide-react';
import { getCourseWithHoles } from '@/actions/course';
import { getMapPointsForCourse } from '@/actions/hole-map';
import { HoleList } from '@/features/course/components/hole-list';
// import { HoleImport } from '@/features/course/components/hole-import';
import { notFound } from 'next/navigation';

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [{ course, holes, holeNotes }, mapPoints] = await Promise.all([
    getCourseWithHoles(courseId),
    getMapPointsForCourse(courseId),
  ]);

  if (!course) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        コース一覧
      </Link>

      <div className="flex items-start gap-4">
        {course.layout_url && (
          <Image
            src={course.layout_url}
            alt={course.name}
            width={160}
            height={120}
            className="rounded-lg object-cover shrink-0"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">{course.name}</h1>
          {course.prefecture && (
            <p className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mt-1">
              <MapPin className="h-3.5 w-3.5" />
              {course.prefecture} {course.address}
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">
          ホール情報 {holes.length > 0 && <span className="text-sm font-normal text-gray-500">（{holes.length}ホール）</span>}
        </h2>
        {/* <HoleImport courseId={courseId} /> */}
        <HoleList courseId={courseId} holes={holes} holeNotes={holeNotes} mapPoints={mapPoints} />
      </div>
    </div>
  );
}
