import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject, of, throwError } from 'rxjs';
import { OplusGovernanceComponent } from './oplus-governance.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { GovernanceService } from '../../../../../core/services/governance.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import {
  GovernanceServiceStub,
  FIXTURE_GOVERNANCE,
  liveState,
  staleState,
  errorState,
  loadingState,
} from '../../testing/governance.fixtures';

/** Minimal AuthService stub exposing only the `gcid()` signal accessor. */
class AuthServiceStub {
  gcidValue: string | null = 'operator-gcid-001';
  gcid = (): string | null => this.gcidValue;
}

/** BffClientService stub — `post` is a vi.fn returning a configurable Observable. */
class BffClientStub {
  post = vi.fn().mockReturnValue(of({}));
}

/** ToastService stub — `show` is a spy. */
class ToastServiceStub {
  show = vi.fn();
}

describe('OplusGovernanceComponent', () => {
  let fixture: ComponentFixture<OplusGovernanceComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;
  let bff: BffClientStub;
  let auth: AuthServiceStub;
  let toast: ToastServiceStub;

  beforeEach(async () => {
    stub = new GovernanceServiceStub();
    stub.setGovernance(liveState(FIXTURE_GOVERNANCE));
    bff = new BffClientStub();
    auth = new AuthServiceStub();
    toast = new ToastServiceStub();

    await TestBed.configureTestingModule({
      imports: [OplusGovernanceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
        { provide: BffClientService, useValue: bff },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusGovernanceComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  describe('surface accent', () => {
    it('renders the .surface-oplus accent class on the screen root', () => {
      const root = element.querySelector('[data-testid="oplus-governance-root"]');
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-oplus');
    });
  });

  describe('header', () => {
    it('renders the page title as h1', () => {
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
      const title = element.querySelector('[data-testid="oplus-governance-title"]');
      expect(title?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  describe('tab navigation', () => {
    it('renders 3 tabs (decisions / oversight / data)', () => {
      const tabs = element.querySelectorAll('[data-testid^="oplus-governance-tab-"]');
      expect(tabs.length).toBe(3);
    });

    it('decisions tab is selected by default', () => {
      const tab = element.querySelector(
        '[data-testid="oplus-governance-tab-decisions"]',
      );
      expect(tab?.getAttribute('aria-selected')).toBe('true');
    });

    it('clicking oversight tab selects it', () => {
      const tab = element.querySelector(
        '[data-testid="oplus-governance-tab-oversight"]',
      ) as HTMLButtonElement;
      tab.click();
      fixture.detectChanges();
      expect(tab.getAttribute('aria-selected')).toBe('true');
    });

    it('clicking data tab selects it', () => {
      const tab = element.querySelector(
        '[data-testid="oplus-governance-tab-data"]',
      ) as HTMLButtonElement;
      tab.click();
      fixture.detectChanges();
      expect(tab.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('decisions panel', () => {
    it('renders one row per BFF-sourced decision', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-governance-decision-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_GOVERNANCE.decisions.length);
    });

    it('renders the "View in Cloud Trace ↗" deep-link per row with a trace_id', () => {
      const link = element.querySelector(
        '[data-testid="oplus-governance-trace-d-001"]',
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.target).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      // Fixture provides cloud_trace_url so the link uses it verbatim.
      expect(link.href).toContain('console.cloud.google.com/traces');
      expect(link.href).toContain('abcdef1234567890abcdef1234567890');
    });

    it('omits the deep-link button when trace_id is null', () => {
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            {
              ...FIXTURE_GOVERNANCE.decisions[0],
              trace_id: null,
              cloud_trace_url: null,
            },
          ],
        }),
      );
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="oplus-governance-trace-d-001"]',
      );
      expect(link).toBeNull();
    });

    it('renders no deep-link when the BFF supplies no cloud_trace_url', () => {
      // The frontend never composes a console.cloud.google.com URL itself
      // (that would hard-code a cloud project into the bundle) — a trace the
      // BFF does not deep-link renders as plain text.
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            {
              ...FIXTURE_GOVERNANCE.decisions[0],
              cloud_trace_url: undefined,
            },
          ],
        }),
      );
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="oplus-governance-trace-d-001"]',
      ) as HTMLAnchorElement;
      expect(link).toBeNull();
    });

    it('row-click expands an inline reasoning chain for the whole workflow', () => {
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            {
              ...FIXTURE_GOVERNANCE.decisions[0],
              reasoning_summary: 'Stem clear; 4 plausible options; one key.',
              input_hash: 'sha256:aaa',
              output_hash: 'sha256:bbb',
            },
            { ...FIXTURE_GOVERNANCE.decisions[1] }, // same workflow_id → in the chain
          ],
        }),
      );
      fixture.detectChanges();

      // Collapsed by default.
      expect(
        element.querySelector('[data-testid="oplus-governance-reasoning-d-001"]'),
      ).toBeNull();

      const disclosure = element.querySelector(
        '[data-testid="oplus-governance-disclosure-d-001"]',
      ) as HTMLButtonElement;
      expect(disclosure.getAttribute('aria-expanded')).toBe('false');

      disclosure.click();
      fixture.detectChanges();

      const panel = element.querySelector(
        '[data-testid="oplus-governance-reasoning-d-001"]',
      );
      expect(panel).toBeTruthy();
      expect(disclosure.getAttribute('aria-expanded')).toBe('true');
      // The chain shows BOTH agents of the shared workflow (qgen_question + qgen_critic).
      const steps = element.querySelectorAll(
        '[data-testid^="oplus-governance-reasoning-step-"]',
      );
      expect(steps.length).toBe(2);
      // The agent's own rationale renders (IMDA D2 "why").
      expect(panel?.textContent).toContain('Stem clear; 4 plausible options; one key.');

      // Clicking again collapses the panel.
      disclosure.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="oplus-governance-reasoning-d-001"]'),
      ).toBeNull();
    });

    it('renders the prompt_conditions key→value list in the expanded panel when present (IMDA D2)', () => {
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            {
              ...FIXTURE_GOVERNANCE.decisions[0],
              prompt_conditions: {
                difficulty: 'intermediate',
                cognitive_level: 'apply',
                subject: 'biology',
              },
            },
          ],
        }),
      );
      fixture.detectChanges();

      // Collapsed by default — conditions are NOT in the DOM until expanded.
      expect(
        element.querySelector(
          '[data-testid="oplus-governance-prompt-conditions-d-001"]',
        ),
      ).toBeNull();

      const disclosure = element.querySelector(
        '[data-testid="oplus-governance-disclosure-d-001"]',
      ) as HTMLButtonElement;
      disclosure.click();
      fixture.detectChanges();

      const block = element.querySelector(
        '[data-testid="oplus-governance-prompt-conditions-d-001"]',
      );
      expect(block).toBeTruthy();
      // One key→value row per discriminant (keys are rendered sorted).
      const entries = element.querySelectorAll(
        '[data-testid^="oplus-governance-prompt-condition-d-001-"]',
      );
      expect(entries.length).toBe(3);
      expect(block?.textContent).toContain('difficulty');
      expect(block?.textContent).toContain('intermediate');
      expect(block?.textContent).toContain('cognitive_level');
      expect(block?.textContent).toContain('apply');
    });

    it('omits the prompt_conditions block when absent or empty (no fabrication)', () => {
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            // No prompt_conditions key at all.
            { ...FIXTURE_GOVERNANCE.decisions[0] },
            // Explicit empty map → nothing rendered.
            {
              ...FIXTURE_GOVERNANCE.decisions[1],
              prompt_conditions: {},
            },
          ],
        }),
      );
      fixture.detectChanges();

      const disclosure = element.querySelector(
        '[data-testid="oplus-governance-disclosure-d-001"]',
      ) as HTMLButtonElement;
      disclosure.click();
      fixture.detectChanges();

      // Panel is open (reasoning row present) but no conditions block renders.
      expect(
        element.querySelector('[data-testid="oplus-governance-reasoning-d-001"]'),
      ).toBeTruthy();
      expect(
        element.querySelector(
          '[data-testid="oplus-governance-prompt-conditions-d-001"]',
        ),
      ).toBeNull();
      expect(
        element.querySelector(
          '[data-testid="oplus-governance-prompt-conditions-d-002"]',
        ),
      ).toBeNull();
    });

    it('renders empty-state when no decisions', () => {
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [],
        }),
      );
      fixture.detectChanges();
      const empty = element.querySelector(
        '[data-testid="oplus-governance-decisions-empty"]',
      );
      expect(empty).toBeTruthy();
    });
  });

  describe('oversight panel', () => {
    beforeEach(() => {
      const tab = element.querySelector(
        '[data-testid="oplus-governance-tab-oversight"]',
      ) as HTMLButtonElement;
      tab.click();
      fixture.detectChanges();
    });

    it('renders HITL queue cards from BFF', () => {
      const cards = element.querySelectorAll(
        '[data-testid^="oplus-governance-hitl-card-"]',
      );
      expect(cards.length).toBe(FIXTURE_GOVERNANCE.hitl_pending.length);
    });

    it('Approve/Reject buttons are enabled (HITL verdicts are wired)', () => {
      const approve = element.querySelector(
        '[data-testid^="oplus-governance-hitl-approve-"]',
      ) as HTMLButtonElement;
      const reject = element.querySelector(
        '[data-testid^="oplus-governance-hitl-reject-"]',
      ) as HTMLButtonElement;
      expect(approve.disabled).toBe(false);
      expect(reject.disabled).toBe(false);
    });

    it('Approve POSTs the verdict to the BFF with the operator GCID', () => {
      const approve = element.querySelector(
        '[data-testid="oplus-governance-hitl-approve-h-001"]',
      ) as HTMLButtonElement;
      approve.click();
      fixture.detectChanges();
      expect(bff.post).toHaveBeenCalledTimes(1);
      const [path, body] = bff.post.mock.calls[0];
      expect(path).toBe('/bff/oplus/governance/hitl/h-001/approve');
      expect(body).toEqual({ operator_gcid: 'operator-gcid-001' });
    });

    it('Reject POSTs the verdict to the reject endpoint', () => {
      const reject = element.querySelector(
        '[data-testid="oplus-governance-hitl-reject-h-001"]',
      ) as HTMLButtonElement;
      reject.click();
      fixture.detectChanges();
      expect(bff.post).toHaveBeenCalledTimes(1);
      const [path] = bff.post.mock.calls[0];
      expect(path).toBe('/bff/oplus/governance/hitl/h-001/reject');
    });

    it('optimistically removes the actioned row on a successful verdict', () => {
      bff.post.mockReturnValue(of({}));
      const before = element.querySelectorAll(
        '[data-testid^="oplus-governance-hitl-card-"]',
      ).length;
      const approve = element.querySelector(
        '[data-testid="oplus-governance-hitl-approve-h-001"]',
      ) as HTMLButtonElement;
      approve.click();
      fixture.detectChanges();
      const card = element.querySelector(
        '[data-testid="oplus-governance-hitl-card-h-001"]',
      );
      expect(card).toBeNull();
      const after = element.querySelectorAll(
        '[data-testid^="oplus-governance-hitl-card-"]',
      ).length;
      expect(after).toBe(before - 1);
      expect(toast.show).toHaveBeenCalled();
    });

    it('shows an inline error and keeps the row on a failed verdict', () => {
      bff.post.mockReturnValue(throwError(() => ({ status: 500 })));
      const reject = element.querySelector(
        '[data-testid="oplus-governance-hitl-reject-h-001"]',
      ) as HTMLButtonElement;
      reject.click();
      fixture.detectChanges();
      // Row stays visible.
      const card = element.querySelector(
        '[data-testid="oplus-governance-hitl-card-h-001"]',
      );
      expect(card).toBeTruthy();
      // Inline error alert is rendered.
      const err = element.querySelector(
        '[data-testid="oplus-governance-hitl-action-error"]',
      );
      expect(err).toBeTruthy();
      expect(toast.show).toHaveBeenCalled();
    });

    it('does not POST when no operator GCID is available', () => {
      auth.gcidValue = null;
      const approve = element.querySelector(
        '[data-testid="oplus-governance-hitl-approve-h-001"]',
      ) as HTMLButtonElement;
      approve.click();
      fixture.detectChanges();
      expect(bff.post).not.toHaveBeenCalled();
      const err = element.querySelector(
        '[data-testid="oplus-governance-hitl-action-error"]',
      );
      expect(err).toBeTruthy();
    });

    it('exposes autonomy level on each HITL card', () => {
      const cards = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-testid^="oplus-governance-hitl-card-"]',
        ),
      );
      for (const card of cards) {
        const level = card.dataset['autonomyLevel'];
        expect(['HOOTL', 'HOTL', 'HITL-L0', 'HITL-L1', 'HITL-L2']).toContain(
          level ?? '',
        );
      }
    });

    it('renders the localised "unassigned" string when assignee is null', () => {
      // The h-002 fixture row carries `assignee: null` to exercise the
      // unassigned semantic introduced by migration 0008 (hitl_decision_log
      // .assignee_gcid). The BFF passes that null through verbatim and the
      // template falls through to the localised "Unassigned" label.
      const card = element.querySelector(
        '[data-testid="oplus-governance-hitl-card-h-002"]',
      );
      expect(card).toBeTruthy();
      const meta = card?.querySelector(
        '.oplus-governance__hitl-meta--unassigned',
      );
      expect(meta).toBeTruthy();
      // i18n in tests resolves to the key path because the real translation
      // loader is bypassed — assert the rendered text contains the key.
      expect(meta?.textContent?.trim()).toContain(
        'oplus.governance.assignee_unassigned',
      );
    });

    it('renders the literal GCID when assignee is a non-null string', () => {
      // The h-001 fixture row carries `assignee: 'assessor-alice'`.
      const card = element.querySelector(
        '[data-testid="oplus-governance-hitl-card-h-001"]',
      );
      expect(card).toBeTruthy();
      const unassignedMeta = card?.querySelector(
        '.oplus-governance__hitl-meta--unassigned',
      );
      expect(unassignedMeta).toBeNull();
      expect(card?.textContent ?? '').toContain('assessor-alice');
    });
  });

  describe('data panel', () => {
    beforeEach(() => {
      const tab = element.querySelector(
        '[data-testid="oplus-governance-tab-data"]',
      ) as HTMLButtonElement;
      tab.click();
      fixture.detectChanges();
    });

    it('renders the lineage table from BFF', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-governance-lineage-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_GOVERNANCE.data_lineage.length);
    });

    it('renders the RACI matrix with 4 quadrants from the static config', () => {
      const cards = element.querySelectorAll(
        '[data-testid^="oplus-governance-raci-card-"]',
      );
      expect(cards.length).toBe(4);
    });

    it('each RACI card exposes role data attribute', () => {
      const roles = Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-testid^="oplus-governance-raci-card-"]',
        ),
      ).map((c) => c.dataset['role']);
      expect(roles).toContain('Responsible');
      expect(roles).toContain('Accountable');
      expect(roles).toContain('Consulted');
      expect(roles).toContain('Informed');
    });
  });

  describe('state branches', () => {
    it('renders auditor gate on 403 forbidden', () => {
      stub.setGovernance(errorState('forbidden', 403));
      fixture.detectChanges();
      const gate = element.querySelector('[data-testid="oplus-governance-auditor-gate"]');
      expect(gate).toBeTruthy();
    });

    it('renders error block on server error with no cached data', () => {
      stub.setGovernance(errorState('server', 503));
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="oplus-governance-error"]');
      expect(err).toBeTruthy();
    });

    it('keeps panels rendered in stale state', () => {
      stub.setGovernance(staleState(FIXTURE_GOVERNANCE));
      fixture.detectChanges();
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-governance-decision-row-"]',
      );
      expect(rows.length).toBe(FIXTURE_GOVERNANCE.decisions.length);
      const live = element.querySelector('[data-testid="oplus-governance-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('stale');
    });
  });

  describe('IMDA D1 accountability tie-in', () => {
    it('decisions panel references D1 accountability dimension', () => {
      const heading = element.querySelector(
        '[data-testid="oplus-governance-decisions-heading"]',
      );
      expect(heading?.textContent?.toLowerCase()).toContain('d1');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // BRANCH-COVERAGE AUGMENTATION
  //
  // The DOM-driven suite above covers the live / stale / error visual
  // states. The cases below target the remaining UNCOVERED conditional
  // arms reachable via the public/protected component API.
  // ───────────────────────────────────────────────────────────────────

  /** Reach the protected computed/method surface for characterization. */
  function instance(): Record<string, unknown> {
    return fixture.componentInstance as unknown as Record<string, unknown>;
  }
  function read<T>(name: string): T {
    return (instance()[name] as () => T)();
  }
  function invoke<T>(name: string, ...args: unknown[]): T {
    return (instance()[name] as (...a: unknown[]) => T).apply(
      fixture.componentInstance,
      args,
    );
  }

  describe('badgeKey switch — loading default arm', () => {
    it('returns badge_loading in the loading state (switch default)', () => {
      stub.setGovernance(loadingState());
      fixture.detectChanges();
      expect(read<string>('badgeKey')).toBe('oplus.dashboard.badge_loading');
      const live = element.querySelector(
        '[data-testid="oplus-governance-live"]',
      ) as HTMLElement;
      expect(live.dataset['variant']).toBe('loading');
    });

    it('returns badge_live in the live state (switch live arm)', () => {
      // live is the default fixture state — assert the live arm explicitly.
      expect(read<string>('badgeKey')).toBe('oplus.dashboard.badge_live');
    });
  });

  describe('isAuditorGated && short-circuit arms', () => {
    it('false in the loading state (1st term `state === error` is false)', () => {
      stub.setGovernance(loadingState());
      fixture.detectChanges();
      expect(read<boolean>('isAuditorGated')).toBe(false);
    });

    it('false on a non-forbidden error (2nd term `kind === forbidden` is false)', () => {
      stub.setGovernance(errorState('server', 503));
      fixture.detectChanges();
      expect(read<boolean>('isAuditorGated')).toBe(false);
    });

    it('true on a forbidden error (both `&&` terms truthy)', () => {
      stub.setGovernance(errorState('forbidden', 403));
      fixture.detectChanges();
      expect(read<boolean>('isAuditorGated')).toBe(true);
    });
  });

  describe('hasErrorOnly first-term short-circuit', () => {
    it('false in the loading state (1st term `state === error` is false)', () => {
      stub.setGovernance(loadingState());
      fixture.detectChanges();
      expect(read<boolean>('hasErrorOnly')).toBe(false);
    });

    it('true on an error state with no cached data', () => {
      stub.setGovernance(errorState('network'));
      fixture.detectChanges();
      expect(read<boolean>('hasErrorOnly')).toBe(true);
    });
  });

  describe('errorKey ternary arms', () => {
    it('returns the error messageKey on the error branch (truthy arm)', () => {
      stub.setGovernance(errorState('unauthorized', 401));
      fixture.detectChanges();
      expect(read<string>('errorKey')).toBe('oplus.errors.unauthorized');
    });

    it('returns the generic fallback when not in an error state (falsy arm)', () => {
      stub.setGovernance(loadingState());
      fixture.detectChanges();
      expect(read<string>('errorKey')).toBe('oplus.errors.generic');
    });
  });

  describe('data computed — hasData ? data : null falsy arm', () => {
    it('exposes null-derived empty counts in the loading state', () => {
      stub.setGovernance(loadingState());
      fixture.detectChanges();
      expect(read<number>('decisionCount')).toBe(0);
      expect(read<number>('hitlCount')).toBe(0);
      expect(read<number>('lineageCount')).toBe(0);
    });
  });

  describe('cloudTraceUrlOf — trace_id fallback then null arm', () => {
    it('returns null when both cloud_trace_url and trace_id are absent', () => {
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            {
              ...FIXTURE_GOVERNANCE.decisions[0],
              cloud_trace_url: null,
              trace_id: null,
            },
          ],
        }),
      );
      fixture.detectChanges();
      const decisions = read<readonly { cloud_trace_url: string | null }[]>(
        'decisions',
      );
      expect(decisions[0].cloud_trace_url).toBeNull();
    });

    it('renders no deep-link when the BFF supplies neither cloud_trace_url nor a usable one', () => {
      // The frontend never composes a console.cloud.google.com URL itself
      // (that would hard-code a cloud project into the bundle) — a trace the
      // BFF does not deep-link renders as plain text.
      stub.setGovernance(
        liveState({
          ...FIXTURE_GOVERNANCE,
          decisions: [
            {
              ...FIXTURE_GOVERNANCE.decisions[0],
              cloud_trace_url: undefined,
              trace_id: 'tid-fallback',
            },
          ],
        }),
      );
      fixture.detectChanges();
      const decisions = read<readonly { cloud_trace_url: string | null }[]>(
        'decisions',
      );
      expect(decisions[0].cloud_trace_url).toBeNull();
    });
  });

  describe('isActive / tab id helpers', () => {
    it('isActive is false for tabs other than the active one', () => {
      expect(invoke<boolean>('isActive', 'decisions')).toBe(true);
      expect(invoke<boolean>('isActive', 'oversight')).toBe(false);
      expect(invoke<boolean>('isActive', 'data')).toBe(false);
    });

    it('tabPanelId/tabId compose stable ids', () => {
      expect(invoke<string>('tabPanelId', 'data')).toBe(
        'oplus-governance-panel-data',
      );
      expect(invoke<string>('tabId', 'oversight')).toBe(
        'oplus-governance-tab-oversight',
      );
    });
  });

  describe('fmtTime / verdictLabel', () => {
    it('fmtTime formats a valid ISO timestamp (try arm)', () => {
      const out = invoke<string>('fmtTime', '2026-06-04T10:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('fmtTime characterizes the unparseable-date path (no throw in jsdom)', () => {
      // `new Date('nope').toLocaleString()` returns "Invalid Date" rather than
      // throwing, so the catch is a dead defensive guard — characterize the
      // actual returned value to keep the spec green.
      expect(invoke<string>('fmtTime', 'nope')).toBe('Invalid Date');
    });

    it('verdictLabel humanizes known verdicts and title-cases unknowns', () => {
      // The auditor-facing "Decision" column renders the agent verdict, never
      // the LogID. Known enums map to plain-language outcomes; unknown values
      // title-case so the column is never a meaningless id or blank.
      expect(invoke<string>('verdictLabel', 'accepted')).toBe('Approved');
      expect(invoke<string>('verdictLabel', 'rejected')).toBe('Rejected');
      expect(invoke<string>('verdictLabel', 'refused')).toBe('Refused');
      expect(invoke<string>('verdictLabel', 'completed_with_warning')).toBe(
        'Approved with warning',
      );
      expect(invoke<string>('verdictLabel', 'some_new_verdict')).toBe(
        'Some New Verdict',
      );
      expect(invoke<string>('verdictLabel', '')).toBe('–');
    });
  });

  describe('isHitlBusy / submitHitlVerdict double-submit guard', () => {
    beforeEach(() => {
      const tab = element.querySelector(
        '[data-testid="oplus-governance-tab-oversight"]',
      ) as HTMLButtonElement;
      tab.click();
      fixture.detectChanges();
    });

    it('isHitlBusy is false before any verdict is submitted', () => {
      expect(invoke<boolean>('isHitlBusy', 'h-001')).toBe(false);
    });

    it('marks the id busy while a verdict is in flight and early-returns a 2nd submit', () => {
      // A non-completing Observable keeps the verdict "in flight" so the
      // pending-id guard stays armed for the duration of the test.
      const inflight = new Subject<unknown>();
      bff.post.mockReturnValue(inflight.asObservable());

      invoke<void>('approveHitlItem', 'h-001');
      fixture.detectChanges();
      expect(bff.post).toHaveBeenCalledTimes(1);
      expect(invoke<boolean>('isHitlBusy', 'h-001')).toBe(true);

      // Second submit while the first is in flight → early `return` (no POST).
      invoke<void>('approveHitlItem', 'h-001');
      expect(bff.post).toHaveBeenCalledTimes(1);

      // Complete the in-flight verdict so nothing dangles.
      inflight.next({});
      inflight.complete();
      fixture.detectChanges();
      expect(invoke<boolean>('isHitlBusy', 'h-001')).toBe(false);
    });
  });
});
