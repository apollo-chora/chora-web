import type { Meta, StoryObj } from '@storybook/angular';

/**
 * GlassPanel — polyglass core primitive.
 *
 * Showcases `.glass-panel` (default + the five surface accent variants).
 * Stories use raw HTML via the `template` field so polyglass classes can be
 * exercised without wrapping every primitive in an Angular component
 * (Stage 3 surface agents decide whether to wrap when porting screens).
 */

type GlassPanelArgs = Record<string, never>;

const meta: Meta<GlassPanelArgs> = {
  title: 'Design System/Glass Panel',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Core polyglass primitive. Frosted backdrop-filter container used by every CHORA surface. Per-surface accent variants come from `.surface-{key}` ancestor classes (wired via the global toolbar).',
      },
    },
  },
};
export default meta;
type Story = StoryObj<GlassPanelArgs>;

export const Default: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 1.5rem; flex-wrap: wrap;">
        <div class="glass-panel" style="width: 320px; padding: 1.5rem;">
          <h3 style="margin: 0 0 0.5rem 0; color: var(--text-main);">Glass panel</h3>
          <p style="margin: 0; color: var(--text-muted);">
            Polyglass primitive — frosted gradient + backdrop blur.
          </p>
        </div>
      </div>
    `,
  }),
};

export const WithAccentText: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem;">
        <div class="glass-panel" style="max-width: 480px; padding: 2rem;">
          <h2 class="surface-accent-text" style="margin: 0 0 0.5rem 0;">CHORA brand gradient</h2>
          <p style="margin: 0; color: var(--text-muted);">
            <code>.surface-accent-text</code> picks up the current surface gradient. Switch the surface
            toolbar (top right) to compare A+ indigo·pink, C+ cyan·violet, H+ teal·sky, O+ violet·magenta,
            R+ amber·orange.
          </p>
        </div>
      </div>
    `,
  }),
};

export const PanelGrid: Story = {
  render: () => ({
    template: `
      <div class="card-grid" style="padding: 2rem;">
        <div class="glass-panel" style="padding: 1.5rem;">
          <h4 style="margin: 0 0 0.5rem 0;">Panel one</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">Default tile.</p>
        </div>
        <div class="glass-panel" style="padding: 1.5rem;">
          <h4 style="margin: 0 0 0.5rem 0;">Panel two</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">Wraps at 300px min.</p>
        </div>
        <div class="glass-panel" style="padding: 1.5rem;">
          <h4 style="margin: 0 0 0.5rem 0;">Panel three</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.875rem;">Hover for shadow lift.</p>
        </div>
      </div>
    `,
  }),
};
