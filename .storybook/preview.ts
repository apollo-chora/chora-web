import type { Preview } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { inject, provideAppInitializer } from '@angular/core';

import { TranslateService } from '../src/app/core/services/translate.service';

/**
 * Preview-time Storybook config for chora-web.
 *
 * Global SCSS (`src/styles.scss`) is injected via the Angular builder
 * `styles` option in angular.json (not imported here) so that webpack's
 * Angular-specific SCSS pipeline owns compilation.
 *
 * - i18n: `assets/i18n/en.json` is loaded before any story paints. At runtime
 *   the root App component does this via `initFromStorage()`; a story has no
 *   root App, so without the initializer below EVERY label falls back to a
 *   humanised key and screens render as "Heading" / "Chat cta" / "Familiar
 *   open". That reads as a broken screen in a visual-regression snapshot and
 *   in any capture taken from one, so it is fixed globally here rather than
 *   per story file.
 * - Light-mode baseline ONLY (dark mode is an open question per design-system skill)
 * - Tablet-first viewports: 768/1024/1280/1440. NO mobile breakpoints.
 * - Per-surface theme switcher (CHORA toolbar) wraps each story in `surface-{value}`.
 * - Polyglass body shell (`polyglass-shell` class) applied to canvas root so stories
 *   render with the canonical radial gradient + Inter typography.
 */

type SurfaceKey = 'aplus' | 'cplus' | 'hplus' | 'oplus' | 'rplus';

/**
 * Deterministic clock, opt-in per story via `parameters.frozenClock`.
 *
 * WHY: a component that renders elapsed or remaining time paints a different
 * string on every capture, so Chromatic classes the story UNSTABLE and
 * auto-ignores its changes. Build 290 did exactly that: six of eight
 * daily-dose stories flagged unstable and all six changes auto-ignored, so
 * the avatar change under review produced NO reviewable diff. The six were
 * precisely the six that render a dose card (and its ticking countdown); the
 * two that draw no card, Empty State and Error State, were stable. A story
 * nobody can review is not visual-regression cover.
 *
 * The ticking countdown is CORRECT product behaviour, so the component is
 * left alone - it is the snapshot that needs a fixed clock. A story sets
 * `parameters: { frozenClock: SOME_EPOCH_MS }` and every `Date.now()` inside
 * that render returns that instant, so the interval keeps firing but writes
 * the same value and the rendered string never moves.
 *
 * Only `Date.now` is pinned; the `Date` constructor is untouched, so
 * `new Date(someIso)` still parses normally. Any fixture that wants "now"
 * must derive it from the same constant rather than calling `new Date()`.
 *
 * The real clock is restored at the top of EVERY story render, so a story
 * without the parameter is never left with a frozen clock inherited from a
 * previous one in the same Storybook session.
 */
const REAL_DATE_NOW = Date.now;

function applyClock(frozenAt: unknown): void {
  Date.now = REAL_DATE_NOW;
  if (typeof frozenAt === 'number' && Number.isFinite(frozenAt)) {
    Date.now = () => frozenAt;
  }
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      options: {
        polyglass: { name: 'polyglass', value: 'transparent' },
        white: { name: 'white', value: '#ffffff' }
      }
    },
    viewport: {
      options: {
        tabletPortrait: {
          name: 'Tablet portrait (768)',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
        tabletLandscape: {
          name: 'Tablet landscape (1024)',
          styles: { width: '1024px', height: '768px' },
          type: 'tablet',
        },
        desktop: {
          name: 'Desktop (1280)',
          styles: { width: '1280px', height: '900px' },
          type: 'desktop',
        },
        desktopWide: {
          name: 'Desktop XL (1440)',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      }
    },
    a11y: {
      context: '#storybook-root',
      config: {},
      options: {},
    },
  },

  globalTypes: {
    surface: {
      name: 'Surface',
      description: 'CHORA surface accent (A+/C+/H+/O+/R+)',
      defaultValue: 'aplus',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'aplus', title: 'A+ (indigo + pink)' },
          { value: 'cplus', title: 'C+ Circle+ (cyan + violet)' },
          { value: 'hplus', title: 'H+ Hub+ (teal + sky)' },
          { value: 'oplus', title: 'O+ IMDA (violet + magenta)' },
          { value: 'rplus', title: 'R+ Rhythm+ (amber + orange)' },
        ],
        dynamicTitle: true,
      },
    },
  },

  decorators: [
    applicationConfig({
      providers: [
        provideAppInitializer(() => inject(TranslateService).loadTranslations('en')),
      ],
    }),
    (storyFn, context) => {
      // Before the story's component constructs, so `nowTick`'s initial
      // `Date.now()` and every subsequent interval tick agree.
      applyClock((context.parameters as { frozenClock?: unknown }).frozenClock);
      const globals = context.globals as { surface?: SurfaceKey };
      const surface: SurfaceKey = globals.surface ?? 'aplus';
      // Apply polyglass body shell + surface accent at canvas root.
      if (typeof document !== 'undefined') {
        document.body.classList.add('polyglass-shell');
        document.body.classList.remove(
          'surface-aplus',
          'surface-cplus',
          'surface-hplus',
          'surface-oplus',
          'surface-rplus',
        );
        document.body.classList.add(`surface-${surface}`);
      }
      return storyFn();
    },
  ],

  initialGlobals: {
    viewport: {
      value: 'tabletPortrait',
      isRotated: false
    },

    backgrounds: {
      value: 'polyglass'
    }
  }
};

export default preview;
