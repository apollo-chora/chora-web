/**
 * CertificationsComponent Storybook stories — R+ /r/certifications (M12).
 *
 * Variants:
 *   - Empty           — BFF returns zero certifications (empty-state branch)
 *   - Populated       — multiple Active + one Revoked credential rows
 *   - Loading         — list() Observable never emits (initial null)
 *   - Error           — list() Observable errors silently (header + empty grid)
 *
 * Stub strategy per `coding-angular-storybook` + `frontend-testing-stack`:
 *   - CertificationsService.list() is replaced with a controllable Observable.
 *   - issue() + revoke() are no-op stubs (no follow-on round-trip wired in M12).
 *   - polyglass shell + R+ accent come from the global preview decorator.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EMPTY, NEVER, Observable, of, throwError } from 'rxjs';

import { CertificationsComponent } from './certifications.component';
import { CertificationsService } from './certifications.service';
import type {
  Certification,
  CertificationList,
  CertificationStatus,
} from './certifications.model';

// ── Fixture builders ─────────────────────────────────────────────────────────

function buildCert(overrides: Partial<Certification> = {}): Certification {
  return {
    id: '01970000-0000-7000-8000-000000000001',
    tenantId: '01970000-0000-7000-8000-000000000aaa',
    learnerGcid: '01970000-0000-7000-8000-000000000bbb',
    courseId: '01970000-0000-7000-8000-000000000ccc',
    accomplishments: ['atom-1:passed', 'exam:passed'],
    hash: 'deadbeef1234deadbeef1234deadbeef1234deadbeef1234deadbeef1234dead',
    issuedAt: '2026-05-26T10:00:00Z',
    status: 'Active' as CertificationStatus,
    ...overrides,
  };
}

const POPULATED_CERTS: readonly Certification[] = [
  buildCert({
    id: '01970000-0000-7000-8000-000000000101',
    learnerGcid: '01970000-0000-7000-8000-00000000a001',
    courseId: 'course-cspo-2026A',
    accomplishments: ['atom-sprint-planning:passed', 'exam:passed'],
    hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    issuedAt: '2026-05-26T10:00:00Z',
    status: 'Active',
  }),
  buildCert({
    id: '01970000-0000-7000-8000-000000000102',
    learnerGcid: '01970000-0000-7000-8000-00000000a002',
    courseId: 'course-dsa-101',
    accomplishments: [
      'atom-arrays:passed',
      'atom-linked-lists:passed',
      'atom-trees:passed',
      'exam:passed',
    ],
    hash: 'cafebabe1234cafebabe1234cafebabe1234cafebabe1234cafebabe1234cafe',
    issuedAt: '2026-05-25T15:30:00Z',
    status: 'Active',
  }),
  buildCert({
    id: '01970000-0000-7000-8000-000000000103',
    learnerGcid: '01970000-0000-7000-8000-00000000a003',
    courseId: 'course-data-engineering',
    accomplishments: ['atom-1:passed', 'capstone:withdrawn'],
    hash: 'feedface1234feedface1234feedface1234feedface1234feedface1234feed',
    issuedAt: '2026-05-20T09:00:00Z',
    status: 'Revoked',
  }),
];

function stubServiceProvider(observable: Observable<CertificationList>) {
  const svc: Pick<CertificationsService, 'list' | 'issue' | 'revoke'> = {
    list: () => observable,
    issue: () => EMPTY as unknown as Observable<Certification>,
    revoke: () => EMPTY as unknown as Observable<void>,
  };
  return { provide: CertificationsService, useValue: svc };
}

function buildList(certs: readonly Certification[]): CertificationList {
  return {
    tenantName: 'MTM Singapore',
    totalCertifications: certs.length,
    items: certs,
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<CertificationsComponent> = {
  title: 'Surfaces/R+/Certifications',
  component: CertificationsComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tabletPortrait' },
    docs: {
      description: {
        component:
          'R+ Rhythm+ training-admin issued-certifications register (/r/certifications, M12). ' +
          'Append-only credential ledger — Revoke is a soft state-flag write, not a DELETE. ' +
          'Each row carries the credential hash for integrity verification.',
      },
    },
  },
  decorators: [
    moduleMetadata({ imports: [CertificationsComponent] }),
  ],
};
export default meta;

type Story = StoryObj<CertificationsComponent>;

// ── Story: Empty ─────────────────────────────────────────────────────────────

export const Empty: Story = {
  name: 'Empty — No certifications yet',
  parameters: {
    docs: {
      description: {
        story:
          'Tenant has not issued any credentials yet — empty-state row below the header. ' +
          'Header still shows the Issue Certification CTA so the admin can mint a first one.',
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
  name: 'Populated — 2 Active + 1 Revoked',
  parameters: {
    docs: {
      description: {
        story:
          'Realistic credential roster with Active + Revoked badge variants. Each card surfaces ' +
          'learner gcid, course id, accomplishments list, and the sha-256 integrity hash.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider(of(buildList(POPULATED_CERTS))),
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
          'BFF call still in-flight — toSignal stays at initial null, header reads zero ' +
          'while the grid sits empty. Issue CTA stays interactive (optimistic UX).',
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
  name: 'Error — BFF 5xx (silent fallthrough)',
  parameters: {
    docs: {
      description: {
        story:
          'BFF upstream fails. The current M12 screen has no fail-loud banner — the toSignal ' +
          'stream errors silently and the list renders empty. Catalogue refactor adds the banner.',
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
