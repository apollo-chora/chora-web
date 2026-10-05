import type { Meta, StoryObj } from '@storybook/angular';

type StatCardArgs = Record<string, never>;

const meta: Meta<StatCardArgs> = {
  title: 'Design System/Stat Cards',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Stat cards — KPI tiles with a left semantic accent rail. Variants: info / warning / success / danger. Compose with `.glass-panel` for the frosted surface.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<StatCardArgs>;

export const Grid: Story = {
  render: () => ({
    template: `
      <div class="card-grid" style="padding: 2rem;">
        <div class="glass-panel stat-card info">
          <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Atoms published</span>
          <strong style="font-size: 2rem; line-height: 1;">1,284</strong>
          <span style="color: var(--info);">+12 today</span>
        </div>
        <div class="glass-panel stat-card success">
          <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Pass rate</span>
          <strong style="font-size: 2rem; line-height: 1;">94%</strong>
          <span style="color: var(--success);">on track</span>
        </div>
        <div class="glass-panel stat-card warning">
          <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Review queue</span>
          <strong style="font-size: 2rem; line-height: 1;">37</strong>
          <span style="color: var(--warning);">3 over SLA</span>
        </div>
        <div class="glass-panel stat-card danger">
          <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">Blocked publishes</span>
          <strong style="font-size: 2rem; line-height: 1;">2</strong>
          <span style="color: var(--danger);">requires action</span>
        </div>
      </div>
    `,
  }),
};
