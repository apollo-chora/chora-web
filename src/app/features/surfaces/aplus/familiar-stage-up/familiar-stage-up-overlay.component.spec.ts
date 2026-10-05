/**
 * Vitest specs — FamiliarStageUpOverlayComponent (WS-2).
 *
 * Tests verify:
 *   1. Overlay renders with correct transition labels (from/to stage)
 *   2. Close button dismisses → `closed` output emits
 *   3. Escape key dismisses → `closed` output emits
 *   4. Backdrop click dismisses → `closed` output emits
 *   5. aria-modal + aria-labelledby are present (a11y)
 *   6. FamiliarRealtimeService.stageTransition$ → overlay appears
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FamiliarStageUpOverlayComponent } from './familiar-stage-up-overlay.component';
import {
  FamiliarRealtimeService,
  type FamiliarStageTransition,
} from '../../../../core/familiar/familiar-realtime.service';
import { TranslateService } from '../../../../core/services/translate.service';

const STAGE_TRANSITION_EGG_TO_BABY: FamiliarStageTransition = {
  familiarId: 'fam-test-001',
  fromStage: 0,
  toStage: 1,
};

const STAGE_TRANSITION_BABY_TO_FLEDGLING: FamiliarStageTransition = {
  familiarId: 'fam-test-001',
  fromStage: 1,
  toStage: 2,
};

function setup(transition: FamiliarStageTransition = STAGE_TRANSITION_EGG_TO_BABY) {
  TestBed.configureTestingModule({
    imports: [FamiliarStageUpOverlayComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(FamiliarStageUpOverlayComponent);
  fixture.componentRef.setInput('transition', transition);
  return {
    fixture,
    component: fixture.componentInstance,
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('FamiliarStageUpOverlayComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.clearAllMocks());

  it('renders the overlay card on mount', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="fsu-overlay-card"]')).not.toBeNull();
  });

  it('shows the "from" stage label (Pod) in the transition line', () => {
    const { fixture, el } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.detectChanges();
    const transition = el.querySelector('[data-testid="fsu-transition"]');
    // Stage 0 is the breed-neutral Pod whether or not a species is set. It used
    // to fall through to STAGE_NAMES[0], printing the raw i18n key segment
    // 'egg' at the learner on the very first hatch (the species is unrevealed
    // until this ceremony, so the species-less branch WAS the live path).
    expect(transition?.textContent ?? '').toContain('Pod');
    expect(transition?.textContent ?? '').not.toMatch(/egg/i);
  });

  it('shows the "to" stage label (Baby) in the heading and transition line', () => {
    const { fixture, el } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.detectChanges();
    const heading = el.querySelector('[data-testid="fsu-heading"]');
    expect(heading?.textContent ?? '').toBeTruthy();
    const transition = el.querySelector('[data-testid="fsu-transition"]');
    // Stage 1 without species = 'baby' stage name
    expect(transition?.textContent ?? '').toContain('baby');
  });

  it('shows dragon breed-adjective labels when species=dragon', () => {
    const { fixture, el } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.componentRef.setInput('species', 'dragon');
    fixture.detectChanges();
    const transition = el.querySelector('[data-testid="fsu-transition"]');
    expect(transition?.textContent ?? '').toContain('Hatchling');
  });

  it('shows correct labels for Stage 1 → 2 (Baby → Fledgling / Owlet → Fledgling Owl for owl)', () => {
    const { fixture, el } = setup(STAGE_TRANSITION_BABY_TO_FLEDGLING);
    fixture.componentRef.setInput('species', 'owl');
    fixture.detectChanges();
    const transition = el.querySelector('[data-testid="fsu-transition"]');
    // Owl Stage 1 = 'Owlet', Stage 2 = 'Fledgling Owl'
    expect(transition?.textContent ?? '').toContain('Owlet');
    expect(transition?.textContent ?? '').toContain('Fledgling Owl');
  });

  it('emits closed when close button is clicked', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const btn = el.querySelector<HTMLButtonElement>(
      '[data-testid="fsu-overlay-close"]',
    );
    btn?.click();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('emits closed when Escape key is pressed', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const backdrop = el.querySelector<HTMLElement>(
      '[data-testid="fsu-overlay-backdrop"]',
    );
    backdrop?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('emits closed when backdrop is clicked', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const backdrop = el.querySelector<HTMLElement>(
      '[data-testid="fsu-overlay-backdrop"]',
    );
    backdrop?.click();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('does NOT emit closed when dialog card itself is clicked (stopPropagation)', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const card = el.querySelector<HTMLElement>(
      '[data-testid="fsu-overlay-card"]',
    );
    card?.click();
    expect(closedSpy).not.toHaveBeenCalled();
  });

  it('dialog card has aria-modal="true" and aria-labelledby="fsu-heading"', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    const card = el.querySelector('[data-testid="fsu-overlay-card"]');
    expect(card?.getAttribute('aria-modal')).toBe('true');
    expect(card?.getAttribute('aria-labelledby')).toBe('fsu-heading');
  });

  it('heading element id matches aria-labelledby', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    const heading = el.querySelector('#fsu-heading');
    expect(heading).not.toBeNull();
  });

  // ── computed signal outputs (direct) ─────────────────────────────
  it('fromStage()/toStage() reflect the transition payload (0 → 1)', () => {
    const { fixture, component } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.detectChanges();
    expect(component.fromStage()).toBe(0);
    expect(component.toStage()).toBe(1);
  });

  it('fromLabel()/toLabel() default to plain STAGE_NAMES when species is empty', () => {
    const { fixture, component } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.detectChanges();
    // Stage 0 is the breed-neutral "Pod" whatever the species; the hatched
    // stages still come from STAGE_NAMES when no species is set.
    expect(component.fromLabel()).toBe('Pod');
    expect(component.toLabel()).toBe('baby');
  });

  it('fromLabel()/toLabel() use BREED_ADJECTIVE when species is set (fox)', () => {
    const { fixture, component } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.componentRef.setInput('species', 'fox');
    fixture.detectChanges();
    // Fox: stage 0 = 'Pod' (breed-neutral), stage 1 = 'Kit'.
    expect(component.fromLabel()).toBe('Pod');
    expect(component.toLabel()).toBe('Kit');
  });

  // species truthy + a stage with NO BREED_ADJECTIVE entry → exercises the
  // right-hand side of `BREED_ADJECTIVE[s]?.[stage] ?? STAGE_NAMES[stage]` in
  // BOTH fromLabel() and toLabel() (the uncovered nullish-coalescing arm).
  it('fromLabel()/toLabel() fall back when the breed adjective entry is missing for the stage', () => {
    // Stage 9 is out of the 0-6 range: BREED_ADJECTIVE.fox[9] is undefined,
    // and STAGE_NAMES[9] is also undefined → both labels resolve to undefined.
    const { fixture, component } = setup({
      familiarId: 'fam-oob',
      fromStage: 9,
      toStage: 8,
    });
    fixture.componentRef.setInput('species', 'fox');
    fixture.detectChanges();
    expect(component.fromLabel()).toBeUndefined();
    expect(component.toLabel()).toBeUndefined();
  });

  // species truthy but NOT a key in BREED_ADJECTIVE → the optional-chained
  // lookup `BREED_ADJECTIVE[s]?.[stage]` yields undefined, so the label falls
  // through to the plain STAGE_NAMES path.
  it('fromLabel()/toLabel() use STAGE_NAMES when species has no BREED_ADJECTIVE table', () => {
    const { fixture, component } = setup({
      familiarId: 'fam-unknown-breed',
      fromStage: 2,
      toStage: 3,
    });
    // 'unicorn' is not a key in BREED_ADJECTIVE; cast since the input type is
    // narrow but the runtime lookup is what we exercise. Stages 2/3 keep this
    // off the stage-0 Pod short-circuit, which never reaches the table.
    fixture.componentRef.setInput('species', 'unicorn' as unknown as string);
    fixture.detectChanges();
    expect(component.fromLabel()).toBe('fledgling');
    expect(component.toLabel()).toBe('awakened');
  });

  it('renders breed-art elements for both from and to cells', () => {
    const { fixture, el } = setup(STAGE_TRANSITION_EGG_TO_BABY);
    fixture.componentRef.setInput('species', 'phoenix');
    fixture.detectChanges();
    const arts = el.querySelectorAll('chora-breed-art');
    expect(arts.length).toBe(2);
  });

  it('to-label appears inside the heading <strong> new-label', () => {
    const { fixture, el } = setup(STAGE_TRANSITION_BABY_TO_FLEDGLING);
    fixture.componentRef.setInput('species', 'cat');
    fixture.detectChanges();
    const strong = el.querySelector('.fsu-overlay__new-label');
    // Cat stage 2 = 'Tabby'.
    expect(strong?.textContent ?? '').toContain('Tabby');
  });

  it('renders the eyebrow and continue CTA i18n keys', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    const eyebrow = el.querySelector('.fsu-overlay__eyebrow');
    expect(eyebrow?.textContent ?? '').toContain(
      'aplus.familiar_stage_up_overlay.eyebrow',
    );
    const cta = el.querySelector('[data-testid="fsu-overlay-close"]');
    expect(cta?.textContent ?? '').toContain(
      'aplus.familiar_stage_up_overlay.continue_cta',
    );
  });

  it('onClose() emits closed exactly once when invoked directly', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    component.onClose();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('onBackdropClick() emits closed exactly once when invoked directly', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    component.onBackdropClick();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('onKeydown() with a non-Escape/non-Tab key is a no-op (no close, no throw)', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    const evt = new KeyboardEvent('keydown', { key: 'a' });
    const prevented = vi.spyOn(evt, 'preventDefault');
    expect(() => component.onKeydown(evt)).not.toThrow();
    expect(prevented).not.toHaveBeenCalled();
    expect(closedSpy).not.toHaveBeenCalled();
  });

  it('Escape via onKeydown() preventDefaults and emits closed', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    const evt = new KeyboardEvent('keydown', { key: 'Escape' });
    const prevented = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);
    expect(prevented).toHaveBeenCalled();
    expect(closedSpy).toHaveBeenCalledOnce();
  });
});

// ── Focus management (effect capture + restore on close) ────────────
describe('FamiliarStageUpOverlayComponent focus management', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.clearAllMocks());

  it('focuses the dialog panel after mount (effect + queueMicrotask)', async () => {
    const { fixture, el } = setup();
    document.body.appendChild(el);
    fixture.detectChanges();
    // The effect schedules a queueMicrotask to focus the dialog panel.
    await Promise.resolve();
    await Promise.resolve();
    const panel = el.querySelector(
      '[data-testid="fsu-overlay-card"]',
    ) as HTMLElement;
    expect(document.activeElement).toBe(panel);
    el.remove();
  });

  it('restores focus to the previously-focused element on close', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { fixture, component, el } = setup();
    document.body.appendChild(el);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    // onClose() should restore focus to the trigger.
    component.onClose();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    el.remove();
  });

  it('does not throw on close when previously-focused element is not an HTMLElement', async () => {
    // Blur everything → document.activeElement falls back to <body>.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const { fixture, component } = setup();
    fixture.detectChanges();
    await Promise.resolve();
    expect(() => component.onClose()).not.toThrow();
  });
});

// ── Keyboard focus trap (Tab / Shift+Tab cycling) ───────────────────
describe('FamiliarStageUpOverlayComponent keyboard focus trap', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.clearAllMocks());

  function trapSetup() {
    const { fixture, component, el } = setup();
    document.body.appendChild(el);
    fixture.detectChanges();
    return { fixture, component, el };
  }

  function getPanel(el: HTMLElement): HTMLElement {
    return el.querySelector('[data-testid="fsu-overlay-card"]') as HTMLElement;
  }

  function getFocusables(el: HTMLElement): HTMLElement[] {
    const panel = getPanel(el);
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  it('wraps focus to first element when Tab pressed on the last focusable', () => {
    const { component, el } = trapSetup();
    const focusables = getFocusables(el);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    const evt = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevented = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(prevented).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
    el.remove();
  });

  it('does NOT wrap on Tab when focus is not on the last focusable (panel focused)', () => {
    const { component, el } = trapSetup();
    // The dialog panel itself is NOT in the focusables list (tabindex="-1"),
    // so focusing it means document.activeElement !== last → no wrap on Tab.
    const panel = getPanel(el);
    panel.focus();
    expect(document.activeElement).toBe(panel);

    const evt = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevented = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(prevented).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(panel);
    el.remove();
  });

  it('wraps focus to last element when Shift+Tab pressed on the first focusable', () => {
    const { component, el } = trapSetup();
    const focusables = getFocusables(el);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();

    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const prevented = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(prevented).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
    el.remove();
  });

  it('wraps focus to last element when Shift+Tab pressed while the panel itself is focused', () => {
    const { component, el } = trapSetup();
    const focusables = getFocusables(el);
    const last = focusables[focusables.length - 1];
    const panel = getPanel(el);
    panel.focus();
    expect(document.activeElement).toBe(panel);

    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const prevented = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(prevented).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
    el.remove();
  });

  it('does NOT wrap on Shift+Tab when focus is neither first nor panel', () => {
    const { component, el } = trapSetup();
    const focusables = getFocusables(el);
    // Only one focusable button exists; to exercise the "not first/panel"
    // branch, focus the trigger sits elsewhere — use a body-level element.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const prevented = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(prevented).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);
    expect(focusables.length).toBeGreaterThan(0);
    outside.remove();
    el.remove();
  });
});

// ── Integration: FamiliarRealtimeService → overlay appears ──────────────
describe('FamiliarRealtimeService.stageTransition$ integration', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('emitStageTransition() pushes to stageTransition$', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const svc = TestBed.inject(FamiliarRealtimeService);
    const received: FamiliarStageTransition[] = [];
    svc.stageTransition$.subscribe((t) => received.push(t));

    svc.emitStageTransition(STAGE_TRANSITION_EGG_TO_BABY);
    expect(received).toHaveLength(1);
    expect(received[0].fromStage).toBe(0);
    expect(received[0].toStage).toBe(1);
  });

  it('emit() with stage_up event fans out to stageTransition$', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const svc = TestBed.inject(FamiliarRealtimeService);
    const received: FamiliarStageTransition[] = [];
    svc.stageTransition$.subscribe((t) => received.push(t));

    svc.emit({
      type: 'stage_up',
      familiarId: 'fam-001',
      stageFrom: 1,
      stageTo: 2,
      stageName: 'fledgling',
      unlockedTools: [],
      llmTierNew: 'flash',
      occurredAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(1);
    expect(received[0].familiarId).toBe('fam-001');
    expect(received[0].fromStage).toBe(1);
    expect(received[0].toStage).toBe(2);
  });
});

// ── CHO-2030 (R3-9): ceremony reveals — slots + woke band + named-tease ────

describe('FamiliarStageUpOverlayComponent reveals (CHO-2030)', () => {
  const GROWTH_ST2_OWL = {
    data: {
      familiarId: 'fam-test-001',
      growthStage: 2,
      stageName: 'fledgling',
      species: 'owl',
      shinyVariant: false,
      rarity: 'common',
      expCurrent: 2,
      expNextThreshold: 200,
      expCumulative: 52,
      effectiveLlmTier: 'flash-lite',
      effectiveMaxOutputTokens: 800,
      unlockedTools: ['cite_atom', 'atom_search'],
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
      hatchedAt: '2026-07-03T00:00:00Z',
      lastStageUpAt: '2026-07-03T10:40:00Z',
      displayName: 'Ember',
      nextUnlocks: [
        {
          skillKey: 'quiz_me',
          skillKind: 'active',
          unlocksAtStage: 3,
          catalogueActive: false,
        },
        {
          skillKey: 'map_sight',
          skillKind: 'active',
          unlocksAtStage: 3,
          catalogueActive: false,
        },
      ],
    },
  };

  const SKILLS_ST2_FOUR = {
    familiarId: 'fam-test-001',
    skillGrants: ['explain_anew', 'reminder_bell'],
    equippedSkills: [],
    grants: [
      {
        skillKey: 'explain_anew',
        skillKind: 'active',
        slotCost: 1,
        equipped: false,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
        catalogueActive: true,
      },
      {
        skillKey: 'reminder_bell',
        skillKind: 'active',
        slotCost: 1,
        equipped: false,
        unlockedVia: 'species_path',
        unlockedAtStage: 2,
        catalogueActive: false,
      },
    ],
    skillSlotsUnlocked: 3,
    slotsUsed: 0,
    evolutionTier: 'adept',
    growthStage: 2,
  };

  function revealSetup() {
    const s = setup(STAGE_TRANSITION_BABY_TO_FLEDGLING);
    const httpMock = TestBed.inject(HttpTestingController);
    return { ...s, httpMock };
  }

  function flushReveals(httpMock: HttpTestingController): void {
    for (const r of httpMock.match((r) => r.url.includes('/growth'))) {
      r.flush(GROWTH_ST2_OWL);
    }
    for (const r of httpMock.match((r) => r.url.endsWith('/skills'))) {
      r.flush(SKILLS_ST2_FOUR);
    }
  }

  it('shows the loading line until the reveal reads land', () => {
    const { fixture, el } = revealSetup();
    fixture.detectChanges();
    expect(
      el.querySelector('[data-testid="fsu-reveals-loading"]'),
    ).not.toBeNull();
  });

  it('renders slots + woke band (dormant chip on dark grants) + named-tease', async () => {
    const { fixture, el, httpMock } = revealSetup();
    fixture.detectChanges();
    flushReveals(httpMock);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const slots = el.querySelector('[data-testid="fsu-reveal-slots"]');
    expect(slots).not.toBeNull();
    expect(slots!.textContent).toContain('3');

    // Woke band: both st2 grants named; the dark one wears the dormant chip.
    expect(el.querySelector('[data-testid="fsu-woke-explain_anew"]')).not.toBeNull();
    const bell = el.querySelector('[data-testid="fsu-woke-reminder_bell"]');
    expect(bell).not.toBeNull();
    expect(bell!.textContent).toContain('familiar_loadout.dormant');
    expect(
      el
        .querySelector('[data-testid="fsu-woke-explain_anew"]')!
        .textContent,
    ).not.toContain('familiar_loadout.dormant');

    // Named-tease: next-stage entries are NAMED with their unlock stage.
    const tease = el.querySelector('[data-testid="fsu-reveal-next"]');
    expect(tease).not.toBeNull();
    expect(el.querySelector('[data-testid="fsu-next-quiz_me"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="fsu-next-map_sight"]')).not.toBeNull();
    expect(tease!.textContent).toContain('familiar_skill.quiz_me');
    // Never fake-usable: the tease list carries no buttons.
    expect(tease!.querySelectorAll('button').length).toBe(0);
    httpMock.verify();
  });

  it('degrades to an honest error line when the reveal reads fail', async () => {
    const { fixture, el, httpMock } = revealSetup();
    fixture.detectChanges();
    // forkJoin cancels the sibling read as soon as one errors — only
    // error live requests (a cancelled TestRequest cannot .error()).
    for (const r of httpMock.match((r) => r.url.includes('/growth'))) {
      r.error(new ProgressEvent('error'), { status: 500, statusText: 'boom' });
    }
    for (const r of httpMock.match((r) => r.url.endsWith('/skills'))) {
      if (!r.cancelled) {
        r.error(new ProgressEvent('error'), { status: 500, statusText: 'boom' });
      }
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="fsu-reveals-error"]')).not.toBeNull();
    // The ceremony art still plays — the card is intact.
    expect(el.querySelector('[data-testid="fsu-overlay-card"]')).not.toBeNull();
    httpMock.verify();
  });
});
