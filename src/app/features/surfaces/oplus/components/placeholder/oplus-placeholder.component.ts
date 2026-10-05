/**
 * O+ wave-2 placeholder — renders for stubbed routes (`/o/dimensions`,
 * `/o/agents`, `/o/governance`, `/o/a2a-console`) until wave 2 lands
 * the full feature builds.
 */
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';

export type OplusPlaceholderSection =
  | 'dimensions'
  | 'agents'
  | 'governance'
  | 'a2a-console';

@Component({
  selector: 'chora-oplus-placeholder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section
      class="oplus-placeholder surface-oplus"
      data-testid="oplus-placeholder-root"
    >
      <div class="glass-panel oplus-placeholder__card">
        <span class="dim-badge dim-d2" aria-hidden="true">
          <i class="fa-solid fa-flask"></i>
        </span>
        <h1
          class="oplus-placeholder__heading surface-accent-text"
          data-testid="oplus-placeholder-heading"
        >
          O+ / {{ section() }}
        </h1>
        <p class="oplus-placeholder__body">
          {{ 'oplus.placeholder.body' | translate }}
        </p>
        <p
          class="oplus-placeholder__status"
          role="note"
          data-testid="oplus-placeholder-status"
        >
          {{ 'oplus.placeholder.coming_wave_2' | translate }}
        </p>
      </div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .oplus-placeholder {
      padding: 2rem 1.5rem;
      min-height: calc(100vh - 4rem);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .oplus-placeholder__card {
      max-width: 560px;
      padding: 2rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      align-items: center;
    }
    .oplus-placeholder__heading {
      font-size: 1.6rem;
      font-weight: 800;
      margin: 0;
    }
    .oplus-placeholder__body {
      margin: 0;
      color: var(--text-main);
      font-size: 0.95rem;
    }
    .oplus-placeholder__status {
      margin-top: 0.25rem;
      padding: 0.5rem 0.9rem;
      background: var(--info-bg, rgba(59, 130, 246, 0.1));
      border-radius: 8px;
      border-inline-start: 3px solid var(--info, #3b82f6);
      color: var(--text-muted);
      font-size: 0.8rem;
      text-align: start;
      width: 100%;
    }
  `,
})
export class OplusPlaceholderComponent {
  readonly section = input.required<OplusPlaceholderSection>();
}
