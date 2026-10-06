/**
 * CollectionsListComponent stories — A+ personal collections list (WS-6b).
 *
 * Variants:
 *   - Loading: listState 'loading' → spinner panel
 *   - Success: listState 'success' with ~3 Collection fixtures → glass-panel grid
 *   - Empty: listState 'success' with 0 items → "Create your first" CTA
 *   - ContractGap: listState 'error' 'aplus.collections.error_gateway_not_wired'
 *       → explicit WS-6b-BE-A1 contract-gap banner (chora-gateway proxy not wired)
 *
 * Per coding-angular-storybook: the component is wired against a signal-based
 * CollectionsService stub injected via moduleMetadata providers. No mocked HTTP.
 * The list component's `constructor` effect calls `loadList()` — the stub is a
 * no-op so the seeded listState signal is what renders. Tablet viewport (768px)
 * is the primary canvas.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { Component, computed, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

import { CollectionsListComponent } from './collections-list.component';
import { CollectionsService } from '../collections.service';
import type { Collection, CollectionListState } from '../collections.model';

// ── Sample data ───────────────────────────────────────────────────────────────

const TENANT_ID = '0190a000-0000-7000-8000-0000000000a0';
const OWNER_GCID = '0190a000-0000-7000-8000-0000000000b1';

const SAMPLE_COLLECTIONS: readonly Collection[] = [
  {
    collection_id: '0190a100-0000-7000-8000-000000000101',
    tenant_id: TENANT_ID,
    owner_gcid: OWNER_GCID,
    title: 'Core Biology Atom Pack',
    description: 'Foundational LearningAtoms for cell biology and genetics.',
    visibility: 'private',
    created_at: '2026-05-10T08:00:00.000Z',
    updated_at: '2026-05-24T14:30:00.000Z',
    atoms: [
      { collection_id: '0190a100-0000-7000-8000-000000000101', atom_id: '0190a200-0000-7000-8000-000000000201', position: 0, added_at: '2026-05-10T08:05:00.000Z' },
      { collection_id: '0190a100-0000-7000-8000-000000000101', atom_id: '0190a200-0000-7000-8000-000000000202', position: 1, added_at: '2026-05-10T08:06:00.000Z' },
      { collection_id: '0190a100-0000-7000-8000-000000000101', atom_id: '0190a200-0000-7000-8000-000000000203', position: 2, added_at: '2026-05-10T08:07:00.000Z' },
    ],
  },
  {
    collection_id: '0190a100-0000-7000-8000-000000000102',
    tenant_id: TENANT_ID,
    owner_gcid: OWNER_GCID,
    title: 'Singapore History Revision',
    description: 'Curated timeline atoms from founding to independence.',
    visibility: 'tenant',
    created_at: '2026-05-12T09:15:00.000Z',
    updated_at: '2026-05-20T11:00:00.000Z',
    atoms: [
      { collection_id: '0190a100-0000-7000-8000-000000000102', atom_id: '0190a200-0000-7000-8000-000000000211', position: 0, added_at: '2026-05-12T09:20:00.000Z' },
    ],
  },
  {
    collection_id: '0190a100-0000-7000-8000-000000000103',
    tenant_id: TENANT_ID,
    owner_gcid: OWNER_GCID,
    title: 'Calculus Sampler (shared with friends)',
    visibility: 'friends',
    created_at: '2026-05-05T07:00:00.000Z',
    updated_at: '2026-05-26T16:45:00.000Z',
    atoms: [],
  },
];

// ── Stub service factory ──────────────────────────────────────────────────────

function makeStubService(state: CollectionListState): Partial<CollectionsService> {
  const _listState = signal<CollectionListState>(state);
  const collections = computed<readonly Collection[]>(() => {
    const s = _listState();
    return s.status === 'success' ? s.items : [];
  });

  return {
    listState: _listState.asReadonly(),
    collections,
    // Constructor effect calls loadList() — no-op so the seeded state renders.
    loadList: () => undefined,
  } as unknown as Partial<CollectionsService>;
}

// ── Meta ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'chora-collections-list-story-wrapper',
  imports: [CollectionsListComponent],
  template: `<chora-aplus-collections-list />`,
})
class CollectionsListWrapperComponent {}

const meta: Meta<CollectionsListWrapperComponent> = {
  title: 'A+/Collections/List',
  component: CollectionsListWrapperComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'A+ personal Collections list — a glass-panel grid of the authenticated ' +
          "user's curated, ordered lists of LearningAtoms. WS-6b. Fail-loud while the " +
          'chora-gateway proxy (WS-6b-BE-A1) is unwired.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<CollectionsListWrapperComponent>;

// ── Variants ──────────────────────────────────────────────────────────────────

export const Loading: Story = {
  name: 'Loading',
  parameters: {
    docs: {
      description: { story: 'Initial load: listState is loading; spinner panel shown.' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [CollectionsListComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: CollectionsService,
          useValue: makeStubService({ status: 'loading' }),
        },
      ],
    },
    template: `<chora-aplus-collections-list />`,
  }),
};

export const Success: Story = {
  name: 'Success (3 collections)',
  parameters: {
    docs: {
      description: {
        story:
          'Three Collections, one per ADR-233 D7 audience: private / tenant / friends. ' +
          'Each card shows the audience badge (lock / building / user-group), atom ' +
          'count, and last-updated date. `PUBLIC` is retired — RLS capped ' +
          'collections at the tenant, so it never was public.',
      },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [CollectionsListComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: CollectionsService,
          useValue: makeStubService({
            status: 'success',
            items: SAMPLE_COLLECTIONS,
            total: SAMPLE_COLLECTIONS.length,
          }),
        },
      ],
    },
    template: `<chora-aplus-collections-list />`,
  }),
};

export const Empty: Story = {
  name: 'Empty (no collections)',
  parameters: {
    docs: {
      description: {
        story: 'Success state with zero items. Shows the "Create your first Collection" CTA.',
      },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [CollectionsListComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: CollectionsService,
          useValue: makeStubService({ status: 'success', items: [], total: 0 }),
        },
      ],
    },
    template: `<chora-aplus-collections-list />`,
  }),
};

export const ContractGap: Story = {
  name: 'Contract Gap — WS-6b-BE-A1',
  parameters: {
    docs: {
      description: {
        story:
          'GET /api/v1/me/collections returns GATEWAY_ROUTE_NOT_FOUND — the route is ' +
          'contracted in creation-admin.yaml §listMyCollections but not yet proxied in ' +
          'chora-gateway. Shown as an explicit contract-gap banner, distinct from a ' +
          'transient upstream error.',
      },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [CollectionsListComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: CollectionsService,
          useValue: makeStubService({
            status: 'error',
            error: 'aplus.collections.error_gateway_not_wired',
          }),
        },
      ],
    },
    template: `<chora-aplus-collections-list />`,
  }),
};
