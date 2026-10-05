/**
 * Storybook stories for BootstrapTenantFormComponent (CHO-1642 Phase 4).
 *
 * Demonstrates the five visible states: idle, loading, already-member,
 * 400 inline error, 5xx banner. Each story injects a fake
 * BootstrapTenantService so the form exercises its switch logic
 * without an HTTP round-trip.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

import { BootstrapTenantFormComponent } from './bootstrap-tenant-form.component';
import { BootstrapTenantService } from './bootstrap-tenant.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BootstrapTenantResult } from './bootstrap-tenant.model';

class FakeService {
  constructor(private readonly result: BootstrapTenantResult) {}
  bootstrap(_name: string): Observable<BootstrapTenantResult> {
    return of(this.result);
  }
}

const fakeAuth = {
  silentRefresh: () => of(true),
};

function withFake(result: BootstrapTenantResult) {
  return {
    applicationConfig: applicationConfig({
      providers: [provideRouter([])],
    }),
    moduleMetadata: moduleMetadata({
      providers: [
        { provide: BootstrapTenantService, useValue: new FakeService(result) },
        { provide: AuthService, useValue: fakeAuth },
      ],
    }),
  };
}

const meta: Meta<BootstrapTenantFormComponent> = {
  title: 'Onboarding / BootstrapTenantForm',
  component: BootstrapTenantFormComponent,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'H+ Setup-Tenant Phase 4 MVP (CHO-1642). Inline form embedded in NoTenantComponent at /welcome/no-tenant. POSTs to /api/v1/tenants/bootstrap and routes the user to /h/tenant on success.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<BootstrapTenantFormComponent>;

export const Idle: Story = {
  parameters: withFake({
    kind: 'success',
    response: {
      tenant_id: '01935f12-0000-7000-8000-000000000001',
      owner_member_id: '01935f12-0000-7000-8000-000000000002',
      entitlement_id: '01935f12-0000-7000-8000-000000000003',
      created_at: '2026-06-02T01:00:00Z',
    },
  }),
};

export const AlreadyMember: Story = {
  parameters: withFake({ kind: 'already-member' }),
  play: async ({ canvasElement }) => {
    // Trigger the conflict state by submitting a valid-looking name.
    const input = canvasElement.querySelector<HTMLInputElement>(
      '[data-testid="bootstrap-tenant-form-name"]',
    );
    const button = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="bootstrap-tenant-form-submit"]',
    );
    if (input && button) {
      input.value = 'Already Owned';
      input.dispatchEvent(new Event('input'));
      button.click();
    }
  },
};

export const InvalidNameServerError: Story = {
  parameters: withFake({
    kind: 'invalid-name',
    message: 'name must be between 3 and 256 characters',
  }),
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>(
      '[data-testid="bootstrap-tenant-form-name"]',
    );
    const button = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="bootstrap-tenant-form-submit"]',
    );
    if (input && button) {
      input.value = 'Reserved Name';
      input.dispatchEvent(new Event('input'));
      button.click();
    }
  },
};

export const ServerError: Story = {
  parameters: withFake({ kind: 'server-error' }),
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>(
      '[data-testid="bootstrap-tenant-form-name"]',
    );
    const button = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="bootstrap-tenant-form-submit"]',
    );
    if (input && button) {
      input.value = 'Triggers Server Error';
      input.dispatchEvent(new Event('input'));
      button.click();
    }
  },
};

export const NetworkError: Story = {
  parameters: withFake({ kind: 'network-error' }),
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>(
      '[data-testid="bootstrap-tenant-form-name"]',
    );
    const button = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="bootstrap-tenant-form-submit"]',
    );
    if (input && button) {
      input.value = 'Triggers Network Error';
      input.dispatchEvent(new Event('input'));
      button.click();
    }
  },
};
