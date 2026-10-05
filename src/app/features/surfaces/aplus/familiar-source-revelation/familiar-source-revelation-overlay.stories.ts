/**
 * Storybook stories for FamiliarSourceRevelationOverlayComponent (WS-2).
 *
 * Stories cover:
 *   1. Dragon breed (Stage 2→3 Aha-moment trigger)
 *   2. Owl breed (alternate familiar)
 *   3. Phoenix breed (legendary rarity variant)
 *   4. No species (graceful fallback)
 *
 * These validate the mystical deep-indigo backdrop, glow animation,
 * and the destiny-glimpse art row (Stage 3 current + Stage 6 vision).
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { FamiliarSourceRevelationOverlayComponent } from './familiar-source-revelation-overlay.component';

const meta: Meta<FamiliarSourceRevelationOverlayComponent> = {
  title: 'A+/Familiar/SourceRevelationOverlay',
  component: FamiliarSourceRevelationOverlayComponent,
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
          'Modal overlay shown after Stage 2 → Stage 3 hatch ceremony completes. ' +
          'Triggered by FamiliarHatchingComponent.commit() success via ' +
          'FamiliarRealtimeService.emitSourceRevelation(). ' +
          'Deep indigo backdrop + glow pulse + destiny-glimpse art row.',
      },
    },
  },
  argTypes: {
    payload: { control: 'object' },
    species: {
      control: 'select',
      options: ['', 'dragon', 'owl', 'fox', 'cat', 'phoenix', 'turtle', 'wolf', 'raven'],
    },
  },
};
export default meta;

type Story = StoryObj<FamiliarSourceRevelationOverlayComponent>;

/** Dragon — canonical Eira demo familiar. */
export const DragonRevelation: Story = {
  args: {
    payload: {
      familiarId: 'fam-eira-001',
      breed: 'dragon',
      source: '2026-06-01T12:00:00Z',
    },
    species: 'dragon',
  },
  name: 'Dragon (Eira — Awakened Dragon)',
};

/** Owl — alternate familiar. */
export const OwlRevelation: Story = {
  args: {
    payload: {
      familiarId: 'fam-002',
      breed: 'owl',
      source: '2026-06-02T08:00:00Z',
    },
    species: 'owl',
  },
  name: 'Owl (Awakened Owl)',
};

/** Phoenix — legendary rarity treatment. */
export const PhoenixRevelation: Story = {
  args: {
    payload: {
      familiarId: 'fam-003',
      breed: 'phoenix',
      source: '2026-06-03T20:00:00Z',
    },
    species: 'phoenix',
  },
  name: 'Phoenix (Legendary)',
};

/** No species — graceful fallback labels. */
export const NoSpeciesRevelation: Story = {
  args: {
    payload: {
      familiarId: 'fam-004',
      breed: '',
      source: '2026-06-04T10:00:00Z',
    },
    species: '',
  },
  name: 'No species (stage-name fallback)',
};
