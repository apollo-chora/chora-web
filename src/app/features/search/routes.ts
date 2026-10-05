import { Routes } from '@angular/router';

export const SEARCH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/search-page/search-page.component').then(
        (m) => m.SearchPageComponent,
      ),
    data: { title: 'Search' },
  },
];
