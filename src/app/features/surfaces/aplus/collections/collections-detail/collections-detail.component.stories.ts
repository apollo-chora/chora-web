/**
 * CollectionsDetailComponent stories — A+ personal collection detail (WS-6b).
 *
 * Variants:
 *   - Loading: detailState 'loading' → spinner panel
 *   - Success: detailState 'success' with a Collection carrying 2 atom refs
 *       → header (title / visibility / atom count), ordered atom list, actions
 *   - NotFound: detailState 'error' 'aplus.collections.error_not_found'
 *       → "Collection not found" panel with back link
 *   - ContractGap: detailState 'error' 'aplus.collections.error_gateway_not_wired'
 *       → explicit WS-6b-BE-A1 contract-gap banner (chora-gateway proxy not wired)
 *
 * Per coding-angular-storybook: the component is wired against a signal-based
 * CollectionsService stub injected via moduleMetadata providers. No mocked HTTP.
 * `provideRouter([])` satisfies the injected Router + RouterLink directives.
 * The required `collectionId` input is bound via the wrapper template. The
 * component's constructor effect calls `loadDetail(id)` — the stub is a no-op so
 * the seeded detailState signal is what renders. Tablet viewport (768px) is the
 * primary canvas.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { Component, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { CollectionsDetailComponent } from './collections-detail.component';
import { CollectionsService } from '../collections.service';
import type {
  Collection,
  CollectionAtomOpState,
  CollectionAtomRef,
  CollectionDetailState,
} from '../collections.model';

// ── Sample data ───────────────────────────────────────────────────────────────

const COLLECTION_ID = '0190a100-0000-7000-8000-000000000101';
const TENANT_ID = '0190a000-0000-7000-8000-0000000000a0';
const OWNER_GCID = '0190a000-0000-7000-8000-0000000000b1';

const SAMPLE_ATOMS: readonly CollectionAtomRef[] = [
  {
    collection_id: COLLECTION_ID,
    atom_id: '0190a200-0000-7000-8000-000000000201',
    position: 0,
    added_at: '2026-05-10T08:05:00.000Z',
  },
  {
    collection_id: COLLECTION_ID,
    atom_id: '0190a200-0000-7000-8000-000000000202',
    position: 1,
    added_at: '2026-05-11T09:30:00.000Z',
  },
];

const SAMPLE_COLLECTION: Collection = {
  collection_id: COLLECTION_ID,
  tenant_id: TENANT_ID,
  owner_gcid: OWNER_GCID,
  title: 'Core Biology Atom Pack',
  description: 'Foundational LearningAtoms for cell biology and genetics.',
  visibility: 'private',
  created_at: '2026-05-10T08:00:00.000Z',
  updated_at: '2026-05-24T14:30:00.000Z',
  atoms: SAMPLE_ATOMS,
};

// ── Stub service factory ──────────────────────────────────────────────────────

function makeStubService(
  state: CollectionDetailState,
  atomOp: CollectionAtomOpState = { status: 'idle' },
): Partial<CollectionsService> {
  const _detailState = signal<CollectionDetailState>(state);
  const _atomOpState = signal<CollectionAtomOpState>(atomOp);
  const detailCollection = computed<Collection | null>(() => {
    const s = _detailState();
    return s.status === 'success' ? s.collection : null;
  });

  return {
    detailState: _detailState.asReadonly(),
    detailCollection,
    atomOpState: _atomOpState.asReadonly(),
    // Constructor effect calls loadDetail() — no-op so the seeded state renders.
    loadDetail: () => undefined,
  } as unknown as Partial<CollectionsService>;
}

// ── Meta ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'chora-collections-detail-story-wrapper',
  imports: [CollectionsDetailComponent],
  template: `<chora-aplus-collections-detail [collectionId]="collectionId" />`,
})
class CollectionsDetailWrapperComponent {
  readonly collectionId = COLLECTION_ID;
}

const meta: Meta<CollectionsDetailWrapperComponent> = {
  title: 'A+/Collections/Detail',
  component: CollectionsDetailWrapperComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'A+ personal Collection detail — title, description, visibility, and the ' +
          'ordered LearningAtom membership list with edit / add / delete actions. WS-6b. ' +
          'LearningAtom remains the PRIMARY AGGREGATE ROOT — this view displays atom ' +
          'references, never atom content. Fail-loud while the chora-gateway proxy ' +
          '(WS-6b-BE-A1) is unwired.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<CollectionsDetailWrapperComponent>;

// ── Variants ──────────────────────────────────────────────────────────────────

export const Loading: Story = {
  name: 'Loading',
  parameters: {
    docs: {
      description: { story: 'Initial load: detailState is loading; spinner panel shown.' },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: CollectionsService,
          useValue: makeStubService({ status: 'loading' }),
        },
      ],
    }),
  ],
  render: () => ({
    template: `<sb-collections-detail-wrapper />`,
  }),
};

export const Success: Story = {
  name: 'Success (2 atoms)',
  parameters: {
    docs: {
      description: {
        story:
          'A `private` Collection with 2 ordered CollectionAtomRef atoms. Header shows ' +
          'title, visibility badge, and atom count; the ordered list renders each atom ' +
          'with a remove control and edit / add / delete actions.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: CollectionsService,
          useValue: makeStubService({ status: 'success', collection: SAMPLE_COLLECTION }),
        },
      ],
    }),
  ],
  render: () => ({
    template: `<sb-collections-detail-wrapper />`,
  }),
};

export const NotFound: Story = {
  name: 'Not Found',
  parameters: {
    docs: {
      description: {
        story:
          'GET /api/v1/collections/{id} returns 404 → "Collection not found" panel with ' +
          'a back link. Distinct from the contract-gap banner.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: CollectionsService,
          useValue: makeStubService({
            status: 'error',
            error: 'aplus.collections.error_not_found',
          }),
        },
      ],
    }),
  ],
  render: () => ({
    template: `<sb-collections-detail-wrapper />`,
  }),
};

export const ContractGap: Story = {
  name: 'Contract Gap — WS-6b-BE-A1',
  parameters: {
    docs: {
      description: {
        story:
          'GET /api/v1/collections/{id} returns GATEWAY_ROUTE_NOT_FOUND — the route is ' +
          'contracted in creation-admin.yaml §getCollection but not yet proxied in ' +
          'chora-gateway. Shown as an explicit contract-gap banner, distinct from a ' +
          'transient upstream error.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: CollectionsService,
          useValue: makeStubService({
            status: 'error',
            error: 'aplus.collections.error_gateway_not_wired',
          }),
        },
      ],
    }),
  ],
  render: () => ({
    template: `<sb-collections-detail-wrapper />`,
  }),
};
