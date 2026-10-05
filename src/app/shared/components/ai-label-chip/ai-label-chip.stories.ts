/**
 * Storybook stories for AiLabelChipComponent (ADR-225).
 *
 * The reusable inline AI-provenance chip. The `variant` input picks which
 * BFF-served inline label to render (aiGenerated / aiAssisted / doseHeader).
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';

import { AiLabelChipComponent } from './ai-label-chip.component';
import { AiTransparencyService } from '../../../core/services/ai-transparency.service';
import type { AiDisclosure } from '../../../core/services/ai-transparency.model';

const DISCLOSURE: AiDisclosure = {
  version: '2026-07-07',
  locale: 'en',
  audienceVariant: 'standard',
  notice: { title: 't', body: 'b', action: 'Got it' },
  badge: { label: 'AI companion', tooltip: 'x' },
  inlineLabels: {
    aiGenerated: { label: 'AI-generated', tooltip: 'This content was created by AI.' },
    aiAssisted: { label: 'AI-assisted', tooltip: 'This was drafted with AI help.' },
    doseHeader: {
      label: 'AI-composed dose',
      tooltip: 'Today’s dose was composed by AI from your Ebbinghaus schedule.',
    },
  },
};

const meta: Meta<AiLabelChipComponent> = {
  title: 'Shared/AI Transparency/LabelChip',
  component: AiLabelChipComponent,
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        {
          provide: AiTransparencyService,
          useValue: { disclosure: signal(DISCLOSURE), ensureLoaded: () => undefined },
        },
      ],
    }),
  ],
  parameters: {
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'ADR-225 inline "AI-generated" disclosure chip. Drop next to any ' +
          'AI-produced content; the variant selects the BFF-served label.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['aiGenerated', 'aiAssisted', 'doseHeader'],
    },
  },
};
export default meta;
type Story = StoryObj<AiLabelChipComponent>;

export const AiGenerated: Story = { args: { variant: 'aiGenerated' } };
export const AiAssisted: Story = { args: { variant: 'aiAssisted' } };
export const DoseHeader: Story = { args: { variant: 'doseHeader' } };
