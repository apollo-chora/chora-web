/**
 * SearchComponent stories — A+ Search Hub (WS-8).
 *
 * Variants:
 *   - Idle: empty query → recent searches + popular tags
 *   - Loading: debounced search in-flight
 *   - MixedResults: all three kinds (atom + course + collection)
 *   - AtomOnly: only atom results returned
 *   - CourseOnly: only course results returned
 *   - CollectionError: fail-loud WS-6a collection 404
 *   - Error: generic upstream error
 *   - EmptyResults: query returns no matches
 *
 * Per coding-angular-storybook: render via template; does NOT call
 * the real SearchService (stubs state via a wrapper component).
 * Tablet viewport (768px) is the primary canvas.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SearchComponent } from './search.component';
import { SearchService } from './search.service';
import type { SearchState } from './models';

// ── Stub service factory ──────────────────────────────────────────────────────

function makeStubService(state: SearchState): Partial<SearchService> {
  const _state = signal(state);
  const atoms = () =>
    state.status === 'success' ? state.results.atoms : [];
  const courses = () =>
    state.status === 'success' ? state.results.courses : [];
  const collections = () =>
    state.status === 'success' ? state.results.collections : [];

  return {
    state: _state.asReadonly(),
    atoms: () => atoms(),
    courses: () => courses(),
    collections: () => collections(),
    totalCount: () =>
      atoms().length + courses().length + collections().length,
    atomCount: () => atoms().length,
    courseCount: () => courses().length,
    collectionCount: () => collections().length,
    search: () => {},
    retry: () => {},
  } as unknown as Partial<SearchService>;
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_ATOMS = [
  {
    kind: 'atom' as const,
    id: 'atom-001',
    title: 'Photosynthesis Light Reactions',
    content_excerpt:
      'In the <em>light reactions</em> of photosynthesis, chlorophyll absorbs…',
    atom_type: 'multiple_choice',
    difficulty: 2,
    labels: ['biology', 'botany', 'plants'],
    topic_names: ['Biology', 'Botany'],
  },
  {
    kind: 'atom' as const,
    id: 'atom-002',
    title: 'ATP Synthesis in Mitochondria',
    content_excerpt:
      'ATP is produced in the <em>mitochondria</em> via oxidative phosphorylation…',
    atom_type: 'short_answer',
    difficulty: 3,
    labels: ['biochemistry', 'energy'],
    topic_names: ['Biochemistry'],
  },
];

const SAMPLE_COURSES = [
  {
    kind: 'course' as const,
    id: 'course-001',
    title: 'Biology Fundamentals Certification',
    instructor_name: 'Dr. Sarah Chen',
    enrolled_count: 256,
    is_free: false,
    price_sgd_cents: 9900,
    tags: ['biology', 'certification'],
  },
  {
    kind: 'course' as const,
    id: 'course-002',
    title: 'Introduction to Molecular Biology',
    instructor_name: 'Prof. David Lim',
    enrolled_count: 84,
    is_free: true,
    price_sgd_cents: 0,
    tags: ['molecular-biology'],
  },
];

const SAMPLE_COLLECTIONS = [
  {
    kind: 'collection' as const,
    id: 'col-001',
    title: 'Core Biology Atom Pack',
    atom_count: 48,
    owner_display_name: 'Alice Ng',
  },
];

// ── Meta ──────────────────────────────────────────────────────────────────────

@Component({
  selector: 'sb-search-wrapper',
  imports: [SearchComponent],
  template: `<chora-aplus-search />`,
})
class SearchWrapperComponent {}

const meta: Meta<SearchWrapperComponent> = {
  title: 'A+ Surface / Search Hub',
  component: SearchWrapperComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'A+ Search Hub — federated atom + course + collection search with glassmorphism design. ' +
          'WS-8. Collection search is fail-loud pending WS-6a BE endpoint.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<SearchWrapperComponent>;

// ── Variants ──────────────────────────────────────────────────────────────────

export const Idle: Story = {
  name: 'Idle (empty query)',
  parameters: {
    docs: {
      description: { story: 'Initial state: no query entered. Shows recent searches (empty) + popular topic tags.' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({ status: 'idle' }),
        },
      ],
    },
    template: `<chora-aplus-search />`,
  }),
};

export const Loading: Story = {
  name: 'Loading',
  parameters: {
    docs: {
      description: { story: '250ms debounce has elapsed; federation calls in-flight.' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({ status: 'loading' }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'biology'" />`,
  }),
};

export const MixedResults: Story = {
  name: 'Mixed results (atoms + courses + collections)',
  parameters: {
    docs: {
      description: {
        story:
          'All three kinds returned. "All" tab is active. Demonstrates tab counts and result grid.',
      },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({
            status: 'success',
            query: 'biology',
            results: {
              atoms: SAMPLE_ATOMS,
              courses: SAMPLE_COURSES,
              collections: SAMPLE_COLLECTIONS,
            },
          }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'biology'" />`,
  }),
};

export const AtomOnly: Story = {
  name: 'Atom-only results',
  parameters: {
    docs: {
      description: { story: 'Only atom results returned (courses + collections empty). Tab counts reflect 0.' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({
            status: 'success',
            query: 'photosynthesis',
            results: { atoms: SAMPLE_ATOMS, courses: [], collections: [] },
          }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'photosynthesis'" />`,
  }),
};

export const CourseOnly: Story = {
  name: 'Course-only results',
  parameters: {
    docs: {
      description: { story: 'Only course results returned (atoms + collections empty).' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({
            status: 'success',
            query: 'certification',
            results: { atoms: [], courses: SAMPLE_COURSES, collections: [] },
          }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'certification'" />`,
  }),
};

export const EmptyResults: Story = {
  name: 'Empty results',
  parameters: {
    docs: {
      description: { story: 'Query returns no matches across all three kinds. Shows "No results for…" message.' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({
            status: 'success',
            query: 'xyzzy-nonexistent',
            results: { atoms: [], courses: [], collections: [] },
          }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'xyzzy-nonexistent'" />`,
  }),
};

export const CollectionError: Story = {
  name: 'Error — collection 404 (WS-6a not wired)',
  parameters: {
    docs: {
      description: {
        story:
          'Fail-loud state when GET /api/v1/collections/search returns 404. ' +
          'WS-6a Collection aggregate is a parallel workstream. ' +
          'Follow-up BE ask #1: wire endpoint on chora-consumption.',
      },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({
            status: 'error',
            error: 'aplus.search.error_collection_not_wired',
          }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'biology'" />`,
  }),
};

export const Error: Story = {
  name: 'Error — generic upstream',
  parameters: {
    docs: {
      description: { story: 'Generic 5xx error state with retry CTA.' },
    },
  },
  render: () => ({
    moduleMetadata: {
      imports: [SearchComponent, RouterModule.forRoot([])],
      providers: [
        {
          provide: SearchService,
          useValue: makeStubService({
            status: 'error',
            error: 'aplus.search.error_upstream',
          }),
        },
      ],
    },
    template: `<chora-aplus-search [q]="'biology'" />`,
  }),
};
