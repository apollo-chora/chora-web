import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { SummonWizardComponent } from './summon-wizard.component';
import { GoalService } from '../goal/goal.service';
import { DashboardService } from '../dashboard.service';
import type { DashboardSummary, FamiliarRosterItem } from '../dashboard.model';
import type { GoalDTO } from '../goal/goal.model';

/**
 * SummonWizardComponent spec — the A+ Cast "summon a Familiar to a learning goal"
 * step-by-step modal (SP2.5). Wired to the REAL goal→Familiar bond (ADR-212 D5):
 * PATCH /api/v1/me/goals/{id} { attachedFamiliarId } via GoalService.update. The
 * bond is strictly 1:1 (backend `ErrAlreadyAttached`), so REPLACE = detach then
 * attach (two PATCH calls) and "Keep both" leaves the existing binding untouched.
 *
 * i18n test contract: the translate pipe emits RAW keys in dev/test.
 */

function familiar(over: Partial<FamiliarRosterItem> = {}): FamiliarRosterItem {
  return {
    familiar_id: 'ember',
    name: 'Ember',
    species: 'phoenix',
    evolution_level: 3,
    stage_label: 'awakened',
    ...over,
  };
}

function goal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g1',
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: 'Fractions',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

function summary(fams: readonly FamiliarRosterItem[] = []): DashboardSummary {
  return {
    gcidPillLabel: 'GC-1',
    userDisplayName: 'Dale',
    currentStreakDays: 0,
    learnerCourses: [],
    instructorCourses: [],
    familiars: fams,
  };
}

function makeGoals(goals: readonly GoalDTO[] = []) {
  return {
    goals: signal<readonly GoalDTO[]>(goals),
    update: vi.fn((_id: string, _patch: unknown) => of(goal())),
    load: vi.fn(),
  };
}
type GoalsMock = ReturnType<typeof makeGoals>;

function makeDash(fams: readonly FamiliarRosterItem[] = []) {
  return { summary: signal<DashboardSummary | null>(summary(fams)) };
}
type DashMock = ReturnType<typeof makeDash>;

function build(
  fam: FamiliarRosterItem,
  goals: GoalsMock,
  dash: DashMock,
): ComponentFixture<SummonWizardComponent> {
  TestBed.configureTestingModule({
    imports: [SummonWizardComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: GoalService, useValue: goals },
      { provide: DashboardService, useValue: dash },
    ],
  });
  const fixture = TestBed.createComponent(SummonWizardComponent);
  fixture.componentRef.setInput('familiar', fam);
  fixture.detectChanges();
  return fixture;
}

function testid(fixture: ComponentFixture<SummonWizardComponent>, id: string): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
}

describe('SummonWizardComponent', () => {
  let goals: GoalsMock;
  let dash: DashMock;

  beforeEach(() => {
    TestBed.resetTestingModule();
    goals = makeGoals([goal()]);
    dash = makeDash([familiar()]);
  });

  it('renders a dialog at the pick step listing the learner goals', () => {
    goals = makeGoals([goal({ goalId: 'g1', northStarNote: 'Fractions' })]);
    const fixture = build(familiar(), goals, dash);
    const dialog = testid(fixture, 'aplus-summon-wizard');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(testid(fixture, 'aplus-summon-goal-g1')).toBeTruthy();
  });

  it('goes straight to confirm when the chosen goal has no Familiar', () => {
    goals = makeGoals([goal({ goalId: 'g1' })]);
    const fixture = build(familiar(), goals, dash);
    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe('confirm');
    expect(testid(fixture, 'aplus-summon-confirm')).toBeTruthy();
    expect(testid(fixture, 'aplus-summon-conflict')).toBeFalsy();
  });

  it('shows the conflict step (with the existing Familiar name) when the goal already has a DIFFERENT Familiar', () => {
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: 'sage' })]);
    dash = makeDash([familiar({ familiar_id: 'sage', name: 'Sage' }), familiar()]);
    const fixture = build(familiar({ familiar_id: 'ember', name: 'Ember' }), goals, dash);
    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe('conflict');
    expect(testid(fixture, 'aplus-summon-conflict')?.textContent).toContain('Sage');
    expect(testid(fixture, 'aplus-summon-keep-both')).toBeTruthy();
    expect(testid(fixture, 'aplus-summon-replace')).toBeTruthy();
  });

  it('skips the conflict when the goal is already bound to THIS Familiar (idempotent)', () => {
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: 'ember' })]);
    const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe('confirm');
  });

  it('confirm (attach) PATCHes the goal with attachedFamiliarId and emits summoned', () => {
    goals = makeGoals([goal({ goalId: 'g1' })]);
    const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
    const summonedIds: string[] = [];
    fixture.componentInstance.summoned.subscribe((id) => summonedIds.push(id));

    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    (testid(fixture, 'aplus-summon-confirm-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(goals.update).toHaveBeenCalledTimes(1);
    expect(goals.update).toHaveBeenCalledWith('g1', { attachedFamiliarId: 'ember' });
    expect(goals.load).toHaveBeenCalled(); // refresh so the binding is reflected
    expect(summonedIds).toEqual(['g1']);
  });

  it('REPLACE detaches the existing Familiar then attaches this one (two PATCH calls)', () => {
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: 'sage' })]);
    dash = makeDash([familiar({ familiar_id: 'sage', name: 'Sage' })]);
    const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
    const summonedIds: string[] = [];
    fixture.componentInstance.summoned.subscribe((id) => summonedIds.push(id));

    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    (testid(fixture, 'aplus-summon-replace') as HTMLButtonElement).click();
    fixture.detectChanges();
    (testid(fixture, 'aplus-summon-confirm-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(goals.update).toHaveBeenCalledTimes(2);
    expect(goals.update).toHaveBeenNthCalledWith(1, 'g1', { detachFamiliar: true });
    expect(goals.update).toHaveBeenNthCalledWith(2, 'g1', { attachedFamiliarId: 'ember' });
    expect(summonedIds).toEqual(['g1']);
  });

  it('"Keep both" leaves the existing binding untouched (no PATCH) and closes', () => {
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: 'sage' })]);
    dash = makeDash([familiar({ familiar_id: 'sage', name: 'Sage' })]);
    const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));

    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    (testid(fixture, 'aplus-summon-keep-both') as HTMLButtonElement).click();
    fixture.detectChanges();

    // 1:1 bond ⇒ a goal cannot hold two Familiars; "keep both" mutates nothing.
    expect(goals.update).not.toHaveBeenCalled();
    expect(closed).toBe(1);
  });

  it('fails loud on a summon error — surfaces an alert, does NOT emit summoned, and retry re-invokes', () => {
    goals = makeGoals([goal({ goalId: 'g1' })]);
    goals.update = vi.fn(() => throwError(() => ({ status: 409 })));
    const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
    const summonedIds: string[] = [];
    fixture.componentInstance.summoned.subscribe((id) => summonedIds.push(id));

    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    (testid(fixture, 'aplus-summon-confirm-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(testid(fixture, 'aplus-summon-error')).toBeTruthy();
    expect(testid(fixture, 'aplus-summon-error')?.getAttribute('role')).toBe('alert');
    expect(summonedIds).toEqual([]);

    // Retry re-runs the confirm (a second update attempt).
    (testid(fixture, 'aplus-summon-retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(goals.update).toHaveBeenCalledTimes(2);
  });

  it('emits closed on Escape', () => {
    const fixture = build(familiar(), goals, dash);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    const panel = testid(fixture, 'aplus-summon-wizard') as HTMLElement;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(closed).toBe(1);
  });

  it('renders an honest empty state when the learner has no goals', () => {
    goals = makeGoals([]);
    const fixture = build(familiar(), goals, dash);
    expect(testid(fixture, 'aplus-summon-empty')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid^="aplus-summon-goal-"]').length,
    ).toBe(0);
  });

  it('excludes retired goals from the pick list', () => {
    goals = makeGoals([
      goal({ goalId: 'g1', status: 'active' }),
      goal({ goalId: 'g2', status: 'retired' }),
    ]);
    const fixture = build(familiar(), goals, dash);
    expect(testid(fixture, 'aplus-summon-goal-g1')).toBeTruthy();
    expect(testid(fixture, 'aplus-summon-goal-g2')).toBeFalsy();
  });

  it('goes back to the pick step from confirm', () => {
    goals = makeGoals([goal({ goalId: 'g1' })]);
    const fixture = build(familiar(), goals, dash);
    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe('confirm');
    (testid(fixture, 'aplus-summon-back') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe('pick');
    expect(fixture.componentInstance.selectedGoal()).toBeNull();
  });

  it('closes from the header close button', () => {
    const fixture = build(familiar(), goals, dash);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => (closed += 1));
    (testid(fixture, 'aplus-summon-close') as HTMLButtonElement).click();
    expect(closed).toBe(1);
  });

  it('keeps Tab / Shift+Tab focus within the dialog (focus trap)', () => {
    goals = makeGoals([goal({ goalId: 'g1' })]);
    const fixture = build(familiar(), goals, dash);
    const panel = testid(fixture, 'aplus-summon-wizard') as HTMLElement;
    const focusables = panel.querySelectorAll<HTMLElement>('button:not([disabled])');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const within = () => panel.contains(document.activeElement) || document.activeElement === panel;

    // Forward Tab from the last focusable is trapped inside the panel.
    last.focus();
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(within()).toBe(true);
    // Shift+Tab from the first is trapped too.
    first.focus();
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(within()).toBe(true);
  });

  it('maps each summon failure status to a distinct i18n error key', () => {
    const cases: readonly (readonly [unknown, string])[] = [
      [{ status: 404 }, 'aplus.dashboard.cast.summon.error_not_found'],
      [{ status: 503 }, 'aplus.dashboard.cast.summon.error_upstream'],
      [{ status: 400 }, 'aplus.dashboard.cast.summon.error_generic'],
      ['boom', 'aplus.dashboard.cast.summon.error_generic'],
    ];
    for (const [err, key] of cases) {
      TestBed.resetTestingModule();
      goals = makeGoals([goal({ goalId: 'g1' })]);
      goals.update = vi.fn(() => throwError(() => err));
      const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
      (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
      fixture.detectChanges();
      (testid(fixture, 'aplus-summon-confirm-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(key);
    }
  });

  it('has no critical/serious accessibility violations (pick + conflict)', async () => {
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: 'sage' })]);
    dash = makeDash([familiar({ familiar_id: 'sage', name: 'Sage' })]);
    const fixture = build(familiar({ familiar_id: 'ember' }), goals, dash);
    (testid(fixture, 'aplus-summon-goal-g1') as HTMLButtonElement).click();
    fixture.detectChanges();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
