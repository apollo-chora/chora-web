/**
 * CollectionsEditComponent stories — A+ personal collection create + edit form (WS-6b).
 *
 * Variants:
 * - CreateMode: idle editState, no collectionId (fresh "New Collection" form)
 * - EditMode: collectionId set + detailState success (prefilled "Edit Collection")
 * - Submitting: editState submitting (button shows spinner + "Saving…")
 * - ContractGap: editState error gateway_not_wired (WS-6b-BE-A1 fail-loud banner)
 *
 * Per coding-angular-storybook skill: stub CollectionsService via signal-based
 * state. No mocked HTTP — component is wired against a signal-based stub.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { WritableSignal, computed, signal } from '@angular/core';

import { CollectionsEditComponent } from './collections-edit.component';
import { CollectionsService } from '../collections.service';
import type {
  Collection,
  CollectionDetailState,
  CollectionEditState,
} from '../collections.model';

// ── Fixtures ────────────────────────────────────────────────────────────────

const COL_ID = '30000000-0000-7000-8000-000000000001';

function buildCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    collection_id: COL_ID,
    tenant_id: '10000000-0000-7000-8000-000000000001',
    owner_gcid: '20000000-0000-7000-8000-000000000002',
    title: 'OSI Model Study Guide',
    description: 'Atoms covering all 7 OSI layers.',
    visibility: 'private',
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: '2026-05-26T10:00:00.000Z',
    atoms: [],
    ...overrides,
  };
}

// ── Stub service ──────────────────────────────────────────────────────────────

class StubServiceState {
  readonly _editState: WritableSignal<CollectionEditState>;
  readonly _detailState: WritableSignal<CollectionDetailState>;
  readonly editState: () => CollectionEditState;
  readonly detailState: () => CollectionDetailState;
  readonly detailCollection: () => Collection | null;

  // Unused-by-edit surface (kept for injection parity).
  readonly listState = signal({ status: 'loading' as const }).asReadonly();
  readonly collections = computed(() => [] as Collection[]);
  readonly atomOpState = signal({ status: 'idle' as const }).asReadonly();

  loadDetail = (_id: string) => undefined;
  resetEditState = () => undefined;
  create = () => undefined;
  update = () => undefined;
  loadList = () => undefined;
  delete = () => undefined;
  addAtom = () => undefined;
  removeAtom = () => undefined;

  constructor(edit: CollectionEditState, detail: CollectionDetailState) {
    this._editState = signal(edit);
    this._detailState = signal(detail);
    this.editState = this._editState.asReadonly();
    this.detailState = this._detailState.asReadonly();
    this.detailCollection = computed(() => {
      const s = this._detailState();
      return s.status === 'success' ? s.collection : null;
    });
  }
}

function stubServiceProvider(edit: CollectionEditState, detail: CollectionDetailState) {
  return {
    provide: CollectionsService,
    useValue: new StubServiceState(edit, detail),
  };
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<CollectionsEditComponent> = {
  title: 'A+/Collections/Edit',
  component: CollectionsEditComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'A+ personal collection create + edit form. Reactive title / description / visibility ' +
          'fields. Create mode POSTs; edit mode loads detail then PATCHes. Fail-loud contract-gap ' +
          'banner (WS-6b-BE-A1) until chora-gateway proxies the write endpoints.',
      },
    },
  },
  argTypes: {
    collectionId: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<CollectionsEditComponent>;

// ── Story: Create mode ──────────────────────────────────────────────────────────

export const CreateMode: Story = {
  name: 'Create mode (new)',
  parameters: {
    docs: {
      description: { story: 'Fresh "New Collection" form. No collectionId; editState idle.' },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({ status: 'idle' }, { status: 'loading' }),
      ],
    }),
  ],
  render: () => ({
    template: `<chora-aplus-collections-edit />`,
  }),
};

// ── Story: Edit mode ────────────────────────────────────────────────────────────

export const EditMode: Story = {
  name: 'Edit mode (prefilled)',
  args: { collectionId: COL_ID },
  parameters: {
    docs: {
      description: {
        story: '"Edit Collection" form prefilled from detail success state (title / description / visibility).',
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
          { status: 'idle' },
          { status: 'success', collection: buildCollection({ visibility: 'tenant' }) },
        ),
      ],
    }),
  ],
  render: (args) => ({
    props: { collectionId: args.collectionId },
    template: `<chora-aplus-collections-edit [collectionId]="collectionId" />`,
  }),
};

// ── Story: Submitting ───────────────────────────────────────────────────────────

export const Submitting: Story = {
  name: 'Submitting',
  parameters: {
    docs: {
      description: { story: 'In-flight save — submit button shows spinner + "Saving…" and is disabled.' },
    },
  },
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        stubServiceProvider({ status: 'submitting' }, { status: 'loading' }),
      ],
    }),
  ],
  render: () => ({
    template: `<chora-aplus-collections-edit />`,
  }),
};

// ── Story: Contract gap (WS-6b-BE-A1) ───────────────────────────────────────────

export const ContractGap: Story = {
  name: 'Contract gap — WS-6b-BE-A1',
  parameters: {
    docs: {
      description: {
        story:
          'Fail-loud state when POST/PATCH /api/v1/collections returns GATEWAY_ROUTE_NOT_FOUND. ' +
          'Write endpoints contracted in creation-admin.yaml but not yet proxied in chora-gateway. ' +
          'Follow-up BE ask: WS-6b-BE-A1.',
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
          { status: 'error', error: 'aplus.collections.error_gateway_not_wired' },
          { status: 'loading' },
        ),
      ],
    }),
  ],
  render: () => ({
    template: `<chora-aplus-collections-edit />`,
  }),
};
