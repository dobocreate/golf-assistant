import { getSavedCourses } from '@/actions/course';
import { CourseSearch } from '@/features/course/components/course-search';
import { CourseCard } from '@/features/course/components/course-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'コース一覧 | Golf Assistant',
};

export default async function CoursesPage() {
  const courses = await getSavedCourses();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">コース検索</h1>
        <CourseSearch />
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">保存済みコース</h2>
        {courses.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            コースが保存されていません。上の検索から追加してください。
          </p>
        )}
      </div>
    </div>
  );
}
