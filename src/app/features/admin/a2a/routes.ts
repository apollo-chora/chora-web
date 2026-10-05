import { Routes } from '@angular/router';

export const A2A_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'partners',
    pathMatch: 'full',
  },
  {
    path: 'activation',
    loadComponent: () =>
      import('./components/a2a-activation/a2a-activation.component').then(
        (m) => m.A2AActivationComponent,
      ),
    data: { title: 'A2A Activation' },
  },
  {
    path: 'partners',
    loadComponent: () =>
      import('./components/partner-registration/partner-registration.component').then(
        (m) => m.PartnerRegistrationComponent,
      ),
    data: { title: 'A2A Partners' },
  },
  {
    path: 'partners/register',
    loadComponent: () =>
      import('./components/partner-registration/partner-registration.component').then(
        (m) => m.PartnerRegistrationComponent,
      ),
    data: { title: 'Register Partner' },
  },
  {
    path: 'partners/:partnerId/suspension',
    loadComponent: () =>
      import('./components/partner-suspension/partner-suspension.component').then(
        (m) => m.PartnerSuspensionComponent,
      ),
    data: { title: 'Partner Suspension' },
  },
];
