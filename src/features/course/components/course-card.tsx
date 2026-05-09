import Link from 'next/link';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import type { Course } from '@/features/course/types';
import { Card } from '@/components/ui/card';

interface Props {
  course: Course;
  /** Sprint 5 PR4 (S-3b): GPS マップ機能対応コースなら true */
  isGpsReady?: boolean;
}

export function CourseCard({ course, isGpsReady }: Props) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="block hover:opacity-90 transition-opacity"
    >
      <Card className="hover:border-primary transition-colors">
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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{course.name}</p>
              {isGpsReady && (
                <span
                  className="inline-flex items-center gap-0.5 text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded px-1.5 py-0.5 leading-none"
                  aria-label="GPS マップ対応コース"
                  title="GPS マップ対応コース"
                >
                  🛰️ GPS対応
                </span>
              )}
            </div>
            <p className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mt-1">
              <MapPin className="h-3.5 w-3.5" />
              {course.prefecture}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
