import type { ClassCourseLesson, ClassCourseResource } from "@/utils/classroomTypes";

export function progressDocumentId(classId: string, courseId: string, studentId: string): string {
  return `${classId}_${courseId}_${studentId}`;
}

export function flattenCourseResources(lessons: ClassCourseLesson[]): ClassCourseResource[] {
  return lessons.flatMap((lesson) => lesson.resources);
}
