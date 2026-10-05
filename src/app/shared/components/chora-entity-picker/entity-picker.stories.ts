/**
 * chora-entity-picker stories — the reusable cross-surface search/select
 * primitive (CHO-1833 B0). One component, three variants (single / multi /
 * command), backed by an in-memory `MockEntitySearchAdapter` registered under
 * the `ENTITY_SEARCH_PORTS` multi-token (NO real BFF — that is B2).
 *
 * Per coding-angular-storybook: light-mode baseline, tablet (768px) canvas,
 * standalone component isolated via `moduleMetadata` providers.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

import { ChoraEntityPickerComponent } from './entity-picker.component';
import {
  MockEntitySearchAdapter,
  provideMockEntitySearchPorts,
} from './mock-search.adapter';
import type { EntityRef } from './entity-picker.model';

// ── Sample corpus ──────────────────────────────────────────────────────────────

const COURSE_ROWS: readonly EntityRef[] = [
  { id: 'c1', label: 'Algebra Foundations', sublabel: 'MATH · 12 atoms', meta: { level: 'beginner', badge: 'PUBLISHED' } },
  { id: 'c2', label: 'Algebra Advanced', sublabel: 'MATH · 18 atoms', meta: { level: 'advanced', badge: 'DRAFT' } },
  { id: 'c3', label: 'Algebra Olympiad', sublabel: 'MATH · 24 atoms', meta: { level: 'advanced', badge: 'PUBLISHED' } },
  { id: 'c4', label: 'Singapore History', sublabel: 'HUM · 9 atoms', meta: { level: 'beginner', badge: 'ARCHIVED' } },
  { id: 'c5', label: 'Organic Chemistry', sublabel: 'SCI · 31 atoms', meta: { level: 'advanced', badge: 'PUBLISHED' } },
];

const courseAdapter = new MockEntitySearchAdapter({
  entityType: 'course',
  rows: COURSE_ROWS,
  pageSize: 3,
});

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta: Meta<ChoraEntityPickerComponent> = {
  title: 'Shared/EntityPicker',
  component: ChoraEntityPickerComponent,
  decorators: [
    moduleMetadata({
      providers: [provideMockEntitySearchPorts(courseAdapter)],
    }),
  ],
  parameters: {
    layout: 'centered',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'Entity-agnostic search/select primitive. The data source is resolved ' +
          'by `entityType` from a fail-loud registry (inversion #1); each instance ' +
          'owns its own per-instance search state (inversion #2). Type ≥3 chars ' +
          '(e.g. "alg") to search the in-memory course corpus.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<ChoraEntityPickerComponent>;

// ── Variants ────────────────────────────────────────────────────────────────────

export const Single: Story = {
  name: 'Single (collapse + picked)',
  parameters: {
    docs: {
      description: {
        story:
          'No chips. Selecting a row collapses the dropdown and emits `picked`; ' +
          'the selected line carries a clear (×) that emits `removed`.',
      },
    },
  },
  render: () => ({
    template: `
      <div style="width: 420px;">
        <chora-entity-picker
          entityType="course"
          variant="single"
          label="Course"
          placeholder="Search courses (try 'alg')…" />
      </div>
    `,
  }),
};

export const Multi: Story = {
  name: 'Multi (chips)',
  parameters: {
    docs: {
      description: {
        story:
          'Chip set above the input. `picked` fires on add, `removed` on chip ×. ' +
          'Two rows are pre-selected to show the chip rendering.',
      },
    },
  },
  render: () => ({
    props: {
      preselected: [COURSE_ROWS[0], COURSE_ROWS[2]],
    },
    template: `
      <div style="width: 480px;">
        <chora-entity-picker
          entityType="course"
          variant="multi"
          label="Invite courses"
          placeholder="Search courses (try 'alg')…"
          [value]="preselected" />
      </div>
    `,
  }),
};

export const Command: Story = {
  name: 'Command (overlay · keyboard-first · badges)',
  parameters: {
    docs: {
      description: {
        story:
          'Overlay palette: autofocus, keyboard-first (↑↓ move, ↵ activate, ⌘↵ ' +
          'new tab, Esc close), state-badge rows from `meta.badge`. Emits ' +
          '`activated` / `activatedNewTab` (not `picked`).',
      },
    },
  },
  render: () => ({
    template: `
      <div style="width: 520px;">
        <chora-entity-picker
          entityType="course"
          variant="command"
          placeholder="Jump to a course (try 'alg')…"
          [autoFocus]="true" />
      </div>
    `,
  }),
};

export const Faceted: Story = {
  name: 'Faceted (level = advanced)',
  parameters: {
    docs: {
      description: {
        story:
          'A facets map (`{ level: "advanced" }`) is forwarded verbatim to the ' +
          'port, narrowing results to advanced courses. Search "alg" to compare ' +
          'with the Single story.',
      },
    },
  },
  render: () => ({
    props: {
      advancedFacet: { level: 'advanced' },
    },
    template: `
      <div style="width: 420px;">
        <chora-entity-picker
          entityType="course"
          variant="single"
          label="Advanced course"
          placeholder="Search advanced courses (try 'alg')…"
          [facets]="advancedFacet" />
      </div>
    `,
  }),
};
