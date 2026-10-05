import { Routes } from '@angular/router';

export const SUPPORT_ROUTES: Routes = [
  { path: '', redirectTo: 'tickets', pathMatch: 'full' },
  {
    path: 'tickets',
    loadComponent: () =>
      import('./components/ticket-list/ticket-list.component').then(
        (m) => m.TicketListComponent,
      ),
    data: { title: 'My Tickets' },
  },
  {
    path: 'tickets/new',
    loadComponent: () =>
      import('./components/ticket-create/ticket-create.component').then(
        (m) => m.TicketCreateComponent,
      ),
    data: { title: 'New Ticket' },
  },
  {
    path: 'tickets/:ticketId',
    loadComponent: () =>
      import('./components/ticket-detail/ticket-detail.component').then(
        (m) => m.TicketDetailComponent,
      ),
    data: { title: 'Ticket Detail' },
  },
  {
    path: 'faq',
    loadComponent: () =>
      import('./components/faq-browser/faq-browser.component').then(
        (m) => m.FaqBrowserComponent,
      ),
    data: { title: 'FAQ' },
  },
  {
    path: 'satisfaction/:ticketId',
    loadComponent: () =>
      import('./components/satisfaction-survey/satisfaction-survey.component').then(
        (m) => m.SatisfactionSurveyComponent,
      ),
    data: { title: 'Feedback' },
  },
];
