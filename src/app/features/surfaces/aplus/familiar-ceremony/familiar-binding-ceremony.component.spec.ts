import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { FamiliarBindingCeremonyComponent } from './familiar-binding-ceremony.component';
import { TranslateService } from '../../../../core/services/translate.service';
import type { GoalDTO } from '../dashboard/goal/goal.model';

const FAM = '00000000-0000-7000-8000-00000000fa41';
const GOAL = '00000000-0000-7000-8000-000000009a01';
const base = environment.bffBaseUrl;
const GOALS_URL = `${base}/api/v1/me/goals`;
const PATCH_URL = `${GOALS_URL}/${GOAL}`;
const PROPOSE_URL = `${base}/api/v1/me/familiars/${FAM}/ceremony/edge-scout`;

/**
 * One goal AS THE SERVER SENDS IT. chora-consumption speaks Companion on the
 * wire (ADR-254 D9), so the bond arrives as `attachedCompanionId`; callers keep
 * writing the A+ model name and it is translated here, exactly as GoalService
 * translates it in the other direction.
 */
function goal(over: Partial<GoalDTO> = {}): Record<string, unknown> {
  const { attachedFamiliarId, ...rest } = over;
  return {
    goalId: GOAL,
    kind: 'curiosity',
    conceptSet: ['Photosynthesis'],
    status: 'active',
    northStarNote: '',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...rest,
    ...(attachedFamiliarId === undefined
      ? {}
      : { attachedCompanionId: attachedFamiliarId }),
  };
}

describe('FamiliarBindingCeremonyComponent (R3-5 seam)', () => {
  let fixture: ComponentFixture<FamiliarBindingCeremonyComponent>;
  let el: HTMLElement;
  let httpMock: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [FamiliarBindingCeremonyComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        TranslateService,
      ],
    });
    fixture = TestBed.createComponent(FamiliarBindingCeremonyComponent);
    fixture.componentRef.setInput('familiarId', FAM);
    el = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  }

  /** Parent flips `open` → the false→true edge loads the live Goals. */
  function openModal(): void {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  }

  // The `goal()` helper above builds a WIRE row, which keys the bond as
  // `attachedCompanionId` (ADR-254 D9). GoalDTO is the MODEL shape and keys it
  // `attachedFamiliarId`, so typing this parameter GoalDTO[] asked the helper to
  // be something it deliberately is not, and broke the whole suite's compile.
  function flushGoals(items: readonly Record<string, unknown>[]): void {
    httpMock.expectOne(GOALS_URL).flush({ items, primaryLens: 'curiosity' });
    fixture.detectChanges();
  }

  /** Subscribe to the `closed` output and return a live emission counter. */
  function trackClosed(): () => number {
    let count = 0;
    fixture.componentInstance.closed.subscribe(() => (count += 1));
    return () => count;
  }

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('renders nothing and fires NO HTTP while closed (no HTTP until opened)', () => {
    setup();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="familiar-ceremony-dialog"]')).toBeNull();
    httpMock.expectNone(GOALS_URL);
  });

  it('loads the goals on open and offers unbound live goals as picks', () => {
    setup();
    fixture.detectChanges();
    openModal();

    flushGoals([
      goal(),
      goal({ goalId: 'g-2', status: 'retired' }), // not attachable
      goal({ goalId: 'g-3', attachedFamiliarId: 'other-fam' }), // taken
    ]);

    const options = el.querySelectorAll('[data-testid^="familiar-ceremony-goal-option-"]');
    expect(options.length).toBe(1);
    expect(
      el.querySelector(`[data-testid="familiar-ceremony-goal-option-${GOAL}"]`),
    ).not.toBeNull();
  });

  it('summon PATCHes the live attach and reveals the ceremony panel (auto-propose)', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([goal()]);

    el.querySelector<HTMLInputElement>(
      `[data-testid="familiar-ceremony-goal-option-${GOAL}"]`,
    )?.click();
    fixture.detectChanges();

    const attach = el.querySelector<HTMLButtonElement>('[data-testid="familiar-ceremony-attach"]');
    expect(attach?.disabled).toBe(false);
    attach?.click();
    fixture.detectChanges();

    const patchReq = httpMock.expectOne(PATCH_URL);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ attachedCompanionId: FAM });
    patchReq.flush(goal({ attachedFamiliarId: FAM }));
    fixture.detectChanges();

    // The bond refresh + the revealed panel's auto-propose both fire.
    httpMock.expectOne(GOALS_URL).flush({
      items: [goal({ attachedFamiliarId: FAM })],
      primaryLens: 'curiosity',
    });
    httpMock.expectOne(PROPOSE_URL).flush({
      candidates: [],
      fallback: true,
      mana_charged: 0,
    });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="ceremony-edges-panel"]')).not.toBeNull();
  });

  it('surfaces an inline conflict error when the attach 409s', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([goal()]);

    el.querySelector<HTMLInputElement>(
      `[data-testid="familiar-ceremony-goal-option-${GOAL}"]`,
    )?.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="familiar-ceremony-attach"]')?.click();
    fixture.detectChanges();

    httpMock
      .expectOne(PATCH_URL)
      .flush(
        { error: { code: 'FAMILIAR_ALREADY_ATTACHED' } },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(
      el.querySelector('[data-testid="familiar-ceremony-attach-error"]')?.textContent,
    ).toContain('familiar.ceremony.bind_error_conflict');
    expect(el.querySelector('[data-testid="ceremony-edges-panel"]')).toBeNull();
  });

  it('offers the bound re-entry when this familiar already carries a goal bond', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([goal({ attachedFamiliarId: FAM })]);

    expect(el.querySelector('[data-testid="familiar-ceremony-bound"]')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="familiar-ceremony-scout"]')?.click();
    fixture.detectChanges();

    httpMock.expectOne(PROPOSE_URL).flush({
      candidates: [],
      fallback: true,
      mana_charged: 0,
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="ceremony-edges-panel"]')).not.toBeNull();
  });

  it('shows the no-goals hint when nothing is attachable', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([goal({ status: 'retired' })]);

    expect(el.querySelector('[data-testid="familiar-ceremony-no-goals"]')).not.toBeNull();
  });

  it('shows a fail-loud goals error with retry', () => {
    setup();
    fixture.detectChanges();
    openModal();
    httpMock
      .expectOne(GOALS_URL)
      .flush({ error: { code: 'UPSTREAM' } }, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="familiar-ceremony-goals-error"]')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="familiar-ceremony-goals-retry"]')?.click();
    fixture.detectChanges();
    flushGoals([goal()]);
    expect(
      el.querySelector(`[data-testid="familiar-ceremony-goal-option-${GOAL}"]`),
    ).not.toBeNull();
  });

  it('opens the dialog when open is set true', () => {
    setup();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="familiar-ceremony-dialog"]')).toBeNull();

    openModal();
    flushGoals([]);

    const dialog = el.querySelector('[data-testid="familiar-ceremony-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('emits closed via the close button (does NOT self-hide — parent owns open)', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([]);
    expect(el.querySelector('[data-testid="familiar-ceremony-dialog"]')).toBeTruthy();

    const closedCount = trackClosed();
    el.querySelector<HTMLButtonElement>('[data-testid="familiar-ceremony-close"]')?.click();
    fixture.detectChanges();

    expect(closedCount()).toBe(1);
    // The parent owns `open` — the modal stays until the parent flips it.
    expect(el.querySelector('[data-testid="familiar-ceremony-dialog"]')).toBeTruthy();
  });

  it('emits closed on Escape', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([]);

    const closedCount = trackClosed();
    el.querySelector('[data-testid="familiar-ceremony-dialog"]')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(closedCount()).toBe(1);
  });

  it('emits closed on backdrop click', () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([]);

    const closedCount = trackClosed();
    el.querySelector<HTMLElement>('[data-testid="familiar-ceremony-backdrop"]')?.click();
    fixture.detectChanges();

    expect(closedCount()).toBe(1);
  });

  it('has no critical or serious accessibility violations (picker state)', async () => {
    setup();
    fixture.detectChanges();
    openModal();
    flushGoals([goal()]);

    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
