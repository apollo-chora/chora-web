import type { StorybookConfig } from '@storybook/angular';

/**
 * Storybook config for chora-web design-system catalog (Stage 2).
 *
 * - Framework: @storybook/angular v10 (Angular 21+ compatible)
 * - Stories scope: design-system primitives, plus the named A+ feature
 *   surfaces listed in `stories` below. It is an ALLOW-LIST, not a
 *   whole-app sweep: a story outside these globs is invisible to
 *   Chromatic, so a screen only gets visual-regression cover once its
 *   glob is added here.
 * - User-testing & visual regression: Chromatic SaaS (account 5007-Capstone,
 *   project chora-web, appId 6a0a04a1e687bd342f47c6b6). Project token stored
 *   as a CI secret (`CHROMATIC_PROJECT_TOKEN`). CI publishes on every push
 *   to main via the `chromatic-publish` GitHub Actions workflow.
 * - Per-build hosted Storybook URL: https://{appId}-{hash}.chromatic.com/
 *   Latest baseline (Build 1, SHA d5a90f9):
 *   https://6a0a04a1e687bd342f47c6b6-jkkheoxwck.chromatic.com/
 * - Sovereignty supersede: Chromatic SaaS adopted 2026-05-18 per user
 *   directive overriding the prior no-Chromatic rule in
 *   project_chora_rollout.md. The trade-off accepted: reviewer UX +
 *   baseline management > self-hosting purity.
 */
const config: StorybookConfig = {
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  stories: [
    '../src/app/shared/design-system/**/*.stories.@(ts|mdx)',
    // Helpful-UX info-tooltip primitive — InfoTooltipDirective + ChoraTooltipComponent (WS-2)
    '../src/app/shared/tooltip/**/*.stories.@(ts|mdx)',
    // A+ Companion surfaces, ALL of them (CHO-2403). Was two hand-listed
    // overlays (stage-up + source-revelation); widened to every `familiar*`
    // directory so the profile and incubation screens are covered too, and
    // so a new Companion screen inherits visual-regression cover by living
    // in the right place instead of by someone remembering this file.
    '../src/app/features/surfaces/aplus/familiar*/**/*.stories.@(ts|mdx)',
    // A+ Daily Dose screen. The Companion rail lives here, not under
    // `familiar*`, so it needs its own entry.
    '../src/app/features/surfaces/aplus/daily-dose/**/*.stories.@(ts|mdx)',
  ],
  addons: ['@storybook/addon-a11y'],
};

export default config;
