import { Routes } from '@angular/router';

export const BILLING_ROUTES: Routes = [
  { path: '', redirectTo: 'subscription', pathMatch: 'full' },
  {
    path: 'subscription',
    loadComponent: () =>
      import('./components/subscription-manager/subscription-manager.component').then(
        (m) => m.SubscriptionManagerComponent,
      ),
    data: { title: 'Subscription' },
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./components/invoice-list/invoice-list.component').then(
        (m) => m.InvoiceListComponent,
      ),
    data: { title: 'Invoices' },
  },
  {
    path: 'promo-codes',
    loadComponent: () =>
      import('./components/promo-code-manager/promo-code-manager.component').then(
        (m) => m.PromoCodeManagerComponent,
      ),
    data: { title: 'Promo Codes' },
  },
  {
    path: 'usage',
    loadComponent: () =>
      import('./components/usage-dashboard/usage-dashboard.component').then(
        (m) => m.UsageDashboardComponent,
      ),
    data: { title: 'Usage' },
  },
  {
    path: 'marketplace/:itemId',
    loadComponent: () =>
      import('./components/marketplace-detail/marketplace-detail.component').then(
        (m) => m.MarketplaceDetailComponent,
      ),
    data: { title: 'Marketplace Detail' },
  },
  {
    path: 'campaigns/new',
    loadComponent: () =>
      import('./components/campaign-admin/campaign-admin.component').then(
        (m) => m.CampaignAdminComponent,
      ),
    data: { title: 'New Campaign' },
  },
  {
    path: 'campaigns',
    loadComponent: () =>
      import('./components/campaign-admin/campaign-admin.component').then(
        (m) => m.CampaignAdminComponent,
      ),
    data: { title: 'Campaigns' },
  },
  {
    path: 'instructor-revenue',
    loadComponent: () =>
      import('./components/instructor-revenue/instructor-revenue.component').then(
        (m) => m.InstructorRevenueComponent,
      ),
    data: { title: 'Instructor Revenue' },
  },
];
