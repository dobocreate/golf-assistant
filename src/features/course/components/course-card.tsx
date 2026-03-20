import Link from 'next/link';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import type { Course } from '@/features/course/types';

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="block rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-primary transition-colors"
    >
      <div className="flex items-start gap-3">
        {course.layout_url && (
          <Image
            src={course.layout_url}
            alt={course.name}
            width={96}
            height={64}
            className="rounded object-cover shrink-0"
          />
        )}
        <div>
          <p className="font-medium">{course.name}</p>
          <p className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mt-1">
            <MapPin className="h-3.5 w-3.5" />
            {course.prefecture}
          </p>
        </div>
      </div>
    </Link>
  );
}
