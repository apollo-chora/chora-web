import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SurfaceKey = 'aplus' | 'cplus' | 'hplus' | 'oplus' | 'rplus';

export interface SurfaceMeta {
  readonly letter: 'A' | 'C' | 'H' | 'O' | 'R';
  readonly shortName: string;
  readonly longName: string;
  readonly tagline: string;
  readonly description: string;
}

export const SURFACES: Readonly<Record<SurfaceKey, SurfaceMeta>> = {
  aplus: {
    letter: 'A',
    shortName: 'A+',
    longName: 'A-plus',
    tagline: 'aspirational academic A+',
    description: 'Content Creation + Content Consumption for learners and authors.',
  },
  cplus: {
    letter: 'C',
    shortName: 'C+',
    longName: 'Circle+',
    tagline: 'your curiosity, your circle',
    description: 'Content Sharing: social graph, posts, reactions, leaderboards.',
  },
  hplus: {
    letter: 'H',
    shortName: 'H+',
    longName: 'Hub+',
    tagline: 'tenant operations hub',
    description: 'Tenancy + Billing + Identity admin + IdP + add-ons + members + marketplace.',
  },
  oplus: {
    letter: 'O',
    shortName: 'O+',
    longName: 'Observability+',
    tagline: 'Observability Plus',
    description: 'Governance + Observability + runtime control + A2A console.',
  },
  rplus: {
    letter: 'R',
    shortName: 'R+',
    longName: 'Rhythm+',
    tagline: 'pacing, cadence, heartbeat',
    description: 'Content Delivery: training admin, scheduling, rostering, classroom, exam.',
  },
};

@Component({
  selector: 'chora-surface-landing',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      [class]="'surface-landing surface-' + surface()"
      [attr.data-testid]="'surface-landing-' + surface()">
      <div class="glass-panel surface-landing__card">
        <div class="surface-landing__badge surface-accent-bg" aria-hidden="true">
          {{ meta().letter }}
        </div>
        <h1 class="surface-accent-text surface-landing__title" data-testid="surface-name">
          {{ meta().shortName }}
        </h1>
        <p class="surface-landing__tagline" data-testid="surface-tagline">{{ meta().tagline }}</p>
        <p class="surface-landing__description">{{ meta().description }}</p>
        <p class="surface-landing__status" role="note" data-testid="surface-status">
          Surface scaffold: Stage 0 of the Phyllis UX track.
          The full {{ meta().shortName }} build lands in Stage 3.
        </p>
      </div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .surface-landing {
      padding: 2rem 1.5rem;
      min-height: calc(100vh - 4rem);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .surface-landing__card {
      max-width: 560px;
      padding: 2rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
    }
    .surface-landing__badge {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.25rem;
      font-weight: 800;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }
    .surface-landing__title { font-size: 2.5rem; margin: 0; font-weight: 800; }
    .surface-landing__tagline {
      font-size: 1rem;
      font-style: italic;
      color: var(--text-muted);
      margin: 0;
    }
    .surface-landing__description {
      font-size: 0.95rem;
      color: var(--text-main);
      margin: 0;
    }
    .surface-landing__status {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--info-bg);
      border-radius: 8px;
      border-inline-start: 3px solid var(--info);
      text-align: start;
      width: 100%;
    }
  `,
})
export class SurfaceLandingComponent {
  // Bound from route data: { surface: 'aplus' | 'cplus' | 'hplus' | 'oplus' | 'rplus' }
  // via withComponentInputBinding() in app.config.ts.
  readonly surface = input.required<SurfaceKey>();
  readonly meta = computed<SurfaceMeta>(() => SURFACES[this.surface()]);
}
