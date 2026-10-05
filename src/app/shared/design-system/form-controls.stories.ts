import type { Meta, StoryObj } from '@storybook/angular';

type FormControlArgs = Record<string, never>;

const meta: Meta<FormControlArgs> = {
  title: 'Design System/Form Controls',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Polyglass form controls: `.form-control` for inputs/textarea/select, plus checkbox + radio. All inputs have visible `<label>` elements per chora-web accessibility rules.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<FormControlArgs>;

export const TextInputs: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 2rem; max-width: 480px; display: flex; flex-direction: column; gap: 1rem;">
        <label style="display: flex; flex-direction: column; gap: 0.35rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Email</span>
          <input class="form-control" type="email" placeholder="learner@chora.site" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 0.35rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Display name</span>
          <input class="form-control" type="text" value="Phyllis" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 0.35rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Atom title</span>
          <input class="form-control" type="text" placeholder="What does this atom teach?" />
        </label>
      </div>
    `,
  }),
};

export const Textarea: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 2rem; max-width: 480px;">
        <label style="display: flex; flex-direction: column; gap: 0.35rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Atom body</span>
          <textarea class="form-control" rows="5" placeholder="Describe the learning atom..."></textarea>
        </label>
      </div>
    `,
  }),
};

export const Select: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 2rem; max-width: 480px;">
        <label style="display: flex; flex-direction: column; gap: 0.35rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Delivery mode</span>
          <select class="form-control">
            <option>Straight-Up (linear certification)</option>
            <option>Graph-Based Discovery</option>
          </select>
        </label>
      </div>
    `,
  }),
};

export const CheckboxAndRadio: Story = {
  render: () => ({
    template: `
      <div class="glass-panel" style="margin: 2rem; padding: 2rem; max-width: 480px; display: flex; flex-direction: column; gap: 1rem;">
        <fieldset style="border: 0; padding: 0; margin: 0;">
          <legend style="font-weight: 600; margin-bottom: 0.5rem;">Notifications</legend>
          <label style="display: flex; gap: 0.5rem; align-items: center; padding: 0.25rem 0;">
            <input type="checkbox" checked /> Email summary
          </label>
          <label style="display: flex; gap: 0.5rem; align-items: center; padding: 0.25rem 0;">
            <input type="checkbox" /> Push reminders
          </label>
        </fieldset>
        <fieldset style="border: 0; padding: 0; margin: 0;">
          <legend style="font-weight: 600; margin-bottom: 0.5rem;">Default surface</legend>
          <label style="display: flex; gap: 0.5rem; align-items: center; padding: 0.25rem 0;">
            <input type="radio" name="surf" checked /> A+ (Reader)
          </label>
          <label style="display: flex; gap: 0.5rem; align-items: center; padding: 0.25rem 0;">
            <input type="radio" name="surf" /> R+ (Rhythm+)
          </label>
        </fieldset>
      </div>
    `,
  }),
};
