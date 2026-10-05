import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, computed, signal, WritableSignal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, type Observable } from 'rxjs';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';

import { DashboardComponent } from './dashboard.component';
import { DashboardService } from './dashboard.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import type { MeManaLoadState, UserMana } from '../../../../core/services/me-mana.model';
import { GoalService } from './goal/goal.service';
import type { GoalDTO, PrimaryLens } from './goal/goal.model';
import type { DashboardState } from './dashboard.model';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DEFAULT_ORDER, type WrapperKey } from './dashboard-layout.model';
import { MapPreviewCardComponent } from './map-preview-card/map-preview-card.component';
import { CastCardComponent } from './cast-card/cast-card.component';
import { ContinueLearningCardComponent } from './continue-learning-card/continue-learning-card.component';
import { NotificationsTickerComponent } from './notifications-ticker/notifications-ticker.component';
import { HeaderGoalControlComponent } from './header-goal-control/header-goal-control.component';
import {
  buildDashboardSummary,
  buildLearnerCourseSummary,
  buildInstructorCourseSummary,
} from '../../../../testing/builders/buildDashboardSummary';

/**
 * A+ Dashboard component spec — SP2.2 "dashboard-as-hub" three-tier shell.
 *
 * The learner view is restructured into three tiers:
 *   1. a fixed Header (greeting + GCID pill + goal control + Today's Dose CTA),
 *   2. a conditional NotificationsTicker (always mounted; self-collapses empty),
 *   3. a cdkDropList column of draggable wrapper cards (map / cast / courses),
 *      ordered by `DashboardLayoutService.order()`, each with a drag handle.
 *
 * The map hero, the adaptive credential/curiosity lens, the standalone streak
 * pill, the growth-edges tally, the learner course tiles, and the Familiar
 * switcher strip are RETIRED from the shell — their concerns now live in the
 * self-contained wrapper components (each with its own spec) and the ticker,
 * which is now the SOLE celebration detector on the dashboard route (no more
 * grew-edge / goal-graduated toasts in the shell).
 *
 * Preserved: fail-loud loading/error/success states, the identity header,
 * mana pocket, partial-notice, one-shot banner, the no-role fallback, and the
 * browse-catalog footer.
 *
 * Role visibility is THREE-WAY and additive (learner hub / author card /
 * instructor card). `author` and `instructor` are distinct: the instructor
 * panel that once served both is deleted, since courses belong to R+.
 *
 * The wrapper cards + ticker are STUBBED here (test-pyramid: the shell spec
 * asserts wiring/order/drag; each wrapper's own spec asserts its internals).
 */

// ── Wrapper + ticker stubs (swapped in via TestBed.overrideComponent) ───────
@Component({ selector: 'chora-aplus-map-preview-card', standalone: true, template: '' })
class StubMapPreviewCardComponent {}
@Component({ selector: 'chora-aplus-cast-card', standalone: true, template: '' })
class StubCastCardComponent {}
@Component({ selector: 'chora-aplus-continue-learning-card', standalone: true, template: '' })
class StubContinueLearningCardComponent {}
@Component({ selector: 'chora-aplus-notifications-ticker', standalone: true, template: '' })
class StubNotificationsTickerComponent {}
@Component({ selector: 'chora-aplus-header-goal-control', standalone: true, template: '' })
class StubHeaderGoalControlComponent {}

// ── MockDashboardService ────────────────────────────────────────────────────
class MockDashboardService {
  readonly _state: WritableSignal<DashboardState> = signal<DashboardState>({
    status: 'loading',
  });
  readonly state = this._state.asReadonly();
  loadCalls = 0;
  setState(s: DashboardState): void {
    this._state.set(s);
  }
  load(): void {
    this.loadCalls += 1;
  }
}

function makeMock(): MockDashboardService {
  const mock = new MockDashboardService();
  Object.defineProperty(mock, 'summary', {
    value: () => {
      const s = mock._state();
      return s.status === 'success' ? s.summary : null;
    },
  });
  return mock;
}

// ── MockMeManaService — the mana pocket (CHO-1989) injects this. ─────────────
const ZERO_MANA: UserMana = { balance_units: 0, lifetime_earned: 0, lifetime_spent: 0 };
class MockMeManaService {
  readonly loadState = signal<MeManaLoadState>({ status: 'success', mana: ZERO_MANA });
  readonly balanceUnits = signal(0);
  readonly mana = signal<UserMana | null>(ZERO_MANA);
  load(): void {
    /* no-op — the pocket calls this on init; nothing to fetch in tests. */
  }
}

// ── MockAuthService ─────────────────────────────────────────────────────────
interface MockAuthUser {
  gcid: string;
  roles: string[];
  displayName: string;
  email: string;
  tenantId: string;
  capabilities: string[];
}
class MockAuthService {
  readonly _user = signal<MockAuthUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = () => this._user() !== null;
  readonly gcid = computed<string | null>(() => this._user()?.gcid ?? null);
  setRoles(roles: string[]): void {
    this._user.set({
      gcid: 'gcid-test-01',
      roles,
      displayName: 'Phyllis Tan',
      email: 'phyllis@chora.test',
      tenantId: 'tenant-01',
      capabilities: roles,
    });
  }
  clearUser(): void {
    this._user.set(null);
  }
}

/** Local Goal builder — no inline object literals in specs (CLAUDE.md §6). */
function buildGoal(overrides: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g-1',
    kind: 'curiosity',
    conceptSet: ['fractions'],
    status: 'active',
    northStarNote: '',
    createdAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    ...overrides,
  };
}

// ── MockGoalService — the header goal control reads `activeGoal` + calls
// load(); the goal picker (when open) calls create(). ────────────────────────
class MockGoalService {
  readonly _lens = signal<PrimaryLens>('curiosity');
  readonly _active = signal<GoalDTO | null>(null);
  readonly _goals = signal<readonly GoalDTO[]>([]);
  readonly primaryLens = this._lens.asReadonly();
  readonly activeGoal = this._active.asReadonly();
  readonly goals = this._goals.asReadonly();
  loadCalls = 0;
  createResult: GoalDTO = buildGoal({ goalId: 'g-new' });
  load(): void {
    this.loadCalls += 1;
  }
  create(): Observable<GoalDTO> {
    return of(this.createResult);
  }
  update(): Observable<GoalDTO> {
    return of(this.createResult);
  }
  setActiveGoal(goal: GoalDTO | null): void {
    this._active.set(goal);
  }
  setGoals(goals: readonly GoalDTO[]): void {
    this._goals.set(goals);
  }
}

// ── MockDashboardLayoutService (SP2.1) — the shell reads `order()`, calls
// load() on construct, and reorder() on drop. ────────────────────────────────
class MockDashboardLayoutService {
  readonly _order = signal<readonly WrapperKey[]>([...DEFAULT_ORDER]);
  readonly order = this._order.asReadonly();
  loadCalls = 0;
  reorderCalls = 0;
  lastReorder: readonly WrapperKey[] | null = null;
  load(): void {
    this.loadCalls += 1;
  }
  reorder(next: readonly WrapperKey[]): void {
    this.reorderCalls += 1;
    this.lastReorder = next;
    this._order.set([...next]);
  }
  setOrder(order: readonly WrapperKey[]): void {
    this._order.set([...order]);
  }
}

// ── Setup helper ────────────────────────────────────────────────────────────
interface SetupResult {
  fixture: ComponentFixture<DashboardComponent>;
  mock: MockDashboardService;
  authMock: MockAuthService;
  goalMock: MockGoalService;
  layoutMock: MockDashboardLayoutService;
}

function setup(initialRoles: string[] = ['learner']): SetupResult {
  const mock = makeMock();
  const authMock = new MockAuthService();
  authMock.setRoles(initialRoles);
  const goalMock = new MockGoalService();
  const layoutMock = new MockDashboardLayoutService();

  TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: DashboardService, useValue: mock },
      { provide: AuthService, useValue: authMock },
      { provide: MeManaService, useValue: new MockMeManaService() },
      { provide: GoalService, useValue: goalMock },
      { provide: DashboardLayoutService, useValue: layoutMock },
    ],
  });
  // Swap the heavy self-contained wrappers + ticker for inert stubs — their own
  // specs cover their internals; here we only test the shell's wiring + order.
  TestBed.overrideComponent(DashboardComponent, {
    remove: {
      imports: [
        MapPreviewCardComponent,
        CastCardComponent,
        ContinueLearningCardComponent,
        NotificationsTickerComponent,
        HeaderGoalControlComponent,
      ],
    },
    add: {
      imports: [
        StubMapPreviewCardComponent,
        StubCastCardComponent,
        StubContinueLearningCardComponent,
        StubNotificationsTickerComponent,
        StubHeaderGoalControlComponent,
      ],
    },
  });

  const fixture = TestBed.createComponent(DashboardComponent);
  fixture.detectChanges();
  return { fixture, mock, authMock, goalMock, layoutMock };
}

// ── Setup helper with query params (drives detectBanner) ────────────────────
function setupWithQueryParams(
  queryParams: Record<string, string>,
  initialRoles: string[] = ['learner'],
): { fixture: ComponentFixture<DashboardComponent>; mock: MockDashboardService } {
  const mock = makeMock();
  const authMock = new MockAuthService();
  authMock.setRoles(initialRoles);

  TestBed.configureTestingModule({
    imports: [DashboardComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: DashboardService, useValue: mock },
      { provide: AuthService, useValue: authMock },
      { provide: MeManaService, useValue: new MockMeManaService() },
      { provide: GoalService, useValue: new MockGoalService() },
      { provide: DashboardLayoutService, useValue: new MockDashboardLayoutService() },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });
  TestBed.overrideComponent(DashboardComponent, {
    remove: {
      imports: [
        MapPreviewCardComponent,
        CastCardComponent,
        ContinueLearningCardComponent,
        NotificationsTickerComponent,
        HeaderGoalControlComponent,
      ],
    },
    add: {
      imports: [
        StubMapPreviewCardComponent,
        StubCastCardComponent,
        StubContinueLearningCardComponent,
        StubNotificationsTickerComponent,
        StubHeaderGoalControlComponent,
      ],
    },
  });
  const fixture = TestBed.createComponent(DashboardComponent);
  mock.setState({ status: 'success', summary: buildDashboardSummary() });
  fixture.detectChanges();
  return { fixture, mock };
}

/** Wrapper keys in DOM order (from the shell's `data-wrapper-key` markers). */
function wrapperKeysInDom(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('[data-testid="aplus-dashboard-wrapper"]')).map(
    (w) => w.getAttribute('data-wrapper-key') ?? '',
  );
}

// ─────────────────────────────────────────────────────────────────────────
describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let element: HTMLElement;
  let mock: MockDashboardService;
  let authMock: MockAuthService;
  let goalMock: MockGoalService;
  let layoutMock: MockDashboardLayoutService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    fixture = result.fixture;
    mock = result.mock;
    authMock = result.authMock;
    goalMock = result.goalMock;
    layoutMock = result.layoutMock;
    element = fixture.nativeElement as HTMLElement;
  });

  // ── Surface shell + loads on construct ──────────────────────────────────
  describe('surface shell + load on construct', () => {
    it('renders with the surface-aplus accent class', () => {
      const root = element.querySelector('[data-testid="aplus-dashboard"]');
      expect(root?.className).toContain('surface-aplus');
    });

    it('carries the shared A+ Learn hub-page geometry class (CHO-2340)', () => {
      // All 6 Learn hub sections share `.aplus-hub-page` so the sub-nav pill
      // lands at an identical offset/width; the per-page padding/max-width is
      // gone. Here we assert the dashboard opts in (the cross-page anti-drift
      // guard lives in courses-sub-nav/hub-page-layout.spec.ts).
      const root = element.querySelector('[data-testid="aplus-dashboard"]');
      expect(root?.className).toContain('aplus-hub-page');
    });

    it('calls DashboardService.load() exactly once on construct', () => {
      expect(mock.loadCalls).toBe(1);
    });

    it('calls GoalService.load() exactly once on construct', () => {
      expect(goalMock.loadCalls).toBe(1);
    });

    it('calls DashboardLayoutService.load() exactly once on construct', () => {
      expect(layoutMock.loadCalls).toBe(1);
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders the loading panel while the service is loading', () => {
      const loading = element.querySelector('[data-testid="aplus-dashboard-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      expect(loading?.getAttribute('role')).toBe('status');
    });
  });

  // ── Error state ────────────────────────────────────────────────────────
  describe('error state (fail-loud)', () => {
    beforeEach(() => {
      mock.setState({ status: 'error', error: 'aplus.dashboard.error_upstream' });
      fixture.detectChanges();
    });

    it('renders the fail-loud error banner with role=alert', () => {
      const err = element.querySelector('[data-testid="aplus-dashboard-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('renders a retry button that re-calls load()', () => {
      const retry = element.querySelector(
        '[data-testid="aplus-dashboard-retry"]',
      ) as HTMLButtonElement;
      expect(retry).not.toBeNull();
      retry.click();
      expect(mock.loadCalls).toBe(2);
    });
  });

  // ── Success state — identity header + footer ────────────────────────────
  describe('success state — identity header + footer', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        summary: buildDashboardSummary({
          gcidPillLabel: 'ONE IDENTITY · GCID active',
          userDisplayName: 'Phyllis Tan',
        }),
      });
      fixture.detectChanges();
    });

    it('renders the fixed header with the GCID pill and display name', () => {
      const header = element.querySelector('[data-testid="aplus-dashboard-header"]');
      expect(header).not.toBeNull();
      const identity = element.querySelector('[data-testid="aplus-dashboard-identity"]');
      expect(identity?.textContent).toContain('GCID');
      expect(identity?.textContent).toContain('Phyllis Tan');
    });

    it('retires the standalone 5-stat grid', () => {
      expect(element.querySelector('[data-testid="aplus-dashboard-stats"]')).toBeNull();
      expect(element.querySelector('.stat-mini')).toBeNull();
    });

    it('renders a browse-catalog footer link', () => {
      const link = element.querySelector('[data-testid="aplus-dashboard-browse-catalog"]');
      expect(link?.getAttribute('href')).toContain('/a/catalog');
    });

    it('does NOT render the partial notice on a healthy response', () => {
      expect(element.querySelector('[data-testid="aplus-dashboard-partial-notice"]')).toBeNull();
    });

    it('renders the mana cell with a Top-up CTA to the one Wallet (CHO-2238)', () => {
      // CHO-1989 pointed this at /a/mana-pool; the one-wallet ruling
      // (2026-07-17) unified balance + top-up + timeline at /a/wallet.
      const pocket = element.querySelector('[data-testid="aplus-dashboard-mana"]');
      expect(pocket).not.toBeNull();
      const topup = element.querySelector('[data-testid="aplus-dashboard-mana-topup"]');
      expect(topup?.getAttribute('href')).toBe('/a/wallet');
    });

    it('folds the mana cell INSIDE the unified header (one surface, no separate slab)', () => {
      const header = element.querySelector('[data-testid="aplus-dashboard-header"]');
      const mana = element.querySelector('[data-testid="aplus-dashboard-mana"]');
      expect(header).not.toBeNull();
      expect(mana).not.toBeNull();
      expect(header?.contains(mana as Node)).toBe(true);
    });
  });

  // ── Unified header: identity role badges + today strip ──────────────────────
  describe('unified header: role badges + today strip', () => {
    it('renders the learner display name with role badges from the JWT roles', () => {
      TestBed.resetTestingModule();
      const r = setup(['learner', 'author', 'admin']);
      r.mock.setState({
        status: 'success',
        summary: buildDashboardSummary({ userDisplayName: 'Dale' }),
      });
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      const identity = el.querySelector('[data-testid="aplus-dashboard-identity"]');
      expect(identity?.textContent).toContain('Dale');
      // Every held role gets a badge…
      expect(el.querySelector('[data-testid="aplus-dashboard-role-learner"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-role-author"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-role-admin"]')).not.toBeNull();
      // …and a role NOT held renders no badge.
      expect(el.querySelector('[data-testid="aplus-dashboard-role-auditor"]')).toBeNull();
    });

    it('renders the streak cell in the learner strip with the real day count', () => {
      authMock.setRoles(['learner']);
      mock.setState({
        status: 'success',
        summary: buildDashboardSummary({ streak: { current_streak_days: 5 } }),
      });
      fixture.detectChanges();
      const streak = element.querySelector('[data-testid="aplus-dashboard-streak"]');
      expect(streak).not.toBeNull();
      expect(streak?.textContent).toContain('5');
    });

    it('hides the streak cell for a non-learner (streak is a learner concept)', () => {
      TestBed.resetTestingModule();
      const r = setup(['instructor']);
      r.mock.setState({ status: 'success', summary: buildDashboardSummary() });
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-dashboard-streak"]')).toBeNull();
    });
  });

  // ── CHO-2340: badges reconcile with H+ Members (membership roles only) ──────
  describe('role badges reconcile with H+ Members (CHO-2340)', () => {
    // H+ Members shows the tenant-membership roles; the A+ dashboard now matches
    // it. The JWT-only / non-membership labels (training_admin / tenant_admin /
    // platform_operator) are NO LONGER badged even when the session holds them,
    // and the elevated membership roles (admin / auditor) render as a clearly
    // legible pill, not the old near-invisible muted-grey "ops" pill.
    function renderWith(roles: string[]): HTMLElement {
      TestBed.resetTestingModule();
      const r = setup(roles);
      r.mock.setState({ status: 'success', summary: buildDashboardSummary() });
      r.fixture.detectChanges();
      return r.fixture.nativeElement as HTMLElement;
    }

    it('does NOT badge JWT-only / non-membership roles (platform_operator, training_admin, tenant_admin)', () => {
      const el = renderWith(['learner', 'platform_operator', 'training_admin', 'tenant_admin']);
      expect(el.querySelector('[data-testid="aplus-dashboard-role-platform_operator"]')).toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-role-training_admin"]')).toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-role-tenant_admin"]')).toBeNull();
      // The membership role held alongside them still badges.
      expect(el.querySelector('[data-testid="aplus-dashboard-role-learner"]')).not.toBeNull();
    });

    it('badges exactly the membership roles for a mixed elevated session', () => {
      // The owner account case: membership + JWT-only labels held at once. Only
      // {Learner, Author, Instructor, Admin} may badge (auditor is not held).
      const el = renderWith([
        'learner',
        'author',
        'instructor',
        'admin',
        'training_admin',
        'platform_operator',
      ]);
      const badged = Array.from(el.querySelectorAll('[data-testid^="aplus-dashboard-role-"]'))
        .map((n) => n.getAttribute('data-testid'))
        .sort();
      expect(badged).toEqual([
        'aplus-dashboard-role-admin',
        'aplus-dashboard-role-author',
        'aplus-dashboard-role-instructor',
        'aplus-dashboard-role-learner',
      ]);
    });

    it('renders the admin badge as a clearly-legible elevated pill, not the muted ops pill', () => {
      const admin = renderWith(['learner', 'admin']).querySelector(
        '[data-testid="aplus-dashboard-role-admin"]',
      );
      expect(admin).not.toBeNull();
      // Elevated modifier present (the clear/legible treatment) …
      expect(admin?.classList.contains('dashboard__role-pill--elevated')).toBe(true);
      // … and the retired near-invisible muted "ops" modifier is gone entirely.
      expect(admin?.classList.contains('dashboard__role-pill--ops')).toBe(false);
    });

    it('marks elevated (admin) distinctly from content roles (learner)', () => {
      const el = renderWith(['learner', 'admin']);
      const learner = el.querySelector('[data-testid="aplus-dashboard-role-learner"]');
      const admin = el.querySelector('[data-testid="aplus-dashboard-role-admin"]');
      // Content role: no elevated modifier. Elevated role: elevated modifier.
      expect(learner?.classList.contains('dashboard__role-pill--elevated')).toBe(false);
      expect(admin?.classList.contains('dashboard__role-pill--elevated')).toBe(true);
      // Neither carries the retired muted "ops" class.
      expect(learner?.classList.contains('dashboard__role-pill--ops')).toBe(false);
      expect(admin?.classList.contains('dashboard__role-pill--ops')).toBe(false);
    });

    it('still derives badges from the live session roles (auditor shows only when held)', () => {
      // Derivation, not a hardcoded set: auditor is a membership role but is
      // badged ONLY when the session actually holds it.
      expect(
        renderWith(['learner']).querySelector('[data-testid="aplus-dashboard-role-auditor"]'),
      ).toBeNull();
      expect(
        renderWith(['learner', 'auditor']).querySelector(
          '[data-testid="aplus-dashboard-role-auditor"]',
        ),
      ).not.toBeNull();
    });
  });

  // ── TIER 1: fixed header learner controls (goal + Today's Dose) ──────────
  describe('tier 1 header: learner controls', () => {
    beforeEach(() => {
      authMock.setRoles(['learner']);
      mock.setState({ status: 'success', summary: buildDashboardSummary() });
      fixture.detectChanges();
    });

    it('renders the Today’s Dose CTA in the header (→ /a/daily-dose)', () => {
      const cta = element.querySelector('[data-testid="aplus-dashboard-daily-dose-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.getAttribute('href')).toContain('/a/daily-dose');
    });

    it('mounts the header goal control (SP2.8) in the learner header', () => {
      // The goal control's own behaviour (drawer / switch / new / propose) is
      // covered by header-goal-control.component.spec.ts; the shell only wires it.
      expect(element.querySelector('chora-aplus-header-goal-control')).not.toBeNull();
    });

    it('does NOT show learner header controls for an instructor-only user', () => {
      TestBed.resetTestingModule();
      const r = setup(['instructor']);
      r.mock.setState({ status: 'success', summary: buildDashboardSummary() });
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-dashboard-daily-dose-cta"]')).toBeNull();
      expect(el.querySelector('chora-aplus-header-goal-control')).toBeNull();
    });
  });

  // ── TIER 2: conditional notifications ticker ────────────────────────────
  describe('tier 2 notifications ticker', () => {
    beforeEach(() => {
      authMock.setRoles(['learner']);
      mock.setState({ status: 'success', summary: buildDashboardSummary() });
      fixture.detectChanges();
    });

    it('always mounts the ticker in the learner view (it self-collapses when empty)', () => {
      expect(element.querySelector('chora-aplus-notifications-ticker')).not.toBeNull();
    });

    it('does NOT mount the ticker for an instructor-only user', () => {
      TestBed.resetTestingModule();
      const r = setup(['instructor']);
      r.mock.setState({ status: 'success', summary: buildDashboardSummary() });
      r.fixture.detectChanges();
      expect(
        (r.fixture.nativeElement as HTMLElement).querySelector('chora-aplus-notifications-ticker'),
      ).toBeNull();
    });

    it('does NOT render celebration toasts in the shell (detection moved to the ticker)', () => {
      // The ticker is now the sole celebration detector on the dashboard route.
      expect(element.querySelector('chora-grew-edge-celebration')).toBeNull();
      expect(element.querySelector('chora-goal-graduated-celebration')).toBeNull();
    });
  });

  // ── TIER 3: draggable wrapper column ────────────────────────────────────
  describe('tier 3 draggable wrappers', () => {
    beforeEach(() => {
      authMock.setRoles(['learner']);
      mock.setState({ status: 'success', summary: buildDashboardSummary() });
      fixture.detectChanges();
    });

    it('renders a cdkDropList with the three wrapper cards', () => {
      expect(element.querySelector('[data-testid="aplus-dashboard-wrappers"]')).not.toBeNull();
      expect(element.querySelector('chora-aplus-map-preview-card')).not.toBeNull();
      expect(element.querySelector('chora-aplus-cast-card')).not.toBeNull();
      expect(element.querySelector('chora-aplus-continue-learning-card')).not.toBeNull();
    });

    it('renders wrappers in the default (map-dominant) order', () => {
      expect(wrapperKeysInDom(element)).toEqual([
        'map',
        'cast',
        'courses',
        'study',
        'transcript',
      ]);
    });

    it('renders the study wrapper adjacent to courses (provenance siblings)', () => {
      const keys = wrapperKeysInDom(element);
      expect(keys.indexOf('study')).toBe(keys.indexOf('courses') + 1);
    });

    it('re-renders wrappers in the persisted order from the layout service', () => {
      layoutMock.setOrder(['courses', 'map', 'cast']);
      fixture.detectChanges();
      expect(wrapperKeysInDom(element)).toEqual(['courses', 'map', 'cast']);
    });

    it('shows NO drag handles by default (clean layout) + a reorder toggle', () => {
      expect(element.querySelectorAll('[data-testid="aplus-dashboard-drag-grip"]').length).toBe(0);
      expect(
        element.querySelector('[data-testid="aplus-dashboard-reorder-toggle"]'),
      ).not.toBeNull();
      expect(fixture.componentInstance.reorderMode()).toBe(false);
    });

    it('entering reorder mode reveals a handle per card + a Done control', () => {
      (
        element.querySelector('[data-testid="aplus-dashboard-reorder-toggle"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.reorderMode()).toBe(true);
      expect(element.querySelectorAll('[data-testid="aplus-dashboard-drag-grip"]').length).toBe(5);
      expect(element.querySelector('[data-testid="aplus-dashboard-reorder-done"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-reorder-toggle"]')).toBeNull();
    });

    it('Done exits reorder mode and hides the handles again', () => {
      fixture.componentInstance.enterReorderMode();
      fixture.detectChanges();
      (
        element.querySelector('[data-testid="aplus-dashboard-reorder-done"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.reorderMode()).toBe(false);
      expect(element.querySelectorAll('[data-testid="aplus-dashboard-drag-grip"]').length).toBe(0);
    });

    it('onDrop moves the dragged card and persists the new order via reorder()', () => {
      // Drag position 0 (map) to position 2 →
      // ['cast','courses','map','study','transcript'].
      fixture.componentInstance.onDrop({
        previousIndex: 0,
        currentIndex: 2,
      } as unknown as CdkDragDrop<readonly WrapperKey[]>);
      expect(layoutMock.reorderCalls).toBe(1);
      expect(layoutMock.lastReorder).toEqual([
        'cast',
        'courses',
        'map',
        'study',
        'transcript',
      ]);
    });

    it('does NOT render the wrapper column for an instructor-only user', () => {
      TestBed.resetTestingModule();
      const r = setup(['instructor']);
      r.mock.setState({ status: 'success', summary: buildDashboardSummary() });
      r.fixture.detectChanges();
      expect(
        (r.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-dashboard-wrappers"]',
        ),
      ).toBeNull();
    });
  });

  // ── Integrative role-driven panel visibility ────────────────────────────
  describe('integrative role-driven visibility', () => {
    const successState = () => ({
      status: 'success' as const,
      summary: buildDashboardSummary({
        learnerCourses: [buildLearnerCourseSummary({ courseId: 'c-1', title: 'CSM Prep' })],
        instructorCourses: [buildInstructorCourseSummary({ courseId: 'c-2', title: 'CSPO Fund' })],
      }),
    });

    it('learner-only role: shows learner hub, no author or instructor card', () => {
      authMock.setRoles(['learner']);
      mock.setState(successState());
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-author-card"]')).toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).toBeNull();
    });

    it('instructor-only role: shows the courses card, NOT the learner hub or the author card', () => {
      TestBed.resetTestingModule();
      const r = setup(['instructor']);
      r.mock.setState(successState());
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).toBeNull();
      // An instructor is not implicitly an author: teaching is not authoring.
      expect(el.querySelector('[data-testid="aplus-dashboard-author-card"]')).toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-no-role"]')).toBeNull();
    });

    it('author-only role: shows the authoring card, NOT the courses card or the learner hub', () => {
      TestBed.resetTestingModule();
      const r = setup(['author']);
      r.mock.setState(successState());
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-dashboard-author-card"]')).not.toBeNull();
      // The regression this guards: `author` used to be ORed into
      // isInstructorRole, so an author was shown someone else's courses.
      expect(el.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-no-role"]')).toBeNull();
    });

    it('author and instructor get DIFFERENT cards pointing at different homes', () => {
      TestBed.resetTestingModule();
      const author = setup(['author']);
      author.mock.setState(successState());
      author.fixture.detectChanges();
      // The signpost tile IS the link now, so the card testid carries the href.
      const authorCta = (author.fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="aplus-dashboard-author-card"]',
      );
      // 🔴 Studio HAS landed, so this retargets — as the old assertion's own
      // comment said it should. It pointed at `/a/studio/atoms/new`, the blank
      // compose form, which is the exact inversion CHO-2211 set out to fix:
      // "your authoring" must open your INVENTORY (step 1), not a create form
      // (step 2). A green test pinning the stale target IS the bug.
      expect(authorCta?.getAttribute('href')).toBe('/a/studio');

      TestBed.resetTestingModule();
      const instructor = setup(['instructor']);
      instructor.mock.setState(successState());
      instructor.fixture.detectChanges();
      const instructorCta = (instructor.fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="aplus-dashboard-instructor-card"]',
      );
      // Courses belong to R+ (chora_delivery owns Course).
      expect(instructorCta?.getAttribute('href')).toContain('/r/catalog');
    });

    it('dual-role user: learner hub AND instructor card visible simultaneously', () => {
      authMock.setRoles(['learner', 'instructor']);
      mock.setState(successState());
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-author-card"]')).toBeNull();
    });

    it('learner+author: learner hub AND author card, but NO instructor card', () => {
      TestBed.resetTestingModule();
      const r = setup(['learner', 'author']);
      r.mock.setState(successState());
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-author-card"]')).not.toBeNull();
      // A learner who authors is not thereby an instructor.
      expect(el.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).toBeNull();
    });

    it('all three roles: learner hub AND author card AND instructor card, all at once', () => {
      // The owner's own account. Integrative visibility is additive, never a
      // toggle (Tier 4 D16), so holding three roles shows three things.
      TestBed.resetTestingModule();
      const r = setup(['learner', 'author', 'instructor']);
      r.mock.setState(successState());
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-author-card"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-dashboard-no-role"]')).toBeNull();
    });

    it('no-role user: shows fallback notice, no learner hub and no role cards', () => {
      authMock.setRoles([]);
      mock.setState(successState());
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-dashboard-no-role"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-author-card"]')).toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-instructor-card"]')).toBeNull();
    });

    it('an author is NOT treated as no-role (the fallback must not swallow them)', () => {
      // The regression: the fallback was gated on !learner && !instructor, so
      // splitting author out of instructor would have left an author-only user
      // with neither a card nor the notice.
      TestBed.resetTestingModule();
      const r = setup(['author']);
      r.mock.setState(successState());
      r.fixture.detectChanges();
      expect(
        (r.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-dashboard-no-role"]',
        ),
      ).toBeNull();
    });

    it('mana pocket is role-agnostic — visible even to a no-role user (CHO-1989)', () => {
      authMock.setRoles([]);
      mock.setState(successState());
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-dashboard-mana"]')).not.toBeNull();
    });
  });

  // ── The dashboard renders NO course tiles (courses belong to R+) ────────
  describe('no course rendering on A+', () => {
    it('renders no course tiles even when the BFF still returns courses', () => {
      // A+ signposts to R+ rather than rendering courses, so course payload in
      // the summary must not put a tile (or an "Open course" CTA) on screen.
      TestBed.resetTestingModule();
      const r = setup(['learner', 'instructor']);
      r.mock.setState({
        status: 'success',
        summary: buildDashboardSummary({
          instructorCourses: [
            buildInstructorCourseSummary({ courseId: 'c-fund', title: 'CSPO Fundamentals' }),
          ],
        }),
      });
      r.fixture.detectChanges();
      const el = r.fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.dashboard__tile').length).toBe(0);
      expect(el.querySelector('[data-testid="aplus-dashboard-open-c-fund"]')).toBeNull();
      expect(el.textContent).not.toContain('CSPO Fundamentals');
    });
  });

  // ── Honest empty / partial rendering ────────────────────────────────────
  describe('honest empty / partial rendering', () => {
    it('renders learner hub + instructor card on an empty summary without crashing', () => {
      authMock.setRoles(['learner', 'instructor']);
      mock.setState({
        status: 'success',
        summary: buildDashboardSummary({ learnerCourses: [], instructorCourses: [] }),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-dashboard-learner-panel"]')).not.toBeNull();
      // The card is role-driven, not data-driven: zero courses still signposts.
      const instructorCard = element.querySelector('[data-testid="aplus-dashboard-instructor-card"]');
      expect(instructorCard).not.toBeNull();
      expect(instructorCard?.querySelectorAll('.dashboard__tile').length).toBe(0);
    });

    it('does NOT render a broken / "undefined" name when userDisplayName is ""', () => {
      mock.setState({
        status: 'success',
        summary: buildDashboardSummary({ userDisplayName: '' }),
      });
      fixture.detectChanges();
      const identity = element.querySelector('[data-testid="aplus-dashboard-identity"]');
      expect(identity).not.toBeNull();
      expect(identity?.textContent).not.toContain('undefined');
      expect(identity?.textContent).toContain('GCID');
    });

    it('renders the partial notice (role=status) when partial:true', () => {
      mock.setState({
        status: 'success',
        summary: buildDashboardSummary({
          partial: true,
          part_errors: { userDisplayName: 'upstream_4xx' },
        }),
      });
      fixture.detectChanges();
      const notice = element.querySelector('[data-testid="aplus-dashboard-partial-notice"]');
      expect(notice).not.toBeNull();
      expect(notice?.getAttribute('role')).toBe('status');
    });

    it('does NOT hard-fail on partial:true — the header still renders', () => {
      mock.setState({ status: 'success', summary: buildDashboardSummary({ partial: true }) });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-dashboard-error"]')).toBeNull();
      expect(element.querySelector('[data-testid="aplus-dashboard-header"]')).not.toBeNull();
    });
  });

  // ── One-shot banner via query params (detectBanner) ─────────────────────
  describe('one-shot banner (detectBanner from query params)', () => {
    it('renders the "course submitted" banner for course_submitted=1', () => {
      TestBed.resetTestingModule();
      const r = setupWithQueryParams({ course_submitted: '1' });
      expect(r.fixture.componentInstance.banner()).toBe('aplus.dashboard.banner_course_submitted');
      expect(
        (r.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-dashboard-banner"]',
        ),
      ).not.toBeNull();
    });

    it('renders the "course resubmitted" banner for course_resubmitted=1', () => {
      TestBed.resetTestingModule();
      const r = setupWithQueryParams({ course_resubmitted: '1' });
      expect(r.fixture.componentInstance.banner()).toBe(
        'aplus.dashboard.banner_course_resubmitted',
      );
    });

    it('renders the "course saved" banner for course_saved=1', () => {
      TestBed.resetTestingModule();
      const r = setupWithQueryParams({ course_saved: '1' });
      expect(r.fixture.componentInstance.banner()).toBe('aplus.dashboard.banner_course_saved');
    });

    it('shows no banner when no banner query param is present', () => {
      TestBed.resetTestingModule();
      const r = setupWithQueryParams({});
      expect(r.fixture.componentInstance.banner()).toBeNull();
      expect(
        (r.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-dashboard-banner"]',
        ),
      ).toBeNull();
    });

    it('dismissBanner clears the banner + strips the query params', () => {
      TestBed.resetTestingModule();
      const r = setupWithQueryParams({ course_submitted: '1' });
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      r.fixture.componentInstance.dismissBanner();
      r.fixture.detectChanges();

      expect(r.fixture.componentInstance.banner()).toBeNull();
      expect(navSpy).toHaveBeenCalledTimes(1);
      const [, extras] = navSpy.mock.calls[0];
      expect(extras?.queryParams).toEqual({
        course_submitted: null,
        course_resubmitted: null,
        course_saved: null,
      });
      expect(extras?.queryParamsHandling).toBe('merge');
      expect(extras?.replaceUrl).toBe(true);
    });

    it('clicking the banner dismiss button hides the banner', () => {
      TestBed.resetTestingModule();
      const r = setupWithQueryParams({ course_saved: '1' });
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const dismissBtn = (r.fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="aplus-dashboard-banner-dismiss"]',
      ) as HTMLButtonElement;
      expect(dismissBtn).not.toBeNull();
      dismissBtn.click();
      r.fixture.detectChanges();

      expect(r.fixture.componentInstance.banner()).toBeNull();
      expect(
        (r.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-dashboard-banner"]',
        ),
      ).toBeNull();
    });
  });

  // ── errorKey computed ───────────────────────────────────────────────────
  describe('errorKey computed', () => {
    it('returns the error i18n key while in the error state', () => {
      mock.setState({ status: 'error', error: 'aplus.dashboard.error_upstream' });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('aplus.dashboard.error_upstream');
    });

    it('returns an empty string when NOT in the error state (loading)', () => {
      expect(fixture.componentInstance.errorKey()).toBe('');
    });

    it('returns an empty string when in the success state', () => {
      mock.setState({ status: 'success', summary: buildDashboardSummary() });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('');
    });
  });

  // ── isPartial computed ──────────────────────────────────────────────────
  describe('isPartial computed', () => {
    it('is false when summary is null (loading)', () => {
      expect(fixture.componentInstance.isPartial()).toBe(false);
    });

    it('is false on a healthy (non-partial) summary', () => {
      mock.setState({ status: 'success', summary: buildDashboardSummary() });
      fixture.detectChanges();
      expect(fixture.componentInstance.isPartial()).toBe(false);
    });

    it('is true when the summary carries partial:true', () => {
      mock.setState({ status: 'success', summary: buildDashboardSummary({ partial: true }) });
      fixture.detectChanges();
      expect(fixture.componentInstance.isPartial()).toBe(true);
    });
  });

  // ── a11y ────────────────────────────────────────────────────────────────
  describe('a11y (axe-core)', () => {
    it('has zero critical/serious WCAG violations on the learner success view', async () => {
      authMock.setRoles(['learner']);
      mock.setState({
        status: 'success',
        summary: buildDashboardSummary({
          userDisplayName: 'Phyllis Tan',
          partial: true,
        }),
      });
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 15000);
  });
});
