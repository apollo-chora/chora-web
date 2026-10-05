import { Routes } from '@angular/router';

export const ONBOARDING_ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'cohorts', pathMatch: 'full' },
  {
    path: 'templates/new',
    loadComponent: () =>
      import('./components/checklist-builder/checklist-builder.component').then(
        (m) => m.ChecklistBuilderComponent,
      ),
    data: { title: 'New Checklist Template' },
  },
  {
    path: 'templates/:id/edit',
    loadComponent: () =>
      import('./components/checklist-builder/checklist-builder.component').then(
        (m) => m.ChecklistBuilderComponent,
      ),
    data: { title: 'Edit Checklist Template' },
  },
  {
    path: 'cohorts',
    loadComponent: () =>
      import('./components/cohort-progress/cohort-progress.component').then(
        (m) => m.CohortProgressComponent,
      ),
    data: { title: 'Cohort Progress' },
  },
];
