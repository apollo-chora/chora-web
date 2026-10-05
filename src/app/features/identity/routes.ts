import { Routes } from '@angular/router';

export const LOGIN_ROUTES: Routes = [
  {
    path: '',
    // Unified login surface — render the polished AplusLoginComponent at /login
    // so unauthed users reach the same UX described in
    // docs/m13/phyllis-demo-script-2026-05-12.md Step 1.
    loadComponent: () =>
      import('../surfaces/aplus/login/aplus-login.component').then(
        (m) => m.AplusLoginComponent,
      ),
    data: { title: 'Log In' },
  },
];

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./settings/settings.component').then((m) => m.SettingsComponent),
    data: { title: 'Settings' },
  },
  {
    // Passkey registration (Phase A4 FE seam). TOTP MFA enrolment was
    // removed with the Firebase Identity Platform extraction — the gateway
    // has no TOTP routes.
    path: 'security',
    loadComponent: () =>
      import('./settings/security/security-settings.component').then(
        (m) => m.SecuritySettingsComponent,
      ),
    data: { title: 'Security' },
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('../admin/communication/components/notification-preferences/notification-preferences.component').then(
        (m) => m.NotificationPreferencesComponent,
      ),
    data: { title: 'Notification Preferences' },
  },
  {
    path: 'notifications/history',
    loadComponent: () =>
      import('./settings/notification-archive/notification-archive.component').then(
        (m) => m.NotificationArchiveComponent,
      ),
    data: { title: 'Notification History' },
  },
  {
    path: 'account/delete',
    loadComponent: () =>
      import('../admin/tenant-admin/components/account-deletion/account-deletion.component').then(
        (m) => m.AccountDeletionComponent,
      ),
    data: { title: 'Delete Account' },
  },
  {
    path: 'account/appeal/status',
    loadComponent: () =>
      import('./settings/appeal-timeline/appeal-timeline.component').then(
        (m) => m.AppealTimelineComponent,
      ),
    data: { title: 'Appeal Status' },
  },
  {
    path: 'account/appeal',
    loadComponent: () =>
      import('./settings/appeal/appeal.component').then(
        (m) => m.AppealComponent,
      ),
    data: { title: 'Appeal Suspension' },
  },
  {
    path: 'api-keys',
    loadComponent: () =>
      import('./settings/api-keys/api-keys.component').then(
        (m) => m.ApiKeysComponent,
      ),
    data: { title: 'API Keys' },
  },
  {
    path: 'identity',
    loadChildren: () =>
      import('./portability/routes').then((m) => m.PORTABILITY_ROUTES),
  },
  {
    path: 'privacy/a2a',
    loadComponent: () =>
      import('./settings/a2a-connections/a2a-connections.component').then(
        (m) => m.A2AConnectionsComponent,
      ),
    data: { title: 'A2A Connections' },
  },
  {
    path: 'referrals',
    loadComponent: () =>
      import('./settings/referrals/referrals.component').then(
        (m) => m.ReferralsComponent,
      ),
    data: { title: 'Referrals' },
  },
  {
    path: 'kyc',
    loadComponent: () =>
      import('./settings/kyc-wizard/kyc-wizard.component').then(
        (m) => m.KycWizardComponent,
      ),
    data: { title: 'KYC Verification' },
  },
];
