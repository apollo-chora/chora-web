import type { Meta, StoryObj } from '@storybook/angular';

type SurfaceAccentArgs = Record<string, never>;

const meta: Meta<SurfaceAccentArgs> = {
  title: 'Design System/Surface Accents',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'CHORA per-surface accent showcase. The 5 `.surface-{key}` classes override `--primary` / `--primary-hover` / `--secondary` and provide a brand gradient via `--surface-accent-gradient`. This story renders all 5 side-by-side regardless of the active toolbar selection.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<SurfaceAccentArgs>;

const SURFACES: readonly { key: string; brand: string; tagline: string }[] = [
  { key: 'aplus', brand: 'A+ (A-plus)', tagline: 'aspirational academic — A+ pun' },
  { key: 'cplus', brand: 'C+ Circle+', tagline: 'your curiosity, your circle' },
  { key: 'hplus', brand: 'H+ Hub+', tagline: 'neutral on authority' },
  { key: 'oplus', brand: 'O+ Observability+', tagline: 'audit + accountability' },
  { key: 'rplus', brand: 'R+ Rhythm+', tagline: 'pacing · cadence · heartbeat' },
];

export const AllFive: Story = {
  render: () => {
    const cards = SURFACES.map(
      (s) => `
        <div class="surface-${s.key}" style="display: contents;">
          <div class="glass-panel" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem;">
            <h2 class="surface-accent-text" style="margin: 0; font-size: 1.5rem;">${s.brand}</h2>
            <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">${s.tagline}</p>
            <div class="surface-accent-bg" style="height: 6px; border-radius: 3px;"></div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-primary" type="button">Primary</button>
              <span class="badge surface-accent-bg" style="color: white;">Accent</span>
            </div>
          </div>
        </div>
      `,
    ).join('');
    return {
      template: `<div class="card-grid" style="padding: 2rem;">${cards}</div>`,
    };
  },
};

export const ActiveSurfaceOnly: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 2rem; max-width: 520px; display: flex; flex-direction: column; gap: 1rem;">
        <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">
          This panel reflects the surface chosen in the toolbar (top right). The brand gradient,
          buttons, and accent bar all switch in lock-step.
        </p>
        <h1 class="surface-accent-text" style="margin: 0;">Surface gradient</h1>
        <div class="surface-accent-bg" style="height: 8px; border-radius: 4px;"></div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" type="button">Primary CTA</button>
          <button class="btn btn-secondary" type="button">Secondary</button>
        </div>
      </div>
    `,
  }),
};
