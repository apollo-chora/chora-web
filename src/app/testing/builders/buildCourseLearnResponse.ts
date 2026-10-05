import type {
  CourseLearnAtom,
  CourseLearnResponse,
} from '../../features/surfaces/aplus/course-learn/course-learn.model';

/**
 * Test data builder for `CourseLearnResponse` — the hydrated learning-path
 * DTO returned by GET /api/v1/me/learning-paths?course_id={id}.
 *
 * Per chora-web/CLAUDE.md §6 — never inline object literals in specs.
 * Defaults represent a minimal 2-atom Straight-Up path with the first atom
 * in_progress (current_index = 0).
 */
export function buildCourseLearnAtom(
  overrides: Partial<CourseLearnAtom> = {},
): CourseLearnAtom {
  return {
    atom_id: '01000000-0000-7000-8000-000000000001',
    title: 'Introduction to Scrum',
    order: 0,
    state: 'not_started',
    completed_at: null,
    ...overrides,
  };
}

export function buildCourseLearnResponse(
  overrides: Partial<CourseLearnResponse> = {},
): CourseLearnResponse {
  const atoms: readonly CourseLearnAtom[] = [
    buildCourseLearnAtom({
      atom_id: '01000000-0000-7000-8000-000000000001',
      title: 'Introduction to Scrum',
      order: 0,
      state: 'in_progress',
    }),
    buildCourseLearnAtom({
      atom_id: '01000000-0000-7000-8000-000000000002',
      title: 'Roles and Responsibilities',
      order: 1,
      state: 'not_started',
    }),
  ];
  return {
    learning_path_id: '08000000-0000-7000-8000-000000000001',
    course_id: '05000000-0000-7000-8000-0000000c5301',
    title: 'Certified ScrumMaster (CSM) Prep',
    mode: 'straight_up',
    bootstrapped_at: '2026-05-26T10:00:00Z',
    current_index: 0,
    total_atoms: 2,
    // completed_atoms = HOW MANY are done. `completed` = is the WHOLE path done.
    // These used to be one field (`completed: 0`), which is how the boolean the
    // backend actually sends ended up rendered to a learner as "false / 5
    // completed" (CHO-2169).
    completed_atoms: 0,
    completed: false,
    atoms,
    ...overrides,
  };
}
