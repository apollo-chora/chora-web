import { Routes } from '@angular/router';

export const SURVEY_ROUTES: Routes = [
  { path: '', redirectTo: 'list', pathMatch: 'full' },
  {
    path: 'list',
    loadComponent: () =>
      import('./components/survey-list/survey-list.component').then(
        (m) => m.SurveyListComponent,
      ),
    data: { title: 'Surveys' },
  },
  {
    path: ':surveyId/respond',
    loadComponent: () =>
      import('./components/survey-form/survey-form.component').then(
        (m) => m.SurveyFormComponent,
      ),
    data: { title: 'Survey Response' },
  },
  {
    path: ':surveyId/complete',
    loadComponent: () =>
      import('./components/survey-completion/survey-completion.component').then(
        (m) => m.SurveyCompletionComponent,
      ),
    data: { title: 'Survey Complete' },
  },
];
