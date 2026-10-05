import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'chora-placeholder',
  template: `
    <div class="placeholder">
      <h2>{{ title() }}</h2>
      <p>This feature is under development.</p>
    </div>
  `,
  styles: [
    `
      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--chora-space-2xl);
        text-align: center;
        color: var(--chora-color-text-secondary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderComponent {
  title = input('Coming Soon');
}
