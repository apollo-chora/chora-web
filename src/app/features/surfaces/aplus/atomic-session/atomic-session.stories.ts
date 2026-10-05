/**
 * AtomAttemptComponent stories - WS-1 MCQ/OE rendering post-A16.
 *
 * Variants:
 *   - ReadingOnly          — outline atom, no question_payload; body + Continue CTA
 *   - McqWithOptions       — 3 MCQ options, no correct_option_id (learner mode)
 *   - McqWithTimer         — MCQ with timer_seconds present
 *   - OeWithRubric         — OE with 3 rubric criteria + textarea
 *   - AuthorMode           — MCQ with correct_option_id visible (author role)
 *   - LoadingState         — AsyncState.loading skeleton
 *   - ErrorState           — AsyncState.error with retry CTA
 *
 * Uses stub service injected via Storybook providers — no real HTTP.
 * Tablet viewport (768px) primary canvas per chora-web CLAUDE.md §4.
 * Per coding-angular-storybook: wrapper component injects preset signals.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { signal, computed } from '@angular/core';
import { RouterModule } from '@angular/router';

import { AtomAttemptComponent } from './atomic-session.component';
import { AtomAttemptService } from './atomic-session.service';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import type {
  AtomAttempt,
  AtomAttemptLoadState,
  AtomAttemptStartState,
  AtomAttemptSubmitState,
  LearningAtom,
  McqQuestionPayload,
  OeQuestionPayload,
} from './atomic-session.model';

// ── Sample data ────────────────────────────────────────────────────────────────

const BASE_ATOM: LearningAtom = {
  atom_id: '00000000-0000-7000-8000-00000000a0a1',
  atom_type: 'outline',
  body: 'A LearningAtom is the smallest unit of meaning a learner can engage with in the Chora bimodal learning ecosystem.',
  course_id: '44444444-4444-7444-8444-444444444444',
  gcid: '00000000-0000-7000-8000-000000001999',
  tenant_id: '11111111-1111-7111-8111-111111111111',
  mode: 'straight-up',
  difficulty: 2,
  revision: 3,
  status: 'published',
  tags: ['aplus', 'fundamentals', 'bimodal'],
  title: 'A+ : Atomic Learning Primitives',
  created_at: '2026-05-12T19:45:04.992954Z',
  updated_at: '2026-05-14T08:10:08.808962Z',
};

const MCQ_PAYLOAD_LEARNER: McqQuestionPayload = {
  type: 'mcq',
  question_id: 'qqq-111-222-333',
  prompt: 'Which entity is the primary aggregate root in the Chora content model?',
  options: [
    { option_id: 'opt-a', label: 'LearningAtom' },
    { option_id: 'opt-b', label: 'Course' },
    { option_id: 'opt-c', label: 'LearningPath' },
  ],
  xp_on_correct: 10,
};

const MCQ_PAYLOAD_TIMED: McqQuestionPayload = {
  ...MCQ_PAYLOAD_LEARNER,
  timer_seconds: 60,
};

const MCQ_PAYLOAD_AUTHOR: McqQuestionPayload = {
  ...MCQ_PAYLOAD_LEARNER,
  correct_option_id: 'opt-a',
  timer_seconds: 45,
};

const OE_PAYLOAD: OeQuestionPayload = {
  type: 'oe',
  question_id: 'qqq-oe-111',
  prompt: 'Explain how the Bimodal Atomic Learning model differs from traditional course-centric learning platforms. Include both Straight-Up and Graph-Based Discovery modes in your answer.',
  rubric: {
    criteria: [
      { criterion_id: 'c1', description: 'Accurate definition of LearningAtom as primary aggregate root', weight_percent: 40 },
      { criterion_id: 'c2', description: 'Correct explanation of Straight-Up mode vs Graph-Based Discovery', weight_percent: 35 },
      { criterion_id: 'c3', description: 'Clarity and depth of analysis', weight_percent: 25 },
    ],
  },
  max_score: 100,
};

const SAMPLE_SESSION: AtomAttempt = {
  session_id: '019e2b24-759f-76b8-bad8-0926780532ce',
  tenant_id: '11111111-1111-7111-8111-111111111111',
  learner_gcid: '00000000-0000-7000-8000-000000001999',
  atom_id: BASE_ATOM.atom_id,
  status: 'started',
  hints_used: 0,
  answer_count: 0,
  started_at: '2026-05-26T10:17:50.239Z',
};

// ── Stub service factory ──────────────────────────────────────────────────────

function makeStubAtomicService(opts: {
  load?: AtomAttemptLoadState;
  start?: AtomAttemptStartState;
  submit?: AtomAttemptSubmitState;
}): Partial<AtomAttemptService> {
  const _load = signal<AtomAttemptLoadState>(
    opts.load ?? { status: 'loading' },
  );
  const _start = signal<AtomAttemptStartState>(
    opts.start ?? { status: 'idle' },
  );
  const _submit = signal<AtomAttemptSubmitState>(
    opts.submit ?? { status: 'idle' },
  );

  return {
    loadState: _load.asReadonly(),
    startState: _start.asReadonly(),
    submitState: _submit.asReadonly(),
    atom: computed(() => {
      const s = _load();
      return s.status === 'success' ? s.atom : null;
    }),
    session: computed(() => {
      const s = _start();
      return s.status === 'started' ? s.session : null;
    }),
    load: () => {},
    start: () => {},
    submit: () => {},
  } as unknown as Partial<AtomAttemptService>;
}

function makeStubFamiliarService(): Partial<ActiveFamiliarService> {
  return {
    active: signal(null) as unknown as ActiveFamiliarService['active'],
  };
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<AtomAttemptComponent> = {
  title: 'A+/AtomAttempt',
  component: AtomAttemptComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    backgrounds: {
      default: 'aplus',
      values: [{ name: 'aplus', value: '#f1f5f9' }],
    },
  },
};

export default meta;
type Story = StoryObj<AtomAttemptComponent>;

// ── ReadingOnly ───────────────────────────────────────────────────────────────

function buildStory(
  load: AtomAttemptLoadState,
  start: AtomAttemptStartState = { status: 'idle' },
  submit: AtomAttemptSubmitState = { status: 'idle' },
): Story {
  return {
    render: () => ({
      props: {},
      moduleMetadata: {
        imports: [AtomAttemptComponent, RouterModule.forRoot([])],
        providers: [
          {
            provide: AtomAttemptService,
            useValue: makeStubAtomicService({ load, start, submit }),
          },
          {
            provide: ActiveFamiliarService,
            useValue: makeStubFamiliarService(),
          },
        ],
      },
      template: '<chora-aplus-atomic-session />',
    }),
  };
}

export const ReadingOnly: Story = buildStory({
  status: 'success',
  atom: { ...BASE_ATOM, atom_type: 'outline' },
  partial: null,
});
ReadingOnly.storyName = 'Reading Only (outline atom, no question_payload)';

// ── MCQ variants ──────────────────────────────────────────────────────────────

export const McqWithOptions: Story = buildStory(
  {
    status: 'success',
    atom: {
      ...BASE_ATOM,
      atom_type: 'mcq',
      question_payload: MCQ_PAYLOAD_LEARNER,
    },
    partial: null,
  },
  { status: 'started', session: SAMPLE_SESSION },
);
McqWithOptions.storyName = 'MCQ — 3 options (learner mode, no correct_option_id)';

export const McqWithTimer: Story = buildStory(
  {
    status: 'success',
    atom: {
      ...BASE_ATOM,
      atom_type: 'mcq',
      question_payload: MCQ_PAYLOAD_TIMED,
    },
    partial: null,
  },
  { status: 'started', session: SAMPLE_SESSION },
);
McqWithTimer.storyName = 'MCQ — with timer_seconds = 60';

export const AuthorMode: Story = buildStory(
  {
    status: 'success',
    atom: {
      ...BASE_ATOM,
      atom_type: 'mcq',
      question_payload: MCQ_PAYLOAD_AUTHOR,
    },
    partial: null,
  },
  { status: 'idle' },
);
AuthorMode.storyName = 'MCQ — Author mode (correct_option_id visible)';

// ── OE variant ────────────────────────────────────────────────────────────────

export const OeWithRubric: Story = buildStory(
  {
    status: 'success',
    atom: {
      ...BASE_ATOM,
      atom_type: 'essay',
      question_payload: OE_PAYLOAD,
    },
    partial: null,
  },
  { status: 'started', session: SAMPLE_SESSION },
);
OeWithRubric.storyName = 'OE — with 3 rubric criteria + textarea';

// ── States ────────────────────────────────────────────────────────────────────

export const LoadingState: Story = buildStory({ status: 'loading' });
LoadingState.storyName = 'Loading (AsyncState.loading skeleton)';

export const ErrorState: Story = buildStory({
  status: 'error',
  error: 'aplus.atomic_session.error_upstream',
});
ErrorState.storyName = 'Error (AsyncState.error — 5xx upstream, retry CTA)';
