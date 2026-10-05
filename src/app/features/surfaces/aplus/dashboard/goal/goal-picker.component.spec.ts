import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { GoalPickerComponent } from './goal-picker.component';
import { GoalService } from './goal.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import type { CreateGoalRequest, GoalDTO } from './goal.model';

/**
 * GoalPickerComponent — minimal goal-set modal (ADR-204 §2). Mirrors the
 * KgSeedFormComponent seam: owns the `GoalService.create` side-effect, surfaces
 * the BE 422 INVALID_GOAL inline (fail-loud), and emits `(created)` on success.
 */

function buildGoal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g-new',
    kind: 'curiosity',
    conceptSet: ['fractions'],
    status: 'active',
    northStarNote: '',
    createdAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    ...over,
  };
}

class MockGoalService {
  lastCreate: CreateGoalRequest | null = null;
  createCalls = 0;
  createResult: GoalDTO = buildGoal();
  createError: unknown = null;

  create(req: CreateGoalRequest): Observable<GoalDTO> {
    this.createCalls += 1;
    this.lastCreate = req;
    if (this.createError) return throwError(() => this.createError);
    return of(this.createResult);
  }
}

function setup(): {
  fixture: ComponentFixture<GoalPickerComponent>;
  element: HTMLElement;
  goals: MockGoalService;
  created: GoalDTO[];
} {
  const goals = new MockGoalService();
  TestBed.configureTestingModule({
    imports: [GoalPickerComponent],
    providers: [TranslateService, { provide: GoalService, useValue: goals }],
  });
  const fixture = TestBed.createComponent(GoalPickerComponent);
  const created: GoalDTO[] = [];
  fixture.componentInstance.created.subscribe((g) => created.push(g));
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    goals,
    created,
  };
}

function setKind(fixture: ComponentFixture<GoalPickerComponent>, kind: string): void {
  fixture.componentInstance.form.controls.kind.setValue(kind as never);
  fixture.detectChanges();
}

function setTarget(fixture: ComponentFixture<GoalPickerComponent>, value: string): void {
  fixture.componentInstance.form.controls.target.setValue(value);
  fixture.detectChanges();
}

describe('GoalPickerComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders an accessible modal dialog', () => {
    const { element } = setup();
    const dialog = element.querySelector('[data-testid="goal-picker"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('defaults to the curiosity kind and shows the topic field (no target)', () => {
    const { fixture, element } = setup();
    expect(fixture.componentInstance.requiresTarget).toBe(false);
    const hint = element.querySelector('[data-testid="goal-picker-target-hint"]');
    expect(hint?.textContent).toContain('topic_hint');
  });

  it('switches to the target field for a credential kind', () => {
    const { fixture, element } = setup();
    setKind(fixture, 'cert');
    expect(fixture.componentInstance.requiresTarget).toBe(true);
    const hint = element.querySelector('[data-testid="goal-picker-target-hint"]');
    expect(hint?.textContent).toContain('target_hint');
  });

  it('disables submit until the target/topic is filled', () => {
    const { fixture, element } = setup();
    const submit = element.querySelector(
      '[data-testid="goal-picker-submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    setTarget(fixture, 'fractions');
    expect(submit.disabled).toBe(false);
  });

  it('does NOT call create for a whitespace-only topic', () => {
    const { fixture, goals } = setup();
    setTarget(fixture, '   ');
    fixture.componentInstance.onSubmit();
    expect(goals.createCalls).toBe(0);
  });

  it('creates a curiosity goal with a comma-split conceptSet and emits (created)', () => {
    const { fixture, goals, created } = setup();
    setTarget(fixture, '  fractions, decimals ,, ');
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    expect(goals.createCalls).toBe(1);
    expect(goals.lastCreate).toEqual({
      kind: 'curiosity',
      conceptSet: ['fractions', 'decimals'],
    });
    expect(created.length).toBe(1);
    expect(created[0].goalId).toBe('g-new');
  });

  it('creates a credential goal with choraTargetRef (no conceptSet)', () => {
    const { fixture, goals, created } = setup();
    setKind(fixture, 'cert');
    setTarget(fixture, '  CSM certification  ');
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    expect(goals.lastCreate).toEqual({
      kind: 'cert',
      choraTargetRef: 'CSM certification',
    });
    expect(created.length).toBe(1);
  });

  it('includes a trimmed north-star note when provided', () => {
    const { fixture, goals } = setup();
    setTarget(fixture, 'fractions');
    fixture.componentInstance.form.controls.northStarNote.setValue('  help my kid  ');
    fixture.detectChanges();
    fixture.componentInstance.onSubmit();
    expect(goals.lastCreate).toEqual({
      kind: 'curiosity',
      conceptSet: ['fractions'],
      northStarNote: 'help my kid',
    });
  });

  it('renders the 422 INVALID_GOAL fail-loud inline without emitting created', () => {
    const { fixture, element, goals, created } = setup();
    goals.createError = { status: 422 };
    setKind(fixture, 'cert');
    setTarget(fixture, 'something');
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    const err = element.querySelector('[data-testid="goal-picker-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toContain('err_invalid');
    expect(created.length).toBe(0);
    expect(fixture.componentInstance.submitError()?.kind).toBe('invalid_goal');
  });

  it('maps a 503 to the service-unavailable inline error', () => {
    const { fixture, goals } = setup();
    goals.createError = { status: 503 };
    setTarget(fixture, 'fractions');
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    expect(fixture.componentInstance.submitError()?.kind).toBe('service_unavailable');
  });

  it('emits (cancelled) from the cancel button', () => {
    const { fixture, element } = setup();
    let cancels = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));
    const cancel = element.querySelector(
      '[data-testid="goal-picker-cancel"]',
    ) as HTMLButtonElement;
    cancel.click();
    expect(cancels).toBe(1);
  });

  it('emits (cancelled) on Escape from within the dialog panel', () => {
    const { fixture, element } = setup();
    let cancels = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));
    // Focus lives in the panel, so Escape is handled on the panel (not backdrop).
    const panel = element.querySelector('[data-testid="goal-picker"]') as HTMLElement;
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cancels).toBe(1);
  });

  it('emits (cancelled) on a backdrop click', () => {
    const { fixture, element } = setup();
    let cancels = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));
    (element.querySelector('[data-testid="goal-picker-backdrop"]') as HTMLElement).click();
    expect(cancels).toBe(1);
  });

  it('traps Tab focus inside the dialog (last wraps to first)', () => {
    const { fixture, element } = setup();
    setTarget(fixture, 'fractions'); // enables submit so it joins the focus ring
    const focusables = element.querySelectorAll<HTMLElement>(
      'select, input, textarea, button:not([disabled])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevent = vi.spyOn(ev, 'preventDefault');
    fixture.componentInstance.onKeydown(ev);
    expect(prevent).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab focus inside the dialog (first wraps to last)', () => {
    const { fixture, element } = setup();
    setTarget(fixture, 'fractions');
    const focusables = element.querySelectorAll<HTMLElement>(
      'select, input, textarea, button:not([disabled])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const prevent = vi.spyOn(ev, 'preventDefault');
    fixture.componentInstance.onKeydown(ev);
    expect(prevent).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
  });

  it('does not trap Tab when focus is mid-dialog (native tab order)', () => {
    const { fixture, element } = setup();
    setTarget(fixture, 'fractions');
    (element.querySelector('[data-testid="goal-picker-target"]') as HTMLElement).focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab' });
    const tabPrevent = vi.spyOn(tab, 'preventDefault');
    fixture.componentInstance.onKeydown(tab);
    expect(tabPrevent).not.toHaveBeenCalled();
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const shiftPrevent = vi.spyOn(shiftTab, 'preventDefault');
    fixture.componentInstance.onKeydown(shiftTab);
    expect(shiftPrevent).not.toHaveBeenCalled();
  });

  it('restores trigger focus at most once across repeated cancels', () => {
    const { fixture } = setup();
    let cancels = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));
    fixture.componentInstance.onCancel(); // restores + clears the saved element
    fixture.componentInstance.onCancel(); // saved element now null — no-op restore
    expect(cancels).toBe(2);
  });

  it('ignores cancel + re-submit while a create is in flight', () => {
    const { fixture, goals } = setup();
    let cancels = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancels += 1));
    setTarget(fixture, 'fractions');
    fixture.componentInstance.submitting.set(true);
    fixture.componentInstance.onCancel();
    fixture.componentInstance.onSubmit();
    expect(cancels).toBe(0);
    expect(goals.createCalls).toBe(0);
  });
});
