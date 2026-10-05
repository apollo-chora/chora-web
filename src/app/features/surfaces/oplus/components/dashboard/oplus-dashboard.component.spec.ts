import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OplusDashboardComponent } from './oplus-dashboard.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  GovernanceService,
  type DimensionsData,
} from '../../../../../core/services/governance.service';
import {
  GovernanceServiceStub,
  FIXTURE_DASHBOARD,
  FIXTURE_DIMENSIONS,
  liveState,
  staleState,
  errorState,
  loadingState,
} from '../../testing/governance.fixtures';

/**
 * O+ Dashboard — consolidated governance page (synthetic-tinkering-fox,
 * 2026-06-22). The former /o/dimensions content (traffic-light signal +
 * rubric drill-down + evidence links) was merged in; the raw `%` score
 * cards and the 6 decorative safety-risk tiles were removed. The panels are
 * driven by the polled `dimensions()` signal; the header Compliant/Review
 * chip + Recent-decisions counter by the polled `dashboard()` signal.
 */
describe('OplusDashboardComponent', () => {
  let fixture: ComponentFixture<OplusDashboardComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;

  beforeEach(async () => {
    stub = new GovernanceServiceStub();
    stub.setDimensions(liveState(FIXTURE_DIMENSIONS));
    stub.setDashboard(liveState(FIXTURE_DASHBOARD));

    await TestBed.configureTestingModule({
      imports: [OplusDashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusDashboardComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  describe('surface accent', () => {
    it('renders the .surface-oplus accent class on the screen root', () => {
      const root = element.querySelector('[data-testid="oplus-dashboard-root"]');
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-oplus');
    });
  });

  describe('header', () => {
    it('renders the dashboard title via translate key', () => {
      const title = element.querySelector('[data-testid="oplus-dashboard-title"]');
      expect(title).toBeTruthy();
      expect(title?.textContent?.trim().length).toBeGreaterThan(0);
    });

    it('renders the LIVE indicator with the live variant when dimensions state is live', () => {
      const live = element.querySelector('[data-testid="oplus-dashboard-live"]') as HTMLElement;
      expect(live).toBeTruthy();
      expect(live.dataset['variant']).toBe('live');
    });

    it('switches to STALE variant when the dimensions state is stale', () => {
      stub.setDimensions(staleState(FIXTURE_DIMENSIONS));
      fixture.detectChanges();
      const live = element.querySelector('[data-testid="oplus-dashboard-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('stale');
    });

    it('switches to OFFLINE variant on dimensions error state', () => {
      stub.setDimensions(errorState('server', 503));
      fixture.detectChanges();
      const live = element.querySelector('[data-testid="oplus-dashboard-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('offline');
    });

    it('switches to LOADING variant on loading state', () => {
      stub.setDimensions(loadingState());
      fixture.detectChanges();
      const live = element.querySelector('[data-testid="oplus-dashboard-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('loading');
    });
  });

  describe('posture chip (sourced from the dashboard rollup)', () => {
    it('renders the Review chip when the baseline is not fully achieved', () => {
      const posture = element.querySelector(
        '[data-testid="oplus-dashboard-posture"]',
      ) as HTMLElement;
      expect(posture).toBeTruthy();
      expect(posture.className).toContain('oplus-dashboard__posture--review');
    });

    it('renders the Compliant chip when all_baseline_achieved is true', () => {
      stub.setDashboard(liveState({ ...FIXTURE_DASHBOARD, all_baseline_achieved: true }));
      fixture.detectChanges();
      const posture = element.querySelector(
        '[data-testid="oplus-dashboard-posture"]',
      ) as HTMLElement;
      expect(posture.className).toContain('oplus-dashboard__posture--ok');
    });

    it('omits the posture chip when the dashboard rollup has no data', () => {
      stub.setDashboard(loadingState());
      fixture.detectChanges();
      const posture = element.querySelector('[data-testid="oplus-dashboard-posture"]');
      expect(posture).toBeNull();
    });
  });

  describe('IMDA 4-dimension panels (merged from /o/dimensions)', () => {
    it('renders one panel per IMDA dimension (4 total)', () => {
      const panels = element.querySelectorAll('[data-testid^="oplus-dimension-panel-"]');
      expect(panels.length).toBe(4);
    });

    it('exposes each panel canonical ADR-141 label in order', () => {
      const labels = Array.from(
        element.querySelectorAll('[data-testid^="oplus-dimension-panel-"]'),
      ).map((p) => (p as HTMLElement).dataset['imdaLabel']);
      expect(labels).toEqual([
        'accountability',
        'transparency',
        'safety_and_robustness',
        'fairness_and_human_oversight',
      ]);
    });

    it('applies dim-d1..dim-d4 accent classes per panel', () => {
      for (let n = 1; n <= 4; n++) {
        const panel = element.querySelector(`[data-testid="oplus-dimension-panel-${n}"]`);
        expect(panel?.className).toContain(`dim-d${n}`);
      }
    });

    it('renders a traffic-light status indicator per panel (replaces the % score)', () => {
      for (let n = 1; n <= 4; n++) {
        const light = element.querySelector(`[data-testid="oplus-dimension-light-${n}"]`);
        expect(light).toBeTruthy();
        const status = (light as HTMLElement)?.dataset['status'];
        expect(['achieved', 'partial', 'attention', 'pending']).toContain(status ?? '');
      }
    });

    it('no longer renders the raw percentage score (removed — meaningless)', () => {
      const dashScores = element.querySelectorAll('[data-testid^="oplus-dim-score-"]');
      const dimScores = element.querySelectorAll('[data-testid^="oplus-dimension-score-"]');
      expect(dashScores.length).toBe(0);
      expect(dimScores.length).toBe(0);
    });

    it('no longer renders the decorative 6 safety-risk tiles (removed)', () => {
      const tiles = element.querySelectorAll('[data-testid^="oplus-risk-tile-"]');
      expect(tiles.length).toBe(0);
    });

    it('renders an AI Verify principle list per panel', () => {
      for (let n = 1; n <= 4; n++) {
        const principles = element.querySelector(
          `[data-testid="oplus-dimension-principles-${n}"]`,
        );
        expect(principles).toBeTruthy();
        expect(principles!.children.length).toBeGreaterThan(0);
      }
    });
  });

  describe('rubric drill-down', () => {
    it('renders a collapsed rubric toggle per dimension', () => {
      for (let n = 1; n <= 4; n++) {
        const btn = element.querySelector(`[data-testid="oplus-dimension-rubric-toggle-${n}"]`);
        expect(btn).toBeTruthy();
        expect(btn?.getAttribute('aria-expanded')).toBe('false');
      }
    });

    it('expands rubric items when toggle clicked', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-1"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      const items = element.querySelectorAll('[data-testid^="oplus-dimension-rubric-item-1-"]');
      expect(items.length).toBeGreaterThan(0);
    });

    it('collapses rubric items on second toggle click', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-2"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      btn.click();
      fixture.detectChanges();
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });

    it('renders the "View evidence ↗" link when evidence_source_url is set', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-1"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="oplus-dimension-rubric-evidence-1-1.1"]',
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.target).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.href).toContain('console.cloud.google.com/traces');
    });

    it('omits the evidence link when evidence_source_url is null', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-1"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="oplus-dimension-rubric-evidence-1-1.3.1"]',
      );
      expect(link).toBeNull();
    });

    it('renders the P1/P2 priority badges with literal token + aria-label', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-1"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      const p1 = element.querySelector(
        '[data-testid="oplus-dimension-rubric-priority-1-1.1"]',
      ) as HTMLElement;
      expect(p1?.dataset['priority']).toBe('P1');
      expect(p1.textContent?.trim()).toBe('P1');
      expect((p1.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
      const p2 = element.querySelector(
        '[data-testid="oplus-dimension-rubric-priority-1-1.3.1"]',
      ) as HTMLElement;
      expect(p2?.dataset['priority']).toBe('P2');
    });

    it('counts pass / partial / fail in the rubric summary line', () => {
      const base = FIXTURE_DIMENSIONS.dimensions[0];
      const payload: DimensionsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        dimensions: [
          {
            ...base,
            rubric_items: [
              { ...base.rubric_items[0], ref: 'r-pass', status: 'pass' },
              { ...base.rubric_items[0], ref: 'r-partial', status: 'partial' },
              { ...base.rubric_items[0], ref: 'r-fail-1', status: 'fail' },
              { ...base.rubric_items[0], ref: 'r-fail-2', status: 'fail' },
            ],
          },
        ],
      };
      stub.setDimensions(liveState(payload));
      fixture.detectChanges();
      const summary = element.querySelector(
        '[data-testid="oplus-dimension-panel-1"] .oplus-dim-panel__rubric-summary',
      ) as HTMLElement;
      const counts = Array.from(summary.querySelectorAll('strong')).map((s) =>
        s.textContent?.trim(),
      );
      expect(counts[0]).toBe('1'); // pass
      expect(counts[1]).toBe('1'); // partial
      expect(counts[2]).toBe('2'); // fail
    });
  });

  describe('traffic-light legend tooltip', () => {
    it('each dimension light is focusable + aria-describedby a role=tooltip legend', () => {
      for (let n = 1; n <= 4; n++) {
        const light = element.querySelector(
          `[data-testid="oplus-dimension-light-${n}"]`,
        ) as HTMLElement;
        expect(light.getAttribute('tabindex')).toBe('0');
        const describedBy = light.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        const tip = element.querySelector(`#${describedBy}`) as HTMLElement;
        expect(tip.getAttribute('role')).toBe('tooltip');
        const tones = Array.from(tip.querySelectorAll('.oplus-traffic-tip__row')).map(
          (r) => (r as HTMLElement).dataset['tone'],
        );
        expect(tones).toEqual(['red', 'amber', 'green']);
      }
    });
  });

  describe('recent decisions chip (sourced from the dashboard rollup)', () => {
    it('renders the chip when the rollup returns a count', () => {
      const chip = element.querySelector('[data-testid="oplus-dashboard-recent-decisions"]');
      expect(chip).toBeTruthy();
      expect(chip?.textContent?.trim()).toContain('14');
    });

    it('omits the chip when the count is absent', () => {
      stub.setDashboard(liveState({ ...FIXTURE_DASHBOARD, recent_decisions_24h: undefined }));
      fixture.detectChanges();
      const chip = element.querySelector('[data-testid="oplus-dashboard-recent-decisions"]');
      expect(chip).toBeNull();
    });
  });

  describe('error / auditor gate states (driven by dimensions)', () => {
    it('renders auditor gate on 403 forbidden — panels hidden', () => {
      stub.setDimensions(errorState('forbidden', 403));
      fixture.detectChanges();
      const gate = element.querySelector('[data-testid="oplus-dashboard-auditor-gate"]');
      expect(gate).toBeTruthy();
      const panels = element.querySelectorAll('[data-testid^="oplus-dimension-panel-"]');
      expect(panels.length).toBe(0);
    });

    it('renders error block on server error with no cached data', () => {
      stub.setDimensions(errorState('server', 503));
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="oplus-dashboard-error"]');
      expect(err).toBeTruthy();
    });

    it('keeps showing panels in stale state (last-good data preserved)', () => {
      stub.setDimensions(staleState(FIXTURE_DIMENSIONS));
      fixture.detectChanges();
      const panels = element.querySelectorAll('[data-testid^="oplus-dimension-panel-"]');
      expect(panels.length).toBe(4);
    });

    it('does NOT throw when a malformed live payload lacks the dimensions array', () => {
      const malformed = { fetched_at: '2026-05-26T10:00:00Z' } as unknown as DimensionsData;
      expect(() => {
        stub.setDimensions(liveState(malformed));
        fixture.detectChanges();
      }).not.toThrow();
      const panels = element.querySelectorAll('[data-testid^="oplus-dimension-panel-"]');
      expect(panels.length).toBe(4);
    });
  });

  describe('traffic-light status arms (achieved + pending) + green lamp', () => {
    it('drives the achieved arm (green lamp active) and the pending default arm', () => {
      const payload: DimensionsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        dimensions: [
          { ...FIXTURE_DIMENSIONS.dimensions[0], status: 'achieved' },
          { ...FIXTURE_DIMENSIONS.dimensions[1], status: 'partial' },
          { ...FIXTURE_DIMENSIONS.dimensions[2], status: 'attention' },
          // Dim 4 omitted ⇒ 'pending' fallback (statusLabelKey default arm).
        ],
      };
      stub.setDimensions(liveState(payload));
      fixture.detectChanges();

      const status = (n: number): string | undefined =>
        (element.querySelector(`[data-testid="oplus-dimension-light-${n}"]`) as HTMLElement)
          ?.dataset['status'];
      expect(status(1)).toBe('achieved');
      expect(status(4)).toBe('pending');

      const greenActive = (n: number): string | undefined =>
        (
          element.querySelector(
            `[data-testid="oplus-dimension-panel-${n}"] .oplus-traffic__lamp--green`,
          ) as HTMLElement
        )?.dataset['active'];
      expect(greenActive(1)).toBe('true');
      expect(greenActive(3)).toBe('false');

      const light1 = element.querySelector(
        '[data-testid="oplus-dimension-light-1"]',
      ) as HTMLElement;
      expect((light1.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
    });
  });

  describe('rubric priority — P3 arm + priority-absent + empty rubric', () => {
    it('renders the P3 badge, omits the badge when priority is absent', () => {
      const base = FIXTURE_DIMENSIONS.dimensions[0];
      const payload: DimensionsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        dimensions: [
          {
            ...base,
            rubric_items: [
              { ...base.rubric_items[0], ref: 'p3', priority: 'P3' },
              { ...base.rubric_items[0], ref: 'no-prio', priority: undefined },
            ],
          },
        ],
      };
      stub.setDimensions(liveState(payload));
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-1"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      const p3 = element.querySelector(
        '[data-testid="oplus-dimension-rubric-priority-1-p3"]',
      ) as HTMLElement;
      expect(p3?.dataset['priority']).toBe('P3');
      expect((p3.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
      expect(
        element.querySelector('[data-testid="oplus-dimension-rubric-priority-1-no-prio"]'),
      ).toBeNull();
    });

    it('disables the toggle + shows the empty-rubric message for an empty rubric', () => {
      const payload: DimensionsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        dimensions: [{ ...FIXTURE_DIMENSIONS.dimensions[0], rubric_items: [] }],
      };
      stub.setDimensions(liveState(payload));
      fixture.detectChanges();
      const toggle = element.querySelector(
        '[data-testid="oplus-dimension-rubric-toggle-1"]',
      ) as HTMLButtonElement;
      expect(toggle.disabled).toBe(true);
      expect(
        element.querySelector('[data-testid="oplus-dimension-rubric-empty-1"]'),
      ).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('uses a heading (h1) for the dashboard title', () => {
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
    });

    it('each dimension panel is a section with an accessible name', () => {
      for (let n = 1; n <= 4; n++) {
        const panel = element.querySelector(`[data-testid="oplus-dimension-panel-${n}"]`);
        expect(panel?.tagName.toLowerCase()).toBe('section');
        const labelledBy = panel?.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        const label = element.querySelector(`#${labelledBy}`);
        expect(label).toBeTruthy();
      }
    });

    it('each rubric toggle uses aria-controls referencing its region', () => {
      for (let n = 1; n <= 4; n++) {
        const btn = element.querySelector(`[data-testid="oplus-dimension-rubric-toggle-${n}"]`);
        const controls = btn?.getAttribute('aria-controls');
        expect(controls).toBeTruthy();
        (btn as HTMLButtonElement).click();
        fixture.detectChanges();
        const region = element.querySelector(`#${controls}`);
        expect(region).toBeTruthy();
      }
    });
  });
});
