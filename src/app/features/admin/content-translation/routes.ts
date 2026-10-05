import { Routes } from '@angular/router';

export const TRANSLATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/translation-panel/translation-panel.component').then(
        (m) => m.TranslationPanelComponent,
      ),
    data: { title: 'Content Translation' },
  },
];
