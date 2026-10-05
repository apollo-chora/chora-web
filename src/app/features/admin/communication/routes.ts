import { Routes } from '@angular/router';

export const COMMUNICATION_ROUTES: Routes = [
  { path: '', redirectTo: 'preferences', pathMatch: 'full' },
  {
    path: 'preferences',
    loadComponent: () =>
      import('./components/notification-preferences/notification-preferences.component').then(
        (m) => m.NotificationPreferencesComponent,
      ),
    data: { title: 'Notification Preferences' },
  },
  {
    path: 'trigger-rules',
    loadComponent: () =>
      import('./components/trigger-rule-manager/trigger-rule-manager.component').then(
        (m) => m.TriggerRuleManagerComponent,
      ),
    data: { title: 'Trigger Rules' },
  },
  {
    path: 'email-templates',
    loadComponent: () =>
      import('./components/email-template-editor/email-template-editor.component').then(
        (m) => m.EmailTemplateEditorComponent,
      ),
    data: { title: 'Email Templates' },
  },
];
