import { Routes } from '@angular/router';

/**
 * A+ Me-Assessments routes — Phase X.3 / ADR-155 learner submission flow.
 *
 * Main session adds the following entry to `aplus.routes.ts`:
 *   {
 *     path: 'me/assessments',
 *     loadChildren: () =>
 *       import('./me-assessments/me-assessments.routes').then(
 *         (m) => m.ME_ASSESSMENTS_ROUTES,
 *       ),
 *   }
 *
 * Mounted route table (with parent `me/assessments` prefix):
 *   - /a/me/assessments                                      → list
 *   - /a/me/assessments/:assessmentId                        → cover + canvas
 *   - /a/me/assessments/:assessmentId/result/:submissionId   → result
 *   - /a/me/assessments/:assessmentId/result                 → result (compat)
 */
export const ME_ASSESSMENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./me-assessments-list/me-assessments-list.component').then(
        (m) => m.MeAssessmentsListComponent,
      ),
    data: { title: 'A+ | My Assessments', surface: 'aplus' },
  },
  {
    path: ':assessmentId',
    loadComponent: () =>
      import('./me-assessment/me-assessment.component').then(
        (m) => m.MeAssessmentComponent,
      ),
    data: { title: 'A+ | Assessment', surface: 'aplus' },
  },
  {
    path: ':assessmentId/result/:submissionId',
    loadComponent: () =>
      import(
        './me-assessment-result/me-assessment-result.component'
      ).then((m) => m.MeAssessmentResultComponent),
    data: { title: 'A+ | Assessment Result', surface: 'aplus' },
  },
  {
    path: ':assessmentId/result',
    loadComponent: () =>
      import(
        './me-assessment-result/me-assessment-result.component'
      ).then((m) => m.MeAssessmentResultComponent),
    data: { title: 'A+ | Assessment Result', surface: 'aplus' },
  },
];
