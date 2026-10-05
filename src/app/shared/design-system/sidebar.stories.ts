import type { Meta, StoryObj } from '@storybook/angular';

type SidebarArgs = Record<string, never>;

const meta: Meta<SidebarArgs> = {
  title: 'Design System/Sidebar',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Polyglass sidebar — 280px expanded / 64px collapsed. Animated width transition. Hover restores expanded width when collapsed.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<SidebarArgs>;

export const Expanded: Story = {
  render: () => ({
    template: `
      <div class="app-container" style="height: 600px;">
        <nav class="glass-panel sidebar">
          <div class="brand">
            <div class="brand-icon">C</div>
            <div style="display: flex; flex-direction: column; line-height: 1.1;">
              <span class="brand-logo">Chora</span>
              <span class="brand-tagline" style="font-size: 0.7em; opacity: 0.75; font-weight: 400; letter-spacing: 0.02em;">Power of a little bit</span>
            </div>
          </div>
          <ul class="nav-menu">
            <li class="nav-item active">
              <span aria-hidden="true">◎</span>
              <span class="nav-label">Dashboard</span>
            </li>
            <li class="nav-item">
              <span aria-hidden="true">★</span>
              <span class="nav-label">Atoms</span>
            </li>
            <li class="nav-item">
              <span aria-hidden="true">⌘</span>
              <span class="nav-label">Discovery</span>
            </li>
            <li class="nav-item">
              <span aria-hidden="true">⚙</span>
              <span class="nav-label">Settings</span>
            </li>
          </ul>
        </nav>
        <main class="main-content">
          <header class="header glass-panel">
            <h1 class="header-title">Main content</h1>
          </header>
        </main>
      </div>
    `,
  }),
};

export const Collapsed: Story = {
  render: () => ({
    template: `
      <div class="app-container" style="height: 600px;">
        <nav class="glass-panel sidebar collapsed">
          <div class="brand">
            <div class="brand-icon">C</div>
          </div>
          <ul class="nav-menu">
            <li class="nav-item active" aria-label="Dashboard">
              <span aria-hidden="true">◎</span>
            </li>
            <li class="nav-item" aria-label="Atoms">
              <span aria-hidden="true">★</span>
            </li>
            <li class="nav-item" aria-label="Discovery">
              <span aria-hidden="true">⌘</span>
            </li>
            <li class="nav-item" aria-label="Settings">
              <span aria-hidden="true">⚙</span>
            </li>
          </ul>
        </nav>
        <main class="main-content">
          <header class="header glass-panel">
            <h1 class="header-title">Hover sidebar to expand</h1>
          </header>
        </main>
      </div>
    `,
  }),
};
