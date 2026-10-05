import type { CourseDetail } from '../../features/surfaces/aplus/course-detail/course-detail.model';

/**
 * Test data builder for `CourseDetail` — the A+ course-detail DTO.
 *
 * Mirrors the real wire shape returned by
 *   GET https://api.chora.site/api/courses/{id}
 * (snake_case, as the BE serialises it — the SAME field set as
 * `CatalogCourse`). Per `chora-web/CLAUDE.md` §6 — never inline object
 * literals in specs.
 *
 * The defaults reflect the REAL data state probed live 2026-05-14:
 * `instructor_name` is `''`, `tags` empty, counts `0`. Specs that need
 * richer values pass explicit overrides — they never fake them silently.
 */
export function buildCourseDetail(
  overrides: Partial<CourseDetail> = {},
): CourseDetail {
  return {
    id: '05000000-0000-7000-8000-0000000c5301',
    title: 'Certified ScrumMaster (CSM) Prep',
    tenant_id: '22222222-2222-7222-8222-222222222222',
    instructor_gcid: '00000000-0000-7000-8000-000000001002',
    instructor_name: '',
    is_free: true,
    price_sgd_cents: 0,
    public: true,
    visibility: 'public',
    sf_eligible: false,
    enrolled_count: 0,
    syllabus_outline_count: 0,
    tags: [],
    created_at: '2026-05-14T06:46:01.639374Z',
    updated_at: '2026-05-14T06:46:01.639374Z',
    ...overrides,
  };
}
