import type { Meta, StoryObj } from '@storybook/angular';

type ImdaArgs = Record<string, never>;

const meta: Meta<ImdaArgs> = {
  title: 'Design System/IMDA Dimensions',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'IMDA Model AI Governance Framework — 4 dimensions (D1 accountability / D2 transparency / D3 safety_and_robustness / D4 fairness_and_human_oversight) per ADR-141. Used by the O+ governance dashboard. Solid badges, soft chips, and left-rail panel accents.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<ImdaArgs>;

export const Badges: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 1rem; align-items: center;">
        <span class="dim-badge dim-d1" title="D1 Accountability">D1</span>
        <span class="dim-badge dim-d2" title="D2 Transparency">D2</span>
        <span class="dim-badge dim-d3" title="D3 Safety & Robustness">D3</span>
        <span class="dim-badge dim-d4" title="D4 Fairness & Human Oversight">D4</span>
      </div>
    `,
  }),
};

export const Chips: Story = {
  render: () => ({
    template: `
      <div style="padding: 2rem; display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center;">
        <span class="dim-chip dim-d1">D1 · Accountability</span>
        <span class="dim-chip dim-d2">D2 · Transparency</span>
        <span class="dim-chip dim-d3">D3 · Safety &amp; Robustness</span>
        <span class="dim-chip dim-d4">D4 · Fairness &amp; Human Oversight</span>
      </div>
    `,
  }),
};

export const PanelAccents: Story = {
  render: () => ({
    template: `
      <div class="card-grid" style="padding: 2rem;">
        <div class="glass-panel dim-panel-accent dim-d1" style="padding: 1.5rem;">
          <span class="dim-chip dim-d1">D1 · Accountability</span>
          <h4 style="margin: 0.5rem 0 0.25rem 0;">Owner attestations</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">12 of 12 services attested.</p>
        </div>
        <div class="glass-panel dim-panel-accent dim-d2" style="padding: 1.5rem;">
          <span class="dim-chip dim-d2">D2 · Transparency</span>
          <h4 style="margin: 0.5rem 0 0.25rem 0;">Model card coverage</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">All 24 agents have public model cards.</p>
        </div>
        <div class="glass-panel dim-panel-accent dim-d3" style="padding: 1.5rem;">
          <span class="dim-chip dim-d3">D3 · Safety &amp; Robustness</span>
          <h4 style="margin: 0.5rem 0 0.25rem 0;">Red-team pass rate</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">94% (target 95%) — last battery 6h ago.</p>
        </div>
        <div class="glass-panel dim-panel-accent dim-d4" style="padding: 1.5rem;">
          <span class="dim-chip dim-d4">D4 · Fairness &amp; Human Oversight</span>
          <h4 style="margin: 0.5rem 0 0.25rem 0;">HITL coverage</h4>
          <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem;">All Level-2 agents gated. 0 Level-3 deployed.</p>
        </div>
      </div>
    `,
  }),
};
