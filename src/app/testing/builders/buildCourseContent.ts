/**
 * Test data builders for `CourseContentResponse` and `CourseContentItem`.
 *
 * Per chora-web/CLAUDE.md §6 — never inline object literals in specs.
 * Defaults represent a minimal 3-item heterogeneous curriculum.
 */
import type {
  CourseContentItem,
  CourseContentResponse,
} from '../../features/shared/course-content/course-content.model';

export function buildCourseContentItem(
  overrides: Partial<CourseContentItem> = {},
): CourseContentItem {
  return {
    item_id: '09000000-0000-7000-8000-000000000001',
    kind: 'atom',
    ref: '01000000-0000-7000-8000-000000000001',
    title: 'Introduction to Scrum',
    position: 1,
    ...overrides,
  };
}

export function buildCourseContentResponse(
  overrides: Partial<CourseContentResponse> = {},
): CourseContentResponse {
  const items: readonly CourseContentItem[] = [
    buildCourseContentItem({
      item_id: '09000000-0000-7000-8000-000000000001',
      kind: 'atom',
      ref: '01000000-0000-7000-8000-000000000001',
      title: 'Introduction to Scrum',
      position: 1,
    }),
    buildCourseContentItem({
      item_id: '09000000-0000-7000-8000-000000000002',
      kind: 'video',
      ref: 'https://cdn.example.com/scrum-basics.mp4',
      title: 'Scrum in 5 Minutes',
      position: 2,
    }),
    buildCourseContentItem({
      item_id: '09000000-0000-7000-8000-000000000003',
      kind: 'assessment',
      ref: '07000000-0000-7000-8000-000000000001',
      title: 'Scrum Fundamentals Quiz',
      position: 3,
    }),
  ];
  return {
    course_id: '05000000-0000-7000-8000-0000000c5301',
    items,
    ...overrides,
  };
}
