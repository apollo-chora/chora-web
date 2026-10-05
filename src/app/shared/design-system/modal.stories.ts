import type { Meta, StoryObj } from '@storybook/angular';

type ModalArgs = Record<string, never>;

const meta: Meta<ModalArgs> = {
  title: 'Design System/Modal',
  parameters: {
    layout: 'fullscreen',
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'Polyglass modal — `.modal-overlay` (fixed scrim with backdrop blur) + `.modal-content` (frosted dialog). Stage 3 wraps as a CDK overlay; here we showcase the chrome only.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<ModalArgs>;

export const Default: Story = {
  render: () => ({
    template: `
      <div style="position: relative; height: 600px; background: var(--bg-base); overflow: hidden;">
        <div style="position: absolute; inset: 0; background: radial-gradient(ellipse at top left, rgba(224,231,255,0.6) 0%, transparent 60%), radial-gradient(ellipse at bottom right, rgba(237,233,254,0.6) 0%, transparent 60%);"></div>
        <div class="modal-overlay" style="position: absolute;">
          <div role="dialog" aria-labelledby="modal-title" class="modal-content">
            <h2 id="modal-title" style="margin: 0 0 0.5rem 0;">Publish atom?</h2>
            <p style="color: var(--text-muted); margin: 0 0 1.5rem 0;">
              The atom will be immediately available in Discovery and Reader surfaces. This action is reversible
              via the soft-delete workflow.
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
              <button class="btn btn-secondary" type="button">Cancel</button>
              <button class="btn btn-primary" type="button">Publish</button>
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};

export const Confirmation: Story = {
  render: () => ({
    template: `
      <div style="position: relative; height: 600px; background: var(--bg-base); overflow: hidden;">
        <div class="modal-overlay" style="position: absolute;">
          <div role="alertdialog" aria-labelledby="confirm-title" class="modal-content" style="width: 420px;">
            <h2 id="confirm-title" style="margin: 0 0 0.5rem 0;">Delete draft?</h2>
            <p style="color: var(--text-muted); margin: 0 0 1.5rem 0;">
              Drafts are kept for 30 days, then hard-deleted from cold archive.
            </p>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
              <button class="btn btn-secondary" type="button">Keep</button>
              <button class="btn btn-primary" type="button" style="background: linear-gradient(135deg, var(--danger), #b91c1c); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};
