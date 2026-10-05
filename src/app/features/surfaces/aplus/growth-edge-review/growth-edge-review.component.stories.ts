/**
 * GrowthEdgeReviewComponent stories (ADR-205 WS-8) — the bounded-control HITL
 * review of a graduated Growth-Edge diagnosis.
 *
 * Variants:
 *   - ReadyForReview: AWAITING_REVIEW with proposed edges, affordable wallet
 *   - InsufficientMana: chosen outputs exceed the wallet → top-up banner
 *   - StillAnalyzing: the crew is mid-diagnosis (pre-interrupt)
 *   - FailedDiagnosis: fail-loud terminal state
 *
 * Per coding-angular-storybook: stubs WeaknessReviewService + MeManaService via
 * preset values. No real HTTP. Tablet viewport primary canvas. The dragon name
 * "Ignis" fronts the diagnosis (Familiar-fronted, D5).
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { of } from 'rxjs';
import { RouterModule } from '@angular/router';

import { GrowthEdgeReviewComponent } from './growth-edge-review.component';
import { WeaknessReviewService } from './weakness-review.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import type { WeaknessUploadJob } from './weakness-review.models';

const REVIEW_JOB: WeaknessUploadJob = {
  upload_id: 'demo-u1',
  status: 'AWAITING_REVIEW',
  review: {
    familiar: { familiar_id: 'f1', name: 'Ignis', species: 'dragon' },
    proposed_edges: [
      {
        proposed_edge_id: 'p1',
        concept_label: 'Improper Fractions',
        summary:
          'Converting improper fractions to mixed numbers is shaky — a great place to grow next.',
        suggested_angles: ['Draw the wholes first', 'Check with a number line'],
        strength: 0.72,
        suggested_difficulty: 'standard',
      },
      {
        proposed_edge_id: 'p2',
        concept_label: 'Equivalent Fractions',
        summary: 'Spotting equivalent fractions needs a little more practice.',
        suggested_angles: ['Multiply top and bottom by the same number'],
        strength: 0.48,
        suggested_difficulty: 'easier',
      },
      {
        proposed_edge_id: 'p3',
        concept_label: 'Comparing Fractions',
        summary: 'Ordering fractions with different denominators trips you up.',
        strength: 0.6,
        suggested_difficulty: 'standard',
      },
    ],
    candidate_struggles: [
      { concept_key: 'decimals', concept_label: 'Decimals' },
      { concept_key: 'percentages', concept_label: 'Percentages' },
      { concept_key: 'ratios', concept_label: 'Ratios' },
    ],
    available_outputs: [
      { kind: 'focused_dose', mana_price: 0, default_selected: true },
      { kind: 'familiar_coaching', mana_price: 10 },
      { kind: 'practice_test', mana_price: 30 },
      { kind: 'study_aids', mana_price: 20 },
    ],
  },
};

function stubReviewService(job: WeaknessUploadJob): Partial<WeaknessReviewService> {
  return {
    pollUpload: () => of(job),
    resume: () => of({ upload_id: job.upload_id, status: 'COMPLETED', upserted_growth_edge_ids: ['e1'] }),
  } as unknown as Partial<WeaknessReviewService>;
}

function stubMana(balance: number): Partial<MeManaService> {
  return {
    balanceUnits: (() => balance) as unknown as MeManaService['balanceUnits'],
    load: () => undefined,
  } as unknown as Partial<MeManaService>;
}

const meta: Meta<GrowthEdgeReviewComponent> = {
  title: 'A+ / Growth Edge Review',
  component: GrowthEdgeReviewComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'Bounded-control HITL review (ADR-205 WS-8): accept/reject/merge edges, ' +
          'difficulty tri-toggle, add-a-struggle picker, output chooser with a mana ' +
          'running total vs the wallet — Familiar-fronted, no free-form input.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<GrowthEdgeReviewComponent>;

export const ReadyForReview: Story = {
  name: 'Ready for review (affordable)',
  decorators: [
    moduleMetadata({
      imports: [RouterModule.forRoot([])],
      providers: [
        { provide: WeaknessReviewService, useValue: stubReviewService(REVIEW_JOB) },
        { provide: MeManaService, useValue: stubMana(500) },
      ],
    }),
  ],
  render: () => ({
    props: { uploadId: 'demo-u1' },
    template: '<chora-aplus-growth-edge-review [uploadId]="uploadId" />',
  }),
};

export const InsufficientMana: Story = {
  name: 'Insufficient mana (top-up CTA)',
  decorators: [
    moduleMetadata({
      imports: [RouterModule.forRoot([])],
      providers: [
        { provide: WeaknessReviewService, useValue: stubReviewService(REVIEW_JOB) },
        { provide: MeManaService, useValue: stubMana(5) },
      ],
    }),
  ],
  render: () => ({
    props: { uploadId: 'demo-u1' },
    template: '<chora-aplus-growth-edge-review [uploadId]="uploadId" />',
  }),
};

export const StillAnalyzing: Story = {
  name: 'Still analyzing (pre-interrupt)',
  decorators: [
    moduleMetadata({
      imports: [RouterModule.forRoot([])],
      providers: [
        {
          provide: WeaknessReviewService,
          useValue: stubReviewService({ upload_id: 'demo-u1', status: 'ANALYZING' }),
        },
        { provide: MeManaService, useValue: stubMana(500) },
      ],
    }),
  ],
  render: () => ({
    props: { uploadId: 'demo-u1' },
    template: '<chora-aplus-growth-edge-review [uploadId]="uploadId" />',
  }),
};

export const FailedDiagnosis: Story = {
  name: 'Failed diagnosis (fail-loud)',
  decorators: [
    moduleMetadata({
      imports: [RouterModule.forRoot([])],
      providers: [
        {
          provide: WeaknessReviewService,
          useValue: stubReviewService({
            upload_id: 'demo-u1',
            status: 'FAILED',
            failure_reason: 'screened',
          }),
        },
        { provide: MeManaService, useValue: stubMana(500) },
      ],
    }),
  ],
  render: () => ({
    props: { uploadId: 'demo-u1' },
    template: '<chora-aplus-growth-edge-review [uploadId]="uploadId" />',
  }),
};
