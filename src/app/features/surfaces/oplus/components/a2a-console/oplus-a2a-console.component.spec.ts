import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OplusA2aConsoleComponent } from './oplus-a2a-console.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { GovernanceService } from '../../../../../core/services/governance.service';
import {
  GovernanceServiceStub,
  FIXTURE_A2A_LIVE,
  FIXTURE_A2A_PENDING,
  liveState,
  staleState,
  errorState,
  loadingState,
} from '../../testing/governance.fixtures';
import type { A2aData } from '../../../../../core/services/governance.service';

describe('OplusA2aConsoleComponent', () => {
  let fixture: ComponentFixture<OplusA2aConsoleComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;

  beforeEach(async () => {
    stub = new GovernanceServiceStub();
    stub.setA2a(liveState(FIXTURE_A2A_LIVE));

    await TestBed.configureTestingModule({
      imports: [OplusA2aConsoleComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusA2aConsoleComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  describe('surface accent', () => {
    it('renders the .surface-oplus accent class on the screen root', () => {
      const root = element.querySelector('[data-testid="oplus-a2a-console-root"]');
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-oplus');
    });
  });

  describe('header', () => {
    it('renders the page title as h1', () => {
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
      const title = element.querySelector(
        '[data-testid="oplus-a2a-console-title"]',
      );
      expect(title?.textContent?.trim().length).toBeGreaterThan(0);
    });

    it('renders an Issue API key CTA (disabled — deferred to backend)', () => {
      const cta = element.querySelector(
        '[data-testid="oplus-a2a-issue-key"]',
      ) as HTMLButtonElement;
      expect(cta).toBeTruthy();
      expect(cta.disabled).toBe(true);
    });
  });

  describe('pending mode', () => {
    it('renders the "A2A backend deployment pending" banner', () => {
      stub.setA2a(liveState(FIXTURE_A2A_PENDING));
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="oplus-a2a-pending-banner"]');
      expect(banner).toBeTruthy();
    });

    it('omits the banner in live mode', () => {
      const banner = element.querySelector('[data-testid="oplus-a2a-pending-banner"]');
      expect(banner).toBeNull();
    });
  });

  describe('contracts section', () => {
    it('renders the contracts table with rows', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-a2a-contract-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_A2A_LIVE.contracts.length);
    });

    it('each contract row exposes status data attribute', () => {
      const rows = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-testid^="oplus-a2a-contract-row-"]',
        ),
      );
      for (const row of rows) {
        const status = row.dataset['status'];
        expect(['active', 'paused', 'pending', 'revoked']).toContain(status ?? '');
      }
    });

    it('renders at least one active + one paused contract from the fixture', () => {
      const active = element.querySelectorAll(
        '[data-testid^="oplus-a2a-contract-row-"][data-status="active"]',
      );
      const paused = element.querySelectorAll(
        '[data-testid^="oplus-a2a-contract-row-"][data-status="paused"]',
      );
      expect(active.length).toBeGreaterThanOrEqual(1);
      expect(paused.length).toBeGreaterThanOrEqual(1);
    });

    it('Pause/Resume partner buttons are disabled in this wave', () => {
      const buttons = element.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="oplus-a2a-contract-pause-"]',
      );
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of Array.from(buttons)) {
        expect(b.disabled).toBe(true);
      }
    });
  });

  describe('external agent identity browser', () => {
    it('renders the external agent table with AGIDs', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-a2a-agent-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_A2A_LIVE.external_agents.length);
    });

    it('each external agent exposes the AGID as data attribute (distinct from GCID)', () => {
      const rows = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-testid^="oplus-a2a-agent-row-"]',
        ),
      );
      for (const row of rows) {
        const agid = row.dataset['agid'];
        expect(agid).toBeTruthy();
        expect(agid?.startsWith('agid-')).toBe(true);
      }
    });
  });

  describe('invocation audit', () => {
    it('renders the invocation audit table', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-a2a-invocation-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_A2A_LIVE.invocations.length);
    });

    it('renders at least one denied invocation', () => {
      const denied = element.querySelectorAll(
        '[data-testid^="oplus-a2a-invocation-row-"][data-status="denied"]',
      );
      expect(denied.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('state branches', () => {
    it('renders auditor gate on 403 forbidden', () => {
      stub.setA2a(errorState('forbidden', 403));
      fixture.detectChanges();
      const gate = element.querySelector('[data-testid="oplus-a2a-auditor-gate"]');
      expect(gate).toBeTruthy();
    });

    it('renders error block on server error with no cached data', () => {
      stub.setA2a(errorState('server', 503));
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="oplus-a2a-error"]');
      expect(err).toBeTruthy();
    });

    it('keeps panels rendered in stale state', () => {
      stub.setA2a(staleState(FIXTURE_A2A_LIVE));
      fixture.detectChanges();
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-a2a-contract-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_A2A_LIVE.contracts.length);
      const live = element.querySelector('[data-testid="oplus-a2a-console-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('stale');
    });
  });

  describe('accessibility', () => {
    it('each table has caption or aria-label', () => {
      const tables = element.querySelectorAll('table');
      for (const t of Array.from(tables)) {
        const caption = t.querySelector('caption');
        const label = t.getAttribute('aria-label') || caption?.textContent;
        expect(label?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });
  });

  describe('ADR-132 A2A as core domain', () => {
    it('header explicitly names AGID (Agent identity) — distinct from GCID per ddd-enforcement', () => {
      const root = element.querySelector(
        '[data-testid="oplus-a2a-console-root"]',
      );
      expect((root?.textContent ?? '').toLowerCase()).toContain('agid');
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────
  // Drives the FALSE arm of `hasData(s) ? s.data : null` (→ data() = null),
  // the nullish-falsy arm of `data()?.mode`, the three `?? []` fallbacks,
  // the `badgeKey()` switch `default` (loading), the empty `@for` loops,
  // and the `deniedRecent() > 0` false arm (no alert chip).
  describe('loading state (data() === null)', () => {
    beforeEach(() => {
      stub.setA2a(loadingState<A2aData>());
      fixture.detectChanges();
    });

    it('renders neither the auditor gate nor the error block (the @else branch)', () => {
      expect(
        element.querySelector('[data-testid="oplus-a2a-auditor-gate"]'),
      ).toBeNull();
      expect(element.querySelector('[data-testid="oplus-a2a-error"]')).toBeNull();
    });

    it('omits the pending banner (data() is null → mode optional-chain falsy)', () => {
      expect(
        element.querySelector('[data-testid="oplus-a2a-pending-banner"]'),
      ).toBeNull();
    });

    it('renders zero contract / agent / invocation rows (empty ?? [] fallbacks)', () => {
      expect(
        element.querySelectorAll('[data-testid^="oplus-a2a-contract-row-"]').length,
      ).toBe(0);
      expect(
        element.querySelectorAll('[data-testid^="oplus-a2a-agent-row-"]').length,
      ).toBe(0);
      expect(
        element.querySelectorAll('[data-testid^="oplus-a2a-invocation-row-"]').length,
      ).toBe(0);
    });

    it('counter chips read 0 active / 0 paused (filter over empty array)', () => {
      const chips = element.querySelectorAll('.oplus-a2a__chip');
      const text = Array.from(chips)
        .map((c) => c.textContent ?? '')
        .join(' ');
      expect(text).toContain('0');
    });

    it('shows the loading badge variant via the switch default arm', () => {
      const live = element.querySelector(
        '[data-testid="oplus-a2a-console-live"]',
      ) as HTMLElement;
      expect(live.dataset['variant']).toBe('loading');
      expect(live.textContent ?? '').toContain('oplus.dashboard.badge_loading');
    });

    it('marks the root data-state as loading', () => {
      const root = element.querySelector(
        '[data-testid="oplus-a2a-console-root"]',
      ) as HTMLElement;
      expect(root.dataset['state']).toBe('loading');
    });
  });

  // ─── invocation alert chip — false arm of `deniedRecent() > 0` ───────
  describe('invocation audit — no denied invocations', () => {
    it('omits the alert chip when every invocation succeeded', () => {
      const noDenied: A2aData = {
        ...FIXTURE_A2A_LIVE,
        invocations: [
          {
            id: 'inv-ok',
            contract_id: 'c-001',
            agid: 'agid-7f3c9a2d-acme',
            partner: 'Partner X — Acme Research',
            endpoint: 'GET /a2a/v1/atoms/{id}',
            status: 'success',
            latency_ms: 88,
            timestamp: '2026-05-26T09:42:11Z',
          },
        ],
      };
      stub.setA2a(liveState(noDenied));
      fixture.detectChanges();

      expect(
        element.querySelectorAll(
          '[data-testid^="oplus-a2a-invocation-row-"][data-status="denied"]',
        ).length,
      ).toBe(0);
      const alertChip = element.querySelector('.oplus-a2a__chip[data-variant="alert"]');
      expect(alertChip).toBeNull();
    });
  });

  // ─── fmtTime — null arm renders the em-dash placeholder ─────────────
  describe('timestamp formatting (fmtTime)', () => {
    it('renders "—" for a null last_invocation and a real string for present ones', () => {
      const withNullTime: A2aData = {
        ...FIXTURE_A2A_LIVE,
        contracts: [
          {
            id: 'c-null',
            partner: 'Partner Null-Time',
            agid: 'agid-null-time',
            scope: ['read:atoms'],
            status: 'active',
            last_invocation: null,
            invocations_30d: 0,
            created_at: '2026-02-11T00:00:00Z',
          },
          {
            id: 'c-real',
            partner: 'Partner Real-Time',
            agid: 'agid-real-time',
            scope: ['read:atoms'],
            status: 'active',
            last_invocation: '2026-05-26T09:42:11Z',
            invocations_30d: 5,
            created_at: '2026-02-11T00:00:00Z',
          },
        ],
      };
      stub.setA2a(liveState(withNullTime));
      fixture.detectChanges();

      const nullRow = element.querySelector(
        '[data-testid="oplus-a2a-contract-row-c-null"]',
      ) as HTMLElement;
      const realRow = element.querySelector(
        '[data-testid="oplus-a2a-contract-row-c-real"]',
      ) as HTMLElement;

      // fmtTime(null) → '—'
      expect((nullRow.textContent ?? '')).toContain('–');
      // fmtTime(iso) → toLocaleString(), which renders a non-empty, non-dash value
      const realMutedCell = realRow.querySelector('.oplus-a2a__cell-muted');
      expect((realMutedCell?.textContent ?? '').trim().length).toBeGreaterThan(0);
      expect((realMutedCell?.textContent ?? '').trim()).not.toBe('—');
    });
  });

  // ─── scope chips — empty + non-empty inner @for loop ────────────────
  describe('contract scope rendering', () => {
    it('renders one chip per scope entry and none for an empty scope', () => {
      const mixedScope: A2aData = {
        ...FIXTURE_A2A_LIVE,
        contracts: [
          {
            id: 'c-empty-scope',
            partner: 'Partner Empty-Scope',
            agid: 'agid-empty-scope',
            scope: [],
            status: 'active',
            last_invocation: null,
            invocations_30d: 0,
            created_at: '2026-02-11T00:00:00Z',
          },
          {
            id: 'c-multi-scope',
            partner: 'Partner Multi-Scope',
            agid: 'agid-multi-scope',
            scope: ['read:atoms', 'read:topics', 'read:graph'],
            status: 'active',
            last_invocation: null,
            invocations_30d: 0,
            created_at: '2026-02-11T00:00:00Z',
          },
        ],
      };
      stub.setA2a(liveState(mixedScope));
      fixture.detectChanges();

      const emptyRow = element.querySelector(
        '[data-testid="oplus-a2a-contract-row-c-empty-scope"]',
      ) as HTMLElement;
      const multiRow = element.querySelector(
        '[data-testid="oplus-a2a-contract-row-c-multi-scope"]',
      ) as HTMLElement;

      expect(emptyRow.querySelectorAll('.oplus-a2a__scope-chip').length).toBe(0);
      expect(multiRow.querySelectorAll('.oplus-a2a__scope-chip').length).toBe(3);
    });
  });

  // ─── badge variant — stale arm + offline arm ────────────────────────
  describe('header badge variants', () => {
    it('maps a stale state to the "stale" badge (switch case stale)', () => {
      stub.setA2a(staleState(FIXTURE_A2A_LIVE));
      fixture.detectChanges();
      const live = element.querySelector(
        '[data-testid="oplus-a2a-console-live"]',
      ) as HTMLElement;
      expect(live.dataset['variant']).toBe('stale');
      expect(live.textContent ?? '').toContain('oplus.dashboard.badge_stale');
    });

    it('maps an error state to the "offline" badge (switch case offline)', () => {
      stub.setA2a(errorState('server', 503));
      fixture.detectChanges();
      const live = element.querySelector(
        '[data-testid="oplus-a2a-console-live"]',
      ) as HTMLElement;
      expect(live.dataset['variant']).toBe('offline');
      expect(live.textContent ?? '').toContain('oplus.dashboard.badge_offline');
    });
  });

  // ─── resume vs pause action label — both ternary arms ───────────────
  describe('contract pause/resume button label', () => {
    it('renders Resume for paused and Pause for active contracts', () => {
      // FIXTURE_A2A_LIVE has one active (c-001) + one paused (c-002).
      const activeBtn = element.querySelector(
        '[data-testid="oplus-a2a-contract-pause-c-001"]',
      ) as HTMLButtonElement;
      const pausedBtn = element.querySelector(
        '[data-testid="oplus-a2a-contract-pause-c-002"]',
      ) as HTMLButtonElement;

      expect((activeBtn.textContent ?? '')).toContain('oplus.a2a_console.pause_partner');
      expect((pausedBtn.textContent ?? '')).toContain('oplus.a2a_console.resume_partner');
    });
  });

  // ─── auditor-gate guard — non-forbidden error is NOT gated ──────────
  describe('auditor gate guard (isAuditorGated)', () => {
    it('does NOT show the auditor gate for a non-forbidden error (kind != forbidden)', () => {
      stub.setA2a(errorState('server', 503));
      fixture.detectChanges();
      // server error → error block, NOT the auditor gate
      expect(
        element.querySelector('[data-testid="oplus-a2a-auditor-gate"]'),
      ).toBeNull();
      expect(element.querySelector('[data-testid="oplus-a2a-error"]')).toBeTruthy();
    });
  });
});
