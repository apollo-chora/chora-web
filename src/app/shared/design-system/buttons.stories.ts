import type { Meta, StoryObj } from '@storybook/angular';

type ButtonArgs = Record<string, never>;

const meta: Meta<ButtonArgs> = {
  title: 'Design System/Buttons',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Polyglass button family — primary (gradient fill), secondary (frosted), icon (circular). Surface accent applies via the surface toolbar.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<ButtonArgs>;

export const Primary: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
        <button class="btn btn-primary" type="button">Primary action</button>
        <button class="btn btn-primary" type="button">
          <span aria-hidden="true">+</span>
          <span>Create atom</span>
        </button>
      </div>
    `,
  }),
};

export const Secondary: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
        <button class="btn btn-secondary" type="button">Cancel</button>
        <button class="btn btn-secondary" type="button">Save draft</button>
      </div>
    `,
  }),
};

export const IconOnly: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 0.75rem; align-items: center;">
        <button class="btn-icon" type="button" aria-label="Refresh">
          <span aria-hidden="true">⟳</span>
        </button>
        <button class="btn-icon" type="button" aria-label="Settings">
          <span aria-hidden="true">⚙</span>
        </button>
        <button class="btn-icon" type="button" aria-label="More options">
          <span aria-hidden="true">⋯</span>
        </button>
      </div>
    `,
  }),
};

export const Combined: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 1.5rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
        <button class="btn btn-secondary" type="button">Discard</button>
        <button class="btn btn-primary" type="button">Publish</button>
        <span style="flex: 1;"></span>
        <button class="btn-icon" type="button" aria-label="Help">
          <span aria-hidden="true">?</span>
        </button>
      </div>
    `,
  }),
};
