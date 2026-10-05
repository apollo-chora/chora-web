/**
 * Storybook stories for the InfoTooltipDirective ([choraInfo]) - the Helpful-UX
 * info affordance (UX review §2). Light-mode baseline.
 *
 * The directive appends a small fa-circle-info button to its host and opens a
 * glassmorphic ChoraTooltipComponent (CDK Overlay portal) on hover / keyboard
 * focus / tap. Content is resolved from the microcopy registry by key.
 *
 * A stub TranslateService supplies the §2.5 copy so the stories render real
 * microcopy without an HTTP-backed i18n load (the live app resolves the same
 * `tooltips.*` keys from public/assets/i18n/en.json).
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, moduleMetadata } from '@storybook/angular';

import { InfoTooltipDirective } from './info-tooltip.directive';
import { TranslateService } from '../../core/services/translate.service';

/** Demo copy for the keys these stories exercise - mirrors en.json `tooltips.*`. */
const DEMO_COPY: Record<string, string> = {
  'tooltips.mana.label': 'Mana',
  'tooltips.mana.description':
    'Your shared AI budget. Each AI action (generating, grading, images) spends mana; hand-authoring is free.',
  'tooltips.topic.label': 'Topic',
  'tooltips.topic.description':
    "A short subject line. It's sent to the AI to focus the questions and is used to tag and find this item.",
  'tooltips.cognitive_level.label': 'Cognitive level',
  'tooltips.cognitive_level.description':
    'The thinking level the questions target, from Remembering (recall) up to Creating (design).',
  'tooltips.growth_edge.label': 'Growth edge',
  'tooltips.growth_edge.description':
    "A specific weak spot we've spotted for you. Practising it is the fastest way to improve.",
  'tooltips.skillsfuture.label': 'SkillsFuture',
  'tooltips.skillsfuture.description':
    "A Singapore government scheme that can subsidise this course's fee for eligible learners.",
};

/**
 * These stories substitute TranslateService so the tooltip copy is fixed and
 * legible without shipping the whole 405KB `en.json` into the snapshot.
 *
 * `loadTranslations` is NOT decoration. preview.ts runs a global
 * `provideAppInitializer(() => inject(TranslateService).loadTranslations('en'))`
 * so every screen renders real English instead of humanised keys, and that
 * initializer resolves whatever TranslateService is provided. A stub carrying
 * only `instant` therefore throws before the story paints, which is exactly
 * how these two stories broke. A substitute has to satisfy every part of the
 * contract its callers use, not only the part its own component calls.
 */
const translateStub = {
  instant: (key: string): string => DEMO_COPY[key] ?? key,
  loadTranslations: (): Promise<void> => Promise.resolve(),
};

const LABEL_STYLE =
  'display:inline-flex;align-items:center;font-weight:600;color:#1e293b;font-size:0.95rem;';

const meta: Meta = {
  title: 'Shared/Helpful-UX/Info Tooltip',
  decorators: [
    moduleMetadata({ imports: [InfoTooltipDirective] }),
    applicationConfig({
      providers: [{ provide: TranslateService, useValue: translateStub }],
    }),
  ],
  parameters: {
    layout: 'centered',
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'The `[choraInfo]="key"` info affordance: a small fa-circle-info button paired ' +
          'with a field label / section header that opens a glassmorphic two-tier tooltip ' +
          '(bold label + plain description) on hover, keyboard focus, or tap. Content is ' +
          'resolved from the microcopy registry. WCAG 2.1 AA: the trigger is a real button ' +
          '(focusable + keyboard-operable), aria-describedby is wired while open, and it ' +
          'dismisses on Escape and blur - never hover-only.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

/** The canonical usage - a single field label carrying the info affordance. */
export const Default: Story = {
  render: () => ({
    template: `
      <div style="padding:5rem 7rem;">
        <label style="${LABEL_STYLE}">
          Mana
          <span choraInfo="mana"></span>
        </label>
      </div>
    `,
  }),
};

/** Several seeded terms stacked, as they would appear across an authoring form. */
export const Gallery: Story = {
  render: () => ({
    template: `
      <div style="display:flex;flex-direction:column;gap:1.5rem;padding:4rem 7rem;min-width:300px;">
        <label style="${LABEL_STYLE}">Topic <span choraInfo="topic"></span></label>
        <label style="${LABEL_STYLE}">Cognitive level <span choraInfo="cognitive_level"></span></label>
        <label style="${LABEL_STYLE}">Growth edge <span choraInfo="growth_edge"></span></label>
        <label style="${LABEL_STYLE}">SkillsFuture <span choraInfo="skillsfuture"></span></label>
      </div>
    `,
  }),
};
