import type { Meta, StoryObj } from '@storybook/angular';

type ToastArgs = Record<string, never>;

const meta: Meta<ToastArgs> = {
  title: 'Design System/Notification Toasts',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Toast variants — minimal Stage-2 markup. Stage 3 surface agents may wrap as `<chora-toast>` Angular component with signal inputs. Toasts use the polyglass floating-widget shadow + a left semantic accent.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<ToastArgs>;

const toastStyle = (color: string): string =>
  [
    'display: flex',
    'align-items: center',
    'gap: 0.75rem',
    'padding: 0.9rem 1.25rem',
    'background: linear-gradient(135deg, rgba(255,255,255,0.92), rgba(240,244,255,0.7))',
    'backdrop-filter: blur(24px) saturate(180%)',
    '-webkit-backdrop-filter: blur(24px) saturate(180%)',
    'border-radius: 14px',
    'box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12)',
    'border: 1px solid rgba(255,255,255,0.6)',
    `border-left: 4px solid ${color}`,
    'min-width: 320px',
    'max-width: 480px',
  ].join('; ');

export const Success: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem;">
        <div role="status" style="${toastStyle('var(--success)')}">
          <span class="badge badge-success">✓</span>
          <div style="flex: 1;">
            <strong style="display: block;">Atom published</strong>
            <span style="color: var(--text-muted); font-size: 0.85rem;">"Pythagorean Theorem" is live.</span>
          </div>
        </div>
      </div>
    `,
  }),
};

export const Warning: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem;">
        <div role="alert" style="${toastStyle('var(--warning)')}">
          <span class="badge badge-warning">!</span>
          <div style="flex: 1;">
            <strong style="display: block;">Manual review needed</strong>
            <span style="color: var(--text-muted); font-size: 0.85rem;">PII pattern detected in atom body.</span>
          </div>
        </div>
      </div>
    `,
  }),
};

export const Danger: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem;">
        <div role="alert" style="${toastStyle('var(--danger)')}">
          <span class="badge badge-danger">×</span>
          <div style="flex: 1;">
            <strong style="display: block;">Publish blocked</strong>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Guardrail violation — safety_and_robustness.</span>
          </div>
        </div>
      </div>
    `,
  }),
};

export const Info: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem;">
        <div role="status" style="${toastStyle('var(--info)')}">
          <span class="badge badge-info">i</span>
          <div style="flex: 1;">
            <strong style="display: block;">Embedding in progress</strong>
            <span style="color: var(--text-muted); font-size: 0.85rem;">Available for discovery in ~2 minutes.</span>
          </div>
        </div>
      </div>
    `,
  }),
};

export const Stack: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem;">
        <div role="status" style="${toastStyle('var(--success)')}">
          <span class="badge badge-success">✓</span>
          <div style="flex: 1;"><strong>Saved draft</strong></div>
        </div>
        <div role="status" style="${toastStyle('var(--info)')}">
          <span class="badge badge-info">i</span>
          <div style="flex: 1;"><strong>Sync queued</strong></div>
        </div>
        <div role="alert" style="${toastStyle('var(--warning)')}">
          <span class="badge badge-warning">!</span>
          <div style="flex: 1;"><strong>Approaching mana cap</strong></div>
        </div>
      </div>
    `,
  }),
};
