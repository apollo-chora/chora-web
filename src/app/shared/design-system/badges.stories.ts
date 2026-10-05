import type { Meta, StoryObj } from '@storybook/angular';

type BadgeArgs = Record<string, never>;

const meta: Meta<BadgeArgs> = {
  title: 'Design System/Badges',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Polyglass status badges — semantic palette mapped to success / warning / danger / info tokens.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<BadgeArgs>;

export const AllVariants: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
        <span class="badge badge-success">Success</span>
        <span class="badge badge-warning">Warning</span>
        <span class="badge badge-danger">Danger</span>
        <span class="badge badge-info">Info</span>
      </div>
    `,
  }),
};

export const InContext: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 1.5rem; max-width: 520px;">
        <h4 style="margin: 0 0 0.75rem 0;">Pipeline status</h4>
        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
          <li style="display: flex; justify-content: space-between; align-items: center;">
            <span>Atom validation</span>
            <span class="badge badge-success">Passed</span>
          </li>
          <li style="display: flex; justify-content: space-between; align-items: center;">
            <span>PII scan</span>
            <span class="badge badge-warning">Manual review</span>
          </li>
          <li style="display: flex; justify-content: space-between; align-items: center;">
            <span>Guardrail check</span>
            <span class="badge badge-danger">Blocked</span>
          </li>
          <li style="display: flex; justify-content: space-between; align-items: center;">
            <span>Embedding</span>
            <span class="badge badge-info">Queued</span>
          </li>
        </ul>
      </div>
    `,
  }),
};
