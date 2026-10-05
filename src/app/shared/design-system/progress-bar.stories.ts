import type { Meta, StoryObj } from '@storybook/angular';

type ProgressArgs = Record<string, never>;

const meta: Meta<ProgressArgs> = {
  title: 'Design System/Progress Bar',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Thin progress bar — `.progress-track` + `.progress-fill` semantic variants. Use ARIA `progressbar` role on the track when interactive.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<ProgressArgs>;

export const Variants: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 2rem; max-width: 520px; display: flex; flex-direction: column; gap: 1.25rem;">
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.85rem;">
            <span>Atom validation</span><span class="badge badge-success">100%</span>
          </div>
          <div class="progress-track" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill success" style="width: 100%;"></div>
          </div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.85rem;">
            <span>Embedding generation</span><span class="badge badge-info">62%</span>
          </div>
          <div class="progress-track" role="progressbar" aria-valuenow="62" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill primary" style="width: 62%;"></div>
          </div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.85rem;">
            <span>Mana usage this month</span><span class="badge badge-warning">83%</span>
          </div>
          <div class="progress-track" role="progressbar" aria-valuenow="83" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill warning" style="width: 83%;"></div>
          </div>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.85rem;">
            <span>Cost budget overrun</span><span class="badge badge-danger">112%</span>
          </div>
          <div class="progress-track" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill danger" style="width: 100%;"></div>
          </div>
        </div>
      </div>
    `,
  }),
};
