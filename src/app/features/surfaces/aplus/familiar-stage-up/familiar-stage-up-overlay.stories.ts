/**
 * Storybook stories for FamiliarStageUpOverlayComponent (WS-2).
 *
 * Stories cover:
 *   1. Egg → Baby (Stage 0→1) — first hatch celebration
 *   2. Baby → Fledgling (Stage 1→2)
 *   3. Awakened → Structural (Stage 3→4)
 *   4. Teen → Matured (Stage 5→6) — final celebration
 *
 * Each story renders the overlay over a glass-panel background to
 * validate the glassmorphism + animation contrast.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { FamiliarStageUpOverlayComponent } from './familiar-stage-up-overlay.component';

const meta: Meta<FamiliarStageUpOverlayComponent> = {
  title: 'A+/Familiar/StageUpOverlay',
  component: FamiliarStageUpOverlayComponent,
  decorators: [
    applicationConfig({
      providers: [provideHttpClient(), provideRouter([])],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'Modal overlay shown when a Familiar transitions stages. ' +
          'Triggered by FamiliarRealtimeService.stageTransition$. ' +
          'Glassmorphism backdrop + sparkles + breed-art morph row.',
      },
    },
  },
  argTypes: {
    transition: { control: 'object' },
    species: {
      control: 'select',
      options: ['', 'dragon', 'owl', 'fox', 'cat', 'phoenix', 'turtle', 'wolf', 'raven'],
    },
  },
};
export default meta;

type Story = StoryObj<FamiliarStageUpOverlayComponent>;

/** Stage 0 → Stage 1 (Egg hatches). */
export const EggToBaby: Story = {
  args: {
    transition: { familiarId: 'fam-001', fromStage: 0, toStage: 1 },
    species: 'dragon',
  },
  name: 'Stage 0 → 1 (Egg → Baby Dragon)',
};

/** Stage 1 → Stage 2 (Baby matures). */
export const BabyToFledgling: Story = {
  args: {
    transition: { familiarId: 'fam-001', fromStage: 1, toStage: 2 },
    species: 'owl',
  },
  name: 'Stage 1 → 2 (Owlet → Fledgling Owl)',
};

/** Stage 3 → Stage 4 (Awakened grows). */
export const AwakenedToStructural: Story = {
  args: {
    transition: { familiarId: 'fam-002', fromStage: 3, toStage: 4 },
    species: 'fox',
  },
  name: 'Stage 3 → 4 (Awakened Fox → Growing Fox)',
};

/** Stage 5 → Stage 6 (Teen to Matured — final stage). */
export const TeenToMatured: Story = {
  args: {
    transition: { familiarId: 'fam-003', fromStage: 5, toStage: 6 },
    species: 'phoenix',
  },
  name: 'Stage 5 → 6 (Teen Phoenix → Phoenix — Sage)',
};

/** No species set — graceful fallback to stage name labels. */
export const NoSpecies: Story = {
  args: {
    transition: { familiarId: 'fam-004', fromStage: 2, toStage: 3 },
    species: '',
  },
  name: 'No species (stage-name labels only)',
};
