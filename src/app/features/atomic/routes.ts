import { Routes } from '@angular/router';

export const ATOMIC_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/atom-list/atom-list.component').then(
        (m) => m.AtomListComponent,
      ),
    data: { title: 'Learning Atoms' },
  },
  {
    path: 'player/:id',
    loadComponent: () =>
      import('./components/atom-player/atom-player.component').then(
        (m) => m.AtomPlayerComponent,
      ),
    data: { title: 'Atom Player' },
  },
  {
    path: 'daily-dose',
    loadComponent: () =>
      import('./components/daily-dose/daily-dose.component').then(
        (m) => m.DailyDoseComponent,
      ),
    data: { title: 'DailyDose' },
  },
  {
    path: 'path/:pathId',
    loadComponent: () =>
      import('../learning/components/locked-path-player/locked-path-player.component').then(
        (m) => m.LockedPathPlayerComponent,
      ),
    data: { title: 'Learning Path' },
  },
  {
    path: 'exam-prep/:examId/final',
    loadComponent: () =>
      import('../learning/components/exam-final-prep/exam-final-prep.component').then(
        (m) => m.ExamFinalPrepComponent,
      ),
    data: { title: 'Final Preparation' },
  },
  {
    path: 'exam-prep/:examId/day-of',
    loadComponent: () =>
      import('../learning/components/exam-day-summary/exam-day-summary.component').then(
        (m) => m.ExamDayConfidenceSummaryComponent,
      ),
    data: { title: 'Exam Day' },
  },
  {
    path: 'training',
    loadComponent: () =>
      import('../learning/components/training-enrollment/training-enrollment.component').then(
        (m) => m.TrainingEnrollmentBrowserComponent,
      ),
    data: { title: 'Training Sessions' },
  },
  // -------------------------------------------------------------------------
  // Revision History (Phase 45.1)
  // -------------------------------------------------------------------------
  {
    path: 'revisions/:atomId',
    loadComponent: () =>
      import('./components/revision-diff-viewer/revision-diff-viewer.component').then(
        (m) => m.RevisionDiffViewerComponent,
      ),
    data: { title: 'Revision History' },
  },
];
