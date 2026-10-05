/**
 * Storybook states for the shared keyboard reorder path (D1, spec b.3/b.7).
 *
 * These stories exist to be DRIVEN, not looked at. The directive's whole point
 * is behaviour with no visual signature: a roving tab stop, Alt+arrow moves,
 * and an announcement a sighted reviewer never sees. So each story names the
 * keys to press, and the live region is rendered VISIBLY here, because a live
 * region you cannot see is one you cannot check.
 *
 * They are also the axe surface for the pattern. The composer mounts this
 * directive; checking the pattern once here is cheaper and more honest than
 * re-checking it inside every host that adopts it.
 */
import { Component, input, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';

import {
  ReorderableListDirective,
  type ReorderEvent,
} from './reorderable-list.directive';

/**
 * A minimal host, deliberately unstyled beyond legibility: the directive ships
 * BEHAVIOUR and every real host keeps its own markup, so a pretty host here
 * would imply a look this thing does not provide.
 *
 * The rows and the lock are inputs so each story renders the state it names
 * rather than describing one it does not show.
 */
@Component({
  selector: 'chora-reorderable-demo',
  standalone: true,
  imports: [ReorderableListDirective],
  styles: [
    `
      ul {
        list-style: none;
        margin: 0 0 0.5rem;
        padding: 0;
        display: grid;
        gap: 4px;
        max-width: 22rem;
      }
      li {
        padding: 0.5rem 0.75rem;
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 8px;
        background: #fff;
      }
      li:focus-visible {
        outline: 2px solid #4b3f8f;
        outline-offset: 2px;
      }
      .live,
      .hint {
        font-size: 0.75rem;
        color: #616161;
      }
      .live {
        min-height: 1rem;
      }
      .hint {
        margin: 0 0 0.5rem;
      }
    `,
  ],
  template: `
    <p class="hint">
      Tab to the list, then Arrow keys move focus and Alt+Arrow moves a row.
      Home and End jump; Alt+Home and Alt+End move a row to an end.
    </p>
    <ul
      [choraReorderableList]="rows().length"
      [rowLabel]="labeller"
      [reorderDisabled]="locked()"
      (reorder)="onReorder($event)"
      #list="choraReorderable"
    >
      @for (r of rows(); track r; let i = $index) {
        <li
          [attr.data-reorder-index]="i"
          [attr.tabindex]="i === list.activeIndex() ? 0 : -1"
        >
          {{ i + 1 }}. {{ r }}
        </li>
      }
    </ul>
    <p class="live" aria-live="polite">
      @if (list.announcement(); as a) {
        {{ a.key }} ({{ announcementParams(a.params) }})
      }
    </p>
  `,
})
class ReorderableDemoComponent {
  /** Seed rows. Mutated locally as the reviewer drives the keyboard. */
  readonly items = input<readonly string[]>([
    'Socratic Drill',
    'Progress Mirror',
    'Recap Scribe',
  ]);
  readonly locked = input<boolean>(false);

  private readonly moved = signal<readonly string[] | null>(null);
  /** The seed until the reviewer moves something, then the moved order. */
  readonly rows = (): readonly string[] => this.moved() ?? this.items();

  readonly labeller = (i: number): string => this.rows()[i] ?? '';

  onReorder(e: ReorderEvent): void {
    const next = [...this.rows()];
    const [row] = next.splice(e.from, 1);
    next.splice(e.to, 0, row);
    this.moved.set(next);
  }

  /** The announcement params, flattened for display. */
  announcementParams(params: Readonly<Record<string, string | number>>): string {
    return Object.entries(params)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
}

const meta: Meta<ReorderableDemoComponent> = {
  title: 'Shared/Reorderable List',
  component: ReorderableDemoComponent,
  decorators: [moduleMetadata({ imports: [ReorderableDemoComponent] })],
  parameters: {
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'The one keyboard reorder path. Angular CDK ships pointer dragging ' +
          'only, so any editor whose order matters is unusable without a ' +
          'mouse until this is mounted. Plain arrows move focus; Alt plus an ' +
          'arrow moves the row, a modifier so browsing cannot reorder by ' +
          'accident. A move at either end announces rather than doing nothing ' +
          'silently, because a key that appears dead is indistinguishable ' +
          'from a broken one.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<ReorderableDemoComponent>;

/** The working path: three rows, everything enabled. */
export const Default: Story = {
  args: { items: ['Socratic Drill', 'Progress Mirror', 'Recap Scribe'] },
};

/**
 * Reorder blocked, navigation still available: the published-ritual shape. The
 * list stays readable and traversable and only MOVING stops, so Alt+Arrow
 * announces that the row cannot move rather than doing nothing.
 */
export const ReorderDisabled: Story = {
  args: {
    items: ['Socratic Drill', 'Progress Mirror', 'Recap Scribe'],
    locked: true,
  },
};

/**
 * One row, which is first and last at once, so EVERY move is a no-op. This is
 * the state that would be silent if the no-op did not announce, and the reason
 * the announcement exists at all.
 */
export const SingleRow: Story = {
  args: { items: ['Socratic Drill'] },
};

/** No rows: the keys must do nothing and must not throw. */
export const Empty: Story = {
  args: { items: [] },
};
