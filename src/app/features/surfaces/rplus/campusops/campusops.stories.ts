/**
 * CampusopsComponent Storybook stories — R+ M15a Campus Operations.
 *
 * Variants:
 *   - Empty           — BFF returns zero campuses (empty-state branch)
 *   - Populated       — multi-campus realistic Singapore + KL roster
 *   - Loading         — getCampuses() Observable never emits (initial null)
 *   - Error           — getCampuses() Observable errors (component still
 *                       renders header + empty grid, no error banner in
 *                       this M15a screen — the catalogue update lands next
 *                       wave)
 *
 * Stub strategy per `coding-angular-storybook` + `frontend-testing-stack`:
 *   - CampusopsService is swapped with a signal-backed stub so getCampuses()
 *     returns a controllable Observable, no HttpClient round-trip.
 *   - TenantContextService is wrapped to surface a sample tenant name —
 *     the real service is signal-backed and the component reads it via
 *     the service mapper, so the stub mirrors the mapper output.
 *   - polyglass + surface-rplus accent is applied by the global preview
 *     decorator; no per-story body class mutation needed.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { CampusopsComponent } from './campusops.component';
import { CampusopsService } from './campusops.service';
import type { Campus, CampusList } from './campusops.model';
import { composeDisplayAddress } from './campusops.model';

// ── Fixture builders ─────────────────────────────────────────────────────────

function buildCampus(overrides: Partial<Campus> = {}): Campus {
  const addressLine1 = overrides.addressLine1 ?? '123 Bras Basah Rd';
  const city = overrides.city ?? 'Singapore';
  const country = overrides.country ?? 'SG';
  return {
    campusId: '01970000-0000-7000-8000-000000000001',
    tenantId: '01970000-0000-7000-8000-000000000aaa',
    name: 'MTM SG — Bras Basah',
    addressLine1,
    addressLine2: '',
    city,
    country,
    displayAddress: composeDisplayAddress(addressLine1, city, country),
    createdAt: '2026-05-26T01:00:00Z',
    updatedAt: '2026-05-26T01:00:00Z',
    ...overrides,
  };
}

const POPULATED_CAMPUSES: readonly Campus[] = [
  buildCampus({
    campusId: '01970000-0000-7000-8000-000000000001',
    name: 'MTM SG — Bras Basah',
    addressLine1: '123 Bras Basah Rd',
    city: 'Singapore',
    country: 'SG',
  }),
  buildCampus({
    campusId: '01970000-0000-7000-8000-000000000002',
    name: 'MTM SG — Bishan',
    addressLine1: '456 Bishan Ave 1',
    city: 'Singapore',
    country: 'SG',
  }),
  buildCampus({
    campusId: '01970000-0000-7000-8000-000000000003',
    name: 'MTM SG — One-North',
    addressLine1: '88 Buona Vista',
    city: 'Singapore',
    country: 'SG',
  }),
  buildCampus({
    campusId: '01970000-0000-7000-8000-000000000004',
    name: 'MTM Malaysia — KL Sentral',
    addressLine1: 'Lot 5, KL Sentral',
    city: 'Kuala Lumpur',
    country: 'MY',
  }),
];

function stubServiceProvider(observable: Observable<CampusList>) {
  const svc: Pick<CampusopsService, 'getCampuses'> = {
    getCampuses: () => observable,
  };
  return { provide: CampusopsService, useValue: svc };
}

function buildList(campuses: readonly Campus[]): CampusList {
  return {
    tenantName: 'MTM Singapore',
    totalCampuses: campuses.length,
    campuses,
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<CampusopsComponent> = {
  title: 'Surfaces/R+/Campusops (Campus Operations)',
  component: CampusopsComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tabletPortrait' },
    docs: {
      description: {
        component:
          'R+ Rhythm+ training-admin Campus Operations entry point (M15a, /r/campusops). ' +
          'Lists Campus aggregates owned by the current tenant with per-card Rooms + ' +
          'Incidents drill-downs (future M15a+ waves).',
      },
    },
  },
  decorators: [
    moduleMetadata({ imports: [CampusopsComponent] }),
  ],
};
export default meta;

type Story = StoryObj<CampusopsComponent>;

// ── Story: Empty ─────────────────────────────────────────────────────────────

export const Empty: Story = {
  name: 'Empty — No campuses yet',
  parameters: {
    docs: {
      description: {
        story:
          'Tenant has not provisioned any Campus yet — empty-state message ' +
          'renders below the header. Header still shows the Create-Campus CTA.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(of(buildList([]))),
      ],
    }),
  ],
};

// ── Story: Populated ─────────────────────────────────────────────────────────

export const Populated: Story = {
  name: 'Populated — 4 campuses (SG × 3 + MY × 1)',
  parameters: {
    docs: {
      description: {
        story:
          'Realistic MTM-tenant campus roster. Header pill shows the tenant name + ' +
          'count badge; each card surfaces the country flag chip, short id badge, ' +
          'address, and per-campus Rooms / Incidents drill-down CTAs.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(of(buildList(POPULATED_CAMPUSES))),
      ],
    }),
  ],
};

// ── Story: Loading ───────────────────────────────────────────────────────────

export const Loading: Story = {
  name: 'Loading — BFF pending',
  parameters: {
    docs: {
      description: {
        story:
          'BFF call still in-flight — initial null from toSignal renders zero ' +
          'campuses + zero header count. Component does not paint a spinner; the ' +
          'header CTA stays interactive.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(NEVER),
      ],
    }),
  ],
};

// ── Story: Error ─────────────────────────────────────────────────────────────

export const Error: Story = {
  name: 'Error — BFF 5xx (no banner; falls through to empty-state)',
  parameters: {
    docs: {
      description: {
        story:
          'BFF upstream fails with a 5xx. The current M15a screen has no explicit ' +
          'error banner — the toSignal stream errors silently and the grid renders ' +
          'as empty. A fail-loud banner lands when the catalogue refactor ships.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(
          throwError(() => ({ status: 503, message: 'Upstream Bad Gateway' })),
        ),
      ],
    }),
  ],
};

