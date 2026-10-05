/**
 * AtomRevisions Storybook stories — WS-7 revision timeline view.
 *
 * Variants:
 * - Loading: spinner while BFF call is in flight
 * - ContractGap: WS-7-BE-A1 banner (endpoint not yet wired)
 * - Error: upstream 5xx fail-loud banner with retry CTA
 * - Empty: no revisions yet (first save hasn't happened)
 * - SingleRevision: one-card timeline (initial state after first save)
 * - MultiRevision: full 4-card timeline (most-recent first, diff toggleable)
 *
 * Per coding-angular-storybook skill: uses decorators to inject stub service
 * state. No mocked HTTP — component is wired against a signal-based stub.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { WritableSignal, computed, signal } from '@angular/core';

import { AtomRevisionsComponent } from './atom-revisions.component';
import { AtomRevisionsService } from './atom-revisions.service';
import type { AtomRevision, AtomRevisionListState, AtomRevisionPage } from './models';

// ── Stub helpers ─────────────────────────────────────────────────────────────

const ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';
const GCID_1 = '00000000-0000-7000-8000-000000001999';
const GCID_2 = 'aabbccdd-0000-7000-8000-000000002000';

function buildRevision(overrides: Partial<AtomRevision> = {}): AtomRevision {
  return {
    revision_id: '019e0001-0000-7000-8000-000000000001',
    atom_id: ATOM_ID,
    revision_number: 1,
    content: { title: 'A+ Atomic Learning Primitives', body: 'The smallest unit.' },
    content_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    validation_rule_type: 'STANDARD',
    published_by_gcid: GCID_1,
    published_at: '2026-05-26T10:00:00.000Z',
    summary: 'Initial revision',
    ...overrides,
  };
}

class StubServiceState {
  readonly _s: WritableSignal<AtomRevisionListState>;
  readonly state: () => AtomRevisionListState;
  readonly page: () => AtomRevisionPage | null;
  readonly revisions: () => readonly AtomRevision[];
  load = (_id: string) => undefined;

  constructor(initial: AtomRevisionListState) {
    this._s = signal(initial);
    this.state = this._s.asReadonly();
    this.page = computed(() => {
      const s = this._s();
      return s.status === 'success' ? s.page : null;
    });
    this.revisions = computed(() => this.page()?.revisions ?? []);
  }
}

function stubServiceProvider(initial: AtomRevisionListState) {
  const svc = new StubServiceState(initial);
  return {
    provide: AtomRevisionsService,
    useValue: svc,
  };
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<AtomRevisionsComponent> = {
  title: 'A+/Atom Revisions/Timeline',
  component: AtomRevisionsComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Append-only revision timeline for a LearningAtom. Each save creates a new ' +
          'AtomRevision (ddd-enforcement invariant #4). Most-recent first, with diff expand/collapse.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<AtomRevisionsComponent>;

// ── Story: Loading ────────────────────────────────────────────────────────────

export const Loading: Story = {
  name: 'Loading',
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({ status: 'loading' }),
      ],
    }),
  ],
  render: () => ({
    props: { atomId: ATOM_ID },
    template: `<chora-aplus-atom-revisions [atomId]="atomId" />`,
  }),
};

// ── Story: Contract Gap (WS-7-BE-A1) ─────────────────────────────────────────

export const ContractGap: Story = {
  name: 'Contract Gap — WS-7-BE-A1',
  parameters: {
    docs: {
      description: {
        story:
          'BFF endpoint GET /api/atoms/{atomId}/revisions not yet wired in chora-gateway. ' +
          'Shown as an explicit "not yet available" banner, distinct from a transient upstream error.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({
          status: 'error',
          error: 'aplus.atom_revisions.error_generic',
        }),
      ],
    }),
  ],
  render: () => ({
    props: { atomId: ATOM_ID },
    template: `<chora-aplus-atom-revisions [atomId]="atomId" />`,
  }),
};

// ── Story: Error (upstream 5xx) ───────────────────────────────────────────────

export const Error: Story = {
  name: 'Error — Upstream failure',
  parameters: {
    docs: {
      description: {
        story:
          'Fail-loud error banner for 5xx / transient upstream failures. Retry CTA calls service.load().',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({
          status: 'error',
          error: 'aplus.atom_revisions.error_upstream',
        }),
      ],
    }),
  ],
  render: () => ({
    props: { atomId: ATOM_ID },
    template: `<chora-aplus-atom-revisions [atomId]="atomId" />`,
  }),
};

// ── Story: Empty ──────────────────────────────────────────────────────────────

export const Empty: Story = {
  name: 'Empty — No revisions yet',
  parameters: {
    docs: {
      description: {
        story: 'Shown when the atom exists but no revisions have been published yet.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({
          status: 'success',
          page: { revisions: [] },
        }),
      ],
    }),
  ],
  render: () => ({
    props: { atomId: ATOM_ID },
    template: `<chora-aplus-atom-revisions [atomId]="atomId" />`,
  }),
};

// ── Story: Single Revision ────────────────────────────────────────────────────

export const SingleRevision: Story = {
  name: 'Single Revision',
  parameters: {
    docs: {
      description: {
        story: 'Timeline with the first-ever revision. "Before" diff shows the no-prior-state message.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({
          status: 'success',
          page: {
            revisions: [
              buildRevision({
                revision_id: '019e0001-0000-7000-8000-000000000001',
                revision_number: 1,
                published_at: '2026-05-20T09:00:00.000Z',
                summary: 'Initial revision — atom created',
                published_by_gcid: GCID_1,
              }),
            ],
          },
        }),
      ],
    }),
  ],
  render: () => ({
    props: { atomId: ATOM_ID },
    template: `<chora-aplus-atom-revisions [atomId]="atomId" />`,
  }),
};

// ── Story: Multi Revision ─────────────────────────────────────────────────────

export const MultiRevision: Story = {
  name: 'Multi Revision — 4 cards',
  parameters: {
    docs: {
      description: {
        story:
          'Full timeline with 4 revisions most-recent first. Card 4 shows "Current" badge. ' +
          'Click "View diff" on any card to expand the before/after JSON panels.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({
          status: 'success',
          page: {
            revisions: [
              buildRevision({
                revision_id: '019e0004-0000-7000-8000-000000000004',
                revision_number: 4,
                content_hash: 'f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4b5a6f1e2',
                published_at: '2026-05-26T14:30:00.000Z',
                summary: 'Add rubric criteria for OE grading',
                published_by_gcid: GCID_2,
                content: { title: 'A+ Atomic Learning Primitives', body: 'Updated body v4.', rubric: ['criterion A', 'criterion B'] },
              }),
              buildRevision({
                revision_id: '019e0003-0000-7000-8000-000000000003',
                revision_number: 3,
                content_hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
                published_at: '2026-05-25T11:00:00.000Z',
                summary: 'Correct MCQ option labels',
                published_by_gcid: GCID_1,
                content: { title: 'A+ Atomic Learning Primitives', body: 'Updated body v3.' },
              }),
              buildRevision({
                revision_id: '019e0002-0000-7000-8000-000000000002',
                revision_number: 2,
                content_hash: 'deadbeef1234deadbeef1234deadbeef1234deadbeef1234deadbeef1234dead',
                published_at: '2026-05-24T09:45:00.000Z',
                summary: 'Fix atom body — removed stale reference',
                published_by_gcid: GCID_1,
                content: { title: 'A+ Atomic Learning Primitives', body: 'Updated body v2.' },
              }),
              buildRevision({
                revision_id: '019e0001-0000-7000-8000-000000000001',
                revision_number: 1,
                content_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
                published_at: '2026-05-20T09:00:00.000Z',
                summary: 'Initial revision',
                published_by_gcid: GCID_1,
                content: { title: 'A+ Atomic Learning Primitives', body: 'The smallest unit.' },
              }),
            ],
          },
        }),
      ],
    }),
  ],
  render: () => ({
    props: { atomId: ATOM_ID },
    template: `<chora-aplus-atom-revisions [atomId]="atomId" />`,
  }),
};
