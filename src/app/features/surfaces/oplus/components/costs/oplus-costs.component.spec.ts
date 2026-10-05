import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OplusCostsComponent } from './oplus-costs.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { GovernanceService } from '../../../../../core/services/governance.service';
import {
  GovernanceServiceStub,
  FIXTURE_COSTS,
  liveState,
  staleState,
  errorState,
  loadingState,
} from '../../testing/governance.fixtures';

describe('OplusCostsComponent', () => {
  let fixture: ComponentFixture<OplusCostsComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;

  beforeEach(async () => {
    stub = new GovernanceServiceStub();
    stub.setCosts(liveState(FIXTURE_COSTS));

    await TestBed.configureTestingModule({
      imports: [OplusCostsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusCostsComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  describe('surface accent', () => {
    it('renders the .surface-oplus accent class on the screen root', () => {
      const root = element.querySelector('[data-testid="oplus-costs-root"]');
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-oplus');
    });
  });

  describe('header', () => {
    it('renders the page title via translate key', () => {
      const title = element.querySelector('[data-testid="oplus-costs-title"]');
      expect(title).toBeTruthy();
      expect(title?.textContent?.trim().length).toBeGreaterThan(0);
    });

    it('renders the LIVE indicator with the live variant when state is live', () => {
      const live = element.querySelector('[data-testid="oplus-costs-live"]') as HTMLElement;
      expect(live).toBeTruthy();
      expect(live.dataset['variant']).toBe('live');
    });

    it('switches to STALE variant on stale state', () => {
      stub.setCosts(staleState(FIXTURE_COSTS));
      fixture.detectChanges();
      const live = element.querySelector('[data-testid="oplus-costs-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('stale');
    });

    it('switches to OFFLINE variant on error state', () => {
      stub.setCosts(errorState('server', 503));
      fixture.detectChanges();
      const live = element.querySelector('[data-testid="oplus-costs-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('offline');
    });

    it('switches to LOADING variant on loading state', () => {
      stub.setCosts(loadingState());
      fixture.detectChanges();
      const live = element.querySelector('[data-testid="oplus-costs-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('loading');
    });
  });

  describe('time-window filter', () => {
    it('renders a button for each of day / week / month / all-time', () => {
      for (const r of ['day', 'week', 'month', 'all']) {
        const btn = element.querySelector(
          `[data-testid="oplus-costs-filter-${r}"]`,
        );
        expect(btn, `filter button for ${r}`).toBeTruthy();
      }
    });

    it('marks the active range (all by default) with aria-pressed', () => {
      const all = element.querySelector(
        '[data-testid="oplus-costs-filter-all"]',
      ) as HTMLElement;
      const month = element.querySelector(
        '[data-testid="oplus-costs-filter-month"]',
      ) as HTMLElement;
      expect(all.getAttribute('aria-pressed')).toBe('true');
      expect(month.getAttribute('aria-pressed')).toBe('false');
    });

    it('clicking a range calls setCostRange and updates aria-pressed', () => {
      const month = element.querySelector(
        '[data-testid="oplus-costs-filter-month"]',
      ) as HTMLElement;
      month.click();
      fixture.detectChanges();
      expect(stub.costRangeState()).toBe('month');
      expect(month.getAttribute('aria-pressed')).toBe('true');
      const all = element.querySelector(
        '[data-testid="oplus-costs-filter-all"]',
      ) as HTMLElement;
      expect(all.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('display currency', () => {
    it('converts + labels amounts in the configured currency', () => {
      stub.setCosts(
        liveState({
          fetched_at: '2026-06-29T10:00:00Z',
          cumulative_cost_usd: 10,
          currency: 'SGD',
          fx_rate: 1.35,
          by_model: [
            { key: 'm', cost_usd: 2, prompt_tokens: 1, completion_tokens: 1 },
          ],
          by_agent: [],
        }),
      );
      fixture.detectChanges();
      const chip = element.querySelector('[data-testid="oplus-costs-cumulative"]');
      expect(chip?.textContent).toContain('S$13.5000'); // 10 × 1.35
      const row = element.querySelector('[data-testid="oplus-costs-model-row-m"]');
      expect(row?.textContent).toContain('S$2.7000'); // 2 × 1.35
    });

    it('shows the FX conversion note (with the rate) when rate != 1', () => {
      stub.setCosts(
        liveState({
          fetched_at: '2026-06-29T10:00:00Z',
          cumulative_cost_usd: 10,
          currency: 'SGD',
          fx_rate: 1.35,
          by_model: [],
          by_agent: [],
        }),
      );
      fixture.detectChanges();
      const note = element.querySelector('[data-testid="oplus-costs-fx-note"]');
      expect(note).toBeTruthy();
      expect(note?.textContent).toContain('1.35');
    });

    it('defaults to USD $ with no FX note when currency/fx_rate absent', () => {
      // FIXTURE_COSTS carries no currency/fx_rate → identity USD display.
      const note = element.querySelector('[data-testid="oplus-costs-fx-note"]');
      expect(note).toBeNull();
      const chip = element.querySelector('[data-testid="oplus-costs-cumulative"]');
      expect(chip?.textContent).toContain('$12.4821');
    });
  });

  describe('cumulative cost headline', () => {
    it('renders the cumulative spend from the BFF', () => {
      const chip = element.querySelector('[data-testid="oplus-costs-cumulative"]');
      expect(chip).toBeTruthy();
      // Fixture cumulative is 12.4821 → formatted to 4dp.
      expect(chip?.textContent).toContain('$12.4821');
    });
  });

  describe('by_model table', () => {
    it('renders one row per model bucket', () => {
      const rows = element.querySelectorAll('[data-testid^="oplus-costs-model-row-"]');
      expect(rows.length).toBe(FIXTURE_COSTS.by_model.length);
    });

    it('renders the model key + cost from BFF data', () => {
      const row = element.querySelector(
        '[data-testid="oplus-costs-model-row-gemini-2.5-pro"]',
      );
      expect(row).toBeTruthy();
      expect(row?.textContent).toContain('gemini-2.5-pro');
      expect(row?.textContent).toContain('$9.8412');
    });

    it('renders an empty-state when no model buckets', () => {
      stub.setCosts(liveState({ ...FIXTURE_COSTS, by_model: [] }));
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="oplus-costs-by-model-empty"]');
      expect(empty).toBeTruthy();
    });
  });

  describe('by_agent table', () => {
    it('renders one row per agent bucket', () => {
      const rows = element.querySelectorAll('[data-testid^="oplus-costs-agent-row-"]');
      expect(rows.length).toBe(FIXTURE_COSTS.by_agent.length);
    });

    it('renders the agent key from BFF data', () => {
      const row = element.querySelector(
        '[data-testid="oplus-costs-agent-row-qgen_question"]',
      );
      expect(row).toBeTruthy();
      expect(row?.textContent).toContain('qgen_question');
    });

    it('renders an empty-state when no agent buckets', () => {
      stub.setCosts(liveState({ ...FIXTURE_COSTS, by_agent: [] }));
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="oplus-costs-by-agent-empty"]');
      expect(empty).toBeTruthy();
    });
  });

  describe('error / auditor gate states', () => {
    it('renders auditor gate on 403 forbidden error', () => {
      stub.setCosts(errorState('forbidden', 403));
      fixture.detectChanges();
      const gate = element.querySelector('[data-testid="oplus-costs-auditor-gate"]');
      expect(gate).toBeTruthy();
      // No tables while gated.
      const rows = element.querySelectorAll('[data-testid^="oplus-costs-model-row-"]');
      expect(rows.length).toBe(0);
    });

    it('renders error block on server error with no cached data', () => {
      stub.setCosts(errorState('server', 503));
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="oplus-costs-error"]');
      expect(err).toBeTruthy();
    });

    it('keeps showing tables in stale state (last-good data preserved)', () => {
      stub.setCosts(staleState(FIXTURE_COSTS));
      fixture.detectChanges();
      const rows = element.querySelectorAll('[data-testid^="oplus-costs-model-row-"]');
      expect(rows.length).toBe(FIXTURE_COSTS.by_model.length);
    });
  });

  describe('accessibility', () => {
    it('uses a heading (h1) for the page title', () => {
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
    });

    it('each breakdown table has an accessible name', () => {
      const tables = element.querySelectorAll('table');
      expect(tables.length).toBe(2);
      for (const t of Array.from(tables)) {
        expect(t.getAttribute('aria-label')?.length).toBeGreaterThan(0);
      }
    });
  });
});
