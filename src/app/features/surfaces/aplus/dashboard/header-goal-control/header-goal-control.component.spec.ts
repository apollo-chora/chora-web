import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of, type Observable } from 'rxjs';

import { HeaderGoalControlComponent } from './header-goal-control.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { GoalService } from '../goal/goal.service';
import { GoalPickerComponent } from '../goal/goal-picker.component';
import type { GoalDTO } from '../goal/goal.model';

/**
 * HeaderGoalControlComponent spec (SP2.8) — the A+ dashboard header goal control
 * + learning-goals drawer. Self-contained: reads GoalService (root), owns the
 * drawer + the new-goal picker, and switches by navigating to the goal's map.
 *
 * The goal-picker is STUBBED (its own spec covers it); the goal-progress-ring is
 * mounted real (presentational).
 */

@Component({ selector: 'chora-aplus-goal-picker', standalone: true, template: '' })
class StubGoalPickerComponent {}

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

class MockGoalService {
  readonly _active = signal<GoalDTO | null>(null);
  readonly _goals = signal<readonly GoalDTO[]>([]);
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
  setActiveGoal(g: GoalDTO | null): void {
    this._active.set(g);
  }
  setGoals(goals: readonly GoalDTO[]): void {
    this._goals.set(goals);
  }
}

interface SetupResult {
  fixture: ComponentFixture<HeaderGoalControlComponent>;
  element: HTMLElement;
  goalMock: MockGoalService;
}

function setup(): SetupResult {
  const goalMock = new MockGoalService();
  TestBed.configureTestingModule({
    imports: [HeaderGoalControlComponent],
    providers: [provideRouter([]), TranslateService, { provide: GoalService, useValue: goalMock }],
  });
  TestBed.overrideComponent(HeaderGoalControlComponent, {
    remove: { imports: [GoalPickerComponent] },
    add: { imports: [StubGoalPickerComponent] },
  });
  const fixture = TestBed.createComponent(HeaderGoalControlComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, goalMock };
}

function openDrawer(r: SetupResult): void {
  (
    r.element.querySelector('[data-testid="aplus-header-goal-trigger"]') as HTMLButtonElement
  ).click();
  r.fixture.detectChanges();
}

describe('HeaderGoalControlComponent', () => {
  let r: SetupResult;

  beforeEach(() => {
    TestBed.resetTestingModule();
    r = setup();
  });

  // ── Trigger (no goal) ────────────────────────────────────────────────
  describe('trigger — no goal', () => {
    it('renders the "set your first learning goal" CTA when there is no goal', () => {
      expect(r.element.querySelector('[data-testid="aplus-header-goal-empty-cta"]')).not.toBeNull();
      expect(r.element.querySelector('[data-testid="aplus-header-goal-name"]')).toBeNull();
    });
  });

  // ── Trigger (active goal) ────────────────────────────────────────────
  describe('trigger — active goal', () => {
    it('renders the goal target + status badge (no faked %)', () => {
      r.goalMock.setActiveGoal(
        buildGoal({ kind: 'cert', choraTargetRef: 'CSM certification', status: 'active' }),
      );
      r.fixture.detectChanges();
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-name"]')?.textContent,
      ).toContain('CSM certification');
      const status = r.element.querySelector('[data-testid="aplus-header-goal-status"]');
      expect(status?.textContent).toContain('status_active');
      expect(r.element.querySelector('[data-testid="aplus-header-goal-empty-cta"]')).toBeNull();
    });

    it('falls back to the conceptSet, then the kind label, for the goal name', () => {
      r.goalMock.setActiveGoal(
        buildGoal({
          kind: 'curiosity',
          choraTargetRef: undefined,
          conceptSet: ['fractions', 'decimals'],
        }),
      );
      r.fixture.detectChanges();
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-name"]')?.textContent,
      ).toContain('fractions, decimals');

      r.goalMock.setActiveGoal(
        buildGoal({ kind: 'edge', choraTargetRef: undefined, conceptSet: [] }),
      );
      r.fixture.detectChanges();
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-name"]')?.textContent,
      ).toContain('kind_edge');
    });

    it('uses semantic status badges (achieved → success, maintenance → warning)', () => {
      r.goalMock.setActiveGoal(buildGoal({ status: 'achieved' }));
      r.fixture.detectChanges();
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-status"]')?.className,
      ).toContain('badge-success');
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-graduated-badge"]'),
      ).not.toBeNull();

      r.goalMock.setActiveGoal(buildGoal({ status: 'maintenance' }));
      r.fixture.detectChanges();
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-status"]')?.className,
      ).toContain('badge-warning');
    });

    it('renders the verified-progress ring when totalConcepts > 0, else the bullseye', () => {
      r.goalMock.setActiveGoal(
        buildGoal({
          kind: 'cert',
          choraTargetRef: 'CSM',
          totalConcepts: 6,
          progressPercent: 50,
          masteredConcepts: 3,
        }),
      );
      r.fixture.detectChanges();
      expect(r.element.querySelector('[data-testid="goal-progress-ring"]')).not.toBeNull();
      expect(r.element.querySelector('.hgc-ring--set')).toBeNull();

      r.goalMock.setActiveGoal(
        buildGoal({ kind: 'curiosity', conceptSet: ['fractions'], totalConcepts: 0 }),
      );
      r.fixture.detectChanges();
      expect(r.element.querySelector('[data-testid="goal-progress-ring"]')).toBeNull();
      expect(r.element.querySelector('.hgc-ring--set')).not.toBeNull();
    });
  });

  // ── Drawer open/close ────────────────────────────────────────────────
  describe('drawer', () => {
    it('is closed by default and opens on the trigger click', () => {
      expect(r.fixture.componentInstance.drawerOpen()).toBe(false);
      openDrawer(r);
      expect(r.fixture.componentInstance.drawerOpen()).toBe(true);
      const drawer = r.element.querySelector('[data-testid="aplus-header-goal-drawer"]');
      expect(drawer?.className).toContain('is-open');
    });

    it('closes via the close button and via the backdrop', () => {
      openDrawer(r);
      (
        r.element.querySelector(
          '[data-testid="aplus-header-goal-drawer-close"]',
        ) as HTMLButtonElement
      ).click();
      r.fixture.detectChanges();
      expect(r.fixture.componentInstance.drawerOpen()).toBe(false);

      openDrawer(r);
      (
        r.element.querySelector('[data-testid="aplus-header-goal-drawer-backdrop"]') as HTMLElement
      ).click();
      r.fixture.detectChanges();
      expect(r.fixture.componentInstance.drawerOpen()).toBe(false);
    });
  });

  // ── Switch goal ──────────────────────────────────────────────────────
  describe('switch goal', () => {
    beforeEach(() => {
      r.goalMock.setGoals([
        buildGoal({ goalId: 'g-a', choraTargetRef: 'CSM cert', kind: 'cert' }),
        buildGoal({
          goalId: 'g-b',
          kind: 'curiosity',
          choraTargetRef: undefined,
          conceptSet: ['fractions'],
        }),
        buildGoal({ goalId: 'g-retired', status: 'retired', choraTargetRef: 'Old' }),
      ]);
      r.goalMock.setActiveGoal(
        buildGoal({ goalId: 'g-a', choraTargetRef: 'CSM cert', kind: 'cert' }),
      );
      r.fixture.detectChanges();
    });

    it('lists the non-retired goals and marks the current one', () => {
      openDrawer(r);
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-switch-g-a"]'),
      ).not.toBeNull();
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-switch-g-b"]'),
      ).not.toBeNull();
      // retired goal excluded
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-switch-g-retired"]'),
      ).toBeNull();
      // the active goal's row is marked current
      const currentRow = r.element.querySelector('[data-testid="aplus-header-goal-row-g-a"]');
      expect(currentRow?.className).toContain('is-current');
    });

    it('navigates to the goal map and closes the drawer when a goal is picked', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      openDrawer(r);
      (
        r.element.querySelector('[data-testid="aplus-header-goal-switch-g-b"]') as HTMLButtonElement
      ).click();
      r.fixture.detectChanges();
      expect(navSpy).toHaveBeenCalledWith(['/a/knowledge', 'g-b']);
      expect(r.fixture.componentInstance.drawerOpen()).toBe(false);
    });
  });

  // ── New goal (picker) ────────────────────────────────────────────────
  describe('new learning goal', () => {
    it('opens the goal picker and, on create, closes it + reloads goals', () => {
      openDrawer(r);
      (
        r.element.querySelector('[data-testid="aplus-header-goal-new"]') as HTMLButtonElement
      ).click();
      r.fixture.detectChanges();
      expect(r.fixture.componentInstance.pickerOpen()).toBe(true);
      expect(r.element.querySelector('chora-aplus-goal-picker')).not.toBeNull();

      const before = r.goalMock.loadCalls;
      r.fixture.componentInstance.onGoalCreated(buildGoal());
      r.fixture.detectChanges();
      expect(r.fixture.componentInstance.pickerOpen()).toBe(false);
      expect(r.fixture.componentInstance.drawerOpen()).toBe(false);
      expect(r.goalMock.loadCalls).toBe(before + 1);
    });

    it('closes the picker on cancel without reloading', () => {
      openDrawer(r);
      (
        r.element.querySelector('[data-testid="aplus-header-goal-new"]') as HTMLButtonElement
      ).click();
      r.fixture.detectChanges();
      const before = r.goalMock.loadCalls;
      r.fixture.componentInstance.closePicker();
      r.fixture.detectChanges();
      expect(r.fixture.componentInstance.pickerOpen()).toBe(false);
      expect(r.goalMock.loadCalls).toBe(before);
    });
  });

  // ── Let a Familiar propose one ───────────────────────────────────────
  describe('familiar propose', () => {
    it('routes to the growth-edges surface and closes the drawer', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      openDrawer(r);
      (
        r.element.querySelector('[data-testid="aplus-header-goal-propose"]') as HTMLButtonElement
      ).click();
      r.fixture.detectChanges();
      expect(navSpy).toHaveBeenCalledWith(['/a/growth-edges']);
      expect(r.fixture.componentInstance.drawerOpen()).toBe(false);
    });
  });

  // ── Zero-goal drawer ─────────────────────────────────────────────────
  describe('zero-goal drawer', () => {
    it('shows the empty lead + new/propose actions and no switch list', () => {
      openDrawer(r);
      expect(
        r.element.querySelector('[data-testid="aplus-header-goal-drawer-empty"]'),
      ).not.toBeNull();
      expect(r.element.querySelector('[data-testid="aplus-header-goal-new"]')).not.toBeNull();
      expect(r.element.querySelector('[data-testid="aplus-header-goal-propose"]')).not.toBeNull();
      expect(r.element.querySelectorAll('[data-testid^="aplus-header-goal-switch-"]').length).toBe(
        0,
      );
    });
  });

  // ── a11y ─────────────────────────────────────────────────────────────
  describe('a11y (axe-core)', () => {
    it('has zero critical/serious violations with the drawer open + a goal set', async () => {
      r.goalMock.setActiveGoal(
        buildGoal({
          kind: 'cert',
          choraTargetRef: 'CSM',
          totalConcepts: 6,
          progressPercent: 50,
          masteredConcepts: 3,
        }),
      );
      r.goalMock.setGoals([buildGoal({ goalId: 'g-a', choraTargetRef: 'CSM', kind: 'cert' })]);
      r.fixture.detectChanges();
      openDrawer(r);
      const axe = (await import('axe-core')).default;
      const results = await axe.run(r.fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 15000);
  });
});
